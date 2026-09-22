import { ApifyClient } from 'apify-client';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const DATASET_ID = process.argv[2] || process.env.APIFY_DEFAULT_DATASET_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!APIFY_TOKEN) {
  console.error('❌ Missing APIFY_API_TOKEN in .env');
  process.exit(1);
}
if (!DATASET_ID) {
  console.error('❌ Missing Dataset ID. Pass it as an argument (e.g. node scripts/sync-apify-cron.js <datasetId>) or set APIFY_DEFAULT_DATASET_ID in .env');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

async function runAutoSync() {
  console.log(`🚀 Starting automated sync from Apify Dataset [${DATASET_ID}] to Supabase...`);
  
  const apify = new ApifyClient({ token: APIFY_TOKEN });
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Fetch dataset items
  const dataset = apify.dataset(DATASET_ID);
  const { items } = await dataset.listItems({ limit: 500 });
  console.log(`📦 Fetched ${items.length} raw items from Apify dataset.`);

  // Extract reviews (handles both flat review datasets and nested place scrapers)
  const reviewsToUpsert = [];
  for (const item of items) {
    // Case 1: Place scraper with nested reviews array
    if (Array.isArray(item.reviews) && item.reviews.length > 0) {
      const restName = item.title || item.name || 'Google Place';
      for (const rev of item.reviews) {
        const text = rev.text || rev.textTranslated || rev.originalText || '';
        const id = rev.id || rev.reviewId || `${restName}_${rev.name}_${rev.publishedAtDate || Date.now()}`;
        reviewsToUpsert.push({
          id: String(id),
          restaurant_name: restName,
          reviewer_name: rev.name || 'Google User',
          reviewer_url: rev.reviewerUrl || null,
          rating: Number(rev.stars || rev.rating || 5),
          review_text: text,
          published_at: rev.publishedAtDate || null,
          review_url: rev.reviewUrl || null,
          likes_count: Number(rev.likesCount || 0),
          status: 'pending',
          sentiment: null,
          sentiment_score: null,
          classification: {},
          raw_data: rev,
        });
      }
    } else if (item.text || item.stars || item.rating) {
      // Case 2: Flat review item
      const id = item.id || item.reviewId || `${item.restaurant_name || 'Restaurant'}_${item.name}_${Date.now()}`;
      reviewsToUpsert.push({
        id: String(id),
        restaurant_name: item.restaurant_name || item.placeTitle || 'Google Restaurant',
        reviewer_name: item.name || item.reviewerName || 'Google User',
        reviewer_url: item.reviewerUrl || null,
        rating: Number(item.stars || item.rating || 5),
        review_text: item.text || item.textTranslated || '',
        published_at: item.publishedAtDate || null,
        review_url: item.reviewUrl || null,
        likes_count: Number(item.likesCount || 0),
        status: 'pending',
        sentiment: null,
        sentiment_score: null,
        classification: {},
        raw_data: item,
      });
    }
  }

  if (reviewsToUpsert.length === 0) {
    console.log('ℹ️ No valid review items found to sync.');
    return;
  }

  console.log(`🔄 Upserting ${reviewsToUpsert.length} parsed reviews into Supabase [restaurant_reviews]...`);
  const { data, error } = await supabase
    .from('restaurant_reviews')
    .upsert(reviewsToUpsert, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.error('❌ Supabase Upsert Error:', error.message);
    process.exit(1);
  }

  console.log(`✅ Success! Synced and deduplicated ${data?.length || reviewsToUpsert.length} reviews in Supabase.`);
}

runAutoSync().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
