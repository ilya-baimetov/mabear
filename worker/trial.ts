import bridge from './bridge';

export default {
  async fetch(request: Request, env: Parameters<typeof bridge.fetch>[1]): Promise<Response> {
    if (new URL(request.url).pathname === '/api/health') {
      return Response.json(
        { ok: true, service: 'mabear-masha-trial' },
        {
          headers: {
            'X-Robots-Tag': 'noindex, nofollow',
            'Referrer-Policy': 'same-origin',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store',
          },
        },
      );
    }
    return bridge.fetch(request, env);
  },
};
