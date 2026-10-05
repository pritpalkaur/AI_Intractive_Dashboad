// Calls to the Node backend (proxied to http://localhost:5000 in development).

// Thrown when the server rejects the JWT (missing, invalid or expired), so the app can log out.
export class AuthError extends Error {}

async function request(url, { token, body } = {}) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, error: `Server returned ${res.status}` }));
  const message = data.error || `Server returned ${res.status}`;
  if (res.status === 401 && token) throw new AuthError(message);
  if (!res.ok || !data.ok) throw new Error(message);
  return data;
}

// Returns { token, user: { id, email, name } }.
export const login = (email, password) => request('/api/auth/login', { body: { email, password } });

// Creates an account and logs in. Returns { token, user, email: { to, sent, error } } (welcome email status).
export const signup = (email, name, password) => request('/api/auth/signup', { body: { email, name, password } });

export const fetchProducts = token => request('/api/products', { token }).then(b => b.data);

// items: only the products whose price changed. The summary email goes to the logged-in user.
export const saveProducts = (token, items) => request('/api/products/save', {
  token,
  body: { data: items.map(({ id, label, value }) => ({ id, label, value })) },
});
