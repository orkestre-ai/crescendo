const { version } = require('./package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` produces .next/standalone/server.js for the Dockerfile.
  // It also breaks `next start` and needs env injected at the OS level, so
  // gate it on an env var: Docker sets NEXT_OUTPUT_MODE=standalone, local
  // dev/build leaves it unset so `npm run build && npm start` works normally.
  output: process.env.NEXT_OUTPUT_MODE === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: __dirname,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [],
  },
  // Packages that should stay as runtime `require()` instead of being bundled.
  // - rebrowser-playwright/pino: native deps / dynamic logger transports.
  // - cspell-lib: uses dynamic import() for plugin loading; bundling triggers
  //   "Critical dependency: the request of a dependency is an expression".
  // - @google-analytics/data + @grpc/grpc-js + google-gax: the gRPC runtime
  //   parses error trailers (grpc-status, grpc-message) via require()-loaded
  //   helpers; bundling silently drops them, leaving status.code/details as
  //   undefined and producing the literal string "undefined undefined: undefined"
  //   from google-gax's error formatter (build/src/googleError.js:306).
  serverExternalPackages: [
    'rebrowser-playwright',
    'pino',
    'pino-pretty',
    'cspell-lib',
    '@google-analytics/data',
    '@grpc/grpc-js',
    'google-gax',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
