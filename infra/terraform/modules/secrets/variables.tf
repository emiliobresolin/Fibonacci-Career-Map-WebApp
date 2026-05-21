variable "name" {
  description = "Secret name prefix; suffixed by environment."
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

variable "secrets" {
  description = "Map of secret-name suffix -> secret value. Each becomes an aws_secretsmanager_secret with one version."
  type        = map(string)
  sensitive   = true
}

variable "recovery_window_days" {
  description = "Recovery window before a deleted secret is purged. 0 = immediate purge (dev only); 30 = default for prod."
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags applied to every secret."
  type        = map(string)
  default     = {}
}
