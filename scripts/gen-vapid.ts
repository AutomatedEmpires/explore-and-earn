// `pnpm tsx scripts/gen-vapid.ts mailto:ops@your-domain`: prints a new VAPID key pair for web
// push, as environment lines to paste into the secrets store (Doppler, Vercel). The subject is
// how push services contact us about our traffic (a mailto: or https: URL).
//
// Generate one pair per environment and keep it: changing the keys invalidates every browser's
// push subscription. The private key is a secret: never commit it.
import webpush from 'web-push';

const subject = process.argv[2];
if (!subject || !/^(mailto:.+@.+|https:\/\/.+)$/.test(subject)) {
  console.error(
    'Usage: pnpm tsx scripts/gen-vapid.ts <mailto:ops@your-domain | https://your-site>',
  );
  process.exit(1);
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=${subject}`);
