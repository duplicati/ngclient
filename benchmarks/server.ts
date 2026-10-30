import { resolve, sep, extname } from 'node:path';

const roots = {
  baseline: resolve(process.env['STARTUP_BASELINE_DIR']!),
  candidate: resolve(process.env['STARTUP_CANDIDATE_DIR'] ?? process.env['STARTUP_BASELINE_DIR']!),
};
let variant: keyof typeof roots = 'baseline';
Bun.serve({
  hostname: '127.0.0.1',
  port: 3001,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/__benchmark/build' && request.method === 'POST') {
      const next = (await request.json()).variant;
      if (next !== 'baseline' && next !== 'candidate') return new Response('Invalid build', { status: 400 });
      variant = next;
      return Response.json({ variant });
    }
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/notifications'))
      return new Response('', { status: 404 });
    const root = roots[variant];
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) return new Response('', { status: 404 });
    if (path === root) return new Response(Bun.file(resolve(root, 'index.html')));
    const file = Bun.file(path);
    if (await file.exists()) return new Response(file);
    if (!extname(path)) return new Response(Bun.file(resolve(root, 'index.html')));
    return new Response('', { status: 404 });
  },
});
console.log('Startup measurement server: http://127.0.0.1:3001');
