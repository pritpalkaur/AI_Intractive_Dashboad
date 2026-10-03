# AI Interactive Dashboard

A website that charts product prices from SQL Server, with a chatbot that can change them.

- The chatbot changes prices. The chart redraws right away, and changed bars turn orange.
- Changes are kept **in memory only**, and the header shows "Unsaved changes".
- Clicking **Save data** (or typing `save` to the bot) writes the changed prices to `dbo.Products.Price`. Only prices you changed are written.
- **Discard changes** (or `discard`) puts back the saved prices. `undo` reverts one step.

## Setup

Requires Node.js 20.6+ and SQL Server.

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the connection details:
   ```
   DB_SERVER=PRITI_LAPTOP
   DB_NAME=ProductsDb
   DB_USER=user1
   DB_PASSWORD=...
   ```
3. `npm start` and open http://localhost:3000

`npm test` runs the chatbot command tests.

## Chatbot commands

Use any part of a product name (it must match only one product).

| Example | Effect |
|---|---|
| `set keyboard to 79.99` / `mouse = 20` | Set a price |
| `increase cable by 2` / `add 10% to mouse` | Increase |
| `decrease keyboard by 5` / `reduce cable by 10%` | Decrease |
| `show`, `undo`, `discard`, `save`, `help` | Utilities |
