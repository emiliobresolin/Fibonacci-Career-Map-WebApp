output "primary_endpoint" {
  description = "Redis primary endpoint host."
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "port" {
  description = "Redis port."
  value       = aws_elasticache_replication_group.this.port
}

output "connection_string" {
  description = "Full REDIS_URL connection string with TLS + AUTH (sensitive)."
  value = format(
    "rediss://:%s@%s:%d",
    random_password.auth_token.result,
    aws_elasticache_replication_group.this.primary_endpoint_address,
    aws_elasticache_replication_group.this.port,
  )
  sensitive = true
}

output "replication_group_id" {
  description = "ElastiCache replication group ID — useful for IAM policies and CloudWatch alarms."
  value       = aws_elasticache_replication_group.this.id
}
