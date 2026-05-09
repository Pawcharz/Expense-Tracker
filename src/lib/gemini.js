const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const GROUP_NAMES = [
  'Groceries','Drinks','Dining & Takeout','Household','Hygiene & Beauty',
  'Health & Medical','Clothing','Transport','Digital & Subscriptions',
  'Electronics','Housing','Education','Entertainment','Travel',
  'Finance & Fees','Pets','Gifts & Donations','Other',
];

const CATEGORY_NAMES = [
  'Meat & Fish','Dairy & Eggs','Cheese','Bread & Bakery','Vegetables','Fruit',
  'Frozen Food','Pantry & Dry Goods','Condiments & Spices','Snacks & Sweets','Baby Food',
  'Water & Soft Drinks','Juice','Coffee & Tea','Alcohol','Energy Drinks',
  'Restaurant','Fast Food','Café','Delivery','Bar',
  'Cleaning Products','Kitchen Supplies','Furniture','Home Decor','Garden & Plants',
  'Tools & Hardware','Storage',
  'Personal Care','Cosmetics & Skincare','Haircare','Pharmacy & Supplements',
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
    date: { type: 'string', nullable: true },
    total: { type: 'number', nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          raw_name: { type: 'string' },
          price: { type: 'number' },
          category_group: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['name', 'raw_name', 'price', 'category_group', 'category'],
      },
    },
  },
  required: ['items'],
};

function buildParsePrompt(language) {
  const nameLang = language === 'pl' ? 'Polish' : 'English';
  const groups = GROUP_NAMES.join(', ');
  const categories = CATEGORY_NAMES.join(', ');
  return `You are a receipt parser. Extract all purchased line items from the receipt. The receipt may be in any language.

Rules:
- Every item must appear, including discounts (give discounts a negative price and name them clearly)
- Do not invent items not on the receipt
- raw_name: original text from the receipt exactly as printed
- name: human-readable name in ${nameLang}
- price: numeric value (negative for discounts)
- category_group: pick EXACTLY one from this list: ${groups}
- category: pick EXACTLY one from this list that fits within the chosen group: ${categories}
- date: always output in YYYY-MM-DD format. If the receipt shows DD.MM.YYYY or DD/MM/YYYY, convert accordingly. If the format is already YYYY-MM-DD (year first), copy it exactly without swapping day and month.
- total: final amount paid after discounts

DELIVERY APP RULE (important):
If the receipt is from a food/grocery delivery app (Glovo, Uber Eats, Wolt, Bolt Food, DoorDash, Deliveroo, or similar), apply the following distinction:
- If the order is from a RESTAURANT or food outlet (prepared meals, burgers, pizza, sushi, sandwiches, etc.): set category_group="Dining & Takeout" and category="Delivery" for EVERY item.
- If the order is GROCERY DELIVERY from a supermarket or shop (raw/packaged products, branded goods, produce — from stores like Biedronka, Lidl, Kaufland, Tesco, Carrefour, etc.): categorize each item individually as you would a regular grocery receipt.`;
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
      generationConfig,
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
    { temperature: 0, maxOutputTokens: 4096 }
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
    { temperature: 0, maxOutputTokens: 4096 }
  );
}

// Stage 3: Parse merged text → structured JSON
async function parseReceiptText(text, language, apiKey) {
  const result = await geminiCall(
    apiKey,
    [{ text: `${buildParsePrompt(language)}\n\nReceipt text:\n${text}` }],
    {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    }
  );
  return JSON.parse(result);
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
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    }
  );
  return JSON.parse(result);
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
  return parseReceiptText(mergedText, language, apiKey);
}

export async function getImageChunks(file) {
  const mimeType = file.type || 'image/jpeg';

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    const url = URL.createObjectURL(file);
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    el.src = url;
  });

  if (img.height <= img.width * 2.5) {
    return [{ base64: await imageFileToBase64(file), mimeType }];
  }

  const chunkHeight = img.width * 2;
  const overlap = Math.round(chunkHeight * 0.12);
  const chunks = [];
  let y = 0;

  while (y < img.height && chunks.length < 6) {
    const sectionHeight = Math.min(chunkHeight, img.height - y);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = sectionHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, y, img.width, sectionHeight, 0, 0, img.width, sectionHeight);
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
