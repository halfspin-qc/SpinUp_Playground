# Step-by-Step Integration Guide: Apify + Supabase + LLM Review Classifier

This guide walks you through setting up the complete pipeline for **jev-reviews**:
1. Scraping Google restaurant reviews with **Apify**.
2. Storing and deduplicating reviews in **Supabase (PostgreSQL)**.
3. Classifying sentiments, dishes, and operational action items using a **Language Model (OpenAI, Google Gemini, or Groq)**.
4. Keeping your public repository safe from credential leaks.

---

## Architecture Overview

```
[Google Maps Restaurant]
         │
         ▼
[Apify Google Reviews Actor] ──► [Apify Dataset Storage]
                                         │
                                         ▼ (Sync via API)
                              [Supabase: restaurant_reviews]
                                         │
                                         ▼ (Classify Unprocessed)
                              [LLM Engine: GPT-4o / Gemini]
                                         │
                                         ▼ (Structured JSON Update)
                              [Interactive Dashboard & Insights]
```

---

## Stage 1: Apify Storage & Scraper Setup

Apify runs headless scrapers in the cloud and writes extracted reviews directly into an **Apify Dataset**.

### 1. Create an Apify Account
- Sign up for a free account at [apify.com](https://apify.com).

### 2. Choose a Google Maps Reviews Scraper Actor
There are several popular actors in Apify Store:
- **`compass/crawler-google-places`** (Google Maps Reviews Scraper - highly recommended)
- **`tri_angle/google-maps-reviews-scraper`**

### 3. Run the Scraper for a Target Restaurant
1. In the Apify Console, open the actor page.
2. In the input configuration, enter the Google Maps URL or search keyword of the restaurant (e.g. `Trattoria Bella Roma, New York` or the full `https://maps.google.com/?cid=...` URL).
3. Set the max number of reviews to scrape (e.g., `50` or `100` for initial testing).
4. Click **Start**.

### 4. Obtain your Dataset ID and API Token
1. Once the run finishes (or is running), go to **Storage &rarr; Datasets** in the left sidebar.
2. Click on your dataset. In the top bar or URL, find the **Dataset ID** (an alphanumeric string like `wFhK87S9ya2Zb6Pq1`).
3. To get your API token, go to **Settings / Integrations &rarr; API Tokens** and copy your Personal API Token.

---

## Stage 2: Supabase Setup (Database & Storage)

Supabase provides the PostgreSQL database and JSONB document storage for our review pipeline.

### 1. Create a Supabase Project
- Sign up or log into [supabase.com](https://supabase.com).
- Click **New Project**, choose an organization, name the project (e.g. `jev-ai-reviews`), and set a strong database password.

### 2. Run the Database Schema Migration
1. In your Supabase dashboard, click **SQL Editor** in the left navigation.
2. Click **New Query**.
3. Open the file `supabase/schema.sql` from this repository, copy the entire SQL script, and paste it into the editor.
4. Click **Run** (or press `Ctrl+Enter`).
5. You should see a success message. This creates:
   - `restaurant_reviews` table (with indexing on `restaurant_name`, `sentiment`, `status`, and `published_at`).
   - Automated `updated_at` trigger.
   - Row-Level Security (RLS) policies allowing public read and authenticated/service upsert.
   - `review_stats_view` helper view.

### 3. Retrieve Your Supabase Credentials
1. In the Supabase dashboard, navigate to **Project Settings &rarr; API** (under Configuration).
2. Copy the following values:
   - **Project URL**: `https://<your-project-id>.supabase.co`
   - **service_role (secret) key**: (Use this for backend sync & processing) OR **anon (public) key**.

---

## Stage 3: Language Model & Classifier Configuration

The classification pipeline uses AI models to sort, score, and analyze customer feedback.

### Option A: Jev / TypeSafe System One (Recommended)
- **What is Jev?** Jev doesn't write creative text; it evaluates structured questions directly over state in a single forward pass. It answers exclusively in 3 primitives:
  1. **Choice**: Pick one option from a list (e.g. `positive`, `neutral`, `negative`).
  2. **Score**: Quantitative rating on a scale (e.g. 1 to 5 for Food Quality, Service, Cleanliness, Atmosphere, Value).
  3. **Noul**: Probability of truth / likelihood (e.g. `has_complaints`, `recommends`).
- **Response Speed**: Evaluated in a single forward pass (~200ms - 500ms, 5x-10x faster than generative LLMs).
- **Cost**: **$0.042 / million input tokens** ($42 / billion tokens) and **$0 / output tokens**. An entire review classification costs under **$0.00002**!
- **API Endpoint**: `POST https://api.typesafe.ai/v1/systemone`
- **Key**: Save in `.env` as `JEV_API_KEY=...` or in the session drawer.
- **Model**: `jev-latest`.

### Option B: OpenAI
- **Key**: Create an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
- **Model**: `gpt-4o-mini`.

### Option C: Google Gemini
- **Key**: Create a free API key at [aistudio.google.com](https://aistudio.google.com).
- **Model**: `gemini-2.5-flash`.

### Option D: Groq
- **Key**: Create an API key at [console.groq.com](https://console.groq.com).
- **Model**: `llama-3.3-70b-versatile`.

---

## Stage 4: Managing Credentials (Public Repository Safety)

Because this repository will be public, **never commit API keys or database secrets to git**.

This application supports two safe approaches:

### Approach 1: In-Browser Per-Session Keys (Zero Disk Storage)
1. Launch the web application: `npm run dev`.
2. Click the **API Keys** button in the top navigation bar.
3. Enter your:
   - Apify API Token & Default Dataset ID
   - Supabase Project URL & API Key
   - LLM Provider & API Key
4. Click **Save for this Session**.
5. Keys are stored strictly in `sessionStorage` in your browser tab. Closing the tab wipes them completely. Nothing is ever saved to disk or git.

### Approach 2: Local `.env` File (Ignored by Git)
If running locally and you don't want to re-type keys:
1. Duplicate `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your keys in `.env`.
3. `.gitignore` is pre-configured to strictly ignore `.env`, ensuring it will never be committed to your public repository.

---

## Stage 5: Running the Pipeline

1. **Start the server**:
   ```bash
   npm run dev
   ```
   Open your browser to `http://localhost:4321/jev-reviews`.

2. **Stage 1: Sync from Apify**:
   - In the "Sync from Apify Storage" panel, enter your Apify **Dataset ID**.
   - Click **Sync to Supabase**.
   - Reviews from the dataset will be fetched, deduplicated by ID, and stored in Supabase with status `pending`.

3. **Stage 2: Run LLM Classifier**:
   - Select your batch size (e.g. 5 reviews).
   - Click **Run Classifier**.
   - The LLM processes each pending review and writes back:
     - Overall Sentiment (`positive`, `neutral`, `negative`)
     - Sentiment Score (1.0 to 5.0)
     - 5-Pillar Operational Breakdown (Food Quality, Service, Cleanliness, Atmosphere, Value)
     - Customer Highlights & Critical Complaints
     - Dishes/Menu items identified
     - Action Items for the restaurant owner

4. **Inspect & Filter**:
   - Filter reviews by Sentiment or Status.
   - Click **Inspect LLM** on any review card to open the deep operational inspection drawer.

---

## Troubleshooting & Tips

- **Rate Limits**: When processing large volumes of reviews, use smaller batch sizes (5-10) to avoid LLM rate limits.
- **Foreign Language Reviews**: The LLM automatically understands multilingual reviews (e.g. Spanish, French, Japanese) and produces the output in English.
- **Empty Reviews**: Customers who leave only star ratings without text are handled gracefully; the LLM infers sentiment from the star rating and flags text categories as not mentioned.
