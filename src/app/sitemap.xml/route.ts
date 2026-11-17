// GET /sitemap.xml: the sitemap index, rendered per request (SP3 spec section 5, plan Task 42).
import { connection } from 'next/server';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { renderSitemapIndex, sitemapNames } from '@/modules/landing';

export async function GET(): Promise<Response> {
  await connection();
  const xml = renderSitemapIndex(await sitemapNames(getDb()), getEnv().APP_URL);
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}
