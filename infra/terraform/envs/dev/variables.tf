variable "region" {
  description = "AWS region for this environment."
  type        = string
}

variable "postgres_instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "deletion_protection" {
  type    = bool
  default = false
}
