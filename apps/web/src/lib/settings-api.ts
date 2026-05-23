// Story 7-11 — shared API client for the Admin Settings UI.
//
// Server-side fetchers wrap each Epic-7 endpoint with bearer-token auth
// and `cache: 'no-store'` so admin reads always reflect current state.
// Client-side mutators below carry the same auth.
//
// The 403 path returns a structured `{ error: 'forbidden' }` so server
// components can choose to render an "Admin only" panel vs. redirecting
// (the redirect lives in the page layout — see settings/layout.tsx).

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:3001';

export type FetchResult<T> = T | { error: string; status: number };

export function isError<T>(result: FetchResult<T>): result is { error: string; status: number } {
  return typeof result === 'object' && result !== null && 'error' in result;
}

async function authedGet<T>(path: string, token: string): Promise<FetchResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      // 401/403/404/500 — surface status + body so the UI can pick the
      // right empty-state. Don't throw: the caller has more context
      // for what to render than a thrown error gives.
      const body = await res.text().catch(() => '');
      return {
        error: body || `API returned ${res.status}`,
        status: res.status,
      };
    }
    return (await res.json()) as T;
  } catch (err) {
    return { error: `Failed to reach API: ${(err as Error).message}`, status: 0 };
  }
}

export async function authedPatch<T>(
  path: string,
  body: unknown,
  token: string,
): Promise<FetchResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: text || `API returned ${res.status}`, status: res.status };
    }
    return (await res.json()) as T;
  } catch (err) {
    return { error: `Failed to reach API: ${(err as Error).message}`, status: 0 };
  }
}

// ─── Typed read fetchers ───────────────────────────────────────────

export type VisibilityResponse = { visibilityDefault: 'OWN_ONLY' | 'TEAM' | 'ORG_SUMMARY' | 'ORG_FULL' };
export type ApprovalWorkflowResponse = { approvalWorkflowDefault: 'SINGLE' | 'DUAL_MANAGER' | 'HR_GATE' };
export type PromotionModeResponse = {
  promotionMode: 'CALIBRATION' | 'ACTIVE';
  changedAt: string | null;
  changedBy: string | null;
};

export const getVisibility = (token: string) =>
  authedGet<VisibilityResponse>('/v1/organizations/me/visibility', token);

export const getApprovalWorkflow = (token: string) =>
  authedGet<ApprovalWorkflowResponse>('/v1/organizations/me/approval-workflow', token);

export const getPromotionMode = (token: string) =>
  authedGet<PromotionModeResponse>('/v1/organizations/me/promotion-mode', token);

// Re-exported so client components can use the same const.
export { API_BASE };
