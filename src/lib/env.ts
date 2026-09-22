import dotenv from 'dotenv';
import path from 'path';

/**
 * Robust environment variable resolver for Node / Astro SSR.
 * Always retrieves the latest value from process.env or reloads from .env with override.
 */
export function getEnv(key: string, fallback = ''): string {
  // 1. Process environment (most common in production)
  if (process.env[key] && process.env[key]?.trim()) {
    return process.env[key]!.trim();
  }

  // 2. Astro / Vite import.meta.env
  try {
    const metaEnv = (import.meta as any).env;
    if (metaEnv && metaEnv[key] && String(metaEnv[key]).trim()) {
      return String(metaEnv[key]).trim();
    }
  } catch {}

  // 3. Fallback: dynamically read from local .env file
  try {
    const res = dotenv.config({
      path: path.resolve(process.cwd(), '.env'),
      override: true,
    });
    if (res.parsed && res.parsed[key] && res.parsed[key].trim()) {
      return res.parsed[key].trim();
    }
  } catch {}

  return fallback;
}
