import type { NextConfig } from 'next';

const no_store = [
  {
    key: 'Cache-Control',
    value: 'private, no-store, max-age=0, must-revalidate',
  },
];

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
    { source: '/', headers: no_store },
    { source: '/akcii', headers: no_store },
    { source: '/akciya-pervye-100', headers: no_store },
    { source: '/akciya-studentam', headers: no_store },
    { source: '/akciya-podari-napitok', headers: no_store },
    { source: '/napitok-mesyaca-subzero', headers: no_store },
    { source: '/o-nas', headers: no_store },
    { source: '/kontakty', headers: no_store },
    { source: '/rabota', headers: no_store },
    { source: '/login', headers: no_store },
  ],
};

export default next_config;

if (process.env.ENABLE_CLOUDFLARE_DEV === '1') {
  import('@opennextjs/cloudflare').then((m) => m.initOpenNextCloudflareForDev());
}
