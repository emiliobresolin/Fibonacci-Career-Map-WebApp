# Story 1.7: Observability baseline (pino logs, Prometheus metrics, OpenTelemetry, Sentry)

Status: backlog

## Story

As an operator,
I want structured logs, Prometheus metrics, OTEL traces, and Sentry error tracking from the first deploy,
so that later stories only need to emit domain signals.

## Acceptance Criteria

1. All Node processes emit pino JSON logs including `correlation_id`, `user_id` (nullable), `organization_id` (nullable), `module`.
2. `/metrics` endpoint on the API exposes default Prometheus metrics; endpoint is auth-gated (basic-auth secret from secrets manager).
3. OpenTelemetry SDK initialized in both API and worker modes; OTLP exporter endpoint configured per env.
4. Sentry DSN configured for `apps/web` browser bundle and `apps/api` Node process; a forced test exception in staging appears in Sentry.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E1.2
- E1.3

### References

- Arch §11.1–§11.4
- NFR-6.1–6.3
- AD-12
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
