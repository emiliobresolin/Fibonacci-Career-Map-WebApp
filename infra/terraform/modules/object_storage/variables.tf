variable "name" {
  description = "Bucket name prefix; suffixed by environment + account ID for global uniqueness."
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

variable "noncurrent_version_transition_days" {
  description = "Days after which noncurrent versions transition to a cheaper storage class. Arch §12.5: 90 days."
  type        = number
  default     = 90
}

variable "noncurrent_version_expiration_days" {
  description = "Days after which noncurrent versions are deleted. Default 2555 (7 years) matches typical audit-retention horizons; set to null to keep versions forever."
  type        = number
  default     = 2555
}

variable "force_destroy" {
  description = "Whether `terraform destroy` may delete the bucket even with objects in it. true in dev only — never in staging/prod."
  type        = bool
  default     = false
}

variable "access_log_bucket" {
  description = "S3 bucket to receive server access logs. null disables access logging (dev default); set in staging/prod for audit/forensic trail."
  type        = string
  default     = null
}

variable "access_log_prefix" {
  description = "Prefix applied to access-log object keys in the log bucket."
  type        = string
  default     = "evidence-bucket/"
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
