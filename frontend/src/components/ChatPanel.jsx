import { useEffect, useRef, useState } from 'react';

// messages: [{ id, text, who: 'bot' | 'user', error?, thinking?, tools? }]
// tools: names of the AI assistant tools used for a reply, shown as a small line under it.
export default function ChatPanel({ messages, onSend, disabled }) {
  const [input, setInput] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  // Put the cursor back in the box once the assistant has answered.
  useEffect(() => {
    if (!disabled) inputRef.current.focus();
  }, [disabled]);

  function submit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || disabled) return;
    setInput('');
    onSend(text);
  }

  return (
    <section className="panel chat-panel">
      <h2>Assistant</h2>
      <div className="messages" ref={listRef} aria-live="polite">
        {messages.map(m => (
          <div key={m.id} className={`msg ${m.who}${m.error ? ' error' : ''}${m.thinking ? ' thinking' : ''}`}>
            {m.text}
            {m.tools?.length > 0 && <div className="msg-tools">🤖 used: {m.tools.join(', ')}</div>}
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          ref={inputRef}
          className="chat-input"
          autoComplete="off"
          maxLength={2000}
          placeholder="e.g. set keyboard to 79.99, or ask anything"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={disabled}
        />
        <button type="submit" disabled={disabled}>Send</button>
      </form>
    </section>
  );
}
