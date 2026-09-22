import type { ReviewClassification } from './types';
import { getEnv } from './env';

export interface LLMConfig {
  provider?: 'jev' | 'openai' | 'gemini' | 'groq';
  apiKey?: string;
  model?: string;
}

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';

/**
 * Fetch wrapper with timeout and retry for TypeSafe System One API
 */
async function fetchWithRetry(url: string, options: RequestInit, maxAttempts = 2, timeoutMs = 2500): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 429 || res.status === 529) {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
      }
      return res;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  throw lastError || new Error('Request failed after retries');
}

/**
 * Classifies a review using TypeSafe's Jev (System One) model
 */
async function classifyReviewWithJev(
  review: {
    restaurant_name: string;
    reviewer_name?: string | null;
    rating?: number | null;
    review_text?: string | null;
  },
  apiKey: string,
  modelName = 'jev-latest'
): Promise<ReviewClassification> {
  const startTime = performance.now();

  const state = {
    restaurant: review.restaurant_name,
    customer_rating: review.rating ?? null,
    reviewer: review.reviewer_name || 'Anonymous',
    review_text: review.review_text && review.review_text.trim() ? review.review_text : '(No text provided, customer left star rating only)',
  };

  const questions = {
    overall_sentiment: {
      type: 'choice',
      instructions: 'What is the customer’s overall sentiment regarding their restaurant experience?',
      criteria: {
        positive: 'Satisfied, enjoyable, complimentary, or favorable experience',
        neutral: 'Mixed, indifferent, average, or matter-of-fact tone without strong praise or complaints',
        negative: 'Dissatisfied, disappointed, frustrated, annoyed, or critical experience',
      },
    },
    food_quality: {
      type: 'score',
      instructions: 'Rate the food and beverage quality described in the review.',
      criteria: [
        'Not mentioned in the review',
        'Poor: tasteless, stale, burnt, cold, or subpar food',
        'Acceptable: average, standard, or okay food',
        'Excellent: delicious, flavorful, authentic, fresh, or outstanding food',
      ],
    },
    service_quality: {
      type: 'score',
      instructions: 'Rate the customer service, staff friendliness, and hospitality.',
      criteria: [
        'Not mentioned in the review',
        'Poor: slow, rude, inattentive, dismissive, or neglectful staff',
        'Acceptable: standard or adequate service',
        'Excellent: welcoming, fast, attentive, friendly, and hospitable staff',
      ],
    },
    cleanliness: {
      type: 'score',
      instructions: 'Rate the restaurant cleanliness, hygiene, and dining room upkeep.',
      criteria: [
        'Not mentioned in the review',
        'Dirty or unhygienic: messy restrooms, dirty tables, or poor hygiene',
        'Clean: well-kept, sanitary, and tidy',
      ],
    },
    atmosphere: {
      type: 'score',
      instructions: 'Rate the restaurant atmosphere, vibe, noise level, and ambiance.',
      criteria: [
        'Not mentioned in the review',
        'Unpleasant: overly noisy, uncomfortable, or chaotic',
        'Pleasant: cozy, romantic, lively, welcoming, or great vibe',
      ],
    },
    value_for_money: {
      type: 'score',
      instructions: 'Rate the value for money and portion pricing.',
      criteria: [
        'Not mentioned in the review',
        'Poor value: overpriced, tiny portions, or not worth the cost',
        'Good value: fair prices, generous portions, or worth every penny',
      ],
    },
    has_complaints: {
      type: 'noul',
      instructions: 'Does this review report any specific complaints, delays, errors, or issues?',
      criteria: {
        true: 'Review contains specific criticism, complaints, or negative feedback',
        false: 'No complaints reported',
      },
    },
    has_praise: {
      type: 'noul',
      instructions: 'Does this review report specific praise, highlights, or positive recommendations?',
      criteria: {
        true: 'Review contains specific praise or compliments',
        false: 'No praise reported',
      },
    },
    recommends: {
      type: 'noul',
      instructions: 'Does the reviewer explicitly or implicitly recommend this restaurant or plan to return?',
      criteria: {
        true: 'Reviewer recommends visiting or plans to return',
        false: 'Reviewer would not recommend or return',
      },
    },
  };

  const res = await fetchWithRetry(TYPESAFE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      state,
      model: modelName,
      questions,
    }),
  });

  const responseTimeMs = Math.round(performance.now() - startTime);

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Jev API Error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const answers = data.answers || {};

  // Token usage and pricing calculation based on official documentation:
  // Jev 1.13 pricing: $42 per billion tokens ($0.042 per million tokens) for input tokens. Output tokens are free ($0.00).
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const costUsd = (inputTokens / 1_000_000) * 0.042;
  const costFormatted = costUsd < 0.0001 ? `$${costUsd.toFixed(6)}` : `$${costUsd.toFixed(4)}`;

  // Parse Choice: overall_sentiment
  const sentimentChoice = answers.overall_sentiment?.choice as 'positive' | 'neutral' | 'negative' | undefined;
  const overallSentiment = sentimentChoice || (review.rating && review.rating >= 4 ? 'positive' : review.rating && review.rating <= 2 ? 'negative' : 'neutral');
  const sentimentConfidence = answers.overall_sentiment?.confidence || 0.85;

  // Calculate sentiment score
  let baseScore = overallSentiment === 'positive' ? 4.5 : overallSentiment === 'negative' ? 1.8 : 3.0;
  if (review.rating) {
    baseScore = Number(((baseScore + review.rating) / 2).toFixed(1));
  }

  // Parse Score questions (0: not mentioned, 1: poor, 2: acceptable, 3: excellent)
  const mapScoreCategory = (ans: Record<string, unknown> | undefined) => {
    if (!ans || typeof ans.score !== 'number' || ans.score < 0.4) {
      return { rating: 0, note: 'Not mentioned' };
    }
    const scoreVal = ans.score as number;
    // Map 1..3 levels to 1..5 scale
    const rating = Math.min(5, Math.max(1, Math.round(1 + ((scoreVal - 1) / 2) * 4)));
    const legend = (ans.legend as Record<string, string>) || {};
    const note = legend[Math.round(scoreVal).toString()] || `Score: ${scoreVal.toFixed(1)} (${Math.round((ans.confidence as number || 0.8) * 100)}% conf)`;
    return { rating, note };
  };

  const foodQuality = mapScoreCategory(answers.food_quality);
  const service = mapScoreCategory(answers.service_quality);
  const cleanliness = mapScoreCategory(answers.cleanliness);
  const atmosphere = mapScoreCategory(answers.atmosphere);
  const valueForMoney = mapScoreCategory(answers.value_for_money);

  // Parse Noul questions (probabilities)
  const hasComplaints = (answers.has_complaints?.noul as number) || 0;
  const hasPraise = (answers.has_praise?.noul as number) || 0;
  const recommends = (answers.recommends?.noul as number) || 0;

  // Extract positive highlights
  const positiveHighlights: string[] = [];
  if (foodQuality.rating >= 4) positiveHighlights.push('Praised food and beverage quality');
  if (service.rating >= 4) positiveHighlights.push('Commended friendly, attentive staff and service');
  if (atmosphere.rating >= 4) positiveHighlights.push('Appreciated warm, welcoming restaurant ambiance');
  if (recommends > 0.6) positiveHighlights.push('Reviewer explicitly recommends or intends to return');
  if (positiveHighlights.length === 0 && overallSentiment === 'positive') {
    positiveHighlights.push('Overall favorable dining experience');
  }

  // Extract critical complaints
  const criticalComplaints: string[] = [];
  if (hasComplaints > 0.45) {
    if (foodQuality.rating > 0 && foodQuality.rating <= 2) criticalComplaints.push('Negative feedback on food taste or preparation');
    if (service.rating > 0 && service.rating <= 2) criticalComplaints.push('Dissatisfaction with service pacing or staff attentiveness');
    if (cleanliness.rating > 0 && cleanliness.rating <= 2) criticalComplaints.push('Hygiene or dining area cleanliness concern');
    if (valueForMoney.rating > 0 && valueForMoney.rating <= 2) criticalComplaints.push('Pricing or perceived value concern');
    if (criticalComplaints.length === 0) criticalComplaints.push('Customer voiced dissatisfaction in review details');
  }

  // Action items for restaurant owner
  const actionItemsForOwner: string[] = [];
  if (service.rating > 0 && service.rating <= 2) {
    actionItemsForOwner.push('Review front-of-house table turnaround times and server communication protocols.');
  }
  if (foodQuality.rating > 0 && foodQuality.rating <= 2) {
    actionItemsForOwner.push('Inspect kitchen preparation and temperature standards for items cited by customer.');
  }
  if (cleanliness.rating > 0 && cleanliness.rating <= 2) {
    actionItemsForOwner.push('Schedule hourly restroom inspections and clean table turnover checks.');
  }
  if (actionItemsForOwner.length === 0) {
    actionItemsForOwner.push('Maintain current kitchen standards and continue positive customer engagement.');
  }

  // Synthesize one sentence summary from Jev decisions
  const sentimentLabel = overallSentiment === 'positive' ? 'favorable' : overallSentiment === 'negative' ? 'unfavorable' : 'neutral';
  const recLabel = recommends > 0.6 ? 'with an intent to return' : hasComplaints > 0.6 ? 'with specific complaints noted' : '';
  const oneSentenceSummary = `Customer reported a ${sentimentLabel} visit ${recLabel} (Jev confidence: ${Math.round(sentimentConfidence * 100)}%).`.replace(/\s+/g, ' ');

  // Extract dishes mentioned (if present in review text)
  const dishesMentioned: string[] = [];
  const text = review.review_text || '';
  const dishRegex = /\b(ramen|tonkotsu|chashu|gyoza|pasta|cacio e pepe|arancini|rigatoni|tiramisu|steak|ribeye|burger|pizza|salad|soup|sushi|tacos|curry|broth|dessert|drink|cocktail|wine|beer)\b/gi;
  const matches = text.match(dishRegex);
  if (matches) {
    const unique = Array.from(new Set(matches.map((m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())));
    dishesMentioned.push(...unique.slice(0, 5));
  }

  return {
    overallSentiment,
    sentimentScore: baseScore,
    oneSentenceSummary,
    categories: {
      foodQuality,
      service,
      cleanliness,
      atmosphere,
      valueForMoney,
    },
    dishesMentioned,
    positiveHighlights,
    criticalComplaints,
    actionItemsForOwner,
    jevMeta: {
      model: (data.model as string) || modelName,
      responseTimeMs,
      inputTokens,
      outputTokens,
      costUsd,
      costFormatted,
      confidence: {
        sentiment: sentimentConfidence,
        food: (answers.food_quality?.confidence as number) || 0.8,
        service: (answers.service_quality?.confidence as number) || 0.8,
      },
      probabilities: {
        sentiment: (answers.overall_sentiment?.probabilities as Record<string, number>) || {},
        hasComplaints,
        hasPraise,
        recommends,
      },
    },
  };
}

/**
 * Standard classification dispatcher supporting Jev (TypeSafe System One), OpenAI, Gemini, and Groq.
 */
export async function classifyReviewWithLLM(
  review: {
    restaurant_name: string;
    reviewer_name?: string | null;
    rating?: number | null;
    review_text?: string | null;
  },
  config: LLMConfig = {}
): Promise<ReviewClassification> {
  const provider = (config.provider?.trim() || getEnv('LLM_PROVIDER', 'jev')).toLowerCase();

  // If provider is Jev (or default), execute System One evaluation
  if (provider === 'jev') {
    const apiKey = config.apiKey?.trim() || getEnv('JEV_API_KEY') || getEnv('LLM_API_KEY');
    if (!apiKey) {
      throw new Error(
        'Missing Jev API key. Set JEV_API_KEY in your .env file or enter it in the Session API Keys drawer.'
      );
    }
    const model = config.model?.trim() || getEnv('LLM_MODEL', 'jev-latest');
    return classifyReviewWithJev(review, apiKey, model);
  }

  // Fallback / alternate providers: OpenAI, Gemini, Groq
  const apiKey = config.apiKey?.trim() || getEnv('LLM_API_KEY');
  if (!apiKey) {
    throw new Error(
      `Missing ${provider.toUpperCase()} API key. Set LLM_API_KEY in .env or enter it in the Session Settings modal.`
    );
  }

  const SYSTEM_PROMPT = `You are an expert restaurant operations analyst and food critique intelligence system.
Analyze the customer review and classify it strictly according to the required JSON schema.
Evaluate the review across 5 core pillars: foodQuality, service, cleanliness, atmosphere, valueForMoney.
Also extract overallSentiment, sentimentScore (1-5), oneSentenceSummary, dishesMentioned, positiveHighlights, criticalComplaints, actionItemsForOwner.
Respond ONLY with valid JSON.`;

  const userPrompt = `Restaurant: ${review.restaurant_name}
Customer Rating: ${review.rating ? `${review.rating} / 5 stars` : 'Not provided'}
Reviewer: ${review.reviewer_name || 'Anonymous'}
Customer Review Content:
"""
${review.review_text && review.review_text.trim() ? review.review_text : '(No text provided, customer left star rating only)'}
"""`;

  let rawJsonText = '';

  if (provider === 'gemini') {
    const model = config.model || process.env.LLM_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini API Error (${res.status}): ${errBody}`);
    }
    const data = await res.json();
    rawJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  } else if (provider === 'groq') {
    const model = config.model || process.env.LLM_MODEL || 'llama-3.3-70b-versatile';
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Groq API Error (${res.status}): ${errBody}`);
    }
    const data = await res.json();
    rawJsonText = data.choices?.[0]?.message?.content || '{}';
  } else {
    // OpenAI
    const model = config.model || process.env.LLM_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI API Error (${res.status}): ${errBody}`);
    }
    const data = await res.json();
    rawJsonText = data.choices?.[0]?.message?.content || '{}';
  }

  const cleaned = rawJsonText.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
  const parsed = JSON.parse(cleaned) as ReviewClassification;

  return {
    overallSentiment: parsed.overallSentiment || 'neutral',
    sentimentScore: typeof parsed.sentimentScore === 'number' ? parsed.sentimentScore : (review.rating || 3.0),
    oneSentenceSummary: parsed.oneSentenceSummary || 'Review processed.',
    categories: {
      foodQuality: parsed.categories?.foodQuality || { rating: 0, note: 'Not specified' },
      service: parsed.categories?.service || { rating: 0, note: 'Not specified' },
      cleanliness: parsed.categories?.cleanliness || { rating: 0, note: 'Not specified' },
      atmosphere: parsed.categories?.atmosphere || { rating: 0, note: 'Not specified' },
      valueForMoney: parsed.categories?.valueForMoney || { rating: 0, note: 'Not specified' },
    },
    dishesMentioned: Array.isArray(parsed.dishesMentioned) ? parsed.dishesMentioned : [],
    positiveHighlights: Array.isArray(parsed.positiveHighlights) ? parsed.positiveHighlights : [],
    criticalComplaints: Array.isArray(parsed.criticalComplaints) ? parsed.criticalComplaints : [],
    actionItemsForOwner: Array.isArray(parsed.actionItemsForOwner) ? parsed.actionItemsForOwner : [],
  };
}
