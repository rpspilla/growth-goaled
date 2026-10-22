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
| `RESEND_API_KEY`, `EMAIL_FROM` | Invite emails via Resend (sender must be on a verified domain). Without a key the advisor is shown the invite link to share |
| `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN` | Used from M5 onwards |

Each Vercel environment points at its own Neon branch: Production → `main`, Preview and Development → `dev`.
Neon Auth is configured **per Neon branch**, so `NEON_AUTH_BASE_URL` differs between Production and Preview.

### Database and migrations

- Schema: `lib/db/schema.ts` (Drizzle). Migrations are committed in `drizzle/`.
- After changing the schema: `npm run db:generate -- --name <change>` and commit the new SQL.
- Apply locally: `npm run db:migrate`.
- On deploy, `npm run build` runs `scripts/migrate.mjs` first, migrating that environment's database over the unpooled URL. Neon Auth's own `neon_auth` schema is never touched.

### Seed data and the sample company

`scripts/seed.ts` seeds **Acme AI**, the read-only demo at `/sample` (no login), with its published Benchmark, data points, score and open questions. On staging it also seeds a fake advisory portfolio of six more companies. Figures come from `prototype/src/data/mock.ts` and are illustrative. The sample benchmark cohort is flagged `is_sample` so it is never matched to real companies.

- On deploy the build runs it automatically: Production gets Acme AI only, Preview (staging) gets Acme AI plus the portfolio.
- Locally: `npm run db:seed` (Acme AI + portfolio) or `npm run db:seed -- --sample-only`.
- It is idempotent: seed rows have fixed ids and are replaced on every run. Real users and companies are never touched. The script refuses to put the portfolio into production.
- Seeded people (Jamie Sterling, the advisor; Sam Avery, Acme's founder) cannot sign in.

### Auth and roles

Sign-in is a passwordless magic link (Neon Auth). Links return to `/auth/callback`, which finishes the session in the browser.

On first sign-in a row is created in `users` with role `founder`, and the user is sent to `/welcome` until they finish it:
- **Founders** give their name, title, company name, website and annual revenue band (<$1M, $1M–$3M, $3M–$10M, $10M–$20M, $20M–$50M). This creates the company in the unassigned queue with them as owner.
- **Advisors and admins** give their name and title.

**Invites and the unassigned queue.** Advisors invite a founder from **Portfolio** (email + company name). This creates the company in their portfolio and a single-use link (`/invite/<token>`, 14 days; only a hash is stored). The founder signs in with the invited email, joins the company, then fills in their profile on `/welcome`. Self-signed-up companies appear under **Unassigned**: advisors claim them; admins can assign them to any advisor.

Nobody can choose their own role. Admins change roles on **Users** (`/advisor/users`). To create the first admin (or from a terminal):

```bash
npm run user:role -- someone@example.com admin   # or advisor / founder; they must have signed in once
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
