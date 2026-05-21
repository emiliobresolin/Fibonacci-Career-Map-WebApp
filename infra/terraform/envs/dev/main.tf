terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Application = "fcm"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

module "postgres" {
  source = "../../modules/postgres"

  name                       = "fcm-pg"
  environment                = "dev"
  instance_class             = var.postgres_instance_class
  allocated_storage          = 20
  multi_az                   = false
  backup_retention_days      = 7
  deletion_protection        = var.deletion_protection
  auto_minor_version_upgrade = true
}

module "redis" {
  source = "../../modules/redis"

  name                       = "fcm-redis"
  environment                = "dev"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false
}

module "object_storage" {
  source = "../../modules/object_storage"

  name          = "fcm-evidence"
  environment   = "dev"
  force_destroy = true # dev only — staging/prod must keep this off
  # access_log_bucket null in dev (no audit-grade logging needed for tear-down loops)
}

# Initial seeding of secrets at IaC apply time. Future rotation is owned by
# Secrets Manager's rotation Lambda (wired in a later operational story);
# Terraform must NOT overwrite rotated values, so the value writes here are
# the bootstrap entries and downstream changes are ignored at the secret-version
# layer. The DATABASE_URL is composed from the postgres module outputs at
# apply time so the entry seeded matches the initial password Terraform generated.
module "secrets" {
  source = "../../modules/secrets"

  name                 = "fcm"
  environment          = "dev"
  recovery_window_days = 7
  secrets = {
    database_url = format(
      "postgresql://%s:%s@%s:%d/%s?sslmode=require&schema=public",
      module.postgres.master_username,
      module.postgres.master_password,
      module.postgres.host,
      module.postgres.port,
      module.postgres.database_name,
    )
    redis_url = module.redis.connection_string
    s3_bucket = module.object_storage.bucket_name
    s3_region = module.object_storage.bucket_region
  }
}
