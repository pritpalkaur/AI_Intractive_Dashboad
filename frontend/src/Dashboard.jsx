// Dashboard state:
// - saved: product prices as stored in the database (last loaded/saved)
// - working: in-memory copy the chatbot edits; the chart always renders this
// Changes stay in memory until the user clicks "Save data" (or tells the bot to save).
import { useCallback, useEffect, useRef, useState } from 'react';
import { HELP_TEXT, runCommand } from './chatbot.js';
import { AuthError, fetchProducts, saveProducts } from './api.js';
import ChartPanel from './components/ChartPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import StatusBar from './components/StatusBar.jsx';

let nextId = 0; // chat message keys

export default function Dashboard({ session, onLogout }) {
  const { token, user } = session;
  const [saved, setSaved] = useState([]);
  const [working, setWorking] = useState([]);
  const [history, setHistory] = useState([]); // previous `working` snapshots for undo
  const [savedAt, setSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState([]);

  const savedById = new Map(saved.map(d => [d.id, d.value]));
  const changedIds = new Set(working.filter(d => savedById.get(d.id) !== d.value).map(d => d.id));
  const dirty = changedIds.size > 0;

  const say = useCallback((text, who = 'bot', error = false) =>
    setMessages(m => [...m, { id: nextId++, text, who, error }]), []);

  useEffect(() => {
    let cancelled = false;
    fetchProducts(token)
      .then(data => {
        if (cancelled) return;
        setSaved(data);
        setWorking(data);
        say(`Hi ${user.name}! Changes you make are kept in memory until you save.\n\n` + HELP_TEXT);
      })
      .catch(err => {
        if (cancelled) return;
        if (err instanceof AuthError) onLogout(err.message);
        else say(`Could not load data: ${err.message}`, 'bot', true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, user.name, say, onLogout]);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const savingRef = useRef(false);
  async function save() {
    if (!dirty) { say('Nothing to save — no changes since last save.'); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Send only changed prices so untouched products are never overwritten.
      const result = await saveProducts(token, working.filter(d => changedIds.has(d.id)));
      const fresh = result.data ?? working;
      setSaved(fresh);
      setWorking(fresh);
      setHistory([]);
      setSavedAt(result.savedAt);
      const n = result.changes.length;
      say(`✅ Saved ${n} price${n === 1 ? '' : 's'} to the database and marked ${n === 1 ? 'it' : 'them'} as updated.`);
      if (result.email.sent) say(`📧 Email sent to ${result.email.to}.`);
      else say(`Email not sent: ${result.email.error}`, 'bot', true);
    } catch (err) {
      if (err instanceof AuthError) {
        say(`Save failed: ${err.message}. Your changes were not saved.`, 'bot', true);
        if (window.confirm(`${err.message}. Your unsaved changes will be lost. Go to the login page?`)) onLogout(err.message);
      } else {
        say(`Save failed: ${err.message}`, 'bot', true);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function discard() {
    if (!dirty) { say('There are no unsaved changes.'); return; }
    setWorking(saved);
    setHistory([]);
    say('Discarded unsaved changes. Chart is back to the saved data.');
  }

  function undo() {
    if (!history.length) { say('Nothing to undo.'); return; }
    setWorking(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    say('Undid the last change.');
  }

  function logout() {
    if (dirty && !window.confirm('You have unsaved changes. Log out and lose them?')) return;
    onLogout();
  }

  function handleChat(text) {
    say(text, 'user');
    const result = runCommand(text, working);
    if (result.action === 'save') return save();
    if (result.action === 'discard') return discard();
    if (result.action === 'undo') return undo();
    if (result.data !== working) {
      setHistory(h => [...h, working]);
      setWorking(result.data);
      say(result.reply + '\n(Not saved yet — click "Save data" or type "save".)');
    } else {
      say(result.reply, 'bot', result.error);
    }
  }

  return (
    <>
      <header>
        <h1>Interactive Dashboard</h1>
        <div className="header-right">
          <StatusBar loading={loading} dirty={dirty} savedAt={savedAt} />
          <span className="user" title={user.email}>{user.name}</span>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </header>
      <main>
        <ChartPanel
          working={working}
          savedById={savedById}
          changedIds={changedIds}
          dirty={dirty}
          saving={saving}
          emailTo={user.email}
          onSave={save}
          onDiscard={discard}
        />
        <ChatPanel messages={messages} onSend={handleChat} disabled={loading} />
      </main>
    </>
  );
}
