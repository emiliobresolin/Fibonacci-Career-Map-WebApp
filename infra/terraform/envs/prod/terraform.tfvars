region                  = "us-east-1"
postgres_instance_class = "db.m6g.large"
redis_node_type         = "cache.m6g.large"

# Production-only: deletion-protection on Postgres and bucket-destroy protection.
# Combined with the recovery_window_days = 30 on secrets in main.tf, this is the
# "no one-line oops" safety net for prod. Flipping it to false requires a deliberate
# `terraform apply` against this env, which CI cannot do (CI only runs `plan`).
deletion_protection     = true
