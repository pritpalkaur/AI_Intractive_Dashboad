// Dashboard state:
// - saved: product prices as stored in the database (last loaded/saved)
// - working: in-memory copy the chatbot edits; the chart always renders this
// Changes stay in memory until the user clicks "Save data" (or tells the bot to save).
// Chat text the rule-based parser does not understand goes to the AI assistant, which only proposes changes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { HELP_TEXT, runCommand } from './chatbot.js';
import { AuthError, askAgent, fetchProducts, saveProducts } from './api.js';
import ChartPanel from './components/ChartPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import StatusBar from './components/StatusBar.jsx';

let nextId = 0; // chat message keys
const MAX_AI_TURNS = 20; // chat turns sent to the AI assistant (the server allows 20)
const MAX_AI_TEXT = 2000; // characters per turn (the server allows 2000)

export default function Dashboard({ session, greeting, onLogout }) {
  const { token, user } = session;
  const [saved, setSaved] = useState([]);
  const [working, setWorking] = useState([]);
  const [history, setHistory] = useState([]); // previous `working` snapshots for undo
  const [savedAt, setSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState([]);
  const [aiHistory, setAiHistory] = useState([]); // plain-text { role, content } turns for the AI assistant
  const [thinking, setThinking] = useState(false); // waiting for the AI assistant

  const savedById = new Map(saved.map(d => [d.id, d.value]));
  const changedIds = new Set(working.filter(d => savedById.get(d.id) !== d.value).map(d => d.id));
  const dirty = changedIds.size > 0;

  const say = useCallback((text, who = 'bot', error = false) =>
    setMessages(m => [...m, { id: nextId++, text, who, error }]), []);
  // Replaces one message (the "Thinking…" placeholder) in place.
  const replaceMessage = (id, fields) => setMessages(m => m.map(x => x.id === id ? { ...x, thinking: false, ...fields } : x));

  useEffect(() => {
    let cancelled = false;
    fetchProducts(token)
      .then(data => {
        if (cancelled) return;
        setSaved(data);
        setWorking(data);
        if (greeting) say(greeting, 'bot', /not sent/.test(greeting));
        say(`Hi ${user.name}! Changes you make are kept in memory until you save.\n\n` + HELP_TEXT);
      })
      .catch(err => {
        if (cancelled) return;
        if (err instanceof AuthError) onLogout(err.message);
        else say(`Could not load data: ${err.message}`, 'bot', true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, user.name, greeting, say, onLogout]);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const savingRef = useRef(false);
  // current: the prices to save; the AI assistant passes the list it just changed (state has not re-rendered yet).
  async function save(current = working) {
    // Send only changed prices so untouched products are never overwritten.
    const changed = current.filter(d => savedById.get(d.id) !== d.value);
    if (!changed.length) { say('Nothing to save — no changes since last save.'); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveProducts(token, changed);
      const fresh = result.data ?? current;
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
    if (result.unknown) return askAi(text);
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

  // Sends text the parser did not understand to the AI assistant and applies the changes it proposes.
  // The chat input and the Save/Discard buttons are disabled meanwhile, so `working` cannot change under us.
  async function askAi(text) {
    const thinkingId = nextId++;
    setMessages(m => [...m, { id: thinkingId, text: '🤖 Thinking…', who: 'bot', thinking: true }]);
    setThinking(true);
    const turns = [...aiHistory, { role: 'user', content: text }].slice(-MAX_AI_TURNS);
    while (turns[0].role !== 'user') turns.shift(); // the conversation must start with the user
    const products = working.map(({ id, label, value }) => ({ id, label, value, savedValue: savedById.get(id) ?? value }));
    try {
      const { reply, changes, action, toolCalls } = await askAgent(token, turns, products);
      setAiHistory([...turns, { role: 'assistant', content: reply.slice(0, MAX_AI_TEXT) }].slice(-MAX_AI_TURNS));
      const tools = [...new Set(toolCalls.map(c => c.name))];

      // One history entry for the whole batch, so a single "undo" reverts it.
      const newValues = new Map(changes.map(c => [c.id, c.value]));
      const next = working.map(d => newValues.has(d.id) ? { ...d, value: newValues.get(d.id) } : d);
      const changed = next.some((d, i) => d.value !== working[i].value);
      if (changed && action !== 'undo' && action !== 'discard') {
        setHistory(h => [...h, working]);
        setWorking(next);
      }
      const note = changed && !action ? '\n(Not saved yet — click "Save data" or type "save".)' : '';
      replaceMessage(thinkingId, { text: reply + note, tools });

      if (action === 'save') await save(changed ? next : working);
      else if (action === 'discard') discard();
      else if (action === 'undo') undo();
    } catch (err) {
      if (err instanceof AuthError) {
        replaceMessage(thinkingId, { text: err.message, error: true });
        onLogout(err.message);
      } else if (err.status === 503) {
        replaceMessage(thinkingId, { text: "AI assistant is off. Type 'help' for the commands I understand." });
      } else {
        replaceMessage(thinkingId, { text: `AI assistant error: ${err.message}`, error: true });
      }
    } finally {
      setThinking(false);
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
          busy={thinking}
          emailTo={user.email}
          onSave={() => save()}
          onDiscard={discard}
        />
        <ChatPanel messages={messages} onSend={handleChat} disabled={loading || thinking} />
      </main>
    </>
  );
}
