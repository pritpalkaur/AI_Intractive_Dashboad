# AI Interactive Dashboard

A website that charts product prices from SQL Server, with a chatbot that can change them.

- **frontend/** – React (Vite) app: chart, data table, and chatbot.
- **backend/** – Node.js (Express) REST API: JWT login, reads and saves prices in SQL Server, and sends emails.

## How it works

0. Users register with POST /api/auth/signup (or an admin runs `npm run create-user`), then sign in with email and password. **Forgot password?** on the login page emails a one-time reset link (valid 30 minutes). The backend returns a JWT (valid for 8 hours by default) and every `/api/products` request must send it as `Authorization: Bearer <token>`.
1. The chatbot changes prices (`set keyboard to 79.99`). The chart redraws right away, and changed bars turn orange.
2. Changes are kept **in memory only** in the browser. The header shows "Unsaved changes".
3. Clicking **Save data** (or typing `save`) sends only the changed prices to the backend, which in one transaction:
   - updates `dbo.Products.Price`
   - sets the update flag: `IsUpdated = 1`, `UpdatedAt = <UTC time>`
4. After the save, the backend emails a summary (old price → new price) to the **logged-in user**. If the email fails the data is still saved, and the chatbot tells you the email was not sent.

**Discard changes** (or `discard`) goes back to the saved prices. `undo` reverts one step.

## 🤖 AI assistant

Anything the chatbot commands below don't understand is sent to an AI assistant (Claude, model `claude-opus-5-5`) that understands plain English. Examples:

- `Make everything under $20 ten percent more expensive`
- `Which product is the most expensive?`
- `Set the mouse and the keyboard to the same price as the cable`
- `Round all prices to .99`
- `Ok save it`

The assistant **never writes to the database itself**. It only proposes new prices: they appear on the chart as orange bars, exactly like a chatbot command, and nothing is saved until you click **Save data**, type `save`, or clearly ask it to save. One `undo` reverts everything the assistant changed in one answer, and `discard` works as usual. If a product name could match several products, it asks which one you mean. Under each answer a small line shows which tools it used (for example `🤖 used: list_products, set_prices`).

How it works: the browser sends the chat so far and the prices currently on screen to `POST /api/agent`. The backend (`backend/src/agent.js`) gives Claude three tools — `list_products`, `set_prices` (checks every id and price) and `request_action` (save / discard / undo) — and returns the reply, the proposed prices and the requested action. Each tool call is logged in the backend console.

### Turning it on

1. Create a key at https://platform.claude.com/settings/keys (it starts with `sk-ant-` and is shown only once). The account needs credit under **Billing**.
2. Add it to the end of `backend/.env` (no quotes, no spaces around `=`):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart the backend (`.env` is only read at startup). The console shows **`AI assistant is on`**; without a key it shows `AI assistant is off (ANTHROPIC_API_KEY is not set)`.

Never put the key in `.env.example` or in the chat — `.env` is in `.gitignore`, `.env.example` is committed.

Each question is a paid API call (typically 3–10 seconds per answer). Leave the key empty to turn the assistant off: the app then works exactly as before, `POST /api/agent` returns `503`, and plain-English questions get "AI assistant is off. Type 'help' for the commands I understand."

### Example session

Run against the real API with prices Mouse 24.99, Cable 9.50, Keyboard 30.00 and two products at 20.00:

| You type | Assistant |
|---|---|
| `Which product is the most expensive?` | "Mechanical Keyboard at $30.00" — no changes |
| `Make everything under $20 ten percent more expensive` | Cable 9.50 → 10.45; leaves the 20.00 products alone because they are not *under* 20 |
| `Round all prices to .99` | Four prices → x.99; skips the mouse (already 24.99) |
| `Set the mouse to the same price as the cable` | Mouse 24.99 → 9.99, and warns that this is a 60% cut |

None of this is saved until you click **Save data** or say `save`.

### Details

- Model `claude-opus-5-5`, effort `medium`, at most 10 model calls per chat message (if it needs more, nothing is applied and it asks for a simpler request).
- If Claude declines a request for safety reasons, the API retries on a fallback model automatically (`fallbacks: "default"`); if that also declines, you get a friendly "Sorry, I can't help with that request".
- The browser sends at most the last 20 chat turns (2000 characters each) and the prices currently on screen, including unsaved changes.
- While the assistant is thinking, the chat box and the **Save data** / **Discard changes** buttons are disabled.

## Setup

Requires Node.js 20.6+ and SQL Server with a `dbo.Products (Id, Name, Price decimal(10,2))` table.

### Backend

```
cd backend
npm install
copy .env.example .env      # then fill in DB and SMTP settings
npm run migrate             # adds IsUpdated / UpdatedAt to dbo.Products, creates dbo.DashboardUsers and dbo.PasswordResets
npm run create-user -- --email someone@gmail.com --name "Some One" --password "at-least-8-chars"
npm start                   # http://localhost:5000
```

Set `JWT_SECRET` to a long random string (the command to generate one is in `.env.example`).

`create-user` saves the account (password stored as a bcrypt hash) and sends a welcome email to the new user with their login email and the site link. The password is **not** emailed — give it to the user yourself.

For Gmail, set `SMTP_PASSWORD` to an [app password](https://myaccount.google.com/apppasswords).
If `SMTP_HOST` is empty, emails are only printed to the backend console.

### Frontend

```
cd frontend
npm install
npm run dev                 # http://localhost:3000 (calls to /api are forwarded to the backend on port 5000)
```

`npm test` in either folder runs the tests: `backend/test/api.test.js` (login and API routes, including `/api/agent` with a fake AI assistant — no real API calls), `backend/test/agent.test.js` (the AI assistant's price checks and merging), and `frontend/test/chatbot.test.js` (the chatbot command parser).

## API

Interactive docs (Swagger UI): **http://localhost:5000/api/docs** — sign up with POST /api/auth/signup or log in with POST /api/auth/login, click **Authorize**, and paste the token. The raw OpenAPI spec is at /api/openapi.json.

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, name, password }` | `201 { ok, token, user, email: { to, sent, error } }` — sends a welcome email |
| POST | `/api/auth/forgot-password` | `{ email }` | `{ ok, message }` — same reply whether or not the account exists; emails a link to `APP_URL/?reset=<token>` |
| POST | `/api/auth/reset-password` | `{ token, password }` | `{ ok, message }` — link works once; emails a "password changed" notice |
| POST | `/api/auth/login` | `{ email, password }` | `{ ok, token, user: { id, email, name } }` |
| GET | `/api/products` 🔒 | – | `{ ok, data: [{ id, label, value, isUpdated, updatedAt }] }` |
| POST | `/api/products/save` 🔒 | `{ data: [{ id, label, value }] }` | `{ ok, savedAt, changes, email: { to, sent, error }, data }` |
| POST | `/api/agent` 🔒 | `{ messages: [{ role, content }], products: [{ id, label, value, savedValue }] }` | `{ ok, reply, changes: [{ id, value }], action, toolCalls }` — proposes changes only, never saves; `503` when `ANTHROPIC_API_KEY` is not set |

🔒 = requires `Authorization: Bearer <token>`.

## Chatbot commands

Use any part of a product name (it must match only one product).

| Example | Effect |
|---|---|
| `set keyboard to 79.99` / `mouse = 20` | Set a price |
| `increase cable by 2` / `add 10% to mouse` | Increase |
| `decrease keyboard by 5` / `reduce cable by 10%` | Decrease |
| `show`, `undo`, `discard`, `save`, `help` | Utilities |
| Anything else | Sent to the 🤖 AI assistant (if it is turned on) |

## Troubleshooting

| Problem | Fix |
|---|---|
| Backend exits with `JWT_SECRET in .env must be at least 32 characters` | Set `JWT_SECRET` in `backend/.env` (see `.env.example`). |
| `Could not connect to SQL Server` | Start SQL Server and check `DB_SERVER` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`. |
| Emails not arriving; backend log shows `535-5.7.8 Username and Password not accepted` | `SMTP_USER` must be the exact Gmail address, and `SMTP_PASSWORD` an [app password](https://myaccount.google.com/apppasswords) created for that same account. Restart the backend after editing `.env`. |
| Password reset link (`http://localhost:3000/?reset=...`) does not open | The frontend must be running (`cd frontend` → `npm run dev`). Links expire after 30 minutes and only the newest link works. |
| `Cannot POST /api/agent` (404), or `.env` changes have no effect | An old backend is still running on port 5000. Stop every `node` process (Task Manager, or `Get-Process node \| Stop-Process` in PowerShell) and start the backend again. Likewise, if Vite says port 3000 is in use, an old frontend is still running. |
| Chat says "AI assistant is off" | `ANTHROPIC_API_KEY` is missing from `backend/.env`, or the backend was not restarted after adding it. |
| Chat shows "AI assistant error: AI assistant failed" | See the backend console for the real error (for example an invalid key or no API credit). |
