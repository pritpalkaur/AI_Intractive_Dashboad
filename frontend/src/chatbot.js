// Rule-based chatbot command parser (pure, no React/DOM) so it can be unit tested.

export const HELP_TEXT = `I can change product prices for you. Use any part of a product name:
• set keyboard to 79.99     (or: mouse = 20)
• increase cable by 2       (or: add 10% to mouse)
• decrease keyboard by 5    (or: reduce cable by 10%)
• show                      (list current prices)
• undo                      (revert the last change)
• discard                   (revert to saved prices)
• save                      (write changes to the database)`;

export const MAX_PRICE = 99999999.99; // dbo.Products.Price is decimal(10,2)

// Finds a product by exact name, then prefix, then substring. Returns -1 if none, -2 if ambiguous.
function findIndex(data, name) {
  const n = name.trim().toLowerCase();
  const names = data.map(d => d.label.toLowerCase());
  for (const match of [l => l === n, l => l.startsWith(n), l => l.includes(n)]) {
    const hits = names.map((l, i) => match(l) ? i : -1).filter(i => i !== -1);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return -2;
  }
  return -1;
}

const round2 = v => Math.round(v * 100) / 100;
export function fmt(v) { return v.toFixed(2); }

// Returns { data, reply, action? } — data is a new array if changed, otherwise the same reference.
export function runCommand(input, data) {
  const text = input.trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  const num = '(-?\\d+(?:\\.\\d+)?)';

  if (/^(help|\?|what can you do)/.test(lower)) return { data, reply: HELP_TEXT };
  if (/^(save|save data|save changes|commit)\b/.test(lower)) return { data, reply: '', action: 'save' };
  if (/^(discard|reset|revert|cancel)\b/.test(lower)) return { data, reply: '', action: 'discard' };
  if (/^undo\b/.test(lower)) return { data, reply: '', action: 'undo' };
  if (/^(show|list|values|status)\b/.test(lower)) {
    return { data, reply: data.map(d => `${d.label}: ${fmt(d.value)}`).join('\n') };
  }

  let m;
  const lookup = name => {
    const i = findIndex(data, name);
    if (i === -1) return { error: `I couldn't find "${name}". Products: ${data.map(d => d.label).join(', ')}` };
    if (i === -2) return { error: `"${name}" matches more than one product. Please use more of the name.` };
    return { i };
  };
  const applyPrice = (i, value) => {
    if (value < 0 || value > MAX_PRICE) return { data, reply: `Price must be between 0 and ${MAX_PRICE}.`, error: true };
    const next = data.map((d, j) => j === i ? { ...d, value } : d);
    return { data: next, reply: `${data[i].label}: ${fmt(data[i].value)} → ${fmt(value)}` };
  };

  // set X to N | change X to N | X = N | make X N
  if ((m = text.match(new RegExp(`^(?:set|change|update|make)\\s+(.+?)\\s*(?:to|=|as)\\s*\\$?${num}$`, 'i'))) ||
      (m = text.match(new RegExp(`^(.+?)\\s*=\\s*\\$?${num}$`, 'i')))) {
    const found = lookup(m[1]);
    if (found.error) return { data, reply: found.error, error: true };
    return applyPrice(found.i, round2(parseFloat(m[2])));
  }

  // increase/decrease X by N[%]  |  add N[%] to X  |  subtract N[%] from X
  let label, amount, pct, sign;
  if ((m = text.match(new RegExp(`^(increase|raise|grow|decrease|reduce|lower|drop)\\s+(.+?)\\s+by\\s+${num}\\s*(%|percent)?$`, 'i')))) {
    sign = /^(decrease|reduce|lower|drop)/i.test(m[1]) ? -1 : 1;
    [label, amount, pct] = [m[2], parseFloat(m[3]), !!m[4]];
  } else if ((m = text.match(new RegExp(`^(add|plus|subtract|minus|remove|take)\\s+${num}\\s*(%|percent)?\\s+(?:to|from)\\s+(.+)$`, 'i')))) {
    sign = /^(subtract|minus|remove|take)/i.test(m[1]) ? -1 : 1;
    [label, amount, pct] = [m[4], parseFloat(m[2]), !!m[3]];
  }
  if (label !== undefined) {
    const found = lookup(label);
    if (found.error) return { data, reply: found.error, error: true };
    const old = data[found.i].value;
    const delta = pct ? old * amount / 100 : amount;
    return applyPrice(found.i, round2(old + sign * delta));
  }

  return { data, reply: `Sorry, I didn't understand that. Type "help" to see what I can do.`, error: true };
}
