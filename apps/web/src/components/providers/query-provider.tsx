'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// PRD §4.5: TanStack Query is the canonical server-state client. Background
// refetch on focus is disabled because the WebSocket gateway pushes invalidations;
// per-query overrides can opt back in for cheap 2D queries.
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  // Server: always create a fresh client so each request is isolated.
  if (typeof window === 'undefined') return makeQueryClient();
  // Browser: reuse the same client across navigations to keep the cache.
  // The module-level singleton survives soft navigations; React owns retention
  // via the useState below so Strict Mode and HMR don't swap clients mid-render.
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [client] = React.useState<QueryClient>(() => getQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
