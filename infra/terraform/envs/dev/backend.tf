terraform {
  # Per-env state isolation (AC3 of Story 1-5). The bucket and DynamoDB lock table
  # are provisioned out-of-band by the operator. NEVER point this at staging/prod.
  backend "s3" {
    bucket         = "fcm-tf-state-dev"
    key            = "fcm/dev.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "fcm-tf-locks-dev"
  }
}
