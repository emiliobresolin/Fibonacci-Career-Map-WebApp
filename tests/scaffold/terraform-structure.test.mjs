// Scaffold guardrail: verifies the Terraform IaC layout for Story 1-5.
// Pure file-system assertions — no cloud credentials, no `terraform apply`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const tf = resolve(root, 'infra/terraform');
const modulesDir = resolve(tf, 'modules');
const envsDir = resolve(tf, 'envs');

test('infra/terraform/ exists with modules/ + envs/ + README', () => {
  assert.ok(existsSync(tf), 'infra/terraform/ must exist (AC1)');
  assert.ok(existsSync(modulesDir), 'infra/terraform/modules/ must exist (AC1)');
  assert.ok(existsSync(envsDir), 'infra/terraform/envs/ must exist (AC1)');
  assert.ok(existsSync(resolve(tf, 'README.md')), 'infra/terraform/README.md must exist');
});

test('Each required module exists with main.tf / variables.tf / outputs.tf', () => {
  for (const mod of ['postgres', 'redis', 'object_storage', 'secrets']) {
    const modDir = resolve(modulesDir, mod);
    assert.ok(existsSync(modDir), `modules/${mod}/ must exist (AC1)`);
    for (const f of ['main.tf', 'variables.tf', 'outputs.tf']) {
      assert.ok(existsSync(resolve(modDir, f)), `modules/${mod}/${f} must exist (AC1)`);
    }
  }
});

test('Each environment workspace (dev/staging/prod) has isolated state config', () => {
  for (const env of ['dev', 'staging', 'prod']) {
    const envDir = resolve(envsDir, env);
    assert.ok(existsSync(envDir), `envs/${env}/ must exist (AC1, AC3)`);
    for (const f of ['main.tf', 'backend.tf', 'variables.tf', 'terraform.tfvars']) {
      assert.ok(existsSync(resolve(envDir, f)), `envs/${env}/${f} must exist (AC1)`);
    }
    const backend = readFileSync(resolve(envDir, 'backend.tf'), 'utf8');
    assert.match(backend, /backend\s+"s3"/, `envs/${env}/backend.tf must use an S3 backend (AC3 — separate statefile per env)`);
    assert.match(backend, new RegExp(env), `envs/${env}/backend.tf must reference the env name so each env has a distinct state key (AC3)`);
  }
});

test('Postgres module declares the RDS instance + secret + outputs the connection string', () => {
  const main = readFileSync(resolve(modulesDir, 'postgres/main.tf'), 'utf8');
  assert.match(main, /aws_db_instance|aws_rds_cluster/, 'postgres module must declare RDS instance or cluster (AC1)');
  assert.match(main, /engine_version|engine\s*=/, 'postgres module must pin engine version');
  const outputs = readFileSync(resolve(modulesDir, 'postgres/outputs.tf'), 'utf8');
  assert.match(outputs, /connection_string|endpoint/, 'postgres module must output a connection string or endpoint (AC2)');
});

test('Redis module declares an ElastiCache resource', () => {
  const main = readFileSync(resolve(modulesDir, 'redis/main.tf'), 'utf8');
  assert.match(main, /aws_elasticache_(replication_group|cluster)/, 'redis module must declare an ElastiCache resource (AC1)');
});

test('Object storage module declares the evidence bucket with versioning + encryption', () => {
  const main = readFileSync(resolve(modulesDir, 'object_storage/main.tf'), 'utf8');
  assert.match(main, /aws_s3_bucket\b/, 'object_storage module must declare an S3 bucket (AC1)');
  assert.match(main, /aws_s3_bucket_versioning/, 'evidence bucket must have versioning enabled (Arch §12.5)');
  assert.match(
    main,
    /aws_s3_bucket_server_side_encryption_configuration/,
    'evidence bucket must have encryption-at-rest configured (Arch §12.6 / NFR-4.2)',
  );
});

test('Secrets module writes connection strings to the cloud secret manager', () => {
  const main = readFileSync(resolve(modulesDir, 'secrets/main.tf'), 'utf8');
  assert.match(main, /aws_secretsmanager_secret\b/, 'secrets module must declare a Secrets Manager secret (AC2)');
  assert.match(main, /aws_secretsmanager_secret_version/, 'secrets module must write the secret version (AC2)');
});

test('Each environment composes all four modules in main.tf', () => {
  for (const env of ['dev', 'staging', 'prod']) {
    const main = readFileSync(resolve(envsDir, env, 'main.tf'), 'utf8');
    for (const modSource of ['postgres', 'redis', 'object_storage', 'secrets']) {
      assert.match(
        main,
        new RegExp(`source\\s*=\\s*"\\.\\./\\.\\./modules/${modSource}"`),
        `envs/${env}/main.tf must invoke modules/${modSource} via source = "../../modules/${modSource}" (AC1)`,
      );
    }
  }
});

test('Production environment requires deletion-protection on Postgres + bucket', () => {
  const prodTfvars = readFileSync(resolve(envsDir, 'prod/terraform.tfvars'), 'utf8');
  assert.match(
    prodTfvars,
    /deletion_protection\s*=\s*true|prevent_destroy\s*=\s*true/,
    'prod env must enable deletion protection (one-line oops-prevention)',
  );
});

test('docs/ops/infrastructure.md exists and references the module/env structure', () => {
  const doc = resolve(root, 'docs/ops/infrastructure.md');
  assert.ok(existsSync(doc), 'docs/ops/infrastructure.md must exist (AC3)');
  const text = readFileSync(doc, 'utf8');
  assert.match(text, /modules/, 'docs/ops/infrastructure.md must mention modules');
  assert.match(text, /dev[\s\S]*staging[\s\S]*prod|prod[\s\S]*staging[\s\S]*dev/, 'docs/ops/infrastructure.md must mention all three environments');
  assert.match(text, /backend|tfstate/, 'docs/ops/infrastructure.md must document the per-env state isolation (AC3)');
});
