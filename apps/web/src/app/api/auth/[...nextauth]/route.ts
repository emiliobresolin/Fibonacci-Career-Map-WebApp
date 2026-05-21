// NextAuth v4 App Router handler — exports GET + POST so /api/auth/* routes
// resolve to NextAuth's internal session / callback / signin / signout
// endpoints. The actual configuration lives in @/lib/auth.

import NextAuth from 'next-auth';

import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
