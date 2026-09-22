import type { APIRoute } from 'astro';
import { getSupabaseClient, fetchReviews, getReviewsSummary } from '../../../lib/supabase';

export const ALL: APIRoute = async ({ request, url }) => {
  try {
    let body: Record<string, unknown> = {};
    if (request.method === 'POST') {
      body = await request.json().catch(() => ({}));
    }

    const supabaseUrl = (body.supabaseUrl as string) || request.headers.get('x-supabase-url') || undefined;
    const supabaseKey = (body.supabaseKey as string) || request.headers.get('x-supabase-key') || undefined;

    const status = (body.status as string) || url.searchParams.get('status') || undefined;
    const sentiment = (body.sentiment as string) || url.searchParams.get('sentiment') || undefined;
    const restaurantName = (body.restaurantName as string) || url.searchParams.get('restaurant') || undefined;
    const limit = Number(body.limit || url.searchParams.get('limit')) || 50;
    const offset = Number(body.offset || url.searchParams.get('offset')) || 0;

    const client = getSupabaseClient(supabaseUrl, supabaseKey);

    const [{ reviews, total }, summary] = await Promise.all([
      fetchReviews(client, { status, sentiment, restaurantName, limit, offset }),
      getReviewsSummary(client),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        reviews,
        total,
        limit,
        offset,
        summary,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message, reviews: [], total: 0, summary: null }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
