# SupportPilot

Multi-tenant AI customer support SaaS for Bangladeshi businesses. Unified inbox,
AI/RAG replies in Bangla and English, omnichannel integrations, CRM, workflow
automation, and local payment gateways (SSLCOMMERZ, bKash, Nagad).

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS
- PostgreSQL 15 + pgvector (Drizzle ORM)
- SSE realtime (single-node)
- Vitest for unit tests

## Quick start

Prerequisites: Node.js 20+, PostgreSQL 15+ with the `vector` extension available.

```bash
# Install dependencies
npm install

# Create the database and enable pgvector
createdb saasdb
psql -d saasdb -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Configure environment
cp .env.example .env
# Edit .env and set SESSION_SECRET and DATABASE_URL at minimum

# Run migrations and seed demo data
npm run db:migrate
npm run db:seed

# Start the app
npm run dev
```

Open http://localhost:3000.

### Demo accounts

The seed script creates three accounts (password `SupportPilot123!` unless you
set `SEED_PASSWORD`):

| Role | Email |
| --- | --- |
| Platform admin | admin@supportpilot.dev |
| Workspace owner | owner@supportpilot.dev |
| Agent | agent@supportpilot.dev |

## Scripts

- `npm run dev` - start the dev server on port 3000
- `npm run build` / `npm start` - production build and server
- `npm run typecheck` - TypeScript check
- `npm run test` - run unit tests
- `npm run db:generate` - generate a Drizzle migration after schema changes
- `npm run db:migrate` - apply migrations (enables pgvector)
- `npm run db:seed` - seed plans, demo workspace, and demo accounts
- `npm run worker` - background worker for jobs and subscription expiry

## Configuration

All configuration is environment based. See `.env.example` for the full list.
Key values:

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - signs sessions and encrypts stored channel secrets
- `OPENAI_API_KEY` - required for AI replies and embeddings (RAG)
- `SSLCOMMERZ_*`, `BKASH_*`, `NAGAD_*` - payment gateways
- `META_*`, `TELEGRAM_WEBHOOK_SECRET` - messaging channels

Paid plans stay disabled in the UI until at least one gateway is configured.
In development a "Manual (test)" provider lets you exercise the full payment and
approval flow from the Super Admin panel.

## Billing flow

1. A workspace owner selects a plan and provider on `/dashboard/billing`.
2. The server creates a `pending` payment and redirects to the gateway.
3. The gateway redirects back to `/api/billing/callback/[provider]` and may also
   call `/api/billing/ipn/[provider]`.
4. The server re-verifies the payment **with the gateway** before activating the
   subscription. Callbacks are idempotent.
5. Super admins can approve or reject manual payments at `/admin/payments`.

## Tenancy and security

- Every table that holds tenant data has an `organization_id`, and every query
  filters on it. Authorization is enforced server-side via RBAC
  (`src/lib/auth/permissions.ts`), not just in the UI.
- Channel secrets are encrypted at rest with AES-256-GCM.
- Platform admin access is checked against the database on every request.
- The widget endpoint is rate limited and can be locked to allowed origins.

## Super Admin

Platform operators (`is_platform_admin`) get a separate console at `/admin`:
overview metrics, workspace management (suspend/reinstate), plan editing,
payment review, announcements, and an audit log.

## Realtime

Inbox updates use Server-Sent Events through `/api/realtime`. The bus is
in-process, so it is designed for a single node. For horizontal scaling, swap the
bus implementation in `src/lib/realtime/bus.ts` for Redis pub/sub.
