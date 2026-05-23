/**
 * Pure helpers for evidence S3 object keys (Story 8-2).
 *
 * The canonical key shape is:
 *     org/{organization_id}/evidence/{employee_id}/{evidence_id}/{filename}
 *
 * It exists for two reasons:
 *   1. Per-org path prefix so an IAM policy on the bucket can scope
 *      reads/writes by `${aws:PrincipalTag/org_id}` (Arch §9.1, AD-9).
 *      The closed-fail tenancy posture (Arch §10.4) shows up at the
 *      bucket layer through this prefix.
 *   2. Server-derived from authenticated actor: the client never
 *      constructs a key. The upload-slot endpoint embeds
 *      `actor.organization_id` and `evidence.id` (a fresh uuid) in
 *      the key it returns, so a client-supplied finalize-time key
 *      can only ever match if it came from the same upload-slot
 *      response for the same authenticated org.
 *
 * The functions here are PURE — no IO, no Nest DI. They are imported
 * by EvidenceUploadService (key construction) and EvidenceFinalizeService
 * (AC3 forbidden-scope check).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filename character allow-list. Restricting to A-Za-z0-9._- keeps
 *  the key parsable, blocks path-traversal (no '/', no '..' as a
 *  full segment), and dodges S3-specific gotchas around URL encoding
 *  of unicode in object keys. The hyphen MUST be last in the bracket
 *  expression so it's a literal. */
const FILENAME_RE = /^[A-Za-z0-9._-]+$/;

/** Max filename length. S3 allows keys up to 1024 bytes; we want the
 *  whole key (including the org/employee/evidence prefix, ~150 chars)
 *  to fit comfortably. 200 leaves headroom + dodges UI surfaces that
 *  truncate at common widths. */
export const EVIDENCE_FILENAME_MAX = 200;

export type EvidenceKeyComponents = {
  organizationId: string;
  employeeId: string;
  evidenceId: string;
  filename: string;
};

/** Build the canonical key from its components. Throws if any
 *  component is malformed — the caller (upload-slot) controls all
 *  inputs except `filename`, so the throw should never fire in
 *  practice for the first three components. */
export function buildEvidenceKey(c: EvidenceKeyComponents): string {
  assertUuid(c.organizationId, 'organizationId');
  assertUuid(c.employeeId, 'employeeId');
  assertUuid(c.evidenceId, 'evidenceId');
  const filename = validateFilename(c.filename);
  return `org/${c.organizationId}/evidence/${c.employeeId}/${c.evidenceId}/${filename}`;
}

/**
 * AC3 — verify a key falls under the actor's organization scope.
 *
 * Returns true iff the key starts with the canonical
 * `org/{organizationId}/evidence/` prefix exactly. The check is byte-
 * exact: no `..` traversal, no double-slash, no trailing org-prefix
 * substring (e.g. a key for `org/<other>` with our org embedded
 * later in the path would fail).
 *
 * The finalize endpoint surfaces a `false` result as HTTP 403 with
 * `error: 'FORBIDDEN_SCOPE'`.
 */
export function isKeyInOrgScope(key: string, organizationId: string): boolean {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (!UUID_RE.test(organizationId)) return false;
  const requiredPrefix = `org/${organizationId}/evidence/`;
  return key.startsWith(requiredPrefix);
}

/**
 * Parse a key back into components if it matches the canonical shape.
 * Returns null if the shape doesn't match. Used by the finalize
 * service to cross-check that a stored key in the DRAFT row still
 * resolves to the actor's (organizationId, employeeId, evidenceId)
 * tuple — defense in depth against a hypothetical future bug that
 * mismatches the stored key with the row's other fields.
 */
export function parseEvidenceKey(key: string): EvidenceKeyComponents | null {
  if (typeof key !== 'string') return null;
  const parts = key.split('/');
  // Expected shape: ['org', '<orgId>', 'evidence', '<employeeId>',
  // '<evidenceId>', '<filename>']. Strict length check rejects keys
  // with extra path segments (no nesting under filename).
  if (parts.length !== 6) return null;
  if (parts[0] !== 'org' || parts[2] !== 'evidence') return null;
  const [, organizationId, , employeeId, evidenceId, filename] = parts;
  if (!UUID_RE.test(organizationId!)) return null;
  if (!UUID_RE.test(employeeId!)) return null;
  if (!UUID_RE.test(evidenceId!)) return null;
  if (!FILENAME_RE.test(filename!) || filename!.length > EVIDENCE_FILENAME_MAX) return null;
  return {
    organizationId: organizationId!,
    employeeId: employeeId!,
    evidenceId: evidenceId!,
    filename: filename!,
  };
}

/**
 * Validate + normalize a filename for inclusion in the key. Throws
 * a typed Error on malformed input so the caller can surface a 400.
 */
export function validateFilename(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new InvalidEvidenceKeyError('filename must be a string');
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InvalidEvidenceKeyError('filename is required');
  }
  if (trimmed.length > EVIDENCE_FILENAME_MAX) {
    throw new InvalidEvidenceKeyError(
      `filename must be ≤${EVIDENCE_FILENAME_MAX} chars (got ${trimmed.length})`,
    );
  }
  // Strict allow-list — see FILENAME_RE comment. Block traversal,
  // unicode oddities, and S3 reserved characters in one shot.
  if (!FILENAME_RE.test(trimmed)) {
    throw new InvalidEvidenceKeyError(
      'filename may contain only letters, digits, dot, underscore, and hyphen',
    );
  }
  // Block bare "." and ".." (FILENAME_RE accepts dots, so a filename
  // of literally "." or ".." would otherwise pass the regex even
  // though we reject path-traversal at the segment level via the
  // single-token regex).
  if (trimmed === '.' || trimmed === '..') {
    throw new InvalidEvidenceKeyError('filename must not be "." or ".."');
  }
  return trimmed;
}

export class InvalidEvidenceKeyError extends Error {
  readonly code = 'INVALID_EVIDENCE_KEY' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEvidenceKeyError';
  }
}

function assertUuid(value: string, name: string): void {
  if (!UUID_RE.test(value)) {
    throw new InvalidEvidenceKeyError(`${name} must be a UUID`);
  }
}
