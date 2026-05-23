-- Story 8-2: file-metadata columns for the finalize flow (Arch §9.1).
--
-- AC2 of 8-2 requires the finalize endpoint to record `storage_etag`,
-- `content_type`, and `size_bytes` from the S3 HEAD response on the
-- DRAFT → PENDING_APPROVAL transition. These are FILE-evidence-only
-- fields — TEXT / URL / STRUCTURED submissions populate `payload`
-- instead and leave these NULL (future story).
--
-- The columns are nullable across the board (a DRAFT row has none of
-- them yet; a TEXT-type PENDING_APPROVAL row also has none of them).
-- We DO NOT add a state-correlated CHECK here: the "exactly one of
-- {storage_object_key+metadata} OR {payload} is set on a submitted
-- row" rule depends on the requirement's `evidence_type`, which lives
-- on a different table; expressing that across tables would require a
-- trigger. The finalize service is the canonical guard and refuses
-- non-FILE requirements with a 400 — DB-level reinforcement lands
-- with the TEXT / URL submission story (8-2 follow-up).
--
-- `size_bytes` is BIGINT (PostgreSQL int8) because S3 supports
-- objects up to 5 TiB. Although evidence is expected to be small (PDF
-- / image / spreadsheet), bounding the type to INT4 (2.1 GB) would be
-- a footgun if a future requirement ever stored a screen recording.

ALTER TABLE "evidence"
    ADD COLUMN "storage_etag" TEXT,
    ADD COLUMN "content_type" TEXT,
    ADD COLUMN "size_bytes"   BIGINT;

-- Sanity CHECK: when present, size_bytes must be non-negative. A
-- negative byte count would mean the finalize service mis-parsed the
-- S3 HEAD response — fail loudly rather than persist garbage. NULL is
-- allowed (DRAFT + non-FILE submissions).
ALTER TABLE "evidence"
    ADD CONSTRAINT "evidence_size_bytes_nonneg"
    CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0);
