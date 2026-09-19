import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.bcn.id.vn', pathname: '/**' },
      { protocol: 'http', hostname: '127.0.0.1', port: '9010', pathname: '/**' },
      { protocol: 'http', hostname: 'localhost', port: '9010', pathname: '/**' },
    ],
  },
};

export default nextConfig;
