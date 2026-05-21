# Outputs intentionally do NOT include the master password or a pre-built
# connection_string. The master password is rotated out-of-band via Secrets
# Manager rotation, so any URL the module emits at apply time would go stale
# the moment rotation fires. Application config reads the live password from
# the secrets module's `database_url` entry at runtime, not at IaC apply time.

output "endpoint" {
  description = "Postgres endpoint host:port."
  value       = aws_db_instance.this.endpoint
}

output "host" {
  description = "Postgres hostname (without port)."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Postgres port."
  value       = aws_db_instance.this.port
}

output "database_name" {
  description = "Initial database name."
  value       = aws_db_instance.this.db_name
}

output "master_username" {
  description = "Master username — IaC bootstrap only; the app connects as a less-privileged role."
  value       = aws_db_instance.this.username
}

output "master_password" {
  description = "Initial master password. Sensitive. The secrets module consumes this once at apply time; future rotation happens out-of-band and the secret in Secrets Manager is the source of truth thereafter."
  value       = random_password.master.result
  sensitive   = true
}

output "instance_arn" {
  description = "RDS instance ARN — useful for IAM policies and CloudWatch alarms."
  value       = aws_db_instance.this.arn
}
