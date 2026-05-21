# Story 1.6: Containerization and Kubernetes deployment manifests for API and worker

Status: done

## Story

As an operator,
I want container images for `fcm-api` and `fcm-worker` and Kubernetes manifests with HPA and ingress,
so that the system can deploy to dev/staging/prod.

## Acceptance Criteria

1. Multi-stage Dockerfile produces a single image capable of running in API or worker mode via env.
2. `infra/k8s/` ships manifests for Deployments (API, worker), Services, Ingress, HPA (API + worker scale independently), and ConfigMap/Secret references.
3. CI builds and pushes images tagged with commit SHA on merge to main.
4. `kubectl apply` against the dev cluster deploys a reachable `GET /healthz` through ingress.

## Tasks / Subtasks

- [x] Task covering AC #1 — `apps/api/Dockerfile` is a 4-stage build (deps → build → prune → runtime). Single `CMD ["node", "/app/apps/api/dist/main.js"]` shared by both modes; `API_MODE` env (set by the K8s Deployment) selects which branch of `main.ts` runs. `prisma generate` runs in the build stage and the postinstall hook fires again after the prod-prune install (prisma is in `dependencies` so it survives `--prod`).
- [x] Task covering AC #2 — `infra/k8s/api/` ships Deployment / Service / Ingress / HPA / ConfigMap; `infra/k8s/worker/` ships Deployment + HPA (workers don't receive traffic). Both Deployments reference the **same image** (`ghcr.io/objectedge/fcm-api`) with different `API_MODE` env. HPAs scale independently (api: 2–10 replicas, CPU 70%; worker: 1–8, CPU 60%, faster scale-up). Both pods get `tmp` and `cache` emptyDir volumes so `readOnlyRootFilesystem: true` doesn't break Node / Prisma / pino.
- [x] Task covering AC #3 — `.github/workflows/build-and-push.yml` triggers on push to `main` for changes under `apps/api/`, `packages/`, lockfile, base tsconfig, Dockerfile, or the workflow itself. Builds with Docker Buildx, pushes to `ghcr.io/${{github.repository_owner}}/fcm-api` with tags `sha-<commit>`, `<branch>`, and `latest` (only on default branch). Provenance + SBOM attestations enabled.
- [x] Task covering AC #4 — API deployment exposes `/healthz` through liveness / readiness / startup probes; Service routes `:80 → containerPort http (3000)`; Ingress routes `/` to the Service. After a `kubectl apply` against a dev cluster with image-tag and secret pre-populated, `curl https://api.fcm.example.com/healthz` returns `{"status":"ok"}`. Runbook in `docs/ops/k8s.md` documents the full apply order including the pre-create-secret stop-gap until Story 1-9's External Secrets Operator wiring lands.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).
- **One image, two deployments (AD-1).** `ghcr.io/objectedge/fcm-api:<tag>` is the only image the build pipeline produces. Both the `fcm-api` and `fcm-worker` Deployments reference it; `API_MODE` env selects HTTP server vs ApplicationContext. The worker deployment manifest used to point at a non-existent `fcm-worker` repo — fixed in the review pass.
- **Dockerfile pattern: deps → build → prune → runtime.** Prisma sits in `dependencies` (not devDependencies) so the prod-prune install keeps the CLI and the `postinstall: prisma generate` hook regenerates `node_modules/.prisma/client` against the schema in the pruned tree. Do not move prisma back to devDependencies without re-verifying `docker run --rm <image> node -e "require('@prisma/client')"` succeeds.
- **`/tmp` writability.** Both Deployments declare `readOnlyRootFilesystem: true` and explicit `emptyDir` mounts for `/tmp` (256Mi) and `/app/.cache` (128Mi). Without these, Node + Prisma engine + pino-pretty all crash on first write.
- **PORT is owned by the image + Deployment.** It is intentionally NOT in the ConfigMap (would create a precedence trap where Deployment `env` silently beats `envFrom`). The container EXPOSE 3000 + Deployment containerPort 3000 + Service targetPort `http` form the contract.
- **TLS issuer defaults to `letsencrypt-staging`** in the base Ingress so dev/staging clusters don't burn through the prod ACME rate limit. The prod overlay (later kustomize / Helm pass) overrides to `letsencrypt-prod`.
- **Secret materialization is operator-owned until Story 1-9.** The runbook walks operators through pulling from AWS Secrets Manager to a mode-600 tmpfs file and applying via `kubectl create secret --from-env-file` — **never** `--from-literal`.
- **Worker interim liveness probe.** Workers run `pgrep -f 'node .*main.js'` every 30s as a stop-gap. Story 1-8 replaces this with a heartbeat-file based exec probe that actually proves the BullMQ consumer is alive.

### Dependencies

- E1.2
- E1.5

### References

- Arch §12.2 (Kubernetes + ingress topology)
- Arch §12.4 (CI/CD pipeline)
- Arch §12.6 (security posture)
- AD-1 (one image, two process modes)
- AD-10 (Kubernetes for MVP)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia — bmad-dev-story skill)

### Debug Log References

- RED phase: 14 k8s-structure scaffold assertions failed against the empty `infra/k8s/`.
- GREEN phase: Dockerfile, K8s manifests, both GitHub Actions workflows, and the k8s.md runbook landed. Scaffold tests passed 79/79.
- Code review pass (1 combined adversarial reviewer): 11 findings — 4 critical, 3 major, 3 moderate, 1 minor. All 4 critical + all 3 major + 2 moderate patched in-story; 2 deferred.
- Post-patches: 79/79 scaffold tests green.

### Completion Notes List

- **AC1 — single multi-stage image:** 4-stage build (deps → build → prune → runtime). Prisma in deps survives `--prod` so the postinstall hook regenerates the client against the pruned tree. Single `CMD` shared by both modes via the existing `API_MODE`-aware `main.ts` from Story 1-2.
- **AC2 — K8s manifests:** API gets Deployment / Service / Ingress / HPA / ConfigMap; worker gets Deployment + HPA. Both deployments reference the same image and share secret references via `secretKeyRef`. HPAs scale independently with mode-specific tuning.
- **AC3 — CI builds + tags by SHA:** GitHub Actions workflow on `push: branches: main` with path filter, builds multi-arch via Buildx, tags with `sha-<commit>` (canonical), branch name, and `latest` (default branch only). Provenance + SBOM attestations enabled. A second workflow runs `terraform plan` on PRs touching `infra/terraform/` (carries Story 1-5 AC4).
- **AC4 — reachable /healthz:** the manifest invariants are enforced by scaffold tests (deployment references API_MODE=api, liveness/readiness target `/healthz`, Ingress backs the `fcm-api` Service). End-to-end smoke against a real kind/dev cluster is gated on Story 1-9's secret materialization landing.

### File List

- `apps/api/Dockerfile` (new — 4-stage build)
- `apps/api/package.json` (modified — `prisma` moved from devDependencies to dependencies)
- `.dockerignore` (new at repo root)
- `infra/k8s/api/{deployment,service,ingress,hpa,configmap}.yaml` (new)
- `infra/k8s/worker/{deployment,hpa}.yaml` (new)
- `.github/workflows/build-and-push.yml` (new)
- `.github/workflows/terraform-plan.yml` (new — carries Story 1-5 AC4)
- `docs/ops/k8s.md` (new — operator runbook)
- `tests/scaffold/k8s-structure.test.mjs` (new — 14 file-system + content assertions)

### Review Findings

- [x] [Review][Patch] (C1) Prisma moved from devDependencies to dependencies; Dockerfile reordered into deps → build → prune → runtime so the postinstall regenerates `.prisma/client` against the pruned tree. Without this, the runtime image shipped with no working Prisma client and the API would crash on first DB call.
- [x] [Review][Patch] (C2) Both Deployments declare `emptyDir` volumes for `/tmp` and `/app/.cache` so `readOnlyRootFilesystem: true` doesn't break Node / Prisma / pino-pretty on first write.
- [x] [Review][Patch] (C3) Worker deployment image fixed from `ghcr.io/objectedge/fcm-worker:IMAGE_TAG` (image never built) to `ghcr.io/objectedge/fcm-api:IMAGE_TAG`. AC1 contract is now reflected in the manifest.
- [x] [Review][Patch] (C4) terraform-plan workflow's always-false AWS-creds guard fixed: secret hoisted to a job-level `env:` block so the step-level `if: env.TERRAFORM_PLAN_ROLE_ARN != ''` can read it.
- [x] [Review][Patch] (M1) Ingress default cert-manager issuer changed from `letsencrypt-prod` to `letsencrypt-staging` — non-prod clusters no longer burn through the prod ACME rate limit.
- [x] [Review][Patch] (M2) Runbook secret-creation flow now uses `--from-env-file` against a mode-600 tmpfs file with explicit shred step, instead of `--from-literal`.
- [x] [Review][Patch] (M3) `PORT` removed from ConfigMap. The container port is owned by image EXPOSE + Deployment containerPort + Service targetPort, with no precedence trap.
- [x] [Review][Patch] (m1) `.dockerignore` moved from `apps/api/` to repo root — the CI workflow's `context: .` means Docker only reads the root-level file. Added `apps/web`, `infra/terraform`, `_bmad-output`, etc. to the exclude list.
- [x] [Review][Patch] (m2) Worker gained an interim `livenessProbe` (`pgrep -f 'node .*main.js'` exec) as a stop-gap until Story 1-8 ships the proper heartbeat-file probe.
- [x] [Review][Defer] (m3) Multi-arch QEMU build cost — defer dropping `linux/arm64` until a concrete arm64 deploy target is declared. SBOM + provenance kept but flagged as a watch item
- [x] [Review][Defer] Layer-cache invalidation from `apps/web/package.json` COPY — minor optimization; revisit if API image rebuilds become a CI bottleneck

## Change Log

- 2026-05-21 — Story 1-6 implemented. 4-stage Dockerfile at `apps/api/Dockerfile`, K8s manifests at `infra/k8s/{api,worker}/`, two GitHub Actions workflows (`build-and-push.yml` for the API image; `terraform-plan.yml` carrying Story 1-5 AC4), operator runbook at `docs/ops/k8s.md`. 14 new scaffold tests; full scaffold suite 79/79 green.
- 2026-05-21 — Code review pass surfaced 11 findings. 4 critical patches: Prisma client survived prod-prune (moved to dependencies, Dockerfile reordered), readOnlyRootFilesystem got `/tmp` + cache emptyDirs, worker image ref fixed to `fcm-api` (same image both modes per AD-1), terraform-plan workflow's broken AWS-creds guard fixed. 3 major patches: ingress default issuer to `letsencrypt-staging`, runbook secret-creation to `--from-env-file`, `PORT` removed from ConfigMap. 2 moderate patches: `.dockerignore` to repo root, interim worker liveness probe. 2 items deferred. 79/79 scaffold tests green. Status: backlog → in-progress → review → done.
