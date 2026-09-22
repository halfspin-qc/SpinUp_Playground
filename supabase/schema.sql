-- ==============================================================================
-- JEV-Reviews: Supabase Database Schema
-- Run this in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Create the restaurant_reviews table
CREATE TABLE IF NOT EXISTS public.restaurant_reviews (
    id TEXT PRIMARY KEY,                             -- Apify review ID or hash
    restaurant_name TEXT NOT NULL,                  -- Name of the restaurant
    reviewer_name TEXT,                             -- Google Reviewer display name
    reviewer_url TEXT,                              -- Google Reviewer profile link
    rating NUMERIC,                                 -- Numeric rating (1.0 to 5.0)
    review_text TEXT,                               -- Raw review body text
    published_at TIMESTAMPTZ,                       -- Review timestamp from Google
    review_url TEXT,                                -- Direct link to the review
    likes_count INTEGER DEFAULT 0,                  -- Number of likes on Google
    raw_data JSONB DEFAULT '{}'::jsonb,             -- Full scraped item from Apify
    
    -- Processing & Classification state
    status TEXT DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processed', 'error')),
    sentiment TEXT 
        CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    sentiment_score NUMERIC,                        -- 1.0 to 5.0 LLM score
    classification JSONB DEFAULT '{}'::jsonb,       -- Full structured LLM output
    classified_at TIMESTAMPTZ,                      -- When LLM analyzed the review
    
    -- System timestamps
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Performance indexes for fast querying and filtering
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant ON public.restaurant_reviews(restaurant_name);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON public.restaurant_reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON public.restaurant_reviews(sentiment);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.restaurant_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_published ON public.restaurant_reviews(published_at DESC);

-- 3. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_restaurant_reviews_updated_at ON public.restaurant_reviews;
CREATE TRIGGER set_restaurant_reviews_updated_at
    BEFORE UPDATE ON public.restaurant_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.restaurant_reviews ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for viewing experiments)
CREATE POLICY "Allow public read access to reviews" 
    ON public.restaurant_reviews
    FOR SELECT 
    USING (true);

-- Allow authenticated or service_role write access (for syncing and classifying)
CREATE POLICY "Allow full access for service role"
    ON public.restaurant_reviews
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow anon insert/update if user operates with anon key in session
CREATE POLICY "Allow anon insert/update for demo sessions"
    ON public.restaurant_reviews
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- 5. Helpful Summary View
CREATE OR REPLACE VIEW public.review_stats_view AS
SELECT
    restaurant_name,
    COUNT(*) AS total_reviews,
    COUNT(*) FILTER (WHERE status = 'processed') AS classified_reviews,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending_reviews,
    ROUND(AVG(rating), 2) AS average_rating,
    ROUND(AVG(sentiment_score), 2) AS average_sentiment_score,
    COUNT(*) FILTER (WHERE sentiment = 'positive') AS positive_count,
    COUNT(*) FILTER (WHERE sentiment = 'neutral') AS neutral_count,
    COUNT(*) FILTER (WHERE sentiment = 'negative') AS negative_count
FROM public.restaurant_reviews
GROUP BY restaurant_name;
