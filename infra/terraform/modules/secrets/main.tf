terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

locals {
  base_tags = merge(var.tags, {
    Application = "fcm"
    Component   = "secrets"
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

resource "aws_secretsmanager_secret" "this" {
  for_each = var.secrets

  name                    = "${var.name}/${var.environment}/${each.key}"
  description             = "FCM ${each.key} for ${var.environment}. Managed by Terraform — do not edit in console."
  recovery_window_in_days = var.recovery_window_days

  tags = local.base_tags
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each = var.secrets

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = each.value
}
