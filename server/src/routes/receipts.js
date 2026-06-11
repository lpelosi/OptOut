import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const router = Router();

// Lazily construct one client (only if a key is configured).
const client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;

// Structured-output schema for the extracted receipt. Strict structured outputs
// require additionalProperties:false and every property listed in `required`.
const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { type: 'string', description: 'Store / vendor name, or "" if not visible' },
    total: { type: 'number', description: 'Final total paid as a number, or 0 if not found' },
    currency: { type: 'string', description: 'ISO currency code (e.g. USD), or "" if unknown' },
    purchasedAt: { type: 'string', description: 'Purchase date as ISO 8601 (YYYY-MM-DD), or "" if not found' },
    items: {
      type: 'array',
      description: 'Line items on the receipt',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          price: { type: 'number' },
        },
        required: ['description', 'price'],
      },
    },
  },
  required: ['merchant', 'total', 'currency', 'purchasedAt', 'items'],
};

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// POST /receipts/parse  { imageBase64, mediaType }  -> { receipt: {...} }
router.post('/parse', async (req, res, next) => {
  try {
    if (!client) {
      return res.status(503).json({ success: false, message: 'Receipt scanning is not configured on the server' });
    }
    const { imageBase64, mediaType } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ success: false, message: 'imageBase64 required' });
    }
    const media = ALLOWED_MEDIA.has(mediaType) ? mediaType : 'image/jpeg';

    const message = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 2048,
      output_config: { format: { type: 'json_schema', schema: RECEIPT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: imageBase64 } },
            {
              type: 'text',
              text: 'Extract the receipt details. "total" is the final amount paid (after tax). Use ISO 8601 for the date. If a field is not visible, use an empty string (or 0 for total). Return only the structured data.',
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) {
      return res.status(502).json({ success: false, message: 'Could not read the receipt. Try a clearer photo.' });
    }
    let receipt;
    try {
      receipt = JSON.parse(textBlock.text);
    } catch {
      return res.status(502).json({ success: false, message: 'Could not parse the receipt. Try again.' });
    }
    res.json({ success: true, receipt });
  } catch (err) {
    next(err);
  }
});

export default router;
