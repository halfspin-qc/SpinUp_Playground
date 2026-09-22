import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { loadEnv } from 'vite';

// Automatically populate process.env with variables from .env
const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
Object.assign(process.env, env);

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  server: {
    port: 4321
  }
});
