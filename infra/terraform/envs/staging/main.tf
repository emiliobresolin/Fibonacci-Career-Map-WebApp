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
      Environment = "staging"
      ManagedBy   = "terraform"
    }
  }
}

module "postgres" {
  source = "../../modules/postgres"

  name                       = "fcm-pg"
  environment                = "staging"
  instance_class             = var.postgres_instance_class
  allocated_storage          = 50
  max_allocated_storage      = 200
  multi_az                   = false
  backup_retention_days      = 14
  deletion_protection        = var.deletion_protection
  auto_minor_version_upgrade = true
}

module "redis" {
  source = "../../modules/redis"

  name                       = "fcm-redis"
  environment                = "staging"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
}

module "object_storage" {
  source = "../../modules/object_storage"

  name              = "fcm-evidence"
  environment       = "staging"
  force_destroy     = false
  # access_log_bucket can be wired here once the staging log-bucket module ships.
}

module "secrets" {
  source = "../../modules/secrets"

  name                 = "fcm"
  environment          = "staging"
  recovery_window_days = 14
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
