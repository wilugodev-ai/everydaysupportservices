import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  ...(process.env.CLOUD_RUN_BUILD === '1' ? { output: 'standalone' as const, outputFileTracingRoot: path.join(__dirname, '../..') } : {}),
};

export default config;
