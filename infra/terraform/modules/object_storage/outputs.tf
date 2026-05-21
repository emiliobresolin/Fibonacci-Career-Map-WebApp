output "bucket_name" {
  description = "S3 bucket name."
  value       = aws_s3_bucket.evidence.bucket
}

output "bucket_arn" {
  description = "S3 bucket ARN — used by IAM role policies in the app's deployment manifests."
  value       = aws_s3_bucket.evidence.arn
}

output "bucket_region" {
  description = "AWS region the bucket is provisioned in."
  value       = aws_s3_bucket.evidence.region
}
