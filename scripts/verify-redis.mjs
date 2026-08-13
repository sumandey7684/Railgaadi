/**
 * Verification helper — does not print secrets.
 * Usage: node --env-file=.env.local scripts/verify-redis.mjs
 */
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error('Missing Upstash env vars');
  process.exit(1);
}

const redis = new Redis({ url, token });

const keys = await redis.keys('rg:*');
console.log('rg:* keys:', keys.sort());

for (const key of keys.filter((k) => k.startsWith('rg:cache:live:') || k.startsWith('rg:ratelimit:'))) {
  const ttl = await redis.ttl(key);
  console.log(`ttl ${key} = ${ttl}s`);
}
