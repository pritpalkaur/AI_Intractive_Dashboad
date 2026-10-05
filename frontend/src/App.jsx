// Shows the login page until the user has a JWT, then the dashboard.
// The session (token + user) is kept in localStorage so a page refresh stays logged in until the token expires.
import { useCallback, useState } from 'react';
import Dashboard from './Dashboard.jsx';
import LoginPage from './components/LoginPage.jsx';

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

export default function App() {
  const [session, setSession] = useState(readSession);
  const [notice, setNotice] = useState('');
  const [greeting, setGreeting] = useState(''); // extra message for the assistant after sign-up

  function handleLogin(newSession, newGreeting = '') {
    writeSession(newSession);
    setNotice('');
    setGreeting(newGreeting);
    setSession(newSession);
  }

  const handleLogout = useCallback((reason = '') => {
    writeSession(null);
    setNotice(reason);
    setSession(null);
  }, []);

  if (!session) return <LoginPage onLogin={handleLogin} notice={notice} />;
  return <Dashboard key={session.token} session={session} greeting={greeting} onLogout={handleLogout} />;
}
