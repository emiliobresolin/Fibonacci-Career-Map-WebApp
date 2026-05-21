import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { QueryProvider } from '@/components/providers/query-provider';

import './globals.css';

// Zustand store wiring: stores are module-level singletons declared in src/stores/*.
// They are imported and used directly by client components (e.g. useUIStore) — no
// React provider is required at the layout level. Keeping all client-state mount
// points discoverable via the src/stores/ directory is the canonical Zustand
// pattern for this codebase.

export const metadata: Metadata = {
  metadataBase: new URL(process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000'),
  title: 'FCM — Fibonacci Career Map',
  description: 'See where you are in the whole. 3D career exploration for engineering organizations.',
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
