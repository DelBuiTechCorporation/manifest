# Manifest Development Guidelines

Last updated: 2026-06-17

## CodeGraph

Este repositório está indexado pelo CodeGraph (`.codegraph/` existe na raiz). **Use-o antes de grep/find ou leitura de arquivos** para qualquer pergunta sobre o código:

- **MCP tools** (preferido): `codegraph_explore` responde à maioria das perguntas em uma chamada — retorna o código-fonte verbatim dos símbolos relevantes agrupados por arquivo. `codegraph_node` retorna o fonte de um símbolo + seus callers. Se as ferramentas estiverem adiadas, carregue-as via ToolSearch pelo nome.
- **Shell (sempre funciona)**: `codegraph explore "<pergunta ou nomes de símbolos>"` e `codegraph node <símbolo-ou-arquivo>`.

Use CodeGraph primeiro para "onde está X", "como X funciona", "o que chama X" e para ler qualquer arquivo antes de editá-lo.

## What Manifest Is

Manifest is a smart model router for **AI agents**. It sits between an agent and its LLM providers, scores each request, and routes it to the cheapest model that can handle it. The dashboard tracks costs, tokens, and messages across any agent that speaks OpenAI-compatible HTTP.

**Supported agents** (configured in `agent-type.ts`): OpenClaw, Hermes, OpenAI SDK, Vercel AI SDK, LangChain, cURL, and a generic `other` slot. OpenClaw remains the deepest integration, but no new code or copy should frame Manifest as OpenClaw-only. When adding examples, prefer "AI agent" as the noun and pick OpenClaw as the worked example rather than the sole target. Manifest is consumed as a generic OpenAI-compatible HTTP endpoint — there are no first-party OpenClaw plugins in this repo anymore.

Wingman — the gateway tester for sending requests against a Manifest backend while impersonating any of the supported agents — lives in its own repo at [`mnfst/wingman`](https://github.com/mnfst/wingman) and is hosted at [`wingman.manifest.build`](https://wingman.manifest.build). The dashboard embeds it as an iframe drawer **in dev mode only** — it is dead-code-eliminated from production / self-hosted bundles via `__DEV_MODE__`, and the backend never enables CORS in production. The dev-mode allow-list + CSP `frame-src` is wired in `cors-csp-config.ts`.

**Whenever working in dev mode (`/serve`, `npm run dev`, etc.), the Wingman drawer is expected to be available** — open the FAB at the bottom-right of the dashboard (or hit ⌘/Ctrl+Shift+W) and confirm the iframe loads `https://wingman.manifest.build` cleanly. `/serve` is **dev-only** — never use it to validate production behavior.

## IMPORTANT: Cloud Mode Always

When starting the app for development or testing (e.g. `/serve`), **always use `MANIFEST_MODE=cloud`** (the default). Every dev session must use a **fresh PostgreSQL database** via Docker — multiple concurrent dev instances sharing one DB cause cross-run data pollution and intermittent test failures:

```bash
# 1. Ensure the postgres_db container is running
docker start postgres_db 2>/dev/null || \
  docker run -d --name postgres_db -e POSTGRES_USER=myuser -e POSTGRES_PASSWORD=mypassword -e POSTGRES_DB=mydatabase -p 5432:5432 postgres:16

# 2. Create a pristine database with a unique name
DB_NAME="manifest_$(openssl rand -hex 4)"
docker exec postgres_db psql -U myuser -d postgres -c "CREATE DATABASE $DB_NAME;"

# 3. Update DATABASE_URL in packages/backend/.env to use the new database
# DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/$DB_NAME

# 4. Ensure SEED_DATA=true in .env so the database is populated on startup
```

This guarantees each session starts with a clean, isolated database and avoids all cross-instance conflicts.

## Testing OpenClaw Integration

To test routing from an OpenClaw agent against a local Manifest dev server, point OpenClaw at the dev server's OpenAI-compatible proxy directly — there is no plugin anymore:

```bash
# 1. Build and start the backend in cloud mode
npm run build
PORT=38238 BIND_ADDRESS=127.0.0.1 \
  node -r dotenv/config packages/backend/dist/main.js

# 2. Configure OpenClaw to use the dev server as a generic OpenAI-compatible provider
openclaw config set models.providers.manifest '{"baseUrl":"http://localhost:38238/v1","api":"openai-completions","apiKey":"mnfst_YOUR_KEY","models":[{"id":"auto","name":"Manifest Auto"}]}'
openclaw config set agents.defaults.model.primary manifest/auto

# 3. Restart the gateway
openclaw gateway restart
```

`AgentKeyAuthGuard` accepts any non-`mnfst_*` token from loopback IPs in the self-hosted version, so loopback-only testing works even without a valid key. After restarting the backend, also restart the OpenClaw gateway — it doesn't reconnect automatically.

## Active Technologies

- **Backend**: NestJS 11, TypeORM 0.3, PostgreSQL 16, Better Auth, class-validator, class-transformer, Helmet
- **Frontend**: SolidJS, Vite, uPlot (charts), Better Auth client, custom CSS theme
- **Runtime**: TypeScript 5.x (strict mode), Node.js 24.x
- **Monorepo**: npm workspaces + Turborepo
- **Release**: Changesets for version management + GitHub Actions for npm publishing

## Single-Service Deployment

The app deploys as a **single service**. In production, NestJS serves both the API and the frontend static files from the same port.

```bash
npm run build     # Turborepo: frontend (Vite) then backend (Nest)
npm start         # node packages/backend/dist/main.js — serves frontend + API
```

- API routes (`/api/*`, `/otlp/*`) are excluded from static file serving.
- Dev mode: Vite on `:3000` proxies `/api` and `/otlp` to backend on `:3001`.

## Commands

### Starting the Dev Server

The backend requires a `.env` file at `packages/backend/.env` with at least `BETTER_AUTH_SECRET` (32+ chars). `auth.instance.ts` reads `process.env` at import time, before NestJS `ConfigModule` loads `.env`, so env vars must be available to the Node process.

**Quick start (run these in parallel):**

```bash
# Backend — must preload dotenv since auth.instance.ts reads process.env at import time
cd packages/backend && NODE_OPTIONS='-r dotenv/config' npx nest start --watch

# Frontend
cd packages/frontend && npx vite
```

**Note:** `npm run dev` (turbo) starts the frontend but NOT the backend, because the backend's script is `start:dev` not `dev`. Start the backend separately as shown above.

### Seeding Dev Data

Set `SEED_DATA=true` in `packages/backend/.env` to seed on startup (dev/test only). This creates:

- **Admin user**: `admin@manifest.build` / `manifest`
- **Tenant**: `seed-tenant-001` linked to the admin user
- **Agent**: `demo-agent` with OTLP key `dev-otlp-key-001`
- **API key**: `dev-api-key-manifest-001`
- **Security events**: 12 sample events for the security dashboard
- **Agent messages**: Sample telemetry messages for the demo agent

Seeding is idempotent — it checks for existing records before inserting.

**Minimal `.env` for development:**

```env
PORT=3001
BIND_ADDRESS=127.0.0.1
NODE_ENV=development
BETTER_AUTH_SECRET=<random-hex-64-chars>
DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/mydatabase
API_KEY=dev-api-key-12345
SEED_DATA=true
```

Generate a secret with: `openssl rand -hex 32`

**Database naming convention:** Always create uniquely-named databases. Use the pattern `manifest_<context>_<random>` (e.g., `manifest_sse_49821`). Create via Docker:

```bash
docker exec postgres_db psql -U myuser -d postgres -c "CREATE DATABASE manifest_<name>;"
```

```bash
# Production build + start (single server)
npm run build && npm start

# Tests
npm test --workspace=packages/backend          # Jest unit tests
npm run test:e2e --workspace=packages/backend  # Jest e2e tests
npm test --workspace=packages/frontend         # Vitest tests
```

### Database Migrations

TypeORM migrations run automatically on app startup (`migrationsRun: true`). Schema sync (`synchronize`) is permanently disabled — all schema changes must go through migrations.

**Dev workflow:** modify entity → generate migration → commit both.

```bash
cd packages/backend
npm run migration:generate -- src/database/migrations/DescriptiveName
npm run migration:run       # Run pending migrations
npm run migration:revert    # Revert the last migration
npm run migration:show      # Show migration status ([X] = applied)
npm run migration:create -- src/database/migrations/Name
```

New migrations must be imported in `database.module.ts` and added to the `migrations` array. Always use unique timestamps — never reuse a timestamp from an existing migration file.

## Authentication Architecture

### Guard Chain

Three global guards run on every request (order matters):

1. **SessionGuard** — Checks `@Public()` first. If not public, validates the Better Auth cookie session via `auth.api.getSession()`. Attaches `request.user` and `request.session`.
2. **ApiKeyGuard** — Falls through if session already set. Otherwise checks `X-API-Key` header against `API_KEY` env var (timing-safe compare). Use `@Public()` to skip both guards.
3. **ThrottlerGuard** — Rate limiting.

### Better Auth Setup

- **Instance**: `auth.instance.ts` — `betterAuth()` with `emailAndPassword` + 3 social providers (Google, GitHub, Discord). Each provider only activates when both `CLIENT_ID` and `CLIENT_SECRET` env vars are set.
- **Mounting**: In `main.ts`, Better Auth is mounted as Express middleware at `/api/auth/*splat` **before** `express.json()` (it needs raw body control). NestJS body parsing is re-added after for all other routes.
- **Frontend client**: `auth-client.ts` — `createAuthClient()` from `better-auth/solid`.
- **Social login in dev**: OAuth callback URLs point to `:3001` (`BETTER_AUTH_URL`). Social login only works when accessing the app on port **3001** (production build), not on Vite's `:3000` dev server.

### Auth Types

```typescript
export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;

// Use in controllers:
@Get('something')
async handler(@CurrentUser() user: AuthUser) {
  // user.id, user.name, user.email
}
```

## Multi-Tenancy Model

```
User (Better Auth) ──→ Tenant ──→ Agent ──→ AgentApiKey (mnfst_*)
                                    │
                                    └──→ agent_messages (telemetry data)
```

- **Tenant**: Created automatically on first agent creation. `tenant.owner_user_id` = `user.id` is the ONLY user→tenant link (resolved through `TenantCacheService`).
- **Agent**: Belongs to a tenant. Unique constraint on `[tenant_id, name]`.
- **AgentApiKey**: One-to-one with agent. `mnfst_*` format key for OTLP ingestion.
- **Onboarding flow**: `ApiKeyGeneratorService.onboardAgent()` creates tenant (if new) + agent + API key in one transaction.

### Data Isolation

Every resource belongs to a tenant. Guards resolve the tenant once per request and attach a `TenantContext` (`{ tenantId, userId }`), injected in controllers via `@TenantCtx()`. All analytics queries filter by tenant via `addTenantFilter(qb, tenantId)`. **Never scope, key, cache, or authorize by user id.**

## API Endpoints

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/v1/health` | Public | Health check |
| ALL | `/api/auth/*` | Public | Better Auth (login, register, OAuth, sessions) |
| GET | `/api/v1/overview` | Session/API Key | Dashboard summary |
| GET | `/api/v1/tokens` | Session/API Key | Token usage analytics |
| GET | `/api/v1/costs` | Session/API Key | Cost analytics |
| GET | `/api/v1/messages` | Session/API Key | Paginated message log |
| GET | `/api/v1/agents` | Session/API Key | Agent list with sparklines |
| POST | `/api/v1/agents` | Session/API Key | Create agent + API key |
| DELETE | `/api/v1/agents/:name` | Session/API Key | Delete agent |
| GET | `/api/v1/agents/:name/key` | Session/API Key | Get agent API key |
| POST | `/api/v1/agents/:name/rotate-key` | Session/API Key | Rotate API key |
| PATCH | `/api/v1/agents/:name` | Session/API Key | Rename agent |
| GET | `/api/v1/security` | Session/API Key | Security score + events |
| GET | `/api/v1/model-prices` | Session/API Key | Model pricing list |
| GET | `/api/v1/agent/:agentName/usage` | Session/API Key | Per-agent token usage |
| GET | `/api/v1/agent/:agentName/costs` | Session/API Key | Per-agent cost data |
| GET/POST/PATCH/DELETE | `/api/v1/notifications` | Session/API Key | Notification rules CRUD |
| GET/POST/DELETE | `/api/v1/notifications/email-provider` | Session/API Key | Email provider config |
| GET/POST/PUT/DELETE | `/api/v1/routing/*` | Session/API Key | Routing config (tiers + providers) |
| GET/PUT/POST/DELETE | `/api/v1/routing/:agent/specificity/*` | Session/API Key | Specificity routing config |
| POST | `/api/v1/routing/subscription-providers` | Session/API Key | Subscription provider config |
| POST | `/api/v1/routing/:agentName/ollama/sync` | Session/API Key | Sync Ollama models |
| POST | `/api/v1/routing/resolve` | Bearer (mnfst_*) | Model resolution |
| POST | `/v1/chat/completions` | Bearer (mnfst_*) | LLM proxy (OpenAI-compatible) |
| POST | `/v1/responses` | Bearer (mnfst_*) | LLM proxy (OpenAI Responses API) |
| POST | `/v1/messages` | Bearer (mnfst_*) | LLM proxy (Anthropic Messages API) |
| GET | `/api/v1/events` | Session | SSE real-time events |
| GET | `/api/v1/github/stars` | Public | GitHub star count |

## Environment Variables

See `packages/backend/.env.example` for all variables. Key ones:

- `BETTER_AUTH_SECRET` — **Required.** Secret for Better Auth session signing (min 32 chars). Generate with `openssl rand -hex 32`.
- `DATABASE_URL` — **Required in production.** PostgreSQL connection string. Defaults to `postgresql://myuser:mypassword@localhost:5432/mydatabase`.
- `PORT` — Server port. Default: `3001`
- `BIND_ADDRESS` — Bind address. Default: `127.0.0.1` (use `0.0.0.0` for Railway/Docker)
- `NODE_ENV` — `development` or `production`. CORS only enabled in dev.
- `CORS_ORIGIN` — Allowed CORS origin. Default: `http://localhost:3000`
- `BETTER_AUTH_URL` — Base URL for Better Auth. Default: `http://localhost:{PORT}`
- `FRONTEND_PORT` — Extra trusted origin port for Better Auth.
- `API_KEY` — Secret for programmatic API access (X-API-Key header).
- `THROTTLE_TTL` — Rate limit window in ms. Default: `60000`
- `THROTTLE_LIMIT` — Max requests per window. Default: `100`
- `MAILGUN_API_KEY` — Mailgun API key for email verification/password reset.
- `MAILGUN_DOMAIN` — Mailgun sending domain (e.g. `mg.manifest.build`).
- `NOTIFICATION_FROM_EMAIL` — Sender email. Default: `noreply@manifest.build`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth (optional)
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth (optional)
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — Discord OAuth (optional)
- `SEED_DATA` — Set `true` to seed demo data on startup.
- `MANIFEST_MODE` — `selfhosted` or `cloud` (default: `cloud`; auto-`selfhosted` inside Docker via `/.dockerenv`). Self-hosted mode enables loopback auth shortcuts and allows custom-provider URLs with `http://` / private IPs. `local` is accepted as a legacy alias for `selfhosted`.
- `OLLAMA_HOST` — Ollama endpoint. Defaults to `http://localhost:11434` outside Docker and `http://host.docker.internal:11434` inside the bundled `docker/docker-compose.yml`.

## Domain Terminology

- **Message**: The primary entity in the system. Every row in `agent_messages` is a Message. Key routing columns: `routing_tier` (complexity tier used), `routing_reason` (why — `scored`, `specificity`, `heartbeat`, etc.), `specificity_category` (which task-type category, null if complexity-routed).
- **Tenant**: A user's data boundary. Created from `user.id` on first agent creation.
- **Agent**: An AI agent owned by a tenant. Has a unique OTLP ingest key.

### Message list endpoints (shared projection contract)

Any backend endpoint that returns rows rendered by the frontend `MessageTable` / `ModelCell` component **must** project its SELECT through `selectMessageRowColumns()` in `query-helpers.ts`. This helper is the single source of truth for the columns the shared badge/provider/auth rendering reads (including `specificity_category`, `routing_tier`, `routing_reason`, `auth_type`, `fallback_from_model`).

- Adding a new column the UI needs → edit the helper once, never duplicate the projection across query services.
- Endpoint-specific fields that don't belong to the shared `MessageRow` contract stay as explicit `.addSelect` chained after the helper call.
- A `query-helpers.spec.ts` test pins the required alias set — it fails loudly if anyone drops a field. Don't bypass it by hand-rolling a new SELECT chain.

## Content Security Policy (CSP)

Helmet enforces a strict CSP in `main.ts`. The policy only allows `'self'` origins — **no external CDNs are permitted**.

**Rule: Never load external resources from CDNs.** All assets (fonts, icons, stylesheets) must be self-hosted under `packages/frontend/public/`. This keeps the CSP strict and avoids third-party dependencies at runtime.

To add a new font or icon library:
1. Download the CSS and font files into `packages/frontend/public/`
2. Rewrite any CDN URLs inside the CSS to use relative paths (`./filename.woff`)
3. Reference the local CSS in `index.html` (e.g. `<link href="/fonts/..." />`)
4. Do **not** add external domains to the CSP directives

## Anonymous Usage Telemetry (self-hosted)

Self-hosted installs send one aggregate usage report per 24h to `TELEMETRY_ENDPOINT` (default `https://telemetry.manifest.build/v1/report`). The module lives in `packages/backend/src/telemetry/`.

**Payload fields (v1) — keep this list minimal**: `schema_version`, `install_id`, `manifest_version`, last 24h aggregates from `agent_messages` (messages, tokens, by-provider/tier/auth), `agents_total`, `agents_by_platform`, `platform`, `arch`.

**Explicitly never sent**: tenant/user IDs, emails, API keys, prompts, message contents, model names, custom provider URLs, OAuth client IDs, raw IPs.

**Opt-out**: `MANIFEST_TELEMETRY_DISABLED=1`. Also auto-disabled when `NODE_ENV !== 'production'`.

**Extending the payload**: bump `TELEMETRY_SCHEMA_VERSION` and add fields additively — the ingest rejects unknown `schema_version` values with 400.

## Architecture Notes

- **Single-service**: In production, `@nestjs/serve-static` serves `frontend/dist/` with SPA fallback. API routes (`/api/*`, `/otlp/*`) are excluded.
- **Dev mode**: Vite dev server on `:3000` proxies `/api` and `/otlp` to backend on `:3001`. CORS enabled only in dev.
- **Body parsing**: Disabled at NestJS level (`bodyParser: false`). Better Auth mounted first (needs raw body), then `express.json()` and `express.urlencoded()`.
- **QueryBuilder API**: Analytics and ingestion services use TypeORM `Repository.createQueryBuilder()`. `addTenantFilter()` in `query-helpers.ts` applies multi-tenant WHERE clauses. Only the database seeder and notification cron still use `DataSource.query()` with numbered `$1, $2, ...` placeholders.
- **Validation**: Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`. Explicit `@Type()` decorators on numeric DTO fields.
- **Agent key auth caching**: `AgentKeyAuthGuard` caches valid API keys in-memory for 5 minutes.
- **Database migrations**: `synchronize` is permanently `false`. Migrations auto-run on boot (`migrationsRun: true`) wrapped in a single transaction. Better Auth manages its own tables separately via `ctx.runMigrations()`.
- **LLM Routing**: Two-layer routing system with provider key management (AES-256-GCM encrypted) and OpenAI-compatible proxy at `/v1/chat/completions`:
  - **Complexity tiers** (always active): 4 tiers (simple/standard/complex/reasoning) based on request content scoring with 23 weighted keyword dimensions.
  - **Specificity routing** (opt-in): 9 task-type categories (coding, web_browsing, data_analysis, image_generation, video_generation, social_media, email_management, calendar_management, trading). When enabled, overrides complexity tiers.
  - **Resolution order**: specificity check → complexity scoring → tier assignment → provider/model resolution → proxy forward.

## Providers & Models

### Provider Registry (Single Source of Truth)

All provider definitions live in `PROVIDER_REGISTRY` in `providers.ts`. This is the **only** place to define provider IDs, display names, aliases, and OpenRouter prefix mappings. **Never hardcode provider names elsewhere — always import from the registry.**

The registry exports derived maps: `PROVIDER_BY_ID`, `PROVIDER_BY_ID_OR_ALIAS`, `OPENROUTER_PREFIX_TO_PROVIDER`, `expandProviderNames()`.

### Adding a New Specificity Category

1. Add the category ID to `SPECIFICITY_CATEGORIES` in `specificity.ts`
2. Add keywords to `DEFAULT_KEYWORDS` in `keywords.ts` (new dimension with weight 0)
3. Add the dimension to `DEFAULT_CONFIG.dimensions` in `config.ts`
4. Add the category → dimensions mapping in `DIMENSION_MAP` in `specificity-detector.ts`
5. Optionally add tool name prefixes in `TOOL_NAME_PATTERNS` in the same file
6. Add a `StageDef` entry to `SPECIFICITY_STAGES` in `providers.ts` (frontend)
7. Add test prompts to `specificity-coverage.spec.ts`

The `specificity_assignments` table and UI components handle new categories automatically — no migrations or frontend changes needed beyond the stage definition.

### Adding a New Provider

1. Add entry to `PROVIDER_REGISTRY` in `providers.ts`
2. Add `FetcherConfig` in `provider-model-fetcher.service.ts`
3. Add `ProviderEndpoint` in `provider-endpoints.ts`
4. Add `ProviderDef` in `providers.ts` (frontend)

### Model Discovery

Each provider's model list is fetched from **that provider's own API first**. If the native API fails or returns no models, the system falls back to building a model list from the OpenRouter pricing cache.

- `ProviderModelFetcherService` — config-driven fetcher with parsers for each provider API format
- `ModelDiscoveryService` — orchestrator that decrypts keys, fetches, enriches with pricing, caches results
- Discovery runs synchronously on provider connect; "Refresh models" triggers `POST /routing/:agent/refresh-models`

### Model Pricing

All pricing comes from the **OpenRouter API** (public, no key needed, fetched daily via cron + on startup). No hardcoded pricing data anywhere.

**Priority order for model lists**: (1) Provider's native `/models` API, (2) OpenRouter cache filtered by vendor prefix. OpenRouter is the fallback, not the primary source.

### Where Models Appear

| Page | Source | What's shown |
|------|--------|-------------|
| **Model Prices** | `ModelPricingCacheService.getAll()` | All models from OpenRouter cache |
| **Routing (available models)** | `ModelDiscoveryService.getModelsForAgent()` | Only models from user's connected providers |
| **Routing (tier assignments)** | `TierAutoAssignService.recalculate()` | Auto-assigned from discovered models |
| **Messages / Overview** | Stored in `agent_messages.model` | Raw model name, display resolved via `model-display.ts` cache |

## Releases

There are **no publishable npm packages** in this repo — all packages are `private: true`. Manifest ships exclusively as the Docker image at `manifestdotbuild/manifest`.

### `packages/manifest/` is the canonical version

A **code-free shell package** that exists only to hold the canonical "Manifest version". Always target `manifest` when running `npx changeset` — bumps to `manifest-backend` / `manifest-frontend` / `manifest-shared` are silently discarded.

### Adding a changeset

```bash
npx changeset
# → select "manifest"
# → choose patch / minor / major
# → write a one-line summary (this becomes the CHANGELOG entry)
```

### Cutting a Docker release

Merging the `chore: version packages` PR to `main` automatically publishes a new Docker image. The `publish` job pushes `manifestdotbuild/manifest:{version}` + `{major}.{minor}` + `{major}` + `sha-<short>` (multi-arch: amd64 + arm64, cosign-signed).

**Manual override:** `workflow_dispatch` on `Docker → Run workflow` for hotfixes and retags.

### CI summary

| Trigger | What happens |
|---------|--------------|
| PR opened/updated | `ci.yml` runs tests, lint, typecheck, coverage. `docker.yml` validates the Docker build (no push). |
| Merge to `main` | `release.yml` opens or updates the `chore: version packages` PR. No publish. |
| Merge of `chore: version packages` PR | `release.yml` detects the version bump and calls `docker.yml` to push a new image. |
| Manual `workflow_dispatch` on `Docker` | Pushes a new image tag. Used for hotfixes and retags. |

## Code Coverage (Codecov)

### CRITICAL: 100% Line Coverage Required

**Every PR must maintain 100% line coverage across all packages.** This means:

- All new source files must have corresponding tests with 100% line coverage
- All modified functions must have tests covering every line, including error paths
- **Patch coverage must be 100%** — no new uncovered lines allowed
- Run coverage locally before creating a PR:
  - `cd packages/backend && npx jest --coverage`
  - `cd packages/frontend && npx vitest run --coverage`
  - `cd packages/shared && npx jest --coverage`

### Thresholds

- **Project coverage**: Must not drop more than **1%** below the base branch.
- **Patch coverage**: New/changed lines must have at least **auto - 5%** coverage.

### E2E Test Entities

When adding new TypeORM entities to `database.module.ts`, also add them to the E2E test helper (`packages/backend/test/helpers.ts`) entities array. Missing entities cause `EntityMetadataNotFoundError` in services that depend on them.
