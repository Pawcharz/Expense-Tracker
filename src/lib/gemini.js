const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const GROUP_NAMES = [
  'Groceries','Alcohol','Dining & Takeout','Household','Hygiene & Beauty',
  'Health & Medical','Clothing','Transport','Digital & Subscriptions',
  'Electronics','Housing','Education','Entertainment','Travel',
  'Finance & Fees','Pets','Gifts & Donations','Other',
];

const CATEGORY_NAMES = [
  'Meat & Fish','Dairy & Eggs','Cheese','Bread & Bakery','Vegetables','Fruit',
  'Frozen Food','Pantry & Dry Goods','Condiments & Spices','Snacks & Sweets','Baby Food',
  'Water & Soft Drinks','Juice','Coffee & Tea','Energy Drinks',
  'Alcohol','Beer & Wine','Spirits & Liquor',
  'Restaurant','Fast Food','Café','Delivery','Bar',
  'Cleaning Products','Kitchen Supplies','Furniture','Home Decor','Garden & Plants',
  'Tools & Hardware','Storage',
  'Personal Care','Cosmetics & Skincare','Haircare',
  'Doctor / Clinic','Dentist','Pharmacy','Lab & Tests','Gym & Fitness','Sport Equipment',
  'Everyday Clothing','Shoes','Outerwear','Accessories','Formal Wear','Sportswear','Underwear & Socks',
  'Fuel','Public Transport','Taxi / Rideshare','Car Maintenance','Parking','Tolls','Flights',
  'Productivity Tools','Entertainment Streaming','Games','Cloud Storage','Software Licenses','Domain & Hosting',
  'Phones & Tablets','Computers & Accessories','TV & Audio','Smart Home','Cables & Peripherals',
  'Rent','Building Charges','Utilities','Internet & Phone Plan','Insurance',
  'Books & Textbooks','Courses & Workshops','School Supplies','Tuition',
  'Cinema & Theatre','Events & Concerts','Books & Magazines','Hobbies','Toys & Games',
  'Accommodation','Activities & Tours','Travel Insurance','Luggage',
  'Bank Fees','Transaction Fees','Taxes','Fines','Loan Payments',
  'Pet Food','Vet','Pet Grooming','Pet Supplies',
  'Gifts','Charity','Flowers',
  'Uncategorized',
];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    store: { type: 'string', nullable: true },
    // date_on_receipt gates the date field: Gemini's structured-output mode
    // often fabricates a string for nullable fields instead of returning null.
    // Using an explicit boolean forces a deliberate decision, so we can safely
    // discard the date value whenever date_on_receipt is false.
    date_on_receipt: { type: 'boolean' },
    date: { type: 'string', nullable: true },
    total: { type: 'number', nullable: true },
    currency: { type: 'string', nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          raw_name: { type: 'string' },
          price: { type: 'number' },
          discount: { type: 'number' },
          quantity: { type: 'number' },
          category_group: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['name', 'raw_name', 'price', 'discount', 'quantity', 'category_group', 'category'],
      },
    },
  },
  required: ['items', 'date_on_receipt'],
};

function buildParsePrompt(language) {
  const nameLang = language === 'pl' ? 'Polish' : 'English';
  const groups = GROUP_NAMES.join(', ');
  const categories = CATEGORY_NAMES.join(', ');
  return `You are a receipt parser. Extract all purchased line items from the receipt.

OUTPUT LANGUAGE: ${nameLang}. The receipt may be printed in any language. All human-readable text fields in your response (store, name) MUST be in ${nameLang} — translate from the receipt language if necessary.

Rules:
- Every item must appear
- Do not invent items not on the receipt
- raw_name: original text from the receipt exactly as printed (this MAY include quantity markers like "x2", "2x", "2 szt", "0.5 kg")
- name: human-readable name in ${nameLang} — translate from the receipt language if needed. MUST NOT contain quantity markers like "x2", "2x", "×3", "(2)", "2 szt", "2 pcs". Strip them out and put the count into the quantity field instead. e.g. raw_name "Coca-Cola x2" → name "Coca-Cola", quantity 2.
- store: the merchant/store name translated to ${nameLang} if it is a common word or phrase (e.g. "Piekarnia Kowalski" → "Kowalski Bakery" in English). Proper nouns and brand names that have no translation should be kept as-is.
- quantity: the number of units of this line item (default 1). Use the number printed on the receipt next to the item (e.g. "2 x 3.99" → quantity 2). For weight-based items use the printed weight (e.g. "0.456 kg" → quantity 0.456). If no quantity is shown, use 1.
- price: the UNIT PRICE of this item — i.e. the price of a single unit BEFORE discount. For "2 x 3.99 = 7.98" the price is 3.99, quantity is 2. Always a positive number.
- discount: the TOTAL discount applied to this line across all units (positive number, default 0). If the receipt shows a discount line directly tied to an item, set that item's discount to the discount amount (positive) rather than creating a separate negative-price item. If a general discount appears that cannot be attributed to a specific item, create a separate item named "Store Discount" (or translated equivalent) with price=0, quantity=1, discount=<amount>.
- Items must NEVER have a negative price. Use the discount field instead.
- category_group: pick EXACTLY one from this list: ${groups}
- category: pick EXACTLY one from this list that fits within the chosen group: ${categories}
- date_on_receipt: true if a date is clearly printed on the receipt, false if not. Be strict — only true when you can actually read a date on the receipt.
- date: ONLY filled when date_on_receipt is true. Output as YYYY-MM-DDTHH:MM (ISO datetime, 24h); include time if visible, otherwise use T00:00. Always YYYY-MM-DD with year first — never swap day and month when year leads. If date_on_receipt is false, set this to null.
- total: final amount paid after discounts
- currency: the ISO 4217 currency code of the receipt (e.g. "PLN", "EUR", "USD", "GBP", "CZK"). Detect it from explicit codes, currency symbols (zł, €, $, £, Kč), or country/store context. If you genuinely cannot tell, return null.

DELIVERY APP RULE (important):
If the receipt is from a food/grocery delivery app (Glovo, Uber Eats, Wolt, Bolt Food, DoorDash, Deliveroo, or similar), apply the following distinction:
- If the order is from a RESTAURANT or food outlet (prepared meals, burgers, pizza, sushi, sandwiches, etc.): set category_group="Dining & Takeout" and category="Delivery" for EVERY item.
- If the order is GROCERY DELIVERY from a supermarket or shop (raw/packaged products, branded goods, produce — from stores like Biedronka, Lidl, Kaufland, Tesco, Carrefour, etc.): categorize each item individually as you would a regular grocery receipt.

PHARMACY RULE: Any purchase from a pharmacy or drugstore (medicines, supplements, vitamins, OTC drugs, medical equipment) always goes under Health & Medical > Pharmacy. Never assign pharmacy items to Hygiene & Beauty.`;
}

const OCR_PROMPT =
  'Extract all text from this receipt image exactly as it appears. ' +
  'Output every visible line including item names, quantities, prices, dates, store name, and totals. ' +
  'Do not interpret or summarise — output raw text only, line by line.';

function buildMergePrompt(numChunks) {
  return (
    `The following are ${numChunks} raw text extracts from consecutive overlapping vertical ` +
    `sections of a single receipt (top to bottom). Merge them into one complete, coherent receipt text. ` +
    `Remove duplicate lines that appear in the overlapping areas between consecutive sections. ` +
    `Preserve every unique item, price, date, and piece of information. ` +
    `Output only the merged receipt text — no commentary.`
  );
}

async function geminiCall(apiKey, parts, generationConfig) {
  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        ...generationConfig,
        // Disable thinking mode — receipt OCR is a structured extraction task,
        // not a reasoning task; disabling cuts response time from ~15s to ~3-5s
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    let msg = 'Gemini API error';
    try { const err = await response.json(); msg = err.error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error(
      'The receipt is too long to process. Try cropping it into smaller sections and scanning each separately.'
    );
  }
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

// Stage 1: OCR one image chunk → plain text
async function ocrChunk(base64, mimeType, apiKey) {
  return geminiCall(
    apiKey,
    [
      { text: OCR_PROMPT },
      { inline_data: { mime_type: mimeType, data: base64 } },
    ],
    { temperature: 0, maxOutputTokens: 8192 }
  );
}

// Stage 2: Merge multiple OCR texts into one, deduplicating overlap
async function mergeOcrTexts(texts, apiKey) {
  const sections = texts
    .map((t, i) => `--- Section ${i + 1} ---\n${t}`)
    .join('\n\n');
  return geminiCall(
    apiKey,
    [{ text: `${buildMergePrompt(texts.length)}\n\n${sections}` }],
    { temperature: 0, maxOutputTokens: 8192 }
  );
}

// Normalize parsed Gemini response: discard the date when date_on_receipt is false.
function normalizeReceiptData(data) {
  if (!data.date_on_receipt) data.date = null;
  return data;
}

// Stage 3: Parse merged text → structured JSON
async function parseReceiptText(text, language, apiKey, numChunks = 1) {
  const result = await geminiCall(
    apiKey,
    [{ text: `${buildParsePrompt(language)}\n\nReceipt text:\n${text}` }],
    {
      temperature: 0.1,
      maxOutputTokens: Math.min(32768 * numChunks, 65536),
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    }
  );
  return normalizeReceiptData(JSON.parse(result));
}

// Single-image path: image → structured JSON directly (most efficient for normal receipts)
async function parseReceiptImageDirect(base64, mimeType, language, apiKey) {
  const result = await geminiCall(
    apiKey,
    [
      { text: buildParsePrompt(language) },
      { inline_data: { mime_type: mimeType, data: base64 } },
    ],
    {
      temperature: 0.1,
      maxOutputTokens: 32768,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    }
  );
  return normalizeReceiptData(JSON.parse(result));
}

// Main entry point called by Scan.jsx
export async function parseReceiptImage(chunks, language = 'en') {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (chunks.length === 1) {
    // Normal path: single image → direct parse
    return parseReceiptImageDirect(chunks[0].base64, chunks[0].mimeType, language, apiKey);
  }

  // Multi-chunk path: OCR each chunk → merge → parse text
  const ocrTexts = await Promise.all(
    chunks.map(c => ocrChunk(c.base64, c.mimeType, apiKey))
  );
  const mergedText = await mergeOcrTexts(ocrTexts, apiKey);
  return parseReceiptText(mergedText, language, apiKey, chunks.length);
}

export async function getImageChunks(file) {
  const mimeType = file.type || 'image/jpeg';
  const MAX_WIDTH = 1920;

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    const url = URL.createObjectURL(file);
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    el.src = url;
  });

  // Scale down if wider than MAX_WIDTH (reduces token count without hurting OCR quality)
  const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
  const drawW = Math.round(img.width * scale);
  const drawH = Math.round(img.height * scale);

  if (drawH <= drawW * 2.0) {
    // Single chunk — resize and encode
    const canvas = document.createElement('canvas');
    canvas.width = drawW;
    canvas.height = drawH;
    canvas.getContext('2d').drawImage(img, 0, 0, drawW, drawH);
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    return [{ base64, mimeType: 'image/jpeg' }];
  }

  // Multi-chunk: split the scaled image
  const chunkHeight = drawW * 2;
  const overlap = Math.round(chunkHeight * 0.12);
  const chunks = [];
  let y = 0;

  while (y < drawH && chunks.length < 6) {
    const sectionHeight = Math.min(chunkHeight, drawH - y);
    const canvas = document.createElement('canvas');
    canvas.width = drawW;
    canvas.height = sectionHeight;
    // Draw the scaled source slice onto the chunk canvas
    canvas.getContext('2d').drawImage(
      img,
      0, Math.round(y / scale), img.width, Math.round(sectionHeight / scale),
      0, 0, drawW, sectionHeight
    );
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    chunks.push({ base64, mimeType: 'image/jpeg' });
    y += chunkHeight - overlap;
  }

  return chunks;
}

export function imageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bank statement / transaction list parsing
// A screenshot of a banking app's transaction list → one entry per transaction.
// ─────────────────────────────────────────────────────────────────────────────

const STATEMENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    currency: { type: 'string', nullable: true },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          merchant: { type: 'string' },
          raw_description: { type: 'string' },
          date_on_screen: { type: 'boolean' },
          date: { type: 'string', nullable: true },
          time_on_screen: { type: 'boolean' },
          amount: { type: 'number' },
          is_expense: { type: 'boolean' },
          currency: { type: 'string', nullable: true },
          category_group: { type: 'string' },
          category: { type: 'string' },
        },
        required: [
          'merchant', 'raw_description', 'date_on_screen', 'date', 'time_on_screen',
          'amount', 'is_expense', 'category_group', 'category',
        ],
      },
    },
  },
  required: ['transactions'],
};

function buildStatementPrompt(language, todayIso) {
  const nameLang = language === 'pl' ? 'Polish' : 'English';
  const groups = GROUP_NAMES.join(', ');
  const categories = CATEGORY_NAMES.join(', ');
  return `You are a bank transaction list parser. The image is a screenshot of a banking / card app showing a LIST OF SEPARATE TRANSACTIONS (one row per payment). Extract EVERY transaction row as a separate entry.

Today's date is ${todayIso}. Use it to resolve relative date headers such as "Today", "Yesterday", "Dziś", "Wczoraj", or dates without a year (assume the most recent past occurrence).

OUTPUT LANGUAGE: ${nameLang}. The screenshot may be in any language.

Rules:
- Each row in the list = one transaction. Never merge rows. Never invent rows.
- Section headers (dates like "Monday, 12 May" or "Yesterday") apply to every row beneath them until the next header.
- merchant: a clean, human-readable merchant name in ${nameLang}. Strip card-processor noise like "CARD PAYMENT", "PLATNOSC KARTA", city names, terminal ids, reference numbers, "*", trailing country codes. e.g. "UBER *TRIP HELP.UBER.COM" → "Uber", "ZABKA Z1234 K.1 WARSZAWA" → "Żabka".
- raw_description: the row description exactly as displayed.
- date_on_screen: true if the transaction's date can be determined from the screenshot (row or section header). false otherwise.
- date: ONLY when date_on_screen is true. Format YYYY-MM-DDTHH:MM (24h). If a time is visible for the row, include it and set time_on_screen=true; otherwise use T12:00 and set time_on_screen=false. Year first, never swap day and month. null when date_on_screen is false.
- amount: the absolute (positive) transaction amount as displayed for that row.
- is_expense: true for money going OUT (purchases, card payments, transfers out, subscriptions, fees). false for money coming IN (salary, refunds, incoming transfers, cashback). Rows with a "+" sign or green colour are usually incoming.
- currency: ISO 4217 code for this row if shown (zł → PLN, € → EUR, $ → USD, £ → GBP, Kč → CZK); otherwise null. The top-level currency is the account's main currency if you can tell, else null.
- category_group: pick EXACTLY one from: ${groups}
- category: pick EXACTLY one that belongs to the chosen group from: ${categories}
  Guidance: Uber/Bolt/FreeNow rides → Transport > Taxi / Rideshare. Uber Eats/Glovo/Wolt/Bolt Food/Pyszne → Dining & Takeout > Delivery. Supermarkets (Biedronka, Lidl, Żabka, Kaufland, Carrefour, Auchan, Tesco) → Groceries > Pantry & Dry Goods unless obvious otherwise. Netflix/Spotify/YouTube → Digital & Subscriptions > Entertainment Streaming. Pharmacies (Apteka) → Health & Medical > Pharmacy. Fuel stations (Orlen, BP, Shell, Circle K) → Transport > Fuel. Bank fees/commissions → Finance & Fees > Bank Fees. Unknown → Other > Uncategorized.
- Pending / not-yet-booked transactions still count; include them.
- Ignore running balance figures, account totals, and "available funds" — those are NOT transactions.`;
}

// Normalize: discard fabricated dates, coerce amounts to positive numbers.
function normalizeStatementData(data) {
  const txs = Array.isArray(data.transactions) ? data.transactions : [];
  return {
    currency: data.currency || null,
    transactions: txs.map(tx => ({
      merchant: (tx.merchant || '').trim(),
      raw_description: tx.raw_description || '',
      date: tx.date_on_screen ? tx.date : null,
      time_on_screen: Boolean(tx.date_on_screen && tx.time_on_screen),
      amount: Math.abs(Number(tx.amount) || 0),
      is_expense: tx.is_expense !== false,
      currency: tx.currency || data.currency || null,
      category_group: tx.category_group || 'Other',
      category: tx.category || 'Uncategorized',
    })),
  };
}

async function parseStatementImageDirect(base64, mimeType, language, apiKey, todayIso) {
  const result = await geminiCall(
    apiKey,
    [
      { text: buildStatementPrompt(language, todayIso) },
      { inline_data: { mime_type: mimeType, data: base64 } },
    ],
    {
      temperature: 0.1,
      maxOutputTokens: 32768,
      responseMimeType: 'application/json',
      responseSchema: STATEMENT_RESPONSE_SCHEMA,
    }
  );
  return normalizeStatementData(JSON.parse(result));
}

async function parseStatementText(text, language, apiKey, todayIso, numChunks) {
  const result = await geminiCall(
    apiKey,
    [{ text: `${buildStatementPrompt(language, todayIso)}\n\nTransaction list text:\n${text}` }],
    {
      temperature: 0.1,
      maxOutputTokens: Math.min(32768 * numChunks, 65536),
      responseMimeType: 'application/json',
      responseSchema: STATEMENT_RESPONSE_SCHEMA,
    }
  );
  return normalizeStatementData(JSON.parse(result));
}

// Main entry point for bank-statement screenshots (called by ImportStatement.jsx).
// Accepts the same chunk array produced by getImageChunks().
export async function parseBankStatementImage(chunks, language = 'en') {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const todayIso = new Date().toISOString().slice(0, 10);

  if (chunks.length === 1) {
    return parseStatementImageDirect(chunks[0].base64, chunks[0].mimeType, language, apiKey, todayIso);
  }

  const ocrTexts = await Promise.all(
    chunks.map(c => ocrChunk(c.base64, c.mimeType, apiKey))
  );
  const mergedText = await mergeOcrTexts(ocrTexts, apiKey);
  return parseStatementText(mergedText, language, apiKey, todayIso, chunks.length);
}
