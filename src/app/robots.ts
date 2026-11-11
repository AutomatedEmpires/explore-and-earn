// robots.txt per environment (SP3 spec 8.11, plan Task 42). Outside prod, nothing is indexable.
import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/env';
import { buildRobots } from '@/modules/landing';

export default function robots(): MetadataRoute.Robots {
  const env = getEnv();
  return buildRobots(env.APP_ENV, env.APP_URL);
}
