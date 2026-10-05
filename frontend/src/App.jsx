// Shows the login page until the user has a JWT, then the dashboard.
// A password reset link (?reset=<token>) opens the "Set a new password" page instead.
// The session (token + user) is kept in localStorage so a page refresh stays logged in until the token expires.
import { useCallback, useState } from 'react';
import Dashboard from './Dashboard.jsx';
import LoginPage from './components/LoginPage.jsx';
import ResetPasswordPage from './components/ResetPasswordPage.jsx';

const SESSION_KEY = 'dashboard.session';

function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    // Drop tokens that have already expired (the server checks this too).
    const { exp } = JSON.parse(atob(session.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return exp * 1000 > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable: session lasts until the page is closed */ }
}

// Reads the reset token from the URL once, then removes it so it is not left in the address bar or history.
function takeResetToken() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('reset');
  if (token) {
    url.searchParams.delete('reset');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  return token;
}
const initialResetToken = takeResetToken(); // read once at page load (state initializers can run twice in dev)

export default function App() {
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [session, setSession] = useState(readSession);
  const [notice, setNotice] = useState(null); // { text, kind } shown on the login page
  const [greeting, setGreeting] = useState(''); // extra message for the assistant after sign-up

  function handleLogin(newSession, newGreeting = '') {
    writeSession(newSession);
    setNotice(null);
    setGreeting(newGreeting);
    setSession(newSession);
  }

  const handleLogout = useCallback((reason = '') => {
    writeSession(null);
    setNotice(reason ? { text: reason, kind: 'error' } : null);
    setSession(null);
  }, []);

  if (resetToken) {
    return (
      <ResetPasswordPage
        token={resetToken}
        onDone={result => {
          setResetToken(null);
          if (result) handleLogout(); // after a password change, sign in again with the new password
          setNotice(result);
        }}
      />
    );
  }
  if (!session) return <LoginPage onLogin={handleLogin} notice={notice} />;
  return <Dashboard key={session.token} session={session} greeting={greeting} onLogout={handleLogout} />;
}
