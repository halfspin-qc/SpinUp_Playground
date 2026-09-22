import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env';

export const GET: APIRoute = async () => {
  const llmProvider = getEnv('LLM_PROVIDER', 'jev');
  const hasLlmKey = !!(getEnv('JEV_API_KEY') || getEnv('LLM_API_KEY'));

  const envConfigured = {
    apify: !!getEnv('APIFY_API_TOKEN'),
    supabase: !!(getEnv('SUPABASE_URL') && (getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_ANON_KEY'))),
    llm: hasLlmKey,
    llmProvider,
  };

  return new Response(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      envConfigured,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
