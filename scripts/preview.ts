import { resolve, sep } from 'node:path';

const root = resolve('dist/ngclient/browser');
const index = Bun.file(resolve(root, 'index.html'));
if (!(await index.exists())) throw new Error('Run bun run build:prod before starting the preview.');

const notFound = () => new Response(null, { status: 404 });

const server = Bun.serve({
  hostname: process.env['HOST'] ?? '127.0.0.1',
  port: Number(process.env['PORT'] ?? '3000'),
  async fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return notFound();

    let pathname: string;
    try {
      pathname = decodeURI(new URL(request.url).pathname);
    } catch {
      return notFound();
    }
    if (/^\/(api|notifications)/i.test(pathname) || pathname.includes('\\') || pathname.includes('\0')) {
      return notFound();
    }
    if (pathname.split('/').some((part) => part.startsWith('.') && part !== '.well-known')) {
      return notFound();
    }

    const path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) return notFound();

    const candidates = pathname.endsWith('/')
      ? [resolve(path, 'index.html'), resolve(path, 'index.htm')]
      : [path, path + '.html', path + '.htm', resolve(path, 'index.html'), resolve(path, 'index.htm')];
    let file = index;
    for (const candidate of candidates) {
      const asset = Bun.file(candidate);
      if (await asset.exists()) {
        file = asset;
        break;
      }
    }
    if (file === index && /\.[\w]+$|\/\.well-known/.test(pathname)) return notFound();

    const headers = new Headers({
      'Content-Type': file.type,
      'Content-Length': String(file.size),
      'Last-Modified': new Date(file.lastModified).toUTCString(),
    });
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : file.size - 1, file.size - 1);
      if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
      headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
      headers.set('Content-Length', String(end - start + 1));
      headers.set('Accept-Ranges', 'bytes');
      return new Response(request.method === 'HEAD' ? null : file.slice(start, end + 1), { status: 206, headers });
    }
    return new Response(request.method === 'HEAD' ? null : file, { headers });
  },
});

console.log(`Production preview: ${server.url}`);
