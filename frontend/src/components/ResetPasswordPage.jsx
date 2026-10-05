import { useState } from 'react';
import { resetPassword } from '../api.js';
import { MIN_PASSWORD_LENGTH } from './LoginPage.jsx';

// Opened from the link in the password reset email (?reset=<token>).
export default function ResetPasswordPage({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    setError('');
    try {
      const { message } = await resetPassword(token, password);
      onDone({ text: message, kind: 'success' });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="panel login-panel" onSubmit={submit}>
        <h1>Set a new password</h1>
        <p className="muted">Choose a new password for your Interactive Dashboard account.</p>
        {error && <div className="msg error">{error}</div>}
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <span className="hint">At least {MIN_PASSWORD_LENGTH} characters</span>
        </label>
        <label>
          Confirm new password
          <input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        <p className="switch-mode">
          <button type="button" className="link" onClick={() => onDone(null)} disabled={busy}>Back to sign in</button>
        </p>
      </form>
    </div>
  );
}
