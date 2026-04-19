# FCM — Fibonacci Career Map

Production-credible monorepo for the Fibonacci Career Map platform: a 3D-first, role-scoped career visualization with deterministic scoring, audit-guaranteed transactions, and real-time updates.

## Workspace Layout

The repository follows the source-tree direction in Architecture §18.

```
fcm/
├─ apps/
│  ├─ web/                      # Next.js 14 frontend (3D canvas + 2D deep views)
│  └─ api/                      # NestJS API + worker (modular monolith)
├─ packages/
│  ├─ domain-contracts/         # Shared TS types between web and api
│  └─ scoring-core/             # Pure deterministic functions (zero I/O)
├─ infra/
│  ├─ k8s/                      # Kubernetes manifests
│  ├─ terraform/                # Managed Postgres / Redis / object storage
│  └─ grafana/                  # Dashboards shipped in repo
├─ docs/
│  └─ ops/runbooks/
└─ tests/
   └─ scaffold/                 # Monorepo-structure invariants
```

### Workspace paths

- `apps/web` — Next.js frontend (`@fcm/web`)
- `apps/api` — NestJS API + worker (`@fcm/api`)
- `packages/domain-contracts` — shared TS contracts (`@fcm/domain-contracts`)
- `packages/scoring-core` — pure scoring functions (`@fcm/scoring-core`)
- `infra/` — Kubernetes, Terraform, Grafana dashboards
- `docs/` — product/architecture docs and ops runbooks

### Internal packages

Internal packages are resolved via the **pnpm workspace protocol** (`"workspace:*"`). Consumers declare the dep and pnpm links the workspace package into `node_modules`. If a referenced workspace package is missing, install fails loudly — no silent fall-through to the public registry.

| Package | Consumed by | Purpose |
|---|---|---|
| `@fcm/domain-contracts` | `@fcm/web`, `@fcm/api` | Shared TypeScript contracts |
| `@fcm/scoring-core` | `@fcm/api` | Pure scoring / readiness / eligibility / ETA / confidence |

## Prerequisites

- **Node.js ≥ 20.11.0** (see `engines` in root `package.json`)
- **pnpm ≥ 9.0.0** — install via `npm i -g pnpm@9.15.0` or Corepack (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)

TypeScript strict mode is enforced repo-wide via `tsconfig.base.json` — every workspace extends it.

## Install

```bash
pnpm install
```

## Dev / Build / Test Commands

All commands are run from the repository root and fan out across every workspace via `pnpm -r`.

| Command | Description |
|---|---|
| `pnpm dev` | Start all workspaces in dev mode in parallel |
| `pnpm build` | Build every workspace in parallel |
| `pnpm typecheck` | Run `tsc --noEmit` in every workspace (strict-mode gate) |
| `pnpm lint` | Lint every workspace (wired per-workspace as linting is added) |
| `pnpm test` | Run every workspace's test script |
| `pnpm test:scaffold` | Validate monorepo-scaffold invariants (Story 1-1 guardrail) |

### Workspace-scoped commands

Target a single workspace with `--filter`:

```bash
pnpm --filter @fcm/web dev
pnpm --filter @fcm/api build
pnpm --filter @fcm/scoring-core test
```

## Architecture References

- Source-tree direction: Architecture §18
- Modular-monolith boundaries: Architecture §5.1
- Transactional boundaries: Architecture §5.4
- Architectural goals: §2.1 (AG1 production-credible MVP, AG7 operational readiness)

## Subsequent Scaffold Stories

This story (1-1) establishes only the workspace shell. Full scaffolds land in:

- Story 1-2 — NestJS API scaffold with dual-mode bootstrap
- Story 1-3 — Next.js 14 App Router scaffold with dark-mode theme
- Story 1-4 — Prisma schema baseline and migration tooling
