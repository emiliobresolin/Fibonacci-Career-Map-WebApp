terraform {
  # Per-env state isolation (AC3). NEVER point this at dev/prod.
  backend "s3" {
    bucket         = "fcm-tf-state-staging"
    key            = "fcm/staging.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "fcm-tf-locks-staging"
  }
}
