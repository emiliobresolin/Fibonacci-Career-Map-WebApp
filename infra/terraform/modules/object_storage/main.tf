terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # S3 bucket names are globally unique — suffix with account ID + env so two
  # AWS accounts deploying FCM never collide.
  bucket_name = lower("${var.name}-${var.environment}-${data.aws_caller_identity.current.account_id}")
  base_tags = merge(var.tags, {
    Application = "fcm"
    Component   = "evidence-storage"
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

resource "aws_s3_bucket" "evidence" {
  bucket        = local.bucket_name
  force_destroy = var.force_destroy
  tags          = local.base_tags
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket                  = aws_s3_bucket.evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    id     = "archive-and-expire-noncurrent-versions"
    status = "Enabled"

    # Explicit prefix filter (empty string = all objects). Silences the
    # provider deprecation warning that empty `filter {}` triggers.
    filter {
      prefix = ""
    }

    noncurrent_version_transition {
      noncurrent_days = var.noncurrent_version_transition_days
      storage_class   = "STANDARD_IA"
    }

    # Bound version growth so destroy/recreate paths aren't blocked by
    # accumulated noncurrent versions. Set noncurrent_version_expiration_days
    # to null at the call site to disable expiration.
    dynamic "noncurrent_version_expiration" {
      for_each = var.noncurrent_version_expiration_days == null ? [] : [1]
      content {
        noncurrent_days = var.noncurrent_version_expiration_days
      }
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Server access logging — null access_log_bucket disables. Staging/prod should
# enable for the audit trail (compliance with Arch §12.6 + §10 audit story).
resource "aws_s3_bucket_logging" "evidence" {
  count = var.access_log_bucket == null ? 0 : 1

  bucket        = aws_s3_bucket.evidence.id
  target_bucket = var.access_log_bucket
  target_prefix = var.access_log_prefix
}
