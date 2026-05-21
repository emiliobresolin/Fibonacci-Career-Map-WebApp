import { redirect } from 'next/navigation';

import { getStubSession } from '@/lib/session';

// AC1: `/` redirects to `/login` (placeholder) or `/map` (placeholder) based on a
// stubbed session check. Real session reading lands with EPIC-2 (Identity).
// `redirect()` throws internally, so this function never reaches a return.
export default function RootPage(): JSX.Element {
  const session = getStubSession();
  redirect(session.authenticated ? '/map' : '/login');
}
