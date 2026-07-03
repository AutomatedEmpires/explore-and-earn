# Post-merge Clerk webhook setup

After this PR merges, Jackson must:

1. Add the webhook endpoint in the Clerk dashboard:
   - Endpoint: `https://[vercel-url]/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`
2. Add `CLERK_WEBHOOK_SECRET` to Doppler.
