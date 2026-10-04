import { useEffect, useRef, useState } from 'react';

export default function ChatPanel({ messages, onSend, disabled }) {
  const [input, setInput] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  function submit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    onSend(text);
  }

  return (
    <section className="panel chat-panel">
      <h2>Assistant</h2>
      <div className="messages" ref={listRef}>
        {messages.map(m => (
          <div key={m.id} className={`msg ${m.who}${m.error ? ' error' : ''}`}>{m.text}</div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          className="chat-input"
          autoComplete="off"
          placeholder="e.g. set keyboard to 79.99"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={disabled}
        />
        <button type="submit" disabled={disabled}>Send</button>
      </form>
    </section>
  );
}
