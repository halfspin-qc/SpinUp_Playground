import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RestaurantReviewRecord, ReviewClassification } from './types';

export function getSupabaseClient(explicitUrl?: string, explicitKey?: string): SupabaseClient {
  const url = explicitUrl || process.env.SUPABASE_URL;
  const key = explicitKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase credentials. Provide them in your .env or enter them via the Session Settings in the web UI.'
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function upsertReviews(
  client: SupabaseClient,
  reviews: Partial<RestaurantReviewRecord>[]
): Promise<{ inserted: number; error?: string }> {
  if (reviews.length === 0) return { inserted: 0 };

  const { data, error } = await client
    .from('restaurant_reviews')
    .upsert(reviews, { onConflict: 'id' })
    .select('id');

  if (error) {
    throw new Error(`Supabase Upsert Error: ${error.message}`);
  }

  return { inserted: data ? data.length : reviews.length };
}

export async function fetchReviews(
  client: SupabaseClient,
  options: {
    status?: string;
    sentiment?: string;
    restaurantName?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const { status, sentiment, restaurantName, limit = 50, offset = 0 } = options;

  let query = client
    .from('restaurant_reviews')
    .select('*', { count: 'exact' })
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (sentiment && sentiment !== 'all') {
    query = query.eq('sentiment', sentiment);
  }
  if (restaurantName) {
    query = query.ilike('restaurant_name', `%${restaurantName}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Supabase Fetch Error: ${error.message}`);
  }

  return { reviews: (data as RestaurantReviewRecord[]) || [], total: count || 0 };
}

export async function updateReviewClassification(
  client: SupabaseClient,
  id: string,
  classification: ReviewClassification
) {
  const { error } = await client
    .from('restaurant_reviews')
    .update({
      classification,
      sentiment: classification.overallSentiment,
      sentiment_score: classification.sentimentScore,
      status: 'processed',
      classified_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update review ${id}: ${error.message}`);
  }
}

export async function markReviewError(client: SupabaseClient, id: string, errorMessage: string) {
  await client
    .from('restaurant_reviews')
    .update({
      status: 'error',
      raw_data: { classification_error: errorMessage },
    })
    .eq('id', id);
}

export async function getReviewsSummary(client: SupabaseClient) {
  const { data, error } = await client
    .from('restaurant_reviews')
    .select('status, sentiment, rating, sentiment_score, restaurant_name');

  if (error) {
    return {
      total: 0,
      processed: 0,
      pending: 0,
      avgRating: 0,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      restaurants: [],
    };
  }

  const rows = data || [];
  const total = rows.length;
  const processed = rows.filter((r) => r.status === 'processed').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const positiveCount = rows.filter((r) => r.sentiment === 'positive').length;
  const neutralCount = rows.filter((r) => r.sentiment === 'neutral').length;
  const negativeCount = rows.filter((r) => r.sentiment === 'negative').length;

  const ratings = rows.filter((r) => typeof r.rating === 'number').map((r) => Number(r.rating));
  const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '0.0';

  const restaurants = Array.from(new Set(rows.map((r) => r.restaurant_name).filter(Boolean)));

  return {
    total,
    processed,
    pending,
    avgRating,
    positiveCount,
    neutralCount,
    negativeCount,
    restaurants,
  };
}
