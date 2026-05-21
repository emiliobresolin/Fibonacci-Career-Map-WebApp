variable "name" {
  description = "Resource name (used as a prefix; will be suffixed by environment)."
  type        = string
}

variable "environment" {
  description = "Environment slug — dev | staging | prod. Drives tagging and defaults."
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "vpc_security_group_ids" {
  description = "VPC security group IDs that may connect to the database."
  type        = list(string)
  default     = []
}

variable "db_subnet_group_name" {
  description = "Existing DB subnet group name. Required when not using the default VPC."
  type        = string
  default     = null
}

variable "engine_version" {
  description = "Postgres engine version. Arch §12.3 requires 15+."
  type        = string
  default     = "15.7"
}

variable "instance_class" {
  description = "RDS instance class. Sized per-environment in envs/<env>/terraform.tfvars."
  type        = string
}

variable "allocated_storage" {
  description = "Allocated storage in GB."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Upper bound for storage autoscaling. Set equal to allocated_storage to disable."
  type        = number
  default     = 100
}

variable "multi_az" {
  description = "Whether to provision a Multi-AZ standby (prod only by default)."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Backup retention in days. Arch §12.5: 30 days for prod, 7 for non-prod."
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Whether deletion protection is enabled. Production should be true."
  type        = bool
  default     = false
}

variable "database_name" {
  description = "Initial database name."
  type        = string
  default     = "fcm"
}

variable "master_username" {
  description = "Master username. Used only by IaC; the application connects via a less-privileged role created out-of-band."
  type        = string
  default     = "fcm_master"
}

variable "auto_minor_version_upgrade" {
  description = "Whether RDS may apply minor version bumps during the maintenance window. Off in prod (deliberate patching only)."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
