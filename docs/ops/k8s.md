# FCM — Kubernetes Operator Runbook

Story 1-6 ships the container image and the K8s manifests for `fcm-api` and
`fcm-worker`. Story 1-9 wires the External Secrets Operator that turns AWS
Secrets Manager entries into the `fcm-api-secrets` Secret referenced below.
Until then, operators populate the Secret manually.

## Single image, two deployments

Per AD-1 (architecture §3.2), `apps/api/Dockerfile` produces **one image** that
runs in two modes selected by the `API_MODE` environment variable:

| Mode | Deployment | What it does |
|---|---|---|
| `api` | `fcm-api` | NestJS HTTP server, exposes `GET /healthz` and (later epics) the REST API |
| `worker` | `fcm-worker` | NestJS application context (no HTTP), runs BullMQ consumers + cron schedulers (wired in EPIC-4) |

Both Deployments reference the same image tag; only the `API_MODE` env var and
the resource shape (HPA ranges, probe shape, terminationGracePeriodSeconds) differ.

## Apply order

```bash
# Namespace + ConfigMap + Secret first (Secret is provisioned by Story 1-9's
# External Secrets Operator; for now create it manually from AWS Secrets Manager
# entries — see docs/ops/infrastructure.md for the secret names).
kubectl apply -f infra/k8s/api/configmap.yaml

# Pre-create the Secret (one-time, per env). External Secrets Operator owns this
# from Story 1-9 onward; in the meantime, NEVER use --from-literal (the secret
# value lands in shell history + `ps aux` output + any session recording).
# Use --from-env-file against a mode-600 tmpfs file instead:
#
#   umask 077
#   mkdir -p /dev/shm/fcm
#   cat > /dev/shm/fcm/secrets.env <<EOF
#   database_url=$(aws secretsmanager get-secret-value --secret-id fcm/dev/database_url --query SecretString --output text)
#   redis_url=$(aws secretsmanager get-secret-value --secret-id fcm/dev/redis_url --query SecretString --output text)
#   s3_bucket=$(aws secretsmanager get-secret-value --secret-id fcm/dev/s3_bucket --query SecretString --output text)
#   s3_region=$(aws secretsmanager get-secret-value --secret-id fcm/dev/s3_region --query SecretString --output text)
#   EOF
#   kubectl create secret generic fcm-api-secrets --from-env-file=/dev/shm/fcm/secrets.env
#   shred -u /dev/shm/fcm/secrets.env
#
# Stop-gap until Story 1-9 wires External Secrets Operator.

# API
kubectl apply -f infra/k8s/api/deployment.yaml
kubectl apply -f infra/k8s/api/service.yaml
kubectl apply -f infra/k8s/api/ingress.yaml
kubectl apply -f infra/k8s/api/hpa.yaml

# Worker
kubectl apply -f infra/k8s/worker/deployment.yaml
kubectl apply -f infra/k8s/worker/hpa.yaml
```

After apply, verify reachability through the ingress:

```bash
curl -fsS https://api.fcm.example.com/healthz
# -> {"status":"ok"}
```

## HPA topology

| Deployment | Min | Max | Trigger | Scale-up speed | Scale-down |
|---|---|---|---|---|---|
| `fcm-api` | 2 | 10 | CPU ≥70% / memory ≥80% | +2 pods/60s, 30s stabilization | -1 pod/60s, 300s stabilization |
| `fcm-worker` | 1 | 8 | CPU ≥60% / memory ≥75% | +4 pods/60s, 15s stabilization | -1 pod/120s, 600s stabilization |

The HorizontalPodAutoscalers (`hpa.yaml` in each subdir) scale the deployments
**independently** per AD-1 — a recalc-storm in workers does not pull traffic
capacity from the API, and vice versa. Workers scale faster on the way up
because BullMQ backlog accumulates quickly under config-change fan-outs
(NFR-1.5: 5-min target for a 500-employee org-wide recalc).

In Story 1-7 (observability baseline), we add a custom metric for BullMQ queue
depth so the worker HPA reacts to backlog rather than just CPU. For now CPU is
a reasonable proxy.

## Probes

| Probe | API | Worker |
|---|---|---|
| `startupProbe` | `GET /healthz`, 60s window before liveness kicks in | (none — process-presence is implicit liveness until Story 1-8 ships the heartbeat file) |
| `livenessProbe` | `GET /healthz` every 30s, fail after 3 | (Story 1-8) |
| `readinessProbe` | `GET /healthz` every 10s, fail after 2 | (workers don't receive traffic; not applicable) |

## Image pinning

Deployments ship with `image: ghcr.io/objectedge/fcm-api:IMAGE_TAG` as a literal
placeholder. The deploy step in CI/CD (later operational story) replaces
`IMAGE_TAG` with the actual SHA tag (`sha-<commit>`) pushed by the
`build-and-push.yml` workflow. Until that step exists, operators set the tag
manually:

```bash
kubectl set image deployment/fcm-api fcm-api=ghcr.io/objectedge/fcm-api:sha-<commit>
kubectl set image deployment/fcm-worker fcm-worker=ghcr.io/objectedge/fcm-api:sha-<commit>
```

(Same image for both — `API_MODE` selects the mode at boot.)

## Security posture

- Non-root user (`fcm`, UID 1000) baked into the image; `runAsNonRoot: true` enforced in podSpec.
- `readOnlyRootFilesystem: true`, all capabilities dropped, `RuntimeDefault` seccomp profile.
- Secrets injected via `secretKeyRef` — no plaintext env values for DATABASE_URL / REDIS_URL.
- `tini` as PID 1 so SIGTERM propagates to Node and NestJS `enableShutdownHooks` fires.

## CI workflows

- `.github/workflows/build-and-push.yml` — builds the API image on push to `main`,
  pushes multi-arch (linux/amd64 + linux/arm64) to ghcr.io with `sha-<commit>` +
  `branch` + `latest` tags. SBOM and provenance attestations included.
- `.github/workflows/terraform-plan.yml` — runs `terraform plan` against all
  three envs on every PR touching `infra/terraform/`, comments the plan diff on
  the PR. AWS OIDC role (read-only) wired via `secrets.TERRAFORM_PLAN_ROLE_ARN`.

The actual cluster-side `kubectl apply` step is **not** wired in CI yet — that
lands in a later operational story alongside ArgoCD / Flux GitOps wiring. For
now CI builds + pushes; operators apply.

## See also

- `apps/api/Dockerfile` — single multi-stage image
- `infra/k8s/api/` and `infra/k8s/worker/` — Deployment / Service / Ingress / HPA / ConfigMap
- `docs/ops/infrastructure.md` — Terraform-managed cloud resources
- Architecture §12.2 (Orchestration), §12.4 (CI/CD), §12.6 (Security)
- AD-10 — Kubernetes for MVP
