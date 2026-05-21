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
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

module "postgres" {
  source = "../../modules/postgres"

  name                       = "fcm-pg"
  environment                = "prod"
  instance_class             = var.postgres_instance_class
  allocated_storage          = 100
  max_allocated_storage      = 500
  multi_az                   = true
  backup_retention_days      = 30
  deletion_protection        = var.deletion_protection
  # Prod patches engine_version through a deliberate Terraform PR — no automatic
  # minor bumps during the maintenance window.
  auto_minor_version_upgrade = false
}

module "redis" {
  source = "../../modules/redis"

  name                       = "fcm-redis"
  environment                = "prod"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
}

module "object_storage" {
  source = "../../modules/object_storage"

  name          = "fcm-evidence"
  environment   = "prod"
  force_destroy = false
  # The evidence bucket is protected from accidental deletion by (a) versioning
  # (every PUT keeps prior bytes), (b) per-env state isolation (a stray destroy
  # in another env's directory can't touch prod), and (c) force_destroy=false
  # (a non-empty bucket cannot be deleted without manual emptying first).
  # access_log_bucket should be wired here once the prod log-bucket module ships.
}

module "secrets" {
  source = "../../modules/secrets"

  name                 = "fcm"
  environment          = "prod"
  recovery_window_days = 30
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
