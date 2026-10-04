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

module.exports = { validateSaveRequest, ValidationError, normalizeEmail, isValidEmail, MAX_PRICE };
