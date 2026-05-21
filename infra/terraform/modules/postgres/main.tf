terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

locals {
  full_name = "${var.name}-${var.environment}"
  base_tags = merge(var.tags, {
    Application = "fcm"
    Component   = "postgres"
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# Master password generated once and stored in Secrets Manager. After apply,
# Secrets Manager rotation Lambda (wired in a later operational story) is the
# source of truth — Terraform's `ignore_changes` below keeps it that way.
resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "-_."
}

# Static, deterministic final-snapshot identifier — no timestamp() so plans
# are stable across runs. If you destroy and re-create, the old snapshot must
# be renamed or deleted manually, which is the correct safety friction.
resource "aws_db_instance" "this" {
  identifier = local.full_name

  engine         = "postgres"
  engine_version = var.engine_version

  instance_class        = var.instance_class
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.database_name
  username = var.master_username
  password = random_password.master.result
  port     = 5432

  vpc_security_group_ids = var.vpc_security_group_ids
  db_subnet_group_name   = var.db_subnet_group_name

  multi_az            = var.multi_az
  publicly_accessible = false

  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  deletion_protection       = var.deletion_protection
  delete_automated_backups  = false
  skip_final_snapshot       = !var.deletion_protection
  final_snapshot_identifier = var.deletion_protection ? "${local.full_name}-final" : null

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60

  # auto_minor_version_upgrade is controlled per-env: dev/staging accept AWS-driven
  # minor bumps in the maintenance window; prod overrides to false and patches
  # through a deliberate Terraform PR (Arch §12.4 — controlled change).
  auto_minor_version_upgrade = var.auto_minor_version_upgrade
  apply_immediately          = false

  tags = local.base_tags

  lifecycle {
    ignore_changes = [
      # Master password rotated out-of-band via Secrets Manager.
      password,
      # AWS may patch engine_version during the maintenance window when
      # auto_minor_version_upgrade is on; ignore so plans don't try to downgrade.
      engine_version,
    ]
  }
}
