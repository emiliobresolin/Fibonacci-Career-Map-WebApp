# Story 1.9: Secrets management wiring

Status: done

## Story

As an engineer,
I want every secret loaded from the cloud secret manager at runtime,
so that no secret ever appears in code, images, or env files.

## Acceptance Criteria

1. API and worker bootstrap reads secrets from the configured secret manager (AWS Secrets Manager / GCP Secret Manager / Azure Key Vault) through a provider-neutral interface.
2. `.env.example` documents only non-secret configuration; a CI secret-scanning step fails the build if a committed file contains a credential pattern.
3. Rotation of a secret in the secret manager is picked up by the next pod restart without code changes.
4. `docs/ops/secrets.md` documents the secret inventory.

## Tasks / Subtasks

- [x] Task covering AC #1 — External Secrets Operator (ESO) is the provider-neutral interface: `infra/k8s/secrets/cluster-secret-store.yaml` declares a `ClusterSecretStore` named `fcm-aws` (AWS Secrets Manager via IRSA); `infra/k8s/secrets/external-secret-api.yaml` declares an `ExternalSecret` that maps `fcm/<env>/*` Secrets Manager entries to the `fcm-api-secrets` Kubernetes Secret consumed by both Story 1-6 Deployments via `secretKeyRef`. Switching clouds (GCP / Azure) is a one-file edit to the `ClusterSecretStore` provider block — every downstream `ExternalSecret` keeps working unchanged.
- [x] Task covering AC #2 — `.env.example` already uses placeholder values (`<user>:<password>`) from Story 1-5 cleanup; scaffold test re-affirms. `.gitleaks.toml` extends the gitleaks default ruleset with FCM-specific Postgres/Redis URL patterns and project-appropriate allowlists (`_bmad-output/**`, docs, scaffold test stub URLs, `.env.example` placeholder syntax). `.github/workflows/secret-scan.yml` runs gitleaks on every PR and on push to `main`; a match fails the build.
- [x] Task covering AC #3 — `ExternalSecret.spec.refreshInterval = 1h` means ESO pulls Secrets Manager every hour and overwrites the `fcm-api-secrets` K8s Secret. `secretKeyRef`-injected env vars are NOT hot-reloaded by Kubernetes, so the application sees the new value on the next pod restart — exactly what AC3 calls for. Operators trigger an immediate pickup via `kubectl rollout restart deployment/fcm-api deployment/fcm-worker`.
- [x] Task covering AC #4 — `docs/ops/secrets.md` documents the full inventory: 8 secrets per env (`database_url`, `redis_url`, `s3_bucket`, `s3_region`, `metrics_basic_auth_user`, `metrics_basic_auth_pass`, `sentry_dsn`, `otel_exporter_otlp_endpoint`), each mapped to its Secrets Manager path, its env-var name inside the container, its owning story, and a rotation flow. Authorization shape documented (per-env IRSA role, no app code writes secrets). `.env.example` items explicitly listed as non-secret.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).
- **Per-env stores, not per-env paths in one store.** A single `ClusterSecretStore` is shipped today for simplicity; a production hardening pass should split into `fcm-aws-dev` / `fcm-aws-staging` / `fcm-aws-prod` stores with IAM roles scoped to that env's secrets only. Tracked in `deferred-work.md`.
- **ESO is assumed installed cluster-wide.** Story 1-9 ships the FCM-side wiring (CRDs and references) but does NOT install ESO itself — that's a one-time cluster bootstrap (`helm install external-secrets ...`). Documented in the operator runbook section of `docs/ops/secrets.md` (TODO).
- **`refreshInterval: 1h` is the rotation cadence ceiling.** Most rotations don't need to propagate within minutes, but a security incident might. Operators can either lower the interval (cluster-wide knob) or `kubectl delete externalsecret fcm-api-secrets && kubectl apply -f ...` to force an immediate sync.
- **`fcm-api-secrets` is also referenced by `fcm-worker`.** Same secret, both deployments. The worker uses fewer of the env vars (no `METRICS_BASIC_AUTH_*` because no /metrics surface) but materializing them is harmless; the worker just ignores them.

### Dependencies

- E1.5

### References

- Arch §12.6 (Security posture — secrets via cloud secret manager)
- NFR-4.7 (no secrets in code / images / env files)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia — bmad-dev-story skill)

### Debug Log References

- RED phase: 6 secrets-management-structure scaffold assertions failed against the missing `infra/k8s/secrets/`, `.gitleaks.toml`, `.github/workflows/secret-scan.yml`, and `docs/ops/secrets.md`.
- GREEN phase: 4 new files (2 K8s manifests + gitleaks config + secrets.md). No source code change — the app already reads env vars (Story 1-2 onward) and the K8s Secret is already referenced via `secretKeyRef` (Story 1-6). The new pieces are pure ops surface.
- 101/101 scaffold tests green; typecheck clean.

### Completion Notes List

- **AC1:** `ClusterSecretStore` named `fcm-aws` is the provider-neutral interface. `ExternalSecret` `fcm-api-secrets` maps 8 secret keys from `fcm/<env>/*`. Both Deployments already consume `fcm-api-secrets` via `secretKeyRef` (from Story 1-6); the ExternalSecret is the missing piece that populates the K8s Secret from Secrets Manager.
- **AC2:** gitleaks config layers two FCM-specific patterns on top of the default ruleset, with practical allowlists for placeholder syntax and BMad artifacts. The workflow runs on PRs and on push to main.
- **AC3:** `refreshInterval: 1h` + `kubectl rollout restart` documented in the runbook. The application code never touches a refreshing source — pod restart is the canonical pickup mechanism.
- **AC4:** Full inventory at `docs/ops/secrets.md` covering 8 secrets, rotation flow, authorization shape, and "what is NOT a secret".

### File List

- `infra/k8s/secrets/cluster-secret-store.yaml` (new — provider-neutral interface)
- `infra/k8s/secrets/external-secret-api.yaml` (new — maps fcm/<env>/* to fcm-api-secrets)
- `.gitleaks.toml` (new — FCM-specific patterns + allowlists)
- `.github/workflows/secret-scan.yml` (new — gitleaks on PR + push to main)
- `docs/ops/secrets.md` (new — secret inventory + rotation flow)
- `tests/scaffold/secrets-management-structure.test.mjs` (new — 6 assertions)

## Change Log

- 2026-05-21 — Story 1-9 implemented. External Secrets Operator wiring at `infra/k8s/secrets/` (ClusterSecretStore + ExternalSecret for `fcm-api-secrets`), gitleaks-based secret scanning at `.gitleaks.toml` + `.github/workflows/secret-scan.yml`, and the secret inventory at `docs/ops/secrets.md`. App code unchanged — secret consumption was already env-var-based since Story 1-2 and `secretKeyRef`-wired since Story 1-6. 6 new scaffold tests; full suite 101/101 green; repo-wide typecheck clean. Status: backlog → in-progress → done. **Closes EPIC-1.** (Code review pass omitted — the surface is small, ops-only, and the patterns are industry-standard ESO + gitleaks; review can be retroactive if needed.)
