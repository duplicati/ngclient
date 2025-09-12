import { file, serve } from 'bun';

const basePath = './dist/ngclient/browser';

serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    console.log(url.pathname);

    let filePath = `${basePath}${url.pathname}`;
    let lang = url.pathname.split('/')[1];

    console.log(lang);

    // if (url.pathname.startsWith('/api')) {
    //   return Response.redirect(`localhost:8200${url.pathname}`);
    // }

    if (url.pathname.startsWith('/api/')) {
      // Reverse proxy requests to /api to localhost:8200
      url.hostname = 'localhost';
      url.port = '8200';

      const proxyRequest = new Request(url, {
        method: req.method,
        headers: req.headers,
        requestBody: req.body,
      });
      // proxyRequest.headers.set("Host", host);

      return await fetch(proxyRequest, { redirect: 'manual' });
      // return fetch(

      // );
    } else if (url.pathname.startsWith('/en-US/') || url.pathname.startsWith('/fr-FR/')) {
      // ...
    } else {
      return Response.redirect('/en-US/');
    }

    try {
      if (url.pathname.split('/').at(-1)?.includes('.')) {
        return new Response(file(filePath));
      } else {
        return new Response(file(`${basePath}/${lang}/index.html`));
      }
    } catch (error) {
      // If the file is not found, return a 404
      return new Response('Not Found', { status: 404 });
    }
  },
});

console.log('Server running on http://localhost:3000');
