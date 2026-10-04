import { useState } from 'react';
import { login } from '../api.js';

export default function LoginPage({ onLogin, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } = await login(email.trim(), password);
      onLogin({ token, user });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="panel login-panel" onSubmit={submit}>
        <h1>Interactive Dashboard</h1>
        <p className="muted">Sign in to view and edit product prices.</p>
        {notice && !error && <div className="msg error">{notice}</div>}
        {error && <div className="msg error">{error}</div>}
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
