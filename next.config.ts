import type { NextConfig } from 'next';

const next_config: NextConfig = {
  // сборка в минимальный Node-сервер (.next/standalone/server.js) для Docker/VPS
  output: 'standalone',
  headers: async () => [
    {
      source: '/service-worker.js',
      headers: [
        {
          key: 'cache-control',
          value: 'public, max-age=0, must-revalidate',
        },
        {
          key: 'service-worker-allowed',
          value: '/',
        },
      ],
    },
  ],
};

export default next_config;

if (process.env.ENABLE_CLOUDFLARE_DEV === '1') {
  import('@opennextjs/cloudflare').then((m) => m.initOpenNextCloudflareForDev());
}
