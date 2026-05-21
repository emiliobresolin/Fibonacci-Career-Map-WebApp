// Next.js 14 instrumentation hook — runs once at Next.js startup for both the
// Node.js runtime (Server Components, route handlers) and the edge runtime
// (middleware). Sentry uses this to register its respective config based on
// process.env.NEXT_RUNTIME.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
