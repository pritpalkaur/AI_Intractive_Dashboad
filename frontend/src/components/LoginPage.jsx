import { useState } from 'react';
import { forgotPassword, login, signup } from '../api.js';

export const MIN_PASSWORD_LENGTH = 8; // same rule as the backend

const INTRO = {
  signin: 'Sign in to view and edit product prices.',
  signup: 'Create an account to view and edit product prices.',
  forgot: "Enter your account email and we'll send you a link to reset your password.",
};
const SUBMIT = {
  signin: ['Sign in', 'Signing in…'],
  signup: ['Create account', 'Creating account…'],
  forgot: ['Send reset link', 'Sending…'],
};

// Sign-in form with switches to "Create account" and "Forgot password?".
// notice: optional { text, kind: 'error' | 'success' } shown above the form (e.g. "session expired").
export default function LoginPage({ onLogin, notice }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  function switchMode(next) {
    setMode(next);
    setError('');
    setInfo('');
    setPassword('');
    setConfirm('');
  }

  async function submit(e) {
    e.preventDefault();
    if (isSignup && password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'forgot') {
        const { message } = await forgotPassword(email.trim());
        setInfo(message);
      } else if (isSignup) {
        const { token, user, email: mail } = await signup(email.trim(), name.trim(), password);
        const greeting = mail.sent
          ? `🎉 Your account is ready. A welcome email was sent to ${mail.to}.`
          : `🎉 Your account is ready. (Welcome email not sent: ${mail.error})`;
        onLogin({ token, user }, greeting);
        return;
      } else {
        const { token, user } = await login(email.trim(), password);
        onLogin({ token, user });
        return;
      }
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const shownNotice = mode === 'signin' && !error && notice;

  return (
    <div className="login-wrap">
      <form className="panel login-panel" onSubmit={submit}>
        <h1>{mode === 'forgot' ? 'Forgot password' : 'Interactive Dashboard'}</h1>
        <p className="muted">{INTRO[mode]}</p>
        {shownNotice && <div className={`msg ${shownNotice.kind}`}>{shownNotice.text}</div>}
        {error && <div className="msg error">{error}</div>}
        {info && <div className="msg success">{info}</div>}
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
        {mode !== 'forgot' && (
          <label>
            <span className="label-row">
              Password
              {mode === 'signin' && (
                <button type="button" className="link" onClick={() => switchMode('forgot')} disabled={busy}>Forgot password?</button>
              )}
            </span>
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
        )}
        {isSignup && (
          <label>
            Confirm password
            <input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
          </label>
        )}
        <button type="submit" disabled={busy}>{SUBMIT[mode][busy ? 1 : 0]}</button>
        <p className="switch-mode">
          {mode === 'signin' && <>Don't have an account? </>}
          {mode === 'signup' && <>Already have an account? </>}
          <button type="button" className="link" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} disabled={busy}>
            {mode === 'signin' ? 'Create account' : mode === 'signup' ? 'Sign in' : 'Back to sign in'}
          </button>
        </p>
      </form>
    </div>
  );
}
