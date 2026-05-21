variable "name" {
  description = "Resource name prefix; suffixed by environment."
  type        = string
}

variable "environment" {
  description = "Environment slug — dev | staging | prod."
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "subnet_group_name" {
  description = "ElastiCache subnet group name. Required when not using the default VPC."
  type        = string
  default     = null
}

variable "security_group_ids" {
  description = "Security groups that may connect to Redis."
  type        = list(string)
  default     = []
}

variable "engine_version" {
  description = "Redis engine version. Arch §12.3 requires 7+."
  type        = string
  default     = "7.1"
}

variable "node_type" {
  description = "ElastiCache node type. Sized per-environment."
  type        = string
}

variable "num_cache_clusters" {
  description = "Number of cache clusters (primary + replicas). prod usually 2, non-prod 1."
  type        = number
  default     = 1
}

variable "automatic_failover_enabled" {
  description = "Enable automatic failover. Requires num_cache_clusters >= 2."
  type        = bool
  default     = false
}

variable "multi_az_enabled" {
  description = "Enable Multi-AZ. Requires automatic_failover_enabled."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
