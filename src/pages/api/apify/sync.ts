import type { APIRoute } from 'astro';
import { getApifyClient, fetchReviewsFromApifyDataset } from '../../../lib/apify';
import { getSupabaseClient, upsertReviews } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    
    // Support credentials from request body/headers or server .env
    const apifyToken = body.apifyToken || request.headers.get('x-apify-token') || undefined;
    const supabaseUrl = body.supabaseUrl || request.headers.get('x-supabase-url') || undefined;
    const supabaseKey = body.supabaseKey || request.headers.get('x-supabase-key') || undefined;
    
    const datasetId = body.datasetId || process.env.APIFY_DEFAULT_DATASET_ID;
    const limit = Math.min(Number(body.limit) || 100, 500);
    const defaultRestaurantName = body.restaurantName || undefined;

    if (!datasetId) {
      return new Response(
        JSON.stringify({
          error: 'Dataset ID is required. Please provide a valid Apify Dataset ID (e.g. from your Google Reviews Scraper run).',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Initialize clients
    const apifyClient = getApifyClient(apifyToken);
    const supabaseClient = getSupabaseClient(supabaseUrl, supabaseKey);

    // 2. Fetch and normalize from Apify storage
    const { reviews, rawCount } = await fetchReviewsFromApifyDataset(apifyClient, datasetId, {
      limit,
      defaultRestaurantName,
    });

    if (reviews.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No review items found in the specified Apify dataset.',
          synced: 0,
          rawCount: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Upsert into Supabase
    const { inserted } = await upsertReviews(supabaseClient, reviews);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${inserted} reviews from Apify dataset to Supabase.`,
        datasetId,
        synced: inserted,
        rawCount,
        sample: reviews.slice(0, 3).map((r) => ({
          id: r.id,
          restaurant: r.restaurant_name,
          reviewer: r.reviewer_name,
          rating: r.rating,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
