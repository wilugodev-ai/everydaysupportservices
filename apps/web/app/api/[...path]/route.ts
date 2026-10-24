import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const base = process.env.API_URL || 'http://127.0.0.1:4300';
  const url = new URL(`${base}/v1/${path.map(encodeURIComponent).join('/')}`);
  url.search = request.nextUrl.search;
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const response = await fetch(url, {
      method: request.method, headers, cache: 'no-store', redirect: 'manual',
      signal: AbortSignal.timeout(170_000),
      ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: await request.arrayBuffer() }),
    });
    const outgoing = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['content-type', 'set-cookie']) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json({ message: 'The care service is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
