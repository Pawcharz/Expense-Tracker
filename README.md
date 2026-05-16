# Receipt Tracker

A progressive web app for scanning receipts with AI, tracking spending, and managing monthly budgets.

## Features

- **AI receipt scanning** — photograph a receipt and have Gemini 2.5 Flash extract store, date, total, and every line item with category assignment
- **Manual entry** — add receipts without a photo when needed
- **History with search** — browse all past receipts, search by store name or date
- **Analytics** — spending charts with drill-down into category groups and subcategories; monthly budget tracking per group
- **Multi-language** — English and Polish UI; item names are translated to the user's chosen language at scan time
- **PWA** — installable on Android and iOS, works offline for previously loaded data

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router v6, Recharts |
| Build / PWA | Vite 8, vite-plugin-pwa (Workbox) |
| Backend | Supabase (PostgreSQL, Row-Level Security, Storage) |
| Auth | Supabase magic link (email OTP) |
| AI | Google Gemini 2.5 Flash (structured JSON output) |
| Hosting | Cloudflare Pages |

## Project Structure

```
src/
  App.jsx                  # Route definitions and bottom nav visibility logic
  main.jsx                 # React root, Supabase client initialisation
  pages/
    Scan.jsx               # Camera / file-pick interface, calls Gemini API
    Review.jsx             # Edit AI-parsed items before saving
    ManualEntry.jsx        # Form-based receipt entry without a photo
    History.jsx            # Paginated receipt list with search
    ReceiptDetail.jsx      # Single receipt view with item breakdown
    Analytics.jsx          # Charts, category drill-down, budget progress bars
    Settings.jsx           # Language toggle, budget amounts per category group
    Login.jsx              # Magic-link authentication form
  components/
    BottomNav.jsx          # Persistent tab bar (Scan / History / Analytics / Settings)
    ProtectedRoute.jsx     # Redirects unauthenticated users to /login
    ReceiptCard.jsx        # Summary card used in the history list
    CategoryBadge.jsx      # Coloured chip showing category group
  lib/
    supabase.js            # Supabase client singleton
    gemini.js              # parseReceiptImage() and prompt construction
    categories.js          # Category/group lookup helpers and i18n maps
  locales/
    en.js                  # English UI strings
    pl.js                  # Polish UI strings
  hooks/
    useAuth.jsx            # Auth state hook
    useLanguage.jsx        # Language preference hook (reads user_settings)
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com) API key with Gemini access

### Clone and install

```bash
git clone <repo-url>
cd Expense-Tracker
npm install
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_GEMINI_API_KEY=<your-gemini-api-key>
```

### Database setup

Run the following scripts in order in the Supabase SQL editor:

1. `supabase/schema.sql` — creates all tables, RLS policies, grants, and the receipt image storage bucket
2. `supabase/categories_migration.sql` — seeds category groups and subcategories

For an existing deployment, apply the incremental migration:

3. `supabase/currency_quantity_migration.sql` — adds `receipts.currency`, `items.quantity`, and `user_settings.display_currency` columns (idempotent — uses `add column if not exists`)

### Run locally

```bash
npm run dev
```

## Deployment (Cloudflare Pages)

1. Connect the repository in the Cloudflare Pages dashboard.
2. Set the build command to `npm run build` and the output directory to `dist`.
3. Add the three environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`) in **Settings > Environment variables**.
4. Deploy. Cloudflare handles CDN distribution and HTTPS automatically.

## Category System

Categories are organised in two levels: 18 top-level **groups** (e.g. Groceries, Transport) each containing a set of **subcategories** (e.g. Meat & Fish, Fuel). Both levels are stored in English in the database and in the Gemini prompt, ensuring consistent AI classification regardless of the user's language. The UI translates group and subcategory names at render time using the active locale.
