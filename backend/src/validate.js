const MAX_PRICE = 99999999.99; // dbo.Products.Price is decimal(10,2)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ValidationError extends Error {}

const normalizeEmail = email => String(email ?? '').trim().toLowerCase();
const isValidEmail = email => EMAIL_RE.test(email) && email.length <= 254;

// Throws a ValidationError describing the first problem with a save request body.
// Returns the normalized { items }.
function validateSaveRequest(body) {
  const items = body?.data;
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError('Data must be a non-empty array');

  const seen = new Set();
  const normalized = items.map(it => {
    if (!Number.isInteger(it?.id)) throw new ValidationError('Every item needs a numeric id');
    if (seen.has(it.id)) throw new ValidationError(`Product id ${it.id} appears more than once`);
    seen.add(it.id);
    if (typeof it.value !== 'number' || !Number.isFinite(it.value)) throw new ValidationError(`Invalid price for "${it.label}"`);
    if (it.value < 0 || it.value > MAX_PRICE) throw new ValidationError(`Price for "${it.label}" must be between 0 and ${MAX_PRICE}`);
    return { id: it.id, label: String(it.label ?? it.id), value: Math.round(it.value * 100) / 100 };
  });

  return { items: normalized };
}

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything after 72 bytes

// Throws a ValidationError for the first problem with a new account. Returns the normalized { email, name, password }.
function validateNewUser({ email, name, password } = {}) {
  email = normalizeEmail(email);
  name = String(name ?? '').trim();
  if (!isValidEmail(email)) throw new ValidationError('A valid email is required');
  if (!name || name.length > 100) throw new ValidationError('Name is required (max 100 characters)');
  return { email, name, password: validatePassword(password) };
}

// Throws a ValidationError unless password is a string of an allowed length. Returns it unchanged.
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) throw new ValidationError(`Password must be at most ${MAX_PASSWORD_BYTES} bytes`);
  return password;
}

const MAX_AGENT_MESSAGES = 20;
const MAX_AGENT_MESSAGE_LENGTH = 2000;
const MAX_AGENT_PRODUCTS = 500;

// Throws a ValidationError for the first problem with a POST /api/agent body.
// Returns the normalized { messages: [{ role, content }], products: [{ id, label, value, savedValue }] }.
function validateAgentRequest(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) throw new ValidationError('Messages must be a non-empty array');
  if (messages.length > MAX_AGENT_MESSAGES) throw new ValidationError(`At most ${MAX_AGENT_MESSAGES} messages are allowed`);
  const normalizedMessages = messages.map(m => {
    if (m?.role !== 'user' && m?.role !== 'assistant') throw new ValidationError('Every message role must be "user" or "assistant"');
    if (typeof m.content !== 'string' || !m.content.trim()) throw new ValidationError('Every message needs some text');
    if (m.content.length > MAX_AGENT_MESSAGE_LENGTH) throw new ValidationError(`Messages must be at most ${MAX_AGENT_MESSAGE_LENGTH} characters`);
    return { role: m.role, content: m.content };
  });
  if (normalizedMessages[normalizedMessages.length - 1].role !== 'user') throw new ValidationError('The last message must be from the user');

  const products = body.products;
  if (!Array.isArray(products) || products.length === 0) throw new ValidationError('Products must be a non-empty array');
  if (products.length > MAX_AGENT_PRODUCTS) throw new ValidationError(`At most ${MAX_AGENT_PRODUCTS} products are allowed`);
  const seen = new Set();
  const isPrice = v => typeof v === 'number' && Number.isFinite(v);
  const normalizedProducts = products.map(p => {
    if (!Number.isInteger(p?.id)) throw new ValidationError('Every product needs a numeric id');
    if (seen.has(p.id)) throw new ValidationError(`Product id ${p.id} appears more than once`);
    seen.add(p.id);
    if (!isPrice(p.value)) throw new ValidationError(`Invalid price for product id ${p.id}`);
    if (p.savedValue !== undefined && !isPrice(p.savedValue)) throw new ValidationError(`Invalid saved price for product id ${p.id}`);
    return { id: p.id, label: String(p.label ?? p.id).slice(0, 200), value: p.value, savedValue: p.savedValue ?? p.value };
  });

  return { messages: normalizedMessages, products: normalizedProducts };
}

module.exports = {
  validateSaveRequest, validateNewUser, validatePassword, validateAgentRequest, ValidationError, normalizeEmail, isValidEmail, MAX_PRICE,
};
