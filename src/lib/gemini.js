const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
