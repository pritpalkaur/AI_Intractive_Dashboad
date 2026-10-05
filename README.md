# AI Interactive Dashboard

A website that charts product prices from SQL Server, with a chatbot that can change them.

- **frontend/** – React (Vite) app: chart, data table, and chatbot.
- **backend/** – Node.js (Express) REST API: JWT login, reads and saves prices in SQL Server, and sends emails.

## How it works

0. Users register with POST /api/auth/signup (or an admin runs `npm run create-user`), then sign in with email and password. The backend returns a JWT (valid for 8 hours by default) and every `/api/products` request must send it as `Authorization: Bearer <token>`.
1. The chatbot changes prices (`set keyboard to 79.99`). The chart redraws right away, and changed bars turn orange.
2. Changes are kept **in memory only** in the browser. The header shows "Unsaved changes".
3. Clicking **Save data** (or typing `save`) sends only the changed prices to the backend, which in one transaction:
   - updates `dbo.Products.Price`
   - sets the update flag: `IsUpdated = 1`, `UpdatedAt = <UTC time>`
4. After the save, the backend emails a summary (old price → new price) to the **logged-in user**. If the email fails the data is still saved, and the chatbot tells you the email was not sent.

**Discard changes** (or `discard`) goes back to the saved prices. `undo` reverts one step.

## Setup

Requires Node.js 20.6+ and SQL Server with a `dbo.Products (Id, Name, Price decimal(10,2))` table.

### Backend

```
cd backend
npm install
copy .env.example .env      # then fill in DB and SMTP settings
npm run migrate             # one time: adds IsUpdated / UpdatedAt to dbo.Products and creates dbo.DashboardUsers
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

`npm test` in either folder runs the tests (backend login and API routes, and the chatbot command parser).

## API

Interactive docs (Swagger UI): **http://localhost:5000/api/docs** — sign up with POST /api/auth/signup or log in with POST /api/auth/login, click **Authorize**, and paste the token. The raw OpenAPI spec is at /api/openapi.json.

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, name, password }` | `201 { ok, token, user, email: { to, sent, error } }` — sends a welcome email |
| POST | `/api/auth/login` | `{ email, password }` | `{ ok, token, user: { id, email, name } }` |
| GET | `/api/products` 🔒 | – | `{ ok, data: [{ id, label, value, isUpdated, updatedAt }] }` |
| POST | `/api/products/save` 🔒 | `{ data: [{ id, label, value }] }` | `{ ok, savedAt, changes, email: { to, sent, error }, data }` |

🔒 = requires `Authorization: Bearer <token>`.

## Chatbot commands

Use any part of a product name (it must match only one product).

| Example | Effect |
|---|---|
| `set keyboard to 79.99` / `mouse = 20` | Set a price |
| `increase cable by 2` / `add 10% to mouse` | Increase |
| `decrease keyboard by 5` / `reduce cable by 10%` | Decrease |
| `show`, `undo`, `discard`, `save`, `help` | Utilities |
