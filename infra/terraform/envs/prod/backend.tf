terraform {
  # Per-env state isolation (AC3). NEVER point this at dev/staging.
  backend "s3" {
    bucket         = "fcm-tf-state-prod"
    key            = "fcm/prod.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "fcm-tf-locks-prod"
  }
}
