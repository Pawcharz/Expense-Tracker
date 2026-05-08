# Receipt Tracker — Claude Code Build Prompt

You are building a personal expense tracking PWA (Progressive Web App) from scratch.
Read this entire prompt before writing a single line of code. Follow it exactly.
Work autonomously until all programmatic work is complete.
At the end, print the **Manual Setup Checklist** section so the user knows what to do.

---

## What this app does

- User opens the app on their phone, takes a photo of any receipt or invoice
- The image is sent to the Gemini API which extracts every line item, price, and assigns a category
- The user reviews the parsed items, can edit anything, then confirms
- All data is stored in Supabase (PostgreSQL)
- The user can view spending analytics: by category, by store, over time
- Works as a PWA — installable on Android home screen from Chrome, no Play Store needed
- Single user only (the owner) — no multi-user support needed

---

## Tech stack

- **Frontend**: React 18 + Vite, plain CSS (no Tailwind), deployed to Cloudflare Pages
- **Database + Auth + Storage**: Supabase (free tier)
- **AI**: Google Gemini 2.0 Flash via REST API, called directly from the frontend
- **No backend server** — everything runs client-side + Supabase

Do not introduce any other dependencies unless strictly necessary.
For charts use **Recharts**. For icons use **lucide-react**. For routing use **react-router-dom**.

---

## Project structure to create

```
receipt-tracker/
├── public/
│   ├── manifest.json
│   ├── icon-192.png        ← placeholder, user will replace
│   └── icon-512.png        ← placeholder, user will replace
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css           ← global styles + CSS variables
│   ├── lib/
│   │   ├── supabase.js     ← supabase client init
│   │   └── gemini.js       ← gemini API call + prompt
│   ├── hooks/
│   │   └── useAuth.js
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Scan.jsx
│   │   ├── Review.jsx
│   │   ├── History.jsx
│   │   ├── ReceiptDetail.jsx
│   │   └── Analytics.jsx
│   └── components/
│       ├── BottomNav.jsx
│       ├── CategoryBadge.jsx
│       ├── ReceiptCard.jsx
│       └── ProtectedRoute.jsx
├── supabase/
│   └── schema.sql          ← full DB schema, run this in Supabase SQL editor
├── .env.example
├── vite.config.js
├── index.html
└── package.json
```

---

## Supabase schema

Create the file `supabase/schema.sql` with the following content exactly:

```sql
-- Enable RLS
alter table if exists public.receipts enable row level security;
alter table if exists public.items enable row level security;

-- Categories (seeded, not user-editable for now)
create table public.categories (
  id   serial primary key,
  name text not null unique,
  color text not null  -- hex color for UI badges
);

insert into public.categories (name, color) values
  ('Meat',              '#ef4444'),
  ('Dairy',             '#3b82f6'),
  ('Vegetables',        '#22c55e'),
  ('Fruit',             '#f97316'),
  ('Bread & Bakery',    '#d97706'),
  ('Drinks',            '#06b6d4'),
  ('Snacks',            '#a855f7'),
  ('Household',         '#64748b'),
  ('Hygiene',           '#ec4899'),
  ('Subscriptions',     '#8b5cf6'),
  ('Dining',            '#f59e0b'),
  ('Other',             '#94a3b8');

-- Receipts
create table public.receipts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  store       text,
  date        date not null default current_date,
  total       numeric(10,2),
  image_url   text,
  created_at  timestamptz default now()
);

-- Items (line items from a receipt)
create table public.items (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid references public.receipts(id) on delete cascade not null,
  name        text not null,
  raw_name    text,         -- original Polish text from receipt
  price       numeric(10,2) not null,
  category_id integer references public.categories(id),
  created_at  timestamptz default now()
);

-- RLS policies: users can only see their own data
create policy "Users see own receipts"
  on public.receipts for all
  using (auth.uid() = user_id);

create policy "Users see own items"
  on public.items for all
  using (
    receipt_id in (
      select id from public.receipts where user_id = auth.uid()
    )
  );

-- Categories are public read
create policy "Anyone reads categories"
  on public.categories for select
  using (true);

-- Storage bucket for receipt images
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);

create policy "Users manage own receipt images"
  on storage.objects for all
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
```

---

## Environment variables

Create `.env.example`:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GEMINI_API_KEY=your_gemini_api_key
```

Read these in code via `import.meta.env.VITE_*`.
Never hardcode any keys.

---

## Gemini integration — `src/lib/gemini.js`

This is the most critical file. Implement it as follows:

```javascript
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are a receipt parser. Extract all purchased line items from the receipt image.
The receipt may be in Polish or any other language.

Respond ONLY with a valid JSON object — no markdown, no explanation, no backticks.
Use this exact structure:
{
  "store": "store name or null",
  "date": "YYYY-MM-DD or null",
  "total": numeric or null,
  "items": [
    {
      "name": "human-readable English name",
      "raw_name": "original text from receipt",
      "price": numeric,
      "category": "one of the allowed categories"
    }
  ]
}

Allowed categories (use exactly these strings):
Meat, Dairy, Vegetables, Fruit, Bread & Bakery, Drinks, Snacks, Household, Hygiene, Subscriptions, Dining, Other

Rules:
- Every item on the receipt must appear in the output, including discounts (negative price)
- If an item is a discount or coupon, name it clearly and give it a negative price
- Do not invent items that are not on the receipt
- raw_name preserves the original receipt text including Polish characters
- name is always in English and human-readable
- If you cannot determine the price of an item, omit that item
- If the date is ambiguous, prefer DD.MM.YYYY parsing (European format)
- total should be the final amount paid, not subtotal before discounts`;

export async function parseReceiptImage(base64Image, mimeType = 'image/jpeg') {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Gemini API error');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');

  // Strip any accidental markdown fences
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

export function imageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

---

## Supabase client — `src/lib/supabase.js`

```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

---

## Auth — Magic Link only

Use Supabase magic link (email OTP). No password, no Google OAuth — keeps it simple.

`useAuth.js` hook must:
- expose `{ user, loading, signIn(email), signOut }`
- `signIn` calls `supabase.auth.signInWithOtp({ email })`
- listen to `supabase.auth.onAuthStateChange`

`Login.jsx` must:
- show a single email input + "Send magic link" button
- after submit, show "Check your email" confirmation
- no redirect logic needed here, ProtectedRoute handles it

---

## Pages — detailed spec

### `Scan.jsx` (default home screen)

- Large camera icon button centered on screen
- Tapping it opens the native camera on mobile via `<input type="file" accept="image/*" capture="environment">`
- Also accepts gallery uploads (same input, without `capture`) via a secondary smaller button
- On image selected:
  1. Show a loading overlay with text "Reading receipt…"
  2. Convert image to base64
  3. Upload image to Supabase Storage at path `{user_id}/{uuid}.jpg`
  4. Call `parseReceiptImage()`
  5. On success: navigate to `/review` passing parsed data + image URL via router state
  6. On error: show a visible error message with a retry button, do not crash
- Keep the original image File object in state so it can be shown in the review screen

### `Review.jsx`

Receives via router state:
- `parsedData` — the JSON from Gemini
- `imageUrl` — Supabase Storage URL
- `imageFile` — the original File for preview

Layout:
- Top: small thumbnail of the receipt image (tappable to see full size in a modal)
- Store name input (pre-filled from Gemini, editable)
- Date input type="date" (pre-filled, editable)
- List of items — each item row has:
  - Name input (editable)
  - Price input type="number" step="0.01" (editable)
  - Category select dropdown (all 12 categories)
  - Delete button (trash icon) to remove the item
- "Add item" button at the bottom of the list that appends a blank row
- Total shown at the bottom, auto-calculated from item prices (not from Gemini's total)
- "Save receipt" button — on click:
  1. Insert row into `receipts` table
  2. Insert all items into `items` table with the receipt_id
  3. Navigate to `/history`
- "Discard" button — navigate back to `/scan`

### `History.jsx`

- List of receipts, newest first
- Each receipt shown as a card: store name, date, total, number of items
- Infinite scroll OR simple pagination (show 20 at a time with a "Load more" button)
- Filter bar at top: month selector (prev/next arrows) to filter by month
- Tapping a receipt navigates to `/receipt/:id`

### `ReceiptDetail.jsx`

- Shows the receipt image (if available)
- Store, date, total
- Full list of items with their categories (not editable — read only)
- Delete receipt button (with confirmation dialog) — deletes receipt + all items + storage image

### `Analytics.jsx`

Four sections, all filterable by a month/year selector at the top:

1. **Spending by category** — horizontal bar chart (Recharts). Shows total PLN per category for the selected period. Bars colored by category color.

2. **Monthly trend** — line chart showing total spending per month for the last 6 months.

3. **Top stores** — simple ranked list: store name + total spent there this period.

4. **Top items** — simple ranked list: item name + how many times purchased + total spent.

All data must come from Supabase queries using the JS client — use `.rpc()` or aggregate queries where needed.

---

## Bottom navigation

`BottomNav.jsx` — fixed to bottom, three tabs:
- Scan (camera icon) → `/`
- History (list icon) → `/history`
- Analytics (chart icon) → `/analytics`

Show active state on current tab.

---

## PWA setup

### `public/manifest.json`
```json
{
  "name": "Receipt Tracker",
  "short_name": "Receipts",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### `vite.config.js`
Use the `vite-plugin-pwa` plugin for service worker generation:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // we use our own in /public
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
          },
        ],
      },
    }),
  ],
});
```

Add this to `index.html` `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0a0a0a" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
```

---

## Design direction

The app is for **personal, private, daily use on a phone**. Design it as:

- **Dark theme only** — background `#0a0a0a`, surface `#141414`, border `#222`
- **Monochrome base** with category colors as the only accent colors
- **Typography**: use `DM Mono` for numbers/prices (Google Fonts), `DM Sans` for everything else
- **Dense but not cramped** — this is a utility app, not a marketing site
- Mobile-first, max content width 480px centered
- Scan screen: the camera button should be large and obviously the primary action
- No shadows — use borders and background contrast instead
- Category badges: small pill with background color at 15% opacity and text at full category color
- Smooth page transitions: simple fade (150ms opacity)
- Loading states: a pulsing skeleton placeholder, not a spinner

---

## Error handling requirements

- If Gemini fails (network, bad API key, unparseable JSON): show a clear error on the Scan screen, let user retry or manually enter a receipt
- If Supabase write fails: show error, do not lose the parsed data — keep the user on Review screen
- Wrap all async operations in try/catch
- No unhandled promise rejections

---

## What NOT to build

- No user registration beyond magic link
- No multi-user / sharing features
- No CSV export (can be added later)
- No budget limits / alerts (can be added later)
- No offline queue (can be added later)
- No tests
- No CI/CD configuration

---

## When you are done

1. Make sure `npm run build` completes with zero errors
2. Make sure `npm run dev` starts and the app is navigable
3. Create placeholder 192×192 and 512×512 PNG icons (solid dark square is fine)
4. Print the following checklist for the user:

---

## Manual Setup Checklist

Complete these steps in order after the code is done.

### Step 1 — Supabase project
1. Go to https://supabase.com and create a free account
2. Create a new project (pick any name, e.g. "receipt-tracker"), choose a region close to Poland (Frankfurt)
3. Wait for the project to spin up (~2 minutes)
4. Go to **Project Settings → API** and copy:
   - **Project URL** → this is your `VITE_SUPABASE_URL`
   - **anon / public key** → this is your `VITE_SUPABASE_ANON_KEY`
5. Go to **SQL Editor**, paste the entire contents of `supabase/schema.sql`, and click Run
6. Go to **Authentication → Providers** — make sure **Email** is enabled (it is by default)
7. Go to **Authentication → URL Configuration** and set:
   - Site URL: `https://your-cloudflare-pages-domain.pages.dev` (you'll get this in Step 3 — come back and set it)
   - Redirect URLs: add the same URL

### Step 2 — Gemini API key
1. Go to https://aistudio.google.com
2. Sign in with a Google account
3. Click **Get API key → Create API key**
4. Copy the key → this is your `VITE_GEMINI_API_KEY`
5. No billing setup needed to start — free tier is sufficient for personal use

### Step 3 — Deploy to Cloudflare Pages
1. Push your code to a GitHub repository (create one if needed)
2. Go to https://pages.cloudflare.com and sign in / create a free account
3. Click **Create application → Pages → Connect to Git**
4. Select your repository
5. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
6. Click **Environment variables** and add:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon key
   - `VITE_GEMINI_API_KEY` → your Gemini API key
7. Click **Save and Deploy**
8. Wait for the build to finish — you'll get a `.pages.dev` URL
9. Go back to Supabase Step 1 point 7 and set that URL as the Site URL

### Step 4 — Install on your phone
1. Open the Cloudflare Pages URL in **Chrome on Android**
2. Tap the three-dot menu → **Add to Home screen**
3. The app will install like a native app

### Step 5 — First login
1. Open the app
2. Enter your email address and tap "Send magic link"
3. Open your email and tap the link — you'll be logged in
4. You're done — take a photo of a receipt

### Troubleshooting
- **Gemini returns garbage JSON**: retry — if it keeps failing, the receipt photo may be too blurry
- **"Failed to fetch" on Gemini call**: check that `VITE_GEMINI_API_KEY` is set correctly in Cloudflare Pages env vars and redeploy
- **Login link doesn't work**: make sure the Supabase Site URL matches your Cloudflare Pages URL exactly (no trailing slash)
- **Images not uploading**: check that you ran the full `schema.sql` — the storage bucket is created there