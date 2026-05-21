output "secret_arns" {
  description = "Map of secret-name suffix -> secret ARN. Consumed by application IAM policies."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}

output "secret_names" {
  description = "Map of secret-name suffix -> fully-qualified secret name (e.g., fcm/dev/database_url)."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.name }
}
