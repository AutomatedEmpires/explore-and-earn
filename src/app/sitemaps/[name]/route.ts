// GET /sitemaps/<name>.xml: one urlset, or 404 for an unknown name (SP3 spec section 5).
import { connection } from 'next/server';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { renderUrlset, sitemapEntries, sitemapNames } from '@/modules/landing';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  await connection();
  const raw = (await params).name;
  const name = raw.endsWith('.xml') ? raw.slice(0, -'.xml'.length) : raw;
  const db = getDb();
  if (!(await sitemapNames(db)).includes(name)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const base = getEnv().APP_URL.replace(/\/$/, '');
  const entries = (await sitemapEntries(db, name)).map((entry) => ({
    loc: new URL(entry.loc, `${base}/`).href,
    lastmod: entry.lastmod,
  }));
  return new Response(renderUrlset(entries), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}
