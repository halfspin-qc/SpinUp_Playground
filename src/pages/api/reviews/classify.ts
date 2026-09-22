import type { APIRoute } from 'astro';
import { getSupabaseClient, updateReviewClassification, markReviewError } from '../../../lib/supabase';
import { classifyReviewWithLLM } from '../../../lib/llm';
import type { RestaurantReviewRecord } from '../../../lib/types';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));

    const supabaseUrl = (body.supabaseUrl && String(body.supabaseUrl).trim()) || request.headers.get('x-supabase-url')?.trim() || undefined;
    const supabaseKey = (body.supabaseKey && String(body.supabaseKey).trim()) || request.headers.get('x-supabase-key')?.trim() || undefined;

    const llmProvider = (body.llmProvider && String(body.llmProvider).trim()) || request.headers.get('x-llm-provider')?.trim() || undefined;
    const llmApiKey =
      (body.jevApiKey && String(body.jevApiKey).trim()) ||
      (body.llmApiKey && String(body.llmApiKey).trim()) ||
      request.headers.get('x-jev-api-key')?.trim() ||
      request.headers.get('x-llm-api-key')?.trim() ||
      undefined;
    const llmModel = (body.llmModel && String(body.llmModel).trim()) || undefined;

    const reviewId = body.reviewId;
    const batchSize = Math.min(Number(body.batchSize) || 5, 20);

    const client = getSupabaseClient(supabaseUrl, supabaseKey);

    // 1. Fetch target reviews (either a single specific ID or pending batch)
    let reviewsToProcess: RestaurantReviewRecord[] = [];

    if (reviewId) {
      const { data, error } = await client
        .from('restaurant_reviews')
        .select('*')
        .eq('id', reviewId)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: `Review with ID ${reviewId} not found.` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      reviewsToProcess = [data as RestaurantReviewRecord];
    } else {
      const { data, error } = await client
        .from('restaurant_reviews')
        .select('*')
        .in('status', ['pending', 'error'])
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(batchSize);

      if (error) {
        throw new Error(`Failed to query pending reviews: ${error.message}`);
      }
      reviewsToProcess = (data as RestaurantReviewRecord[]) || [];
    }

    if (reviewsToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No pending reviews found to classify. All reviews are up to date!',
          processedCount: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Classify each review through LLM and persist
    const results: Array<{
      id: string;
      status: 'success' | 'failed';
      summary?: string;
      responseTimeMs?: number;
      costFormatted?: string;
      error?: string;
    }> = [];

    for (const review of reviewsToProcess) {
      try {
        const classification = await classifyReviewWithLLM(
          {
            restaurant_name: review.restaurant_name,
            reviewer_name: review.reviewer_name,
            rating: review.rating,
            review_text: review.review_text,
          },
          {
            provider: llmProvider as any,
            apiKey: llmApiKey,
            model: llmModel,
          }
        );

        await updateReviewClassification(client, review.id, classification);

        results.push({
          id: review.id,
          status: 'success',
          summary: classification.oneSentenceSummary,
          responseTimeMs: classification.jevMeta?.responseTimeMs,
          costFormatted: classification.jevMeta?.costFormatted,
        });
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        await markReviewError(client, review.id, errMessage);
        results.push({
          id: review.id,
          status: 'failed',
          error: errMessage,
        });
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${reviewsToProcess.length} reviews (${successCount} succeeded, ${reviewsToProcess.length - successCount} failed).`,
        processedCount: reviewsToProcess.length,
        results,
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
