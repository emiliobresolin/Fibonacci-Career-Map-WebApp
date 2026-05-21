variable "region" {
  type    = string
  default = "us-east-1"
}

variable "postgres_instance_class" {
  type    = string
  default = "db.m6g.large"
}

variable "redis_node_type" {
  type    = string
  default = "cache.m6g.large"
}

variable "deletion_protection" {
  type    = bool
  default = true
}
