# FCM — Infrastructure as Code (Story 1-5 baseline)

This directory provisions the managed services FCM depends on (Postgres 15+, Redis 7+,
S3-compatible object storage, Secrets Manager) for the `dev`, `staging`, and `prod`
environments. AWS is the canonical provider for the MVP; the module shapes are designed
to be portable to GCP / Azure equivalents in a future per-cloud module pass.

## Layout

```
infra/terraform/
├── modules/
│   ├── postgres/         # RDS Postgres 15+ instance
│   ├── redis/            # ElastiCache Redis 7+
│   ├── object_storage/   # S3 bucket for evidence files (versioned, encrypted)
│   └── secrets/          # Secrets Manager entries for connection strings
└── envs/
    ├── dev/              # Smallest instance sizes, deletion-protection off
    ├── staging/          # Mid-tier, deletion-protection on
    └── prod/             # Production-grade, deletion-protection on, multi-AZ
```

## Per-environment state isolation (AC3)

Each environment writes to its own state file (`fcm-tf-state-<env>/fcm/<env>.tfstate`)
via a distinct S3 backend block in `envs/<env>/backend.tf`. There is intentionally no
shared `tfstate` — accidentally pointing dev's plan at prod's state cannot happen
because the backend bucket and key differ. State bucket creation is out-of-band
(typically run once per AWS account by an operator with elevated permissions).

## Usage

```bash
# initialize an environment (run once per machine)
cd infra/terraform/envs/dev
terraform init

# preview changes (also runs in CI on PRs)
terraform plan

# apply (operator-only; CI does NOT apply on its own)
terraform apply
```

## CI guarantees (AC4)

A `terraform plan` job runs against every PR that touches `infra/terraform/`. The
workflow file lives in Story 1-6 (CI/CD pipelines); Story 1-5 ships the IaC surface
and a documented `terraform fmt` / `terraform validate` / `terraform plan` recipe.

## See also

- `docs/ops/infrastructure.md` — runbook for operators
- Architecture §12.1, §12.3, §12.6 — environments, managed services, security posture
- AG7 — provisioning-via-IaC architecture guidance
