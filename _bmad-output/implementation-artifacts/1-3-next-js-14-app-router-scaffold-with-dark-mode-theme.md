# Story 1.3: Next.js 14 App Router scaffold with dark-mode theme

Status: backlog

## Story

As an engineer,
I want `apps/web` scaffolded with Next.js 14 App Router, Tailwind + CSS variables, shadcn/ui base, TanStack Query, and Zustand,
so that UI stories have a ready canvas.

## Acceptance Criteria

1. `/` redirects to `/login` (placeholder) or `/map` (placeholder) based on a stubbed session check.
2. Dark mode is the default theme; CSS variables drive color tokens; Tailwind configured.
3. shadcn/ui CLI initialized; at least `Button`, `Dialog`, `Input` primitives generated.
4. TanStack Query provider and Zustand store provider mounted in the root layout.
5. `next build` succeeds in CI.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E1.1

### References

- Arch §4.1, §4.5
- NFR-10.1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
