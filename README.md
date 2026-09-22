# JEV AI Labs & jev-reviews

A modern, high-performance web application built with **Astro 5** to showcase experimental LLM pipelines and autonomous data intelligence tools.

The first active experiment is **`jev-reviews`**: an automated pipeline that pulls Google restaurant review scrapes from **Apify Storage**, persists them in **Supabase PostgreSQL**, and processes them with **Language Models (OpenAI, Gemini, Groq)** to perform 5-pillar sentiment classification, dish extraction, and operational action recommendation.

---

## Key Features

- **Multi-Experiment AI Hub**: Modular playground ready to host multiple AI experiments (`/` and `/jev-reviews`).
- **Apify Storage Sync**: Ingests scraped review datasets from Apify Google Maps actors into database storage with deduplication.
- **Supabase Integration**: PostgreSQL storage with JSONB fields, automated indexes, RLS policies, and summary stats views.
- **Multi-Provider LLM Classifier**:
  - Supports **OpenAI** (`gpt-4o-mini`, `gpt-4o`), **Google Gemini** (`gemini-2.5-flash`), and **Groq** (`llama-3.3-70b-versatile`).
  - 5-Pillar classification: Food Quality, Service, Cleanliness, Atmosphere, Value for Money.
  - Dish identification, customer highlight extraction, complaint detection, and actionable advice for restaurant owners.
- **Public Repository Security**:
  - **Zero hardcoded secrets**: Strict `.gitignore` protects against accidental credential commits.
  - **In-Browser Session Keys**: Users can enter API keys in an in-memory browser drawer (`sessionStorage`) without writing anything to disk.
- **Modern Dark-Mode UI**: Glassmorphic panels, responsive layout, real-time KPI metrics, and deep review inspection modal.

---

## Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Credentials (Optional)
You can configure credentials locally via `.env` or interactively in the web UI.

To use `.env`:
```bash
cp .env.example .env
# Edit .env with your Apify, Supabase, and LLM keys
```

*(Note: `.env` is ignored by git and will never be committed to your public repository).*

### 3. Start Development Server
```bash
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

---

## Full Step-by-Step Setup Guide

For detailed instructions on running the Apify Google Scraper actor, setting up your Supabase project with `supabase/schema.sql`, and generating API keys, refer to:

👉 **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**

---

## Project Structure

```
jev-reviews/
├── supabase/
│   └── schema.sql             # Supabase PostgreSQL schema and migration
├── src/
│   ├── components/
│   │   ├── Header.astro       # Navigation with session key indicator
│   │   └── KeySettingsModal.astro # In-memory session credentials manager
│   ├── layouts/
│   │   └── Layout.astro       # Master HTML layout
│   ├── lib/
│   │   ├── apify.ts           # Apify client and dataset normalizer
│   │   ├── llm.ts             # Multi-provider LLM classification engine
│   │   ├── supabase.ts        # Supabase client and query helpers
│   │   └── types.ts           # TypeScript interfaces
│   ├── pages/
│   │   ├── api/
│   │   │   ├── apify/sync.ts  # Ingests Apify dataset reviews into Supabase
│   │   │   ├── health.ts      # Service configuration status
│   │   │   └── reviews/
│   │   │       ├── classify.ts# LLM classification batch endpoint
│   │   │       └── list.ts    # Filterable review query & stats endpoint
│   │   ├── index.astro        # AI Experiments Hub
│   │   └── jev-reviews.astro  # Interactive Google Reviews & LLM Dashboard
│   └── styles/
│       └── global.css         # Design tokens & glassmorphism styling
├── .env.example               # Safe environment variable template
├── .gitignore                 # Strict secrets and build artifact exclusions
├── astro.config.mjs           # Astro SSR configuration with Node adapter
├── package.json
└── tsconfig.json
```

---

## License
MIT
