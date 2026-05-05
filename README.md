This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deployment

How code gets from a feature branch to staging to prod, who approves, and
how to roll back: [`docs/deploy.md`](./docs/deploy.md).

## Refresh staging data

Staging Supabase + GHL can be re-seeded with current prod data using
`scripts/refresh-staging-data/`. See
[`scripts/refresh-staging-data/README.md`](./scripts/refresh-staging-data/README.md)
for required env vars and usage. Note: PII is not anonymized — staging
intentionally mirrors prod so prod users can log into staging.

## How to add a new env var

The repo treats `.env.example` as the canonical list of every env var the app
or its tooling reads. When you introduce a new env var, do all of the
following so the next dev (or future you) doesn't get surprised:

1. **Reference the var in code** via `process.env.NAME` (Next.js / Node) or
   `Deno.env.get('NAME')` (Edge Functions). Never inline the value.
2. **Add the var to `.env.example`** under the appropriate section
   (Supabase / Stripe / GHL / Edge-Function-only / Script-only). Include a
   one-line comment explaining what it does and any gotchas (defaults,
   per-environment differences, "REQUIRED" vs "OPTIONAL").
3. **Set the value in every environment that needs it:**
   - **Local dev**: add to your `.env.local` (gitignored)
   - **Staging**: Railway → `aime-amp` service → top-left env switcher set
     to **staging** → Variables tab → add it. Same for Supabase staging
     Edge Functions: `supabase secrets set --project-ref nuuffnxjsjqdoubvrtcl NAME=...`
   - **Production**: Railway prod env + (if Edge-Function-consumed) Supabase
     prod EF secrets via `supabase secrets set --project-ref jrinrobepqsofuhjnxcp ...`
4. **Update `.env.staging`** (gitignored, local-only reference of what was set
   in Railway staging) so future refresh / debug doesn't have to re-derive.
5. **If the var holds a real secret** (key, token, DB password): make sure
   the value is NEVER committed. Verify with a quick grep before pushing.
6. **If the var is consumed by Edge Functions**, also list it under the
   "Edge Function secrets" reference section in `.env.example` so the next
   dev knows it's set via `supabase secrets set`, not in `.env.local`.
