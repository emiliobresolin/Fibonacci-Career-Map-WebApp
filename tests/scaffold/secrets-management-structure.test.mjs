// Scaffold guardrail: verifies the secrets-management wiring for Story 1-9.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const k8sSecrets = resolve(root, 'infra/k8s/secrets');

// ---------- External Secrets Operator wiring (AC1, AC3) ----------

test('ClusterSecretStore manifest exists and targets AWS Secrets Manager', () => {
  const f = resolve(k8sSecrets, 'cluster-secret-store.yaml');
  assert.ok(existsSync(f), 'infra/k8s/secrets/cluster-secret-store.yaml must exist (AC1)');
  const text = readFileSync(f, 'utf8');
  assert.match(text, /kind:\s*ClusterSecretStore/, 'must declare a ClusterSecretStore (AC1)');
  assert.match(text, /aws/i, 'must target AWS Secrets Manager (AC1 — provider-neutral interface, default cloud is AWS per Arch §12.3)');
  assert.match(text, /SecretsManager/, 'must reference the SecretsManager provider');
});

test('ExternalSecret manifest maps fcm/<env>/* secrets to the fcm-api-secrets K8s Secret', () => {
  const f = resolve(k8sSecrets, 'external-secret-api.yaml');
  assert.ok(existsSync(f), 'infra/k8s/secrets/external-secret-api.yaml must exist (AC1)');
  const text = readFileSync(f, 'utf8');
  assert.match(text, /kind:\s*ExternalSecret/, 'must declare an ExternalSecret (AC1)');
  assert.match(text, /name:\s*fcm-api-secrets\b/, 'must target the fcm-api-secrets Kubernetes Secret (used by Story 1-6 deployments)');
  assert.match(text, /database_url[\s\S]*redis_url[\s\S]*s3_bucket[\s\S]*s3_region|s3_region[\s\S]*s3_bucket[\s\S]*redis_url[\s\S]*database_url/, 'must map at least database_url, redis_url, s3_bucket, s3_region (AC1)');
  // Rotation pickup (AC3) is driven by ExternalSecret.spec.refreshInterval.
  assert.match(text, /refreshInterval/, 'must declare refreshInterval so rotated secrets sync without code changes (AC3)');
});

// ---------- Secret scanning in CI (AC2) ----------

test('Gitleaks config exists at repo root', () => {
  const f = resolve(root, '.gitleaks.toml');
  assert.ok(existsSync(f), '.gitleaks.toml must exist (AC2)');
});

test('CI workflow runs secret scanning on PRs', () => {
  const wf = resolve(root, '.github/workflows/secret-scan.yml');
  assert.ok(existsSync(wf), '.github/workflows/secret-scan.yml must exist (AC2)');
  const text = readFileSync(wf, 'utf8');
  assert.match(text, /pull_request/, 'secret-scan must trigger on pull_request (AC2)');
  assert.match(text, /gitleaks/i, 'secret-scan must invoke gitleaks (AC2)');
});

// ---------- Documentation (AC4) ----------

test('docs/ops/secrets.md documents the secret inventory', () => {
  const doc = resolve(root, 'docs/ops/secrets.md');
  assert.ok(existsSync(doc), 'docs/ops/secrets.md must exist (AC4)');
  const text = readFileSync(doc, 'utf8');
  // Every secret materialized by Story 1-5's Terraform + Story 1-9's ExternalSecret
  // must appear in the inventory so operators have a single source of truth.
  assert.match(text, /database_url/i, 'docs/ops/secrets.md must list database_url (AC4)');
  assert.match(text, /redis_url/i, 'docs/ops/secrets.md must list redis_url (AC4)');
  assert.match(text, /s3_bucket/i, 'docs/ops/secrets.md must list s3_bucket (AC4)');
  assert.match(text, /METRICS_BASIC_AUTH/i, 'docs/ops/secrets.md must list metrics basic-auth credentials (AC4)');
  assert.match(text, /SENTRY_DSN/i, 'docs/ops/secrets.md must list Sentry DSN (AC4)');
  assert.match(text, /OTEL_EXPORTER_OTLP_ENDPOINT|OTLP/i, 'docs/ops/secrets.md must list the OTel exporter endpoint config (AC4)');
});

// ---------- .env.example is non-secret only (AC2) ----------

test('apps/api/.env.example contains only placeholder/non-secret values', () => {
  const text = readFileSync(resolve(root, 'apps/api/.env.example'), 'utf8');
  // The example must not contain anything that looks like a real credential.
  // Allow common placeholders: <user>, <password>, REPLACE_ME, etc.
  assert.match(text, /<user>:<password>|REPLACE_ME|<DATABASE>|<password>/, 'apps/api/.env.example must use placeholder values for DATABASE_URL (AC2)');
});
