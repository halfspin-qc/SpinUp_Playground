import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import type { ApifyRawReview, RestaurantReviewRecord } from './types';

export function getApifyClient(explicitToken?: string): ApifyClient {
  const token = explicitToken || process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error(
      'Missing Apify API Token. Provide it in .env or via the Session Settings modal in the web interface.'
    );
  }
  return new ApifyClient({ token });
}

/**
 * Normalizes varied Apify Google scraper outputs into a consistent RestaurantReviewRecord.
 */
export function normalizeApifyReview(
  item: ApifyRawReview,
  fallbackRestaurantName = 'Unknown Restaurant'
): Partial<RestaurantReviewRecord> {
  // Extract restaurant name
  const restaurantName =
    (item.title as string) ||
    (item.placeName as string) ||
    (item.locationName as string) ||
    (item.restaurantName as string) ||
    fallbackRestaurantName;

  // Extract reviewer name
  const reviewerName =
    (item.name as string) ||
    (item.reviewerName as string) ||
    (item.author as string) ||
    'Google User';

  // Extract review text across all possible Google Maps scraper keys
  const reviewText =
    (item.text as string) ||
    (item.textTranslated as string) ||
    (item.originalText as string) ||
    (item.reviewText as string) ||
    (item.comment as string) ||
    '';

  // Extract rating
  let rating: number | null = null;
  if (item.stars !== undefined && item.stars !== null) {
    rating = typeof item.stars === 'number' ? item.stars : parseFloat(item.stars as string);
  } else if (item.rating !== undefined && item.rating !== null) {
    rating = typeof item.rating === 'number' ? item.rating : parseFloat(item.rating as string);
  } else if (item.starsNumber !== undefined && item.starsNumber !== null) {
    rating = item.starsNumber;
  }

  // Extract published timestamp
  const rawDate =
    (item.publishedAtDate as string) ||
    (item.publishAt as string) ||
    (item.publishedAt as string) ||
    (item.date as string) ||
    null;

  let publishedAt: string | null = null;
  if (rawDate) {
    try {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        publishedAt = parsed.toISOString();
      }
    } catch {
      publishedAt = null;
    }
  }

  // Generate a deterministic ID to avoid duplicate inserts on repeated syncs
  const rawId = (item.id as string) || (item.reviewId as string);
  let id = rawId;

  if (!id) {
    // Deterministic slug hash based on restaurant, reviewer, published date, and text snippet
    const seed = `${restaurantName}_${reviewerName}_${publishedAt || ''}_${reviewText.slice(0, 30)}`;
    id = 'rev_' + Buffer.from(seed).toString('base64url').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  }

  return {
    id,
    restaurant_name: restaurantName,
    reviewer_name: reviewerName,
    reviewer_url: (item.reviewerUrl as string) || (item.authorUrl as string) || null,
    rating,
    review_text: reviewText,
    published_at: publishedAt,
    review_url: (item.reviewUrl as string) || null,
    likes_count: typeof item.likesCount === 'number' ? item.likesCount : 0,
    raw_data: item as Record<string, unknown>,
    status: 'pending',
  };
}

/**
 * Fetches items from an Apify Dataset and converts them to standardized review records.
 * Supports both:
 * 1. Place scrapers (where each dataset item is a Place containing a nested `reviews: [...]` array)
 * 2. Dedicated review scrapers (where each dataset item is directly a review)
 */
export async function fetchReviewsFromApifyDataset(
  client: ApifyClient,
  datasetId: string,
  options: { limit?: number; offset?: number; defaultRestaurantName?: string } = {}
): Promise<{ reviews: Partial<RestaurantReviewRecord>[]; rawCount: number }> {
  const { limit = 100, offset = 0, defaultRestaurantName } = options;

  const dataset = client.dataset(datasetId);
  const { items } = await dataset.listItems({
    limit,
    offset,
  });

  const rawCount = items.length;
  const reviews: Partial<RestaurantReviewRecord>[] = [];

  for (const item of items as unknown as ApifyRawReview[]) {
    // Check if this item is a Place containing a nested `reviews` array
    if (Array.isArray(item.reviews) && item.reviews.length > 0) {
      const placeName =
        (item.title as string) ||
        (item.placeName as string) ||
        (item.locationName as string) ||
        defaultRestaurantName ||
        'Unknown Restaurant';

      for (const subReview of item.reviews as ApifyRawReview[]) {
        const normalized = normalizeApifyReview(
          {
            ...subReview,
            title: placeName,
            placeId: item.placeId,
          },
          placeName
        );

        // Include place metadata in raw_data
        normalized.raw_data = {
          ...subReview,
          placeTitle: item.title,
          placeId: item.placeId,
          placeAddress: item.address,
          placeTotalScore: item.totalScore,
        };

        reviews.push(normalized);
      }
    } else {
      // Direct review item
      reviews.push(normalizeApifyReview(item, defaultRestaurantName));
    }
  }

  return { reviews, rawCount };
}
