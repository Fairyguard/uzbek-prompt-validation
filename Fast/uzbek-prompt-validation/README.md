# Uzbek Prompt Validation Platform

Research workflow for Uzbek prompt translation validation and AI-safety-sensitive meaning preservation.

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Prisma
- Auth.js credentials auth
- SQLite by default, Postgres-compatible Prisma schema
- XLSX import/export with `xlsx`

## Workflow

The app supports the full pipeline:

`MT draft -> human review -> intent check -> spot check -> final decision`

Core behaviors:

- Users can hold multiple roles.
- The same user cannot be both reviewer and intent checker on the same prompt.
- The same prompt is never assigned twice to the same user for the same task type.
- Required review counts and intent-check counts are configurable per dataset.
- Escalation signals route prompts to spot check before final approval.
- Canonical reviewed Uzbek text is auto-selected on reviewer consensus, otherwise chosen manually by admin.

## Main Routes

- `/login`
- `/admin/dashboard`
- `/admin/datasets`
- `/admin/settings`
- `/admin/users`
- `/admin/prompts`
- `/reviewer/queue`
- `/intent-checker/queue`
- `/spot-checker/queue`

## Setup

1. Install dependencies:

```powershell
pnpm install
```

2. Generate Prisma client:

```powershell
pnpm prisma:generate
```

3. Create the local database and schema:

```powershell
pnpm db:push
```

`pnpm db:push` recreates the local SQLite schema from the Prisma model.

4. Seed demo data:

```powershell
pnpm db:seed
```

5. Start the app:

```powershell
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Default local settings live in `.env`:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="research-demo-secret"
NEXTAUTH_URL="http://localhost:3000"
```

The included bootstrap path is SQLite-first for local research pilots. The Prisma model fields are kept Postgres-safe, but switching to Postgres also requires updating the datasource provider in `prisma/schema.prisma` and replacing the SQLite bootstrap script.

## Demo Accounts

All seeded accounts use password `demo12345`.

- `admin@local.test`
- `reviewer1@local.test`
- `reviewer2@local.test`
- `intent@local.test`
- `spot@local.test`
- `multi@local.test`

## XLSX Import

Required columns:

- `prompt_id`
- `category`
- `english_prompt`
- `mt_uzbek_prompt`

Optional columns:

- `intended_intent`
- `notes`

## Export Format

Exports use multiple sheets:

- `prompt_summary`
- `reviews`
- `intent_checks`
- `spot_checks`
- `flat_annotations`

The flat export uses one row per annotation rather than a wide repeated-column layout, because review and intent-check counts are configurable.

## Testing

Unit tests:

```powershell
pnpm test:unit
```

Coverage:

```powershell
pnpm test
```

E2E:

```powershell
pnpm test:e2e
```

## Notes

- Review drafts autosave locally in the browser for reviewer tasks.
- Dataset settings propagate required counts to prompts that are not yet finalized.
- Spot-check exports and admin views include reviewer outputs, blind intent checks, and audit history.
- Simple VPS deployment files are included in [docs/deploy-vps-docker.md](./docs/deploy-vps-docker.md).
