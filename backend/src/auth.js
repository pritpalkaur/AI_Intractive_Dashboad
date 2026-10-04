// Password hashing and JWT helpers. JWT_SECRET must be set in .env.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
// Compared against when the email is unknown, so a login takes the same time whether or not the user exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const hashPassword = password => bcrypt.hash(password, BCRYPT_ROUNDS);

// Returns the user if the password matches, otherwise null.
async function checkPassword(user, password) {
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  return ok && user ? user : null;
}

function signToken(user, secret, expiresIn = '8h') {
  return jwt.sign({ email: user.email, name: user.name }, secret, { subject: String(user.id), expiresIn });
}

// Express middleware: requires "Authorization: Bearer <token>" and sets req.user = { id, email, name }.
function requireAuth(secret) {
  return (req, res, next) => {
    const [scheme, token] = (req.get('Authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ ok: false, error: 'Please log in' });
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      req.user = { id: Number(payload.sub), email: payload.email, name: payload.name };
      next();
    } catch (err) {
      const error = err.name === 'TokenExpiredError' ? 'Your session has expired, please log in again' : 'Please log in';
      res.status(401).json({ ok: false, error });
    }
  };
}

module.exports = { hashPassword, checkPassword, signToken, requireAuth, MIN_PASSWORD_LENGTH };
