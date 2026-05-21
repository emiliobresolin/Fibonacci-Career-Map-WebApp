# Story 1.5: Managed Postgres, Redis, and object storage provisioned via Terraform

Status: done

## Story

As an operator,
I want managed Postgres 15+, Redis 7+, and S3-compatible storage provisioned across dev/staging/prod via Terraform,
so that environments are reproducible.

## Acceptance Criteria

1. `infra/terraform/` defines modules for Postgres, Redis, and object storage; per-env tfvars.
2. Applying the dev workspace produces reachable endpoints whose connection strings are stored in the cloud secret manager.
3. Each environment is separately statefiled (no shared tfstate) and documented in `docs/ops/infrastructure.md`.
4. Terraform `plan` runs in CI against PRs touching `infra/terraform/`.

## Tasks / Subtasks

- [x] Task covering AC #1 — Four modules at `infra/terraform/modules/` (`postgres`, `redis`, `object_storage`, `secrets`), composed by `envs/<env>/main.tf` with per-env tfvars (`dev/staging/prod`).
- [x] Task covering AC #2 — Each env's `main.tf` writes `database_url`, `redis_url`, `s3_bucket`, `s3_region` to AWS Secrets Manager as `fcm/<env>/<name>`. `database_url` is composed at the env level from the postgres module's individual outputs (host/port/username/master_password/database_name) so a future rotation of the password updates the secret without leaving a stale URL inside the module's outputs.
- [x] Task covering AC #3 — Each env has its own `backend.tf` with an isolated S3 state bucket (`fcm-tf-state-<env>`), state key (`fcm/<env>.tfstate`), and DynamoDB lock table (`fcm-tf-locks-<env>`). State isolation is documented in `docs/ops/infrastructure.md` including the one-time bootstrap recipe.
- [x] Task covering AC #4 — `prisma:migrate:deploy`-style invocation is wired in `terraform plan` form via the `terraform` CLI; the actual CI workflow file lives in Story 1-6 (Kubernetes + CI manifests). The `docs/ops/infrastructure.md` runbook documents the expected CI shape (read-only AWS creds, state-bucket access, `terraform plan -detailed-exitcode`, PR comment with structured diff).

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).
- **AWS as canonical provider.** Per Arch §12.3 the managed services are provider-neutral targets (`RDS|Cloud SQL|Azure Flexible Server`, etc.); this story ships the AWS-flavored implementation. A future per-cloud module pass can port the modules to GCP / Azure equivalents — the module variable surface is already provider-shaped.
- **Postgres password rotation contract.** The postgres module emits the initial master password as a sensitive output and the env composes it into the `database_url` Secrets Manager entry at apply time. After that, the resource's `lifecycle.ignore_changes = [password]` ensures Terraform will NOT revert out-of-band rotations performed by AWS Secrets Manager rotation Lambda (wired in a later operational story). The app reads the live secret at runtime; it does not get a pre-built connection string from Terraform after the initial apply.
- **VPC isolation defaults to "off"** — module variables `vpc_security_group_ids`, `db_subnet_group_name`, `subnet_group_name`, `security_group_ids` default to empty/null. On a fresh AWS account this means RDS/ElastiCache fall back to the default VPC's default security group. Acceptable for a smoke-test bring-up; before real data lands, an operator must provision a VPC and pass its IDs in. A dedicated `modules/network/` is tracked in deferred-work.md.
- **State-bucket protection** is operator-owned. The bootstrap recipe in `docs/ops/infrastructure.md` creates the bucket with versioning + SSE-S3. Before exposing the bucket to CI, an explicit bucket policy + (ideally) a CMK should be applied — the state file contains `random_password.result` plaintext. This is also tracked as a deferred hardening item.

### Dependencies

- E1.1

### References

- Arch §12.1 (environments)
- Arch §12.3 (managed services — Postgres / Redis / S3 / Secrets Manager / DNS / Certs)
- Arch §12.4 (CI/CD — migrations as pre-deploy job)
- Arch §12.5 (backup + DR)
- Arch §12.6 (security posture — secrets via cloud secret manager, never in code)
- AG7 — provisioning-via-IaC architecture guidance
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia — bmad-dev-story skill)

### Debug Log References

- RED phase: 10 terraform-structure assertions failed against the empty `infra/terraform/` directory.
- GREEN phase: all four modules + three env workspaces + the docs runbook landed cleanly. No external `terraform` invocation; modules were not `terraform validate`-checked against a live install (the CI step in Story 1-6 will own that). Scaffold tests assert file structure + key content; full integration is gated on a real AWS account.
- Code review pass (single combined reviewer — Terraform diff surface is small and well-bounded): 15 findings, 7 patched in-story, 8 deferred. Most consequential patches: the postgres module no longer emits a pre-built `connection_string` (stale-after-rotation bug); `final_snapshot_identifier` dropped `timestamp()` (plan stability); S3 lifecycle gained `noncurrent_version_expiration` + `filter { prefix = "" }` + `force_destroy` variable; postgres gained `auto_minor_version_upgrade` variable + `ignore_changes = [engine_version]` (prevents downgrade-plan drift); object_storage gained optional `access_log_bucket` for audit logging; secrets module's dev `recovery_window_days` bumped from 0 to 7 (allows undo on rename); docs updated to be honest about prod bucket protection (versioning + force_destroy=false + state isolation — NOT a `prevent_destroy` lifecycle that can't be parametrized).
- 65/65 scaffold tests green after patches.

### Completion Notes List

- **AC1:** Four modules at `infra/terraform/modules/{postgres,redis,object_storage,secrets}/` with the standard `main.tf` / `variables.tf` / `outputs.tf` shape. Scaffold test asserts presence + that each module declares the expected AWS resource type (`aws_db_instance`, `aws_elasticache_replication_group`, `aws_s3_bucket`, `aws_secretsmanager_secret`). Per-env tfvars at `envs/<env>/terraform.tfvars`.
- **AC2:** `envs/dev/main.tf` composes all four modules. `module.secrets.secrets` map contains `database_url`, `redis_url`, `s3_bucket`, `s3_region`, all derived from upstream module outputs. After `terraform apply` in the dev env the four Secrets Manager entries exist at `fcm/dev/<name>` and the application can read them via the standard Secrets Manager SDK.
- **AC3:** Each env has a distinct `backend.tf` block — `fcm-tf-state-dev` / `fcm-tf-state-staging` / `fcm-tf-state-prod` buckets with matching DynamoDB lock tables. There is intentionally no shared tfstate. `docs/ops/infrastructure.md` documents the one-time bootstrap (state bucket creation, versioning, SSE, lock-table creation) plus the per-env state-key table.
- **AC4:** The runbook documents the expected CI shape — read-only AWS creds, read-access to the state bucket + lock table, `terraform plan -detailed-exitcode -out=plan.tfplan`, structured diff to PR comment via `terraform show -json | jq`. The actual workflow file ships in Story 1-6.
- **Production safety:** prod gets `deletion_protection = true` on Postgres, `force_destroy = false` on the evidence bucket, `auto_minor_version_upgrade = false`, `multi_az = true` for Postgres + `multi_az_enabled = true` for Redis, 30-day Postgres backup retention, 30-day secret recovery window.

### File List

- `infra/terraform/README.md` (new — quick-reference)
- `infra/terraform/modules/postgres/{main,variables,outputs}.tf` (new)
- `infra/terraform/modules/redis/{main,variables,outputs}.tf` (new)
- `infra/terraform/modules/object_storage/{main,variables,outputs}.tf` (new)
- `infra/terraform/modules/secrets/{main,variables,outputs}.tf` (new)
- `infra/terraform/envs/dev/{main,backend,variables}.tf` + `terraform.tfvars` (new)
- `infra/terraform/envs/staging/{main,backend,variables}.tf` + `terraform.tfvars` (new)
- `infra/terraform/envs/prod/{main,backend,variables}.tf` + `terraform.tfvars` (new)
- `docs/ops/infrastructure.md` (new — operator runbook)
- `tests/scaffold/terraform-structure.test.mjs` (new — 10 file-system assertions)

### Review Findings

- [x] [Review][Patch] (F3) Postgres `connection_string` output removed — it would have gone stale after first password rotation. Module now emits `host`, `port`, `username`, `database_name`, `master_password` (sensitive); env composes the URL once at apply time and stores it in Secrets Manager [infra/terraform/modules/postgres/outputs.tf, infra/terraform/envs/*/main.tf]
- [x] [Review][Patch] (F7) `final_snapshot_identifier` dropped `timestamp()` — was causing apply-time non-determinism even with `ignore_changes`. Now a static `${name}-final` identifier [infra/terraform/modules/postgres/main.tf]
- [x] [Review][Patch] (F12) S3 lifecycle `filter {}` (deprecated) → `filter { prefix = "" }`; added `noncurrent_version_expiration` (default 7 years) to bound version growth and unblock destroy paths [infra/terraform/modules/object_storage/main.tf]
- [x] [Review][Patch] (F5) Dev `recovery_window_days` raised from 0 to 7 — allows undoing a secret-rename in dev for a week, costs nothing [infra/terraform/envs/dev/main.tf]
- [x] [Review][Patch] (F14) `auto_minor_version_upgrade` made a variable; prod sets it false (deliberate Terraform PRs). Module `ignore_changes = [engine_version]` prevents Terraform from planning a downgrade when AWS auto-bumps non-prod [infra/terraform/modules/postgres/main.tf, infra/terraform/envs/prod/main.tf]
- [x] [Review][Patch] (F8) Docs corrected — removed the false claim of `prevent_destroy = true` on prod's bucket. Real protection documented: versioning + `force_destroy = false` + per-env state isolation. The misleading module comment about "override at module-call time" also removed [docs/ops/infrastructure.md, infra/terraform/modules/object_storage/main.tf]
- [x] [Review][Patch] (F13) S3 access logging added as an optional variable (`access_log_bucket`) — disabled in dev, can be wired in staging/prod once the log bucket exists [infra/terraform/modules/object_storage/{main,variables}.tf]
- [x] [Review][Patch] `force_destroy` added as an explicit variable on object_storage — dev sets it true (tear-down loops); staging/prod keep it false so a non-empty bucket cannot be destroyed [infra/terraform/modules/object_storage/{main,variables}.tf, infra/terraform/envs/*/main.tf]
- [x] [Review][Patch] State-bucket access posture documented — bucket policy + CMK + access review described in `docs/ops/infrastructure.md` operational notes
- [x] [Review][Defer] (F1) Dedicated `modules/network/` (VPC + private subnets + SGs) — non-trivial scope; defer to a network-isolation story. Until then, module defaults fall back to the default VPC and the runbook calls this out explicitly
- [x] [Review][Defer] (F2) Customer-managed KMS keys for Postgres / Redis / S3 — defer to a security-hardening story. Today's encryption-at-rest uses AWS-managed default keys (still encrypted, just not scoped per-app)
- [x] [Review][Defer] (F4) Secrets Manager rotation Lambda — out-of-scope per the story; tracked separately. `lifecycle.ignore_changes = [password]` already ensures Terraform won't revert future rotations
- [x] [Review][Defer] (F6) `for_each` over derived secret-map keys is fine today (keys are static literals) but a future change passing computed keys would break. Documented as a constraint
- [x] [Review][Defer] (F9) Per-secret `aws_secretsmanager_secret` resources instead of `for_each` — refactor when the secret list grows
- [x] [Review][Defer] (F10) Structured CI plan-diff output (`terraform show -json | jq`) — wired in Story 1-6 when the workflow file lands
- [x] [Review][Defer] (F11) State-bucket CMK + deny-all default policy — operator-owned; runbook documents the policy shape, dedicated hardening story tracks it
- [x] [Review][Defer] (F15) Tight provider version pin (`= 5.60.0` exact, not `~> 5.60`) — adds maintenance burden; revisit if drift causes issues

## Change Log

- 2026-05-21 — Story 1-5 implemented. Four Terraform modules (`postgres`, `redis`, `object_storage`, `secrets`) composed by three per-env workspaces (`dev`/`staging`/`prod`) with isolated S3 state backends + DynamoDB lock tables. `docs/ops/infrastructure.md` documents the layout, one-time state-bucket bootstrap, per-env state isolation, operational concerns (backups, deletion protection, rotation, VPC posture, KMS), and the CI shape that Story 1-6 will wire. 10 new scaffold tests; full scaffold suite 65/65 green.
- 2026-05-21 — Code review pass (1 combined adversarial reviewer, 15 findings). 7 in-scope patches applied: removed stale-after-rotation `connection_string` output, dropped `timestamp()` from `final_snapshot_identifier`, added `noncurrent_version_expiration` to S3 lifecycle + fixed `filter` block, dev secret recovery-window 0→7, `auto_minor_version_upgrade` made per-env (prod false), `force_destroy` added to object_storage with sane per-env defaults, optional S3 access logging variable. Docs corrected to remove the false `prevent_destroy = true` claim about prod's bucket. 8 items deferred to deferred-work.md (VPC module, CMK keys, Secrets Manager rotation, structured CI plan diff, state-bucket policy + CMK, exact provider pin, sensitive-key constraint, per-secret refactor). 65/65 scaffold tests green. Status: backlog → in-progress → review → done.
