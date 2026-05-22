/** Roles recognized by the platform. PRD §4.2 precedence: ADMIN > MANAGER > EMPLOYEE.
 *  Mirrored as a Postgres native enum on `role_assignments.role` (Story 2-1). */
export const ROLES = ['EMPLOYEE', 'MANAGER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Shape stamped onto `request.user` by the global AuthGuard (Story 2-4 AC1).
 * Downstream controllers read this via `@Req() req` until the dedicated
 * `@ActorContext()` parameter decorator ships in Story 2-5.
 */
export type RequestUser = {
  user_id: string;
  organization_id: string;
  role: Role;
  /** Session anchor minted at login (Story 2-3). Kept here so the
   *  outbox emit + audit row can reference the exact session that
   *  produced the mutation. */
  jti?: string;
};
