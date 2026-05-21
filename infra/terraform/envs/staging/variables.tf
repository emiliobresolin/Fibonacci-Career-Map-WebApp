variable "region" {
  type    = string
  default = "us-east-1"
}

variable "postgres_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.medium"
}

variable "deletion_protection" {
  type    = bool
  default = true
}
