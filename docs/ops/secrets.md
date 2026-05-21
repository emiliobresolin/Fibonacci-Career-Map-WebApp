# FCM Secrets Inventory

The complete list of secrets the API and worker consume at runtime, where they
live, how they're materialized into the pods, and who can rotate them.

## Cardinality

One entry per logical secret × per environment (dev / staging / prod). All
secrets follow the path convention:

```
fcm/<env>/<secret-name>
```

where `<env>` is `dev`, `staging`, or `prod`. The Terraform `secrets` module
(Story 1-5) creates the entries; the Kubernetes `ExternalSecret` (Story 1-9,
`infra/k8s/secrets/external-secret-api.yaml`) materializes them into the
`fcm-api-secrets` Kubernetes Secret that both Deployments reference via
`secretKeyRef`.

## Inventory

| Logical name | Secrets Manager path | Env var in container | Owner story | Notes |
|---|---|---|---|---|
| `database_url` | `fcm/<env>/database_url` | `DATABASE_URL` | E1.4 (Prisma) | Postgres connection URL with master credentials. Rotation via Secrets Manager rotation Lambda (deferred). |
| `redis_url` | `fcm/<env>/redis_url` | `REDIS_URL` | E1.5 + E4 (BullMQ) | ElastiCache TLS + AUTH connection string. Not used by code until EPIC-4. |
| `s3_bucket` | `fcm/<env>/s3_bucket` | `S3_BUCKET` | E8 (Evidence) | Evidence bucket name (not strictly secret, but env-specific). |
| `s3_region` | `fcm/<env>/s3_region` | `S3_REGION` | E8 (Evidence) | Region the bucket lives in. |
| `metrics_basic_auth_user` | `fcm/<env>/metrics_basic_auth_user` | `METRICS_BASIC_AUTH_USER` | E1.7 (Observability) | /metrics endpoint username. Required in production (env-validation `superRefine`). |
| `metrics_basic_auth_pass` | `fcm/<env>/metrics_basic_auth_pass` | `METRICS_BASIC_AUTH_PASS` | E1.7 | /metrics endpoint password. Same required-in-prod constraint. |
| `sentry_dsn` | `fcm/<env>/sentry_dsn` | `SENTRY_DSN` | E1.7 | API/Node Sentry DSN. App self-disables Sentry when unset. |
| `otel_exporter_otlp_endpoint` | `fcm/<env>/otel_exporter_otlp_endpoint` | `OTEL_EXPORTER_OTLP_ENDPOINT` | E1.7 | OTel collector URL. App self-disables tracing when unset. |

## Rotation

The end-to-end rotation flow:

1. **Rotate in Secrets Manager** — either via the Lambda (when wired) or
   manually through the AWS console / CLI. Every secret has a recovery window
   (`recovery_window_days` in the Terraform secrets module: 7 in dev/staging,
   30 in prod).
2. **External Secrets Operator syncs** — the `ExternalSecret` resource has
   `refreshInterval: 1h`. ESO reads from Secrets Manager and overwrites the
   `fcm-api-secrets` K8s Secret.
3. **Pod restart picks up the new value** — Kubernetes does NOT hot-reload
   `secretKeyRef`-injected env vars; a pod restart (rolling update or pod
   eviction) is required for the application to see the new value.

If a rotation needs to take effect immediately, trigger a rolling restart:

```bash
kubectl rollout restart deployment/fcm-api deployment/fcm-worker
```

## Authorization

- **Read** (production): `external-secrets` operator's IAM role, which has
  `secretsmanager:GetSecretValue` on `fcm/<env>/*` (one role per env so
  ESO instances in dev can't read prod). When the per-env CMK story lands
  (see `deferred-work.md`), the role also needs `kms:Decrypt` on the CMK ARN.
- **Read** (dev): operators with the FCM admin AWS profile may use
  `aws secretsmanager get-secret-value` directly. The k8s.md runbook
  documents the safe `--from-env-file` flow.
- **Write**: a Terraform `secrets` module Apply run from CI's deploy role,
  or an operator with the FCM admin role + MFA via the AWS console for ad-hoc
  rotation. No application code writes secrets.

## What is NOT a secret

`.env.example` contains only:
- `API_MODE` (mode selection, not secret)
- `NODE_ENV` (env name, not secret)
- `PORT` (deployment-level config, not secret)
- `LOG_LEVEL` (operational config, not secret)
- A placeholder `DATABASE_URL` with `<user>:<password>` syntax (intentionally
  unmistakable; never a real credential)

Other non-secret runtime config (e.g., `OTEL_SERVICE_NAME`, sample rates)
lives in the `fcm-api-config` ConfigMap (Story 1-6).

## Secret scanning in CI

`.gitleaks.toml` extends the default gitleaks ruleset with FCM-specific patterns
(Postgres and Redis URLs with embedded passwords). The
`.github/workflows/secret-scan.yml` GitHub Actions workflow runs gitleaks on
every PR and on push to `main`. A match fails the build.

Allowlists are documented inline in `.gitleaks.toml` — they cover BMad output
artifacts, docs, scaffold test stub URLs (e.g., `postgresql://stub:stub@stub.invalid`),
and the `.env.example` placeholder syntax.

## See also

- `infra/terraform/modules/secrets/` — the source of truth (creates the Secrets Manager entries)
- `infra/k8s/secrets/` — the ESO wiring (materializes into K8s Secrets)
- `docs/ops/infrastructure.md` — Terraform runbook
- `docs/ops/k8s.md` — Kubernetes operator runbook (`kubectl create secret --from-env-file` stop-gap until ESO is installed in the cluster)
- Architecture §12.6 — Security posture
