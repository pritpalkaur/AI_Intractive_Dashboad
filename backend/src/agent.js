// Claude-powered chat assistant. It only PROPOSES price changes: the browser applies them to its
// in-memory prices and the user still saves the usual way. Nothing here touches the database.
const { Anthropic } = require('@anthropic-ai/sdk');
const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');
const { MAX_PRICE } = require('./validate');

const MODEL = 'claude-opus-5-5';
const MAX_ITERATIONS = 10; // model calls per chat message
const ACTIONS = ['save', 'discard', 'undo'];

const SYSTEM_PROMPT = 'You are the assistant inside a product price dashboard. Prices are in USD. '
  + 'Always call list_products before answering or changing prices. '
  + 'Use set_prices for every price change (you may change many products in one call). '
  + 'Changes are only shown on screen until the user saves; never claim something is saved unless you called request_action with save. '
  + 'Only call request_action when the user explicitly asks to save, discard or undo. '
  + 'When matching product names, if more than one product could match, ask which one instead of guessing. '
  + "Keep replies short and list each change as 'Name: old → new'.";

const round2 = v => Math.round(v * 100) / 100;

// Validates one set_prices call against the current prices (pure, so it can be unit tested).
// Returns { products, applied: [{ id, name, oldPrice, newPrice }] } with a new products array,
// or { error } if any item is invalid (nothing is applied in that case).
function applyPriceChanges(products, changes) {
  if (!Array.isArray(changes) || changes.length === 0) return { error: 'changes must be a non-empty array' };
  const byId = new Map(products.map(p => [p.id, p]));
  const next = new Map();
  for (const [i, c] of changes.entries()) {
    const where = `changes[${i}]`;
    if (!Number.isInteger(c?.id)) return { error: `${where}: id must be an integer` };
    if (!byId.has(c.id)) return { error: `${where}: no product has id ${c.id}` };
    if (next.has(c.id)) return { error: `${where}: product id ${c.id} appears more than once` };
    if (typeof c.price !== 'number' || !Number.isFinite(c.price)) return { error: `${where}: price must be a number` };
    if (c.price < 0 || c.price > MAX_PRICE) return { error: `${where}: price must be between 0 and ${MAX_PRICE}` };
    next.set(c.id, round2(c.price));
  }
  const applied = [...next].map(([id, price]) => ({ id, name: byId.get(id).label, oldPrice: byId.get(id).value, newPrice: price }));
  return { products: products.map(p => next.has(p.id) ? { ...p, value: next.get(p.id) } : p), applied };
}

// Final value per product after all set_prices calls, leaving out products that ended where they started.
function mergeChanges(original, current) {
  const before = new Map(original.map(p => [p.id, p.value]));
  return current.filter(p => before.get(p.id) !== p.value).map(p => ({ id: p.id, value: p.value }));
}

function createAgent({ apiKey }) {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });

  // messages: [{ role, content }] plain-text chat turns; products: [{ id, label, value, savedValue }].
  async function run({ messages, products }) {
    let current = products.map(p => ({ ...p }));
    let action = null;
    const toolCalls = [];
    const record = (name, input) => {
      console.log(`[agent] ${name}`, JSON.stringify(input));
      toolCalls.push({ name, input });
    };

    const tools = [
      betaTool({
        name: 'list_products',
        description: 'List every product with its current (on-screen) price, its saved price, and whether it has unsaved changes.',
        inputSchema: { type: 'object', properties: {} },
        run: input => {
          record('list_products', input);
          return JSON.stringify(current.map(p => ({
            id: p.id, name: p.label, price: p.value, savedPrice: p.savedValue, changed: p.value !== p.savedValue ? 'yes' : 'no',
          })));
        },
      }),
      betaTool({
        name: 'set_prices',
        description: 'Change the on-screen price of one or more products in USD. Nothing is saved to the database. '
          + 'The whole call is rejected if any item is invalid.',
        inputSchema: {
          type: 'object',
          properties: {
            changes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer', description: 'Product id from list_products' },
                  price: { type: 'number', description: `New price, 0 to ${MAX_PRICE}` },
                },
                required: ['id', 'price'],
              },
            },
          },
          required: ['changes'],
        },
        run: input => {
          record('set_prices', input);
          const result = applyPriceChanges(current, input?.changes);
          if (result.error) return JSON.stringify({ ok: false, error: `${result.error}. No prices were changed.` });
          current = result.products;
          return JSON.stringify({ ok: true, applied: result.applied });
        },
      }),
      betaTool({
        name: 'request_action',
        description: 'Ask the dashboard to save the on-screen prices to the database, discard all unsaved changes, '
          + 'or undo the last change. Only use this when the user explicitly asks for it.',
        inputSchema: {
          type: 'object',
          properties: { action: { type: 'string', enum: ACTIONS } },
          required: ['action'],
        },
        run: input => {
          record('request_action', input);
          if (!ACTIONS.includes(input?.action)) return JSON.stringify({ ok: false, error: `action must be one of ${ACTIONS.join(', ')}` });
          action = input.action;
          return JSON.stringify({ ok: true, message: `The dashboard will ${action} after your reply.` });
        },
      }),
    ];

    const final = await client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // If a safety classifier declines, retry on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_iterations: MAX_ITERATIONS,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    if (final.stop_reason === 'refusal') {
      return { reply: "Sorry, I can't help with that request. Type 'help' to see the commands I understand.", changes: [], action: null, toolCalls };
    }
    // Still asking for tools after MAX_ITERATIONS: the work is unfinished, so propose nothing.
    if (final.stop_reason === 'tool_use') {
      return { reply: 'Sorry, that took too many steps. Please try a simpler request.', changes: [], action: null, toolCalls };
    }
    let reply = final.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || 'Done.';
    if (final.stop_reason === 'max_tokens') reply += ' (answer was cut off)';
    return { reply, changes: mergeChanges(products, current), action, toolCalls };
  }

  return { run };
}

module.exports = { createAgent, applyPriceChanges, mergeChanges, SYSTEM_PROMPT };
