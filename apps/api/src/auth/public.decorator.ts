import { SetMetadata } from '@nestjs/common';

/**
 * Marks a handler (or whole controller) as unauthenticated.
 * The global AuthGuard short-circuits when this metadata is present.
 *
 * Allowed uses today (Story 2-4): the OIDC dance routes, /healthz, /readyz,
 * and /metrics. Every other endpoint is authenticated by default — that's
 * the load-bearing inversion this story locks in.
 */
export const IS_PUBLIC_KEY = 'auth:isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
