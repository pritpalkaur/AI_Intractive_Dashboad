// Interactive dashboard client.
// - savedData: product prices as stored in the database (last loaded/saved)
// - workingData: in-memory copy the chatbot edits; the chart always renders this
// Changes stay in memory until the user clicks "Save data" (or tells the bot to save).

const HELP_TEXT = `I can change product prices for you. Use any part of a product name:
• set keyboard to 79.99     (or: mouse = 20)
• increase cable by 2       (or: add 10% to mouse)
• decrease keyboard by 5    (or: reduce cable by 10%)
• show                      (list current prices)
• undo                      (revert the last change)
• discard                   (revert to saved prices)
• save                      (write changes to the database)`;

const MAX_PRICE = 99999999.99; // dbo.Products.Price is decimal(10,2)

// ---------- Command parsing (pure, no DOM) ----------

// Finds a product by exact name, then prefix, then substring. Returns -1 if none, -2 if ambiguous.
function findIndex(data, name) {
  const n = name.trim().toLowerCase();
  const names = data.map(d => d.label.toLowerCase());
  for (const match of [l => l === n, l => l.startsWith(n), l => l.includes(n)]) {
    const hits = names.map((l, i) => match(l) ? i : -1).filter(i => i !== -1);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return -2;
  }
  return -1;
}

const round2 = v => Math.round(v * 100) / 100;
function fmt(v) { return v.toFixed(2); }

// Returns { data, reply, action? } — data is a new array if changed, otherwise the same reference.
function runCommand(input, data) {
  const text = input.trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  const num = '(-?\\d+(?:\\.\\d+)?)';

  if (/^(help|\?|what can you do)/.test(lower)) return { data, reply: HELP_TEXT };
  if (/^(save|save data|save changes|commit)\b/.test(lower)) return { data, reply: '', action: 'save' };
  if (/^(discard|reset|revert|cancel)\b/.test(lower)) return { data, reply: '', action: 'discard' };
  if (/^undo\b/.test(lower)) return { data, reply: '', action: 'undo' };
  if (/^(show|list|values|status)\b/.test(lower)) {
    return { data, reply: data.map(d => `${d.label}: ${fmt(d.value)}`).join('\n') };
  }

  let m;
  const lookup = name => {
    const i = findIndex(data, name);
    if (i === -1) return { error: `I couldn't find "${name}". Products: ${data.map(d => d.label).join(', ')}` };
    if (i === -2) return { error: `"${name}" matches more than one product. Please use more of the name.` };
    return { i };
  };
  const applyPrice = (i, value) => {
    if (value < 0 || value > MAX_PRICE) return { data, reply: `Price must be between 0 and ${MAX_PRICE}.`, error: true };
    const next = data.map((d, j) => j === i ? { ...d, value } : d);
    return { data: next, reply: `${data[i].label}: ${fmt(data[i].value)} → ${fmt(value)}` };
  };

  // set X to N | change X to N | X = N | make X N
  if ((m = text.match(new RegExp(`^(?:set|change|update|make)\\s+(.+?)\\s*(?:to|=|as)\\s*\\$?${num}$`, 'i'))) ||
      (m = text.match(new RegExp(`^(.+?)\\s*=\\s*\\$?${num}$`, 'i')))) {
    const found = lookup(m[1]);
    if (found.error) return { data, reply: found.error, error: true };
    return applyPrice(found.i, round2(parseFloat(m[2])));
  }

  // increase/decrease X by N[%]  |  add N[%] to X  |  subtract N[%] from X
  let label, amount, pct, sign;
  if ((m = text.match(new RegExp(`^(increase|raise|grow|decrease|reduce|lower|drop)\\s+(.+?)\\s+by\\s+${num}\\s*(%|percent)?$`, 'i')))) {
    sign = /^(decrease|reduce|lower|drop)/i.test(m[1]) ? -1 : 1;
    [label, amount, pct] = [m[2], parseFloat(m[3]), !!m[4]];
  } else if ((m = text.match(new RegExp(`^(add|plus|subtract|minus|remove|take)\\s+${num}\\s*(%|percent)?\\s+(?:to|from)\\s+(.+)$`, 'i')))) {
    sign = /^(subtract|minus|remove|take)/i.test(m[1]) ? -1 : 1;
    [label, amount, pct] = [m[4], parseFloat(m[2]), !!m[3]];
  }
  if (label !== undefined) {
    const found = lookup(label);
    if (found.error) return { data, reply: found.error, error: true };
    const old = data[found.i].value;
    const delta = pct ? old * amount / 100 : amount;
    return applyPrice(found.i, round2(old + sign * delta));
  }

  return { data, reply: `Sorry, I didn't understand that. Type "help" to see what I can do.`, error: true };
}

if (typeof module !== 'undefined') module.exports = { runCommand };

// ---------- UI ----------

if (typeof document !== 'undefined') {
  let savedData = [];
  let workingData = [];
  let history = [];   // previous workingData snapshots for undo
  let savedAt = null;
  let chart;

  const $ = id => document.getElementById(id);
  const clone = arr => arr.map(d => ({ ...d }));
  const isDirty = () => JSON.stringify(savedData) !== JSON.stringify(workingData);

  function addMessage(text, who, isError) {
    const el = document.createElement('div');
    el.className = `msg ${who}${isError ? ' error' : ''}`;
    el.textContent = text;
    $('messages').appendChild(el);
    $('messages').scrollTop = $('messages').scrollHeight;
  }

  function render() {
    const savedMap = new Map(savedData.map(d => [d.id, d.value]));
    const changed = workingData.map(d => savedMap.get(d.id) !== d.value);

    chart.data.labels = workingData.map(d => d.label);
    chart.data.datasets[0].data = workingData.map(d => d.value);
    chart.data.datasets[0].backgroundColor = changed.map(c => c ? '#e8890c' : '#2f6fde');
    chart.update();

    const rows = workingData.map((d, i) =>
      `<tr class="${changed[i] ? 'changed' : ''}"><td>${escapeHtml(d.label)}</td><td>${fmt(savedMap.get(d.id))}</td><td>${fmt(d.value)}</td></tr>`);
    document.querySelector('#data-table tbody').innerHTML = rows.join('');

    const dirty = isDirty();
    $('save-btn').disabled = !dirty;
    $('discard-btn').disabled = !dirty;
    $('status').classList.toggle('dirty', dirty);
    $('status-text').textContent = dirty
      ? 'Unsaved changes (in memory only)'
      : savedAt ? `All changes saved · ${new Date(savedAt).toLocaleTimeString()}` : 'Loaded from database';
  }

  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  async function load() {
    const res = await fetch('/api/data');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    savedData = body.data;
    workingData = clone(savedData);
    history = [];
  }

  async function save() {
    if (!isDirty()) { addMessage('Nothing to save — no changes since last save.', 'bot'); return; }
    $('save-btn').disabled = true;
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send only changed prices so untouched products are never overwritten.
        body: JSON.stringify({ data: workingData.filter(d => savedData.find(s => s.id === d.id)?.value !== d.value) }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
      savedData = body.data;
      savedAt = body.savedAt;
      workingData = clone(savedData);
      history = [];
      addMessage('✅ Saved prices to the database.', 'bot');
    } catch (err) {
      addMessage(`Save failed: ${err.message}`, 'bot', true);
    }
    render();
  }

  function discard() {
    if (!isDirty()) { addMessage('There are no unsaved changes.', 'bot'); return; }
    workingData = clone(savedData);
    history = [];
    addMessage('Discarded unsaved changes. Chart is back to the saved data.', 'bot');
    render();
  }

  function undo() {
    if (!history.length) { addMessage('Nothing to undo.', 'bot'); return; }
    workingData = history.pop();
    addMessage('Undid the last change.', 'bot');
    render();
  }

  function handleInput(text) {
    addMessage(text, 'user');
    const result = runCommand(text, workingData);
    if (result.action === 'save') return save();
    if (result.action === 'discard') return discard();
    if (result.action === 'undo') return undo();
    if (result.data !== workingData) {
      history.push(workingData);
      workingData = result.data;
      render();
      addMessage(result.reply + '\n(Not saved yet — click "Save data" or type "save".)', 'bot');
    } else {
      addMessage(result.reply, 'bot', result.error);
    }
  }

  $('chat-form').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('chat-input').value.trim();
    if (!text) return;
    $('chat-input').value = '';
    handleInput(text);
  });
  $('save-btn').addEventListener('click', save);
  $('discard-btn').addEventListener('click', discard);

  window.addEventListener('beforeunload', e => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  chart = new Chart($('chart'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Price', data: [], borderRadius: 4 }] },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Price' } } },
    },
  });

  load()
    .then(() => {
      render();
      addMessage('Hi! Changes you make are kept in memory until you save.\n\n' + HELP_TEXT, 'bot');
    })
    .catch(err => addMessage(`Could not load data: ${err.message}`, 'bot', true));
}
