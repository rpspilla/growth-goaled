# Growth Goaled

Growth Intelligence platform for Series A B2B SaaS and AI companies.

- **Build instructions:** [`HANDOFF.md`](HANDOFF.md) — the single source of truth for Claude Code
- **Product spec:** [`docs/spec.md`](docs/spec.md)
- **Design reference:** [`prototype/`](prototype/) (Figma Make export, not deployed)

## Environments

| Branch | URL | Database |
|---|---|---|
| `main` | https://app.growthgoaled.com | Neon `main` |
| `dev` | https://dev.growthgoaled.com | Neon `dev` branch |

Work on `dev`; merge `dev` → `main` to release. Never commit directly to `main`.

## Local setup

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```

Pull the Development env vars from Vercel instead of copying by hand: `vercel env pull .env.local`.
Local development points at the Neon `dev` branch.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled connection (app queries) |
| `DATABASE_URL_UNPOOLED` | Neon direct connection (migrations) |
| `NEON_AUTH_BASE_URL` | Neon Auth URL for the matching Neon branch (Console → Better Auth → Project Info) |
| `NEON_AUTH_COOKIE_SECRET` | 32+ char secret that signs session cookies (`openssl rand -base64 32`) |
| `APP_URL` | Public URL; magic links return here and the STAGING badge shows when it is `dev.growthgoaled.com` |
| `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY` | Used from M5/M3 onwards |

Each Vercel environment points at its own Neon branch: Production → `main`, Preview and Development → `dev`.
Neon Auth is configured **per Neon branch**, so `NEON_AUTH_BASE_URL` differs between Production and Preview.

### Database and migrations

- Schema: `lib/db/schema.ts` (Drizzle). Migrations are committed in `drizzle/`.
- After changing the schema: `npm run db:generate -- --name <change>` and commit the new SQL.
- Apply locally: `npm run db:migrate`.
- On deploy, `npm run build` runs `scripts/migrate.mjs` first, migrating that environment's database over the unpooled URL. Neon Auth's own `neon_auth` schema is never touched.

### Auth and roles

Sign-in is a passwordless magic link (Neon Auth). On first sign-in a row is created in `users` with role `founder`.
Promote someone (they must have signed in once):

```bash
npm run user:role -- someone@example.com advisor   # or admin / founder
```

Founders land on `/dashboard` with the founder sidebar; advisors and admins land on `/advisor/portfolio`.
Role checks are enforced on the server (`lib/auth/session.ts`, `lib/access.ts`), not just in the UI.

### Checks

```bash
npm run typecheck
npm run lint
npm test          # Vitest
npm run build
```
