/* ============================================================
   Jeevo — Cloudflare Worker entry
   ------------------------------------------------------------
   Serves the static site from the assets binding, and forwards
   /api/* to the Vercel deployment.

   The two API routes cannot move here yet: api/chat.js reads the
   ai/ folder off disk with fs, and the Workers runtime has no
   filesystem. Forwarding costs one hop and keeps Arjun and the
   Airtable enquiry flow working exactly as they do now.
   ============================================================ */

const API_ORIGIN = 'https://jeevo-tours.vercel.app';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers(request.headers);
      headers.set('host', 'jeevo-tours.vercel.app');
      headers.set('origin', API_ORIGIN);        // satisfies the allow-list upstream

      const res = await fetch(API_ORIGIN + url.pathname + url.search, {
        method  : request.method,
        headers,
        body    : ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      });

      /* same-origin from the browser's side now, so drop the upstream CORS */
      const out = new Headers(res.headers);
      out.delete('access-control-allow-origin');
      out.delete('vary');
      return new Response(res.body, { status: res.status, headers: out });
    }

    return env.ASSETS.fetch(request);
  },
};
