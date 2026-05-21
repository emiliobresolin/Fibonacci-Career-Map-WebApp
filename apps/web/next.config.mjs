/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile internal workspace packages so they participate in the Next build.
  transpilePackages: ['@fcm/domain-contracts'],
  // experimental.typedRoutes will be re-enabled when the first <Link href="..."> lands
  // and the App Router routing surface stabilizes. It is gated on an experimental flag
  // in Next 14.x; safer to opt in once needed than to carry the upgrade risk now.
};

export default nextConfig;
