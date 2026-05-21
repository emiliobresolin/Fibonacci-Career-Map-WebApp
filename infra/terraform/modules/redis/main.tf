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
    Component   = "redis"
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# Redis AUTH token. ElastiCache requires TLS to be enabled for AUTH to apply.
resource "random_password" "auth_token" {
  length  = 32
  special = false
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = local.full_name
  description          = "FCM Redis cluster (${var.environment}) — used for BullMQ queues and read-through cache. Not a source of truth (Arch §12.5)."

  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_clusters
  port                 = 6379
  parameter_group_name = "default.redis7"

  subnet_group_name   = var.subnet_group_name
  security_group_ids  = var.security_group_ids

  automatic_failover_enabled = var.automatic_failover_enabled
  multi_az_enabled           = var.multi_az_enabled

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.auth_token.result

  apply_immediately = false

  tags = local.base_tags

  lifecycle {
    ignore_changes = [auth_token]
  }
}
