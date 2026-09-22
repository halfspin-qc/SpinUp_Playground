import type { APIRoute } from 'astro';
import { getApifyClient, fetchReviewsFromApifyDataset } from '../../../lib/apify';
import { getSupabaseClient, upsertReviews, updateReviewClassification } from '../../../lib/supabase';
import { classifyReviewWithLLM } from '../../../lib/llm';
import { getEnv } from '../../../lib/env';

/**
 * Automated Webhook Endpoint for Apify Actor Runs.
 * Configure this in your Apify Actor -> Integrations -> Webhooks:
 * Event: "Run succeeded" (ACTOR.RUN.SUCCEEDED)
 * URL: https://<your-deployed-domain-or-ngrok>/api/apify/webhook
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));

    // Extract Dataset ID from Apify Webhook payload variations
    // 1. eventData.defaultDatasetId (standard Apify webhook payload)
    // 2. resource.defaultDatasetId
    // 3. datasetId (direct POST payload)
    const datasetId =
      body?.eventData?.defaultDatasetId ||
      body?.resource?.defaultDatasetId ||
      body?.defaultDatasetId ||
      body?.datasetId ||
      getEnv('APIFY_DEFAULT_DATASET_ID');

    if (!datasetId) {
      return new Response(
        JSON.stringify({
          error: 'No defaultDatasetId found in Apify webhook payload or server .env.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize API & Supabase clients from environment
    const apifyClient = getApifyClient();
    const supabaseClient = getSupabaseClient();

    // 1. Fetch new scraped reviews from the dataset
    const limit = Number(body?.limit) || 200;
    const { reviews, rawCount } = await fetchReviewsFromApifyDataset(apifyClient, datasetId, {
      limit,
    });

    if (reviews.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Webhook received, but 0 reviews were extracted from dataset.',
          datasetId,
          synced: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Upsert into Supabase (deduplicates automatically by ID)
    const { inserted } = await upsertReviews(supabaseClient, reviews);

    // 3. Auto-classify new reviews with Jev (if JEV_API_KEY or LLM_API_KEY is configured)
    let autoClassified = 0;
    const hasKey = !!(getEnv('JEV_API_KEY') || getEnv('LLM_API_KEY'));

    if (hasKey && body?.autoClassify !== false) {
      // Process up to 10 newly inserted reviews immediately
      const toClassify = reviews.slice(0, 10);
      for (const rev of toClassify) {
        try {
          const classification = await classifyReviewWithLLM({
            restaurant_name: rev.restaurant_name,
            reviewer_name: rev.reviewer_name,
            rating: rev.rating,
            review_text: rev.review_text,
          });
          await updateReviewClassification(supabaseClient, rev.id, classification);
          autoClassified++;
        } catch {
          // Keep ingesting even if individual review classification encounters a timeout
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Apify Webhook processed successfully. Ingested ${inserted} reviews into Supabase (${autoClassified} auto-classified with Jev).`,
        datasetId,
        syncedCount: inserted,
        rawCount,
        autoClassified,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: `Apify Webhook Error: ${msg}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
