/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  serverExternalPackages: ['escpos', 'escpos-network'],
  // Uploaded product images live in public/uploads/products but are written at
  // runtime, so Next's build-time public snapshot 404s them under `next start`.
  // afterFiles rewrite: dev/static hits serve directly, runtime files fall
  // through to the route handler that reads them from disk.
  async rewrites() {
    return [
      { source: '/uploads/products/:filename', destination: '/api/uploads/products/:filename' },
    ];
  },
};

export default nextConfig;
