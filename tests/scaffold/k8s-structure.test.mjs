// Scaffold guardrail: verifies the containerization + K8s manifests + CI workflow
// for Story 1-6. Pure file-system / YAML / text assertions — no live cluster needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const k8s = resolve(root, 'infra/k8s');
const api = resolve(root, 'apps/api');

// ---------- Dockerfile (AC1) ----------

test('apps/api/Dockerfile exists with a multi-stage build', () => {
  const dockerfile = resolve(api, 'Dockerfile');
  assert.ok(existsSync(dockerfile), 'apps/api/Dockerfile must exist (AC1)');
  const text = readFileSync(dockerfile, 'utf8');
  const fromMatches = text.match(/^FROM\b/gm) ?? [];
  assert.ok(fromMatches.length >= 2, `Dockerfile must have ≥2 FROM stages; found ${fromMatches.length} (AC1)`);
});

test('Dockerfile selects API or worker mode via the API_MODE env, not a different entrypoint', () => {
  const text = readFileSync(resolve(api, 'Dockerfile'), 'utf8');
  assert.match(text, /API_MODE/, 'Dockerfile must reference API_MODE (AC1)');
  // Exactly one CMD or ENTRYPOINT line for the final stage — both modes share one entrypoint.
  const cmdLines = (text.match(/^(CMD|ENTRYPOINT)\b/gm) ?? []).length;
  assert.ok(cmdLines >= 1 && cmdLines <= 2, `Dockerfile must have 1–2 CMD/ENTRYPOINT lines for the final stage; found ${cmdLines} (AC1)`);
});

test('.dockerignore at repo root excludes node_modules + dist + .env', () => {
  // Build context in CI is the repo root (`context: .`), so Docker reads the
  // .dockerignore at the context root — NOT apps/api/.dockerignore.
  const dockerignore = resolve(root, '.dockerignore');
  assert.ok(existsSync(dockerignore), '.dockerignore at repo root must exist');
  const text = readFileSync(dockerignore, 'utf8');
  assert.match(text, /^node_modules/m, '.dockerignore must exclude node_modules');
  assert.match(text, /^dist|^\*\*\/dist/m, '.dockerignore must exclude dist build output');
  assert.match(text, /^\.env/m, '.dockerignore must exclude .env');
});

// ---------- K8s manifests (AC2) ----------

test('infra/k8s/ has api/ and worker/ subdirectories', () => {
  assert.ok(existsSync(resolve(k8s, 'api')), 'infra/k8s/api/ must exist (AC2)');
  assert.ok(existsSync(resolve(k8s, 'worker')), 'infra/k8s/worker/ must exist (AC2)');
});

test('API deployment, service, ingress, HPA, and configmap manifests exist', () => {
  for (const f of ['deployment.yaml', 'service.yaml', 'ingress.yaml', 'hpa.yaml', 'configmap.yaml']) {
    assert.ok(existsSync(resolve(k8s, 'api', f)), `infra/k8s/api/${f} must exist (AC2)`);
  }
});

test('Worker deployment + HPA manifests exist', () => {
  for (const f of ['deployment.yaml', 'hpa.yaml']) {
    assert.ok(existsSync(resolve(k8s, 'worker', f)), `infra/k8s/worker/${f} must exist (AC2)`);
  }
});

test('API deployment runs the image in API mode + worker deployment runs it in worker mode', () => {
  const apiDep = readFileSync(resolve(k8s, 'api/deployment.yaml'), 'utf8');
  assert.match(apiDep, /name:\s*API_MODE[\s\S]{0,80}value:\s*['"]?api['"]?/, 'API deployment must set API_MODE=api (AC2)');

  const workerDep = readFileSync(resolve(k8s, 'worker/deployment.yaml'), 'utf8');
  assert.match(workerDep, /name:\s*API_MODE[\s\S]{0,80}value:\s*['"]?worker['"]?/, 'worker deployment must set API_MODE=worker (AC2)');
});

test('API and worker have independent HPAs (AC2)', () => {
  const apiHpa = readFileSync(resolve(k8s, 'api/hpa.yaml'), 'utf8');
  const workerHpa = readFileSync(resolve(k8s, 'worker/hpa.yaml'), 'utf8');
  assert.match(apiHpa, /kind:\s*HorizontalPodAutoscaler/, 'api hpa must declare a HorizontalPodAutoscaler');
  assert.match(workerHpa, /kind:\s*HorizontalPodAutoscaler/, 'worker hpa must declare a HorizontalPodAutoscaler');
  // Each HPA must target its own deployment.
  assert.match(apiHpa, /name:\s*fcm-api\b/, 'api HPA must target the fcm-api deployment');
  assert.match(workerHpa, /name:\s*fcm-worker\b/, 'worker HPA must target the fcm-worker deployment');
});

test('API deployment exposes the /healthz route via liveness + readiness probes', () => {
  const apiDep = readFileSync(resolve(k8s, 'api/deployment.yaml'), 'utf8');
  assert.match(apiDep, /livenessProbe[\s\S]*?\/healthz/, 'API deployment must have a liveness probe targeting /healthz (AC4)');
  assert.match(apiDep, /readinessProbe[\s\S]*?\/healthz/, 'API deployment must have a readiness probe targeting /healthz (AC4)');
});

test('Ingress routes through to the API service for / and exposes /healthz', () => {
  const ing = readFileSync(resolve(k8s, 'api/ingress.yaml'), 'utf8');
  assert.match(ing, /kind:\s*Ingress/, 'api ingress.yaml must declare an Ingress');
  assert.match(ing, /service:[\s\S]*?name:\s*fcm-api\b/, 'ingress must back the fcm-api service (AC4)');
});

test('API and worker deployments reference DATABASE_URL + REDIS_URL via secret reference, not literal values', () => {
  for (const which of ['api', 'worker']) {
    const dep = readFileSync(resolve(k8s, which, 'deployment.yaml'), 'utf8');
    assert.match(dep, /DATABASE_URL[\s\S]{0,200}secretKeyRef/, `${which} deployment must read DATABASE_URL from a secret (AC2, NFR-4.7)`);
    assert.match(dep, /REDIS_URL[\s\S]{0,200}secretKeyRef/, `${which} deployment must read REDIS_URL from a secret`);
  }
});

// ---------- CI (AC3) ----------

test('GitHub Actions workflow builds and pushes the API image on merge to main', () => {
  const wf = resolve(root, '.github/workflows/build-and-push.yml');
  assert.ok(existsSync(wf), '.github/workflows/build-and-push.yml must exist (AC3)');
  const text = readFileSync(wf, 'utf8');
  // Match either inline list `branches: [main]` or block-scalar `branches:\n  - main`.
  assert.match(
    text,
    /branches:\s*(\[\s*['"]?main['"]?\s*\]|\n\s*-\s*['"]?main['"]?)/,
    'workflow must trigger on push to main (AC3)',
  );
  assert.match(text, /docker\/build-push-action|docker\s+build/, 'workflow must invoke docker build/push (AC3)');
  assert.match(text, /github\.sha|\$\{\{\s*github\.sha\s*\}\}/, 'workflow must tag images with commit SHA (AC3)');
});

test('GitHub Actions workflow runs terraform plan on infra/terraform PRs (AC4 of Story 1-5)', () => {
  const wf = resolve(root, '.github/workflows/terraform-plan.yml');
  assert.ok(existsSync(wf), '.github/workflows/terraform-plan.yml must exist (carries Story 1-5 AC4)');
  const text = readFileSync(wf, 'utf8');
  assert.match(text, /pull_request/, 'terraform-plan workflow must trigger on pull_request');
  assert.match(text, /paths:[\s\S]*?infra\/terraform/, 'terraform-plan workflow must be path-filtered to infra/terraform');
  assert.match(text, /terraform\s+plan/, 'terraform-plan workflow must run terraform plan');
});

// ---------- Docs ----------

test('docs/ops/k8s.md operator runbook exists', () => {
  const doc = resolve(root, 'docs/ops/k8s.md');
  assert.ok(existsSync(doc), 'docs/ops/k8s.md must exist (operator runbook for Story 1-6)');
  const text = readFileSync(doc, 'utf8');
  assert.match(text, /API_MODE/, 'k8s.md must explain the single-image dual-mode deployment');
  assert.match(text, /HPA|HorizontalPodAutoscaler/, 'k8s.md must document the HPA topology');
});
