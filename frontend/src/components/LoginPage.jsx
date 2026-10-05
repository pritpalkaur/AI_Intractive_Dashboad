import { useState } from 'react';
import { login, signup } from '../api.js';

const MIN_PASSWORD_LENGTH = 8; // same rule as the backend

// Sign-in form with a switch to "Create account". Both log the user in on success.
export default function LoginPage({ onLogin, notice }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  function switchMode(next) {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  }

  async function submit(e) {
    e.preventDefault();
    if (isSignup && password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    setError('');
    try {
      if (isSignup) {
        const { token, user, email: mail } = await signup(email.trim(), name.trim(), password);
        const greeting = mail.sent
          ? `🎉 Your account is ready. A welcome email was sent to ${mail.to}.`
          : `🎉 Your account is ready. (Welcome email not sent: ${mail.error})`;
        onLogin({ token, user }, greeting);
      } else {
        const { token, user } = await login(email.trim(), password);
        onLogin({ token, user });
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="panel login-panel" onSubmit={submit}>
        <h1>Interactive Dashboard</h1>
        <p className="muted">
          {isSignup ? 'Create an account to view and edit product prices.' : 'Sign in to view and edit product prices.'}
        </p>
        {notice && !error && !isSignup && <div className="msg error">{notice}</div>}
        {error && <div className="msg error">{error}</div>}
        {isSignup && (
          <label>
            Name
            <input autoComplete="name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} />
          </label>
        )}
        <label>
          Email
          <input type="email" autoComplete={isSignup ? 'email' : 'username'} required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {isSignup && <span className="hint">At least {MIN_PASSWORD_LENGTH} characters</span>}
        </label>
        {isSignup && (
          <label>
            Confirm password
            <input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
          </label>
        )}
        <button type="submit" disabled={busy}>
          {busy ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create account' : 'Sign in')}
        </button>
        <p className="switch-mode">
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <button type="button" className="link" onClick={() => switchMode(isSignup ? 'signin' : 'signup')} disabled={busy}>
            {isSignup ? 'Sign in' : 'Create account'}
          </button>
        </p>
      </form>
    </div>
  );
}
