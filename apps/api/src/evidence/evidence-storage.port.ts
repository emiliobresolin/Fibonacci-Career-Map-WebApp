/**
 * Storage port for the evidence module (Story 8-2, Arch §9.1 / AD-9).
 *
 * Two operations:
 *   • {@link presignPut} returns a time-bounded, content-length-pinned
 *     presigned PUT URL the browser can use to upload bytes directly to
 *     object storage (per Arch §2.2 principle 7, "evidence bypasses the
 *     API for bytes").
 *   • {@link head} returns the object's etag / content-type / size
 *     when present, or null when the key does not exist.
 *
 * The interface is intentionally narrow — no list / delete / copy —
 * because the evidence flow only needs these two operations. Anything
 * beyond is a sign that the storage abstraction is leaking into
 * something else.
 *
 * The production implementation in
 * {@link AwsS3EvidenceStorage} wraps `@aws-sdk/client-s3`. Tests inject
 * an in-memory fake that mirrors the same shape; the upload + finalize
 * services do not import the SDK directly.
 */
export interface EvidenceStorage {
  /**
   * Build a presigned PUT URL the browser can PUT to.
   *
   * Header pinning — the SigV4 signature covers `Content-Type` (so a
   * client that sends a different MIME than declared gets a 403
   * SignatureDoesNotMatch from S3). `Content-Length` is NOT covered
   * by the signature on the `@aws-sdk/s3-request-presigner` browser-
   * PUT path — the SDK omits it from SignedHeaders so XHR/fetch can
   * stream uploads where the network stack recomputes the header.
   * Consequence: an attacker who declares 1 KB at upload-slot can
   * still PUT up to S3's 5 GiB single-PUT ceiling. The byte-cap
   * enforcement therefore lives at FINALIZE: the service compares
   * `head.sizeBytes` against the size pinned on the DRAFT row and
   * rejects with `CONTENT_LENGTH_MISMATCH` on disagreement. See the
   * order-of-operations comment in `evidence-finalize.service.ts`.
   *
   * Returns the URL and the wall-clock instant at which the signature
   * expires (computed from `now + ttlSeconds`). The caller mirrors
   * that into the API response so the browser can refresh before
   * upload if needed.
   *
   * Single-use semantics — the AC says "single-use", but S3 presigned
   * URLs are reusable within their TTL. The single-use property is
   * enforced at the EVIDENCE-ROW layer: each upload-slot call derives
   * a fresh evidence_id and embeds it in the key, so the URL maps to
   * one specific object slot tied to one DRAFT row. The finalize
   * endpoint then transitions the row to PENDING_APPROVAL, blocking
   * a second finalize against the same slot.
   */
  presignPut(args: PresignPutArgs): Promise<PresignPutResult>;

  /**
   * S3 HEAD on the object at `key`. Returns null when the object does
   * not exist (S3 NotFound). Throws for any non-404 error so the
   * finalize service can route to a 5xx.
   *
   * The etag is the S3-computed identifier (usually the MD5 of the
   * body for non-multipart uploads, or a synthetic hash for multipart).
   * The finalize service stores it verbatim — it's an opaque
   * fingerprint that future audit reads can compare against to detect
   * post-finalize tampering.
   */
  head(key: string): Promise<HeadResult | null>;

  /**
   * Build a presigned GET URL the browser can fetch the object from
   * (Story 8-3, Arch §9.2). TTL is short (default 10 min) so a leaked
   * URL has a bounded window of exposure.
   *
   * No payload pinning is needed for GET — the signature covers
   * `Bucket` + `Key` + `Expires` only. A second viewer with the same
   * URL inside its TTL CAN re-fetch the bytes; that's accepted, as
   * the audit event is emitted at presign time (one row per
   * authorization pass), not per byte-level GET.
   */
  presignGet(args: PresignGetArgs): Promise<PresignGetResult>;
}

export type PresignPutArgs = {
  key: string;
  contentType: string;
  contentLength: number;
  ttlSeconds: number;
};

export type PresignPutResult = {
  url: string;
  expiresAt: Date;
};

export type HeadResult = {
  etag: string;
  contentType: string;
  sizeBytes: number;
};

export type PresignGetArgs = {
  key: string;
  ttlSeconds: number;
};

export type PresignGetResult = {
  url: string;
  expiresAt: Date;
};

/** Injection token for {@link EvidenceStorage} so tests can override
 *  the implementation without depending on Nest's class-based provider
 *  resolution. */
export const EVIDENCE_STORAGE = Symbol('EVIDENCE_STORAGE');
