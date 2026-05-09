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
          category_group: { type: 'string', enum: GROUP_NAMES },
          category: { type: 'string', enum: CATEGORY_NAMES },
        },
        required: ['name', 'raw_name', 'price', 'category_group', 'category'],
      },
    },
  },
  required: ['items'],
};

function buildSystemPrompt(language) {
  const nameLang = language === 'pl' ? 'Polish' : 'English';
  return `You are a receipt parser. Extract all purchased line items from the receipt image. The receipt may be in any language.

Rules:
- Every item on the receipt must appear, including discounts (give discounts a negative price and name them clearly)
- Do not invent items not on the receipt
- raw_name: original text from the receipt exactly as printed
- name: human-readable name in ${nameLang}
- price: numeric value (negative for discounts)
- category_group: the top-level category group
- category: the specific subcategory within that group
- date: parse in DD.MM.YYYY format if ambiguous (European)
- total: final amount paid after discounts`;
}

export async function parseReceiptImage(base64Image, mimeType = 'image/jpeg', language = 'en') {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildSystemPrompt(language) },
            { inline_data: { mime_type: mimeType, data: base64Image } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    let msg = 'Gemini API error';
    try { const err = await response.json(); msg = err.error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return JSON.parse(text);
}

export function imageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
