# Step-by-Step Integration Guide: Apify + Supabase + Jev & LLM Review Classifier

This guide walks you through setting up the complete pipeline for **jev-reviews** in **SpinUp Experiments with AI**:
1. Scraping Google Maps restaurant reviews with **Apify**.
2. Storing and deduplicating reviews in **Supabase (PostgreSQL)**.
3. Classifying sentiments, 5 operational pillars, dishes, and owner recommendations using **Jev (TypeSafe System One)** or traditional generative LLMs.
4. Exploring results in both **Cards View** and the dense **Operational Score Matrix Table View**.
5. Keeping your public repository safe from credential leaks.

---

## Architecture Overview

```
[Google Maps Restaurant Scrape]
                │
                ▼
  [Apify Google Reviews Actor] ──► [Apify Dataset Storage]
                                            │
                                            ▼ (Sync via API)
                                 [Supabase: restaurant_reviews]
                                            │
                                            ▼ (Classify Pending/Errored)
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
     [Jev (TypeSafe System One)]                     [Generative LLMs]
   (Choice, Score, Noul Primitives)               (OpenAI, Gemini, Groq)
     ⚡ ~95ms - 365ms | $0.042/Mtok                 ~1.2s - 2.5s | $0.15+/Mtok
                    │                                               │
                    └───────────────────────┬───────────────────────┘
                                            ▼ (Structured JSON Update)
                    [Interactive Dashboard: Cards & Score Matrix Table]
```

---

## Stage 1: Apify Storage & Scraper Setup

Apify runs headless scrapers in the cloud and writes extracted reviews directly into an **Apify Dataset**.

### 1. Create an Apify Account
- Sign up for a free account at [apify.com](https://apify.com).

### 2. Choose a Google Maps Reviews Scraper Actor
There are several popular actors in Apify Store:
- **`compass/crawler-google-places`** (Google Maps Reviews Scraper - highly recommended; our pipeline automatically unrolls nested reviews from place objects)
- **`tri_angle/google-maps-reviews-scraper`**

### 3. Run the Scraper for a Target Restaurant
1. In the Apify Console, open the actor page.
2. In the input configuration, enter the Google Maps URL or search keyword of the restaurant (e.g. `Trattoria Bella Roma, New York` or the full `https://maps.google.com/?cid=...` URL).
3. Set the max number of reviews to scrape (e.g., `25` or `50` for initial testing).
4. Click **Start**.

### 4. Obtain your Dataset ID and API Token
1. Once the run finishes (or is running), go to **Storage &rarr; Datasets** in the left sidebar.
2. Click on your dataset. In the top bar or URL, find the **Dataset ID** (an alphanumeric string like `wFhK87S9ya2Zb6Pq1` or `yKky1KjqeGrUvPoSk`).
3. To get your API token, go to **Settings / Integrations &rarr; API Tokens** and copy your Personal API Token.

---

## Stage 2: Supabase Setup (Database & Storage)

Supabase provides the PostgreSQL database and JSONB document storage for our review pipeline.

### 1. Create a Supabase Project
- Sign up or log into [supabase.com](https://supabase.com).
- Click **New Project**, choose an organization, name the project (e.g. `spinup-ai-reviews`), and set a strong database password.

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

## Stage 3: AI Classifier & Model Configuration

The classification pipeline extracts structured operational intelligence from reviews. The system supports **Jev** as the primary engine, as well as generative LLM fallbacks:

### Option A: Jev / TypeSafe System One (Recommended)
- **What is Jev?** Jev doesn't generate creative text; it evaluates structured questions directly over state in a single forward pass. It answers exclusively in 3 primitives:
  1. **Choice**: Categorical decisions (e.g. `positive`, `neutral`, `negative`).
  2. **Score**: Quantitative rating on a scale (1 to 5 for Food Quality, Service, Cleanliness, Atmosphere, Value for Money).
  3. **Noul**: Probability of truth / likelihood (e.g. `recommends`, `has_complaints`, `has_praise`).
- **Response Speed**: Single forward pass (~95ms – 365ms live tested, 5x–10x faster than generative LLMs).
- **Cost**: Exactly **$0.042 / million input tokens** ($42 / billion tokens) and **$0 / output tokens**. A typical review costs only ~$0.00002 to $0.00004!
- **API Endpoint**: `POST https://api.typesafe.ai/v1/systemone`
- **Model**: `jev-latest`
- **Environment Key**: `JEV_API_KEY=your_typesafe_api_key_here`

### Option B: OpenAI
- **Key**: Create an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
- **Model**: `gpt-4o-mini` (recommended) or `gpt-4o`.
- **Environment Key**: `LLM_API_KEY=your_openai_key_here`

### Option C: Google Gemini
- **Key**: Create a free API key at [aistudio.google.com](https://aistudio.google.com).
- **Model**: `gemini-2.5-flash` or `gemini-1.5-flash`.
- **Environment Key**: `LLM_API_KEY=your_gemini_key_here`

### Option D: Groq
- **Key**: Create an API key at [console.groq.com](https://console.groq.com).
- **Model**: `llama-3.3-70b-versatile`.
- **Environment Key**: `LLM_API_KEY=your_groq_key_here`

---

## Stage 4: Managing Credentials (Public Repository Safety)

Because this repository is public, **never commit API keys or database secrets to git**.

This application supports two safe approaches:

### Approach 1: In-Browser Per-Session Keys (Zero Disk Storage)
1. Launch the web application: `npm run dev`.
2. Click the **API Keys** button in the top navigation bar.
3. Select your provider (`Jev (TypeSafe System One - Recommended)` is selected by default).
4. Enter your keys:
   - Apify API Token & Default Dataset ID
   - Supabase Project URL & API Key
   - Jev / LLM API Key
5. Click **Save for this Session**.
6. Keys are stored strictly in `sessionStorage` in your browser tab. Closing the tab wipes them completely. Nothing is ever saved to disk or git.

### Approach 2: Local `.env` File (Ignored by Git)
If running locally and you don't want to re-type keys:
1. Duplicate `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your keys in `.env`:
   ```env
   APIFY_API_TOKEN=apify_api_...
   APIFY_DEFAULT_DATASET_ID=...
   SUPABASE_URL=https://....supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJh...
   LLM_PROVIDER=jev
   LLM_MODEL=jev-latest
   JEV_API_KEY=apikey_...
   ```
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

3. **Stage 2: Run Jev Classifier**:
   - Select your batch size (e.g. 5 reviews).
   - Click **Run Classifier** (or click **Classify with Jev** / **Retry with Jev** on individual cards).
   - Jev processes each review in sub-second time and outputs:
     - Overall Sentiment (`positive`, `neutral`, `negative`)
     - Sentiment Score (1.0 to 5.0)
     - 5-Pillar Operational Breakdown (Food Quality, Service, Cleanliness, Atmosphere, Value for Money)
     - Customer Highlights & Complaints
     - Action Items for the restaurant owner
     - Exact response time (ms) and token cost ($)

4. **Explore the Results**:
   - **Switch Views**: Use the toolbar buttons to toggle between:
     - **Cards View**: Visual review cards with mini 5-pillar score strips (`🍽️ Food: 5/5`, `🛎️ Svc: 5/5`, `✨ Clean: -`, `🕯️ Atmo: 1/5`, `💵 Val: -`) and telemetry badges (`⚡ 95ms • $0.000042`).
     - **Score Matrix Table View**: High-density operational comparison table with dedicated columns for all 5 pillars, sentiments, ratings, scores, and Jev latency/cost.
   - **Deep Inspection**: Click **Inspect Jev / LLM** on any card or table row to view the deep modal with question probabilities, confidence scores, and qualitative notes.

---

## Troubleshooting & Tips

- **Server Environment Sync**: If you edit `.env` while the dev server is running, the app's dynamic environment resolver automatically re-reads the file without needing a manual restart.
- **Empty Reviews**: Customers who leave only star ratings without review text are handled gracefully; the classifier infers sentiment from the star rating and flags text categories as not mentioned.
- **Nested Apify Scraper Output**: The sync endpoint automatically handles both flat review records and place scraper structures with nested `reviews: [...]` arrays.
- **Rate Limits & Batching**: Use batch sizes of 5 to 10 for optimal throughput and real-time UI progress updates.
