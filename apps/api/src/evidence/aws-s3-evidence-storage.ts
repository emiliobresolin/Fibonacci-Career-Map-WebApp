import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../common/env.config.js';
import type {
  EvidenceStorage,
  HeadResult,
  PresignPutArgs,
  PresignPutResult,
} from './evidence-storage.port.js';

/**
 * AWS S3 implementation of {@link EvidenceStorage} (Story 8-2, Arch
 * §9.1 / AD-9).
 *
 * Wraps `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. The
 * `S3Client` is constructed lazily on first use so the API process can
 * boot without S3 credentials configured (matches the
 * graceful-degrade posture used by Sentry / OTel in observability).
 * An attempt to call presignPut / head without `EVIDENCE_S3_BUCKET`
 * configured throws `EvidenceStorageNotConfiguredError` — the upload
 * controller routes that to a 503.
 *
 * Region resolution: explicit `AWS_REGION` env var first, then the
 * SDK's default chain (`AWS_REGION` → `AWS_DEFAULT_REGION` → EC2/EKS
 * instance metadata). In production both should be set.
 */
@Injectable()
export class AwsS3EvidenceStorage implements EvidenceStorage {
  private readonly logger = new Logger(AwsS3EvidenceStorage.name);
  private client: S3Client | null = null;

  constructor(@Optional() @Inject(ConfigService) private readonly config?: ConfigService<Env>) {}

  async presignPut(args: PresignPutArgs): Promise<PresignPutResult> {
    const bucket = this.requireBucket();
    const client = this.getClient();
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: args.key,
      ContentType: args.contentType,
      ContentLength: args.contentLength,
    });
    // expiresIn is in seconds. The SDK signs Content-Type into the
    // SigV4 signature; Content-Length is NOT signed on the browser-
    // PUT path (omitted from SignedHeaders for XHR/fetch compat). A
    // mismatched Content-Type at upload time gets 403 from S3; a
    // mismatched Content-Length must be enforced at finalize.
    const url = await getSignedUrl(client, cmd, { expiresIn: args.ttlSeconds });
    return {
      url,
      expiresAt: new Date(Date.now() + args.ttlSeconds * 1000),
    };
  }

  async head(key: string): Promise<HeadResult | null> {
    const bucket = this.requireBucket();
    const client = this.getClient();
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      // S3 returns ETag wrapped in exactly one pair of double-quotes
      // (RFC 7232 syntax). Strip the wrapping pair only when both
      // ends are present — never substring-strip, which would mangle
      // a malformed `"abc"def"` (defense against a misbehaving
      // S3-compatible endpoint like LocalStack/Minio).
      const rawEtag = res.ETag ?? '';
      const etag =
        rawEtag.length >= 2 && rawEtag.startsWith('"') && rawEtag.endsWith('"')
          ? rawEtag.slice(1, -1)
          : rawEtag;
      // Defense: a HEAD response without ETag or ContentLength would
      // mean S3 is misbehaving; fail loud so the finalize service can
      // route to a 502. SizeBytes uses Number() — ContentLength is
      // already a number per the SDK types, but the runtime can be a
      // string in some edge SDK builds.
      if (!etag) throw new Error('S3 HEAD returned no ETag');
      if (res.ContentLength === undefined) throw new Error('S3 HEAD returned no ContentLength');
      return {
        etag,
        contentType: res.ContentType ?? 'application/octet-stream',
        sizeBytes: Number(res.ContentLength),
      };
    } catch (err) {
      // The SDK throws NotFound as either a NoSuchKey error or a
      // generic S3ServiceException with $metadata.httpStatusCode === 404.
      // Both are "absent" — return null. Anything else is a real error.
      if (err instanceof S3ServiceException) {
        const status = err.$metadata?.httpStatusCode;
        if (status === 404 || err.name === 'NotFound' || err.name === 'NoSuchKey') {
          return null;
        }
      }
      throw err;
    }
  }

  private requireBucket(): string {
    const bucket = this.config?.get('EVIDENCE_S3_BUCKET') as string | undefined;
    if (!bucket) {
      throw new EvidenceStorageNotConfiguredError(
        'EVIDENCE_S3_BUCKET is not set; evidence storage is unavailable',
      );
    }
    return bucket;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;
    const region = this.config?.get('AWS_REGION') as string | undefined;
    const endpoint = this.config?.get('EVIDENCE_S3_ENDPOINT_URL') as string | undefined;
    this.client = new S3Client({
      ...(region ? { region } : {}),
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
    this.logger.log(
      `S3 client initialized (region=${region ?? 'default'}, endpoint=${endpoint ?? 'aws'})`,
    );
    return this.client;
  }
}

/** Thrown when storage operations are attempted without configured
 *  bucket/region. The upload controller turns this into a 503. */
export class EvidenceStorageNotConfiguredError extends Error {
  readonly code = 'EVIDENCE_STORAGE_NOT_CONFIGURED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceStorageNotConfiguredError';
  }
}
