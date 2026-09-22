// TypeScript Interfaces for JEV Reviews Pipeline

export interface ApifyRawReview {
  id?: string;
  reviewId?: string;
  placeId?: string;
  title?: string;
  placeName?: string;
  name?: string;
  reviewerName?: string;
  reviewerUrl?: string;
  authorUrl?: string;
  stars?: number | string;
  rating?: number | string;
  starsNumber?: number;
  text?: string;
  reviewText?: string;
  comment?: string;
  publishedAtDate?: string;
  publishedAt?: string;
  date?: string;
  reviewUrl?: string;
  likesCount?: number;
  [key: string]: unknown;
}

export interface CategoryAssessment {
  rating: number; // 1 to 5, 0 if not mentioned
  note: string;
}

export interface JevAnswerMeta {
  model: string;
  responseTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costFormatted: string;
  confidence?: {
    overall?: number;
    sentiment?: number;
    food?: number;
    service?: number;
  };
  probabilities?: {
    sentiment?: Record<string, number>;
    hasComplaints?: number;
    hasPraise?: number;
    recommends?: number;
  };
}

export interface ReviewClassification {
  overallSentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number; // 1.0 (very negative) to 5.0 (stellar)
  oneSentenceSummary: string;
  categories: {
    foodQuality: CategoryAssessment;
    service: CategoryAssessment;
    cleanliness: CategoryAssessment;
    atmosphere: CategoryAssessment;
    valueForMoney: CategoryAssessment;
  };
  dishesMentioned: string[];
  positiveHighlights: string[];
  criticalComplaints: string[];
  actionItemsForOwner: string[];
  jevMeta?: JevAnswerMeta;
}

export interface RestaurantReviewRecord {
  id: string;
  restaurant_name: string;
  reviewer_name?: string | null;
  reviewer_url?: string | null;
  rating?: number | null;
  review_text?: string | null;
  published_at?: string | null;
  review_url?: string | null;
  likes_count?: number;
  raw_data?: Record<string, unknown>;
  status: 'pending' | 'processed' | 'error';
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
  sentiment_score?: number | null;
  classification?: ReviewClassification | Record<string, unknown>;
  classified_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SessionCredentials {
  apifyToken?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  llmProvider?: 'jev' | 'openai' | 'gemini' | 'groq';
  llmApiKey?: string;
  jevApiKey?: string;
  llmModel?: string;
}
