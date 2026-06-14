import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // swcMinify: true is default in modern Next.js
  
  webpack: (config, { isServer }) => {
    // Fixes for Solana and crypto packages in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve('crypto-browserify'),
        process: require.resolve('process/browser'),
        path: false,
        zlib: false,
        http: false,
        https: false,
        stream: require.resolve('stream-browserify'),
        os: false,
        buffer: require.resolve('buffer/'),
      };

      // Provide Buffer globally for Solana packages
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const webpack = require('webpack');
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );
    }

    // Ignore specific warnings
    config.ignoreWarnings = [
      { module: /node_modules\/@solana/ },
      { module: /node_modules\/bigint-buffer/ },
    ];

    return config;
  },

  transpilePackages: ['@solana/web3.js', '@solana/wallet-adapter-react', '@solana/wallet-adapter-base'],

  // Optimize production build
  productionBrowserSourceMaps: false,

  // Disable x-powered-by header
  poweredByHeader: false,
};

export default nextConfig;
