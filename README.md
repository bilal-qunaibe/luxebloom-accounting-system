# LuxeBloom — Accounting & Inventory Management System

A full-stack accounting and inventory system I designed and built for LuxeBloom, my own accessories business. It handles sales, purchases, stock, expenses, partners and the books behind them, with an in-app assistant that records operations from plain Arabic messages.

🔗 Live Demo: coming soon

## ✨ Features

- 📦 **Inventory** — products with sizes, weighted average cost, low-stock alerts, and stock adjustments that post to the books
- 💵 **Sales & Purchases** — invoices update stock, customer/supplier balances and the journal in a single atomic transaction
- 📒 **Double-entry accounting** — every operation creates its journal entry automatically (revenue, cost of goods sold, inventory, cash/bank, receivables, payables)
- 🤝 **Partners** — current account per partner for contributions and withdrawals
- 💱 **Multi-currency** — ILS as base currency, with USD and JOD converted at configurable rates
- ↩️ **Cancellation** — any document can be cancelled; the system posts a reversing entry and restores stock/balances instead of deleting history
- 🧾 **Customer & supplier ledgers** — opening balances, payments and full statements
- ✨ **Assistant** — type (or speak) something like "بعت خاتم فضة بـ200 مع دب" and it prepares the operation as a card; nothing is saved until you confirm, and every saved operation can be undone
- 🔁 **Legacy data migration** — one-click tool that posts entries for records created before the accounting engine existed (safe to re-run)
- 🔐 **Security** — Firestore rules allow reads for LuxeBloom members only; all writes go through Cloud Functions

## 🛠 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Firebase Cloud Functions (Node.js 22, TypeScript), Zod |
| Database | Cloud Firestore |
| Auth | Firebase Authentication |
| Assistant | Claude API with tool calling |
| Tooling | Vite, Node test runner, Git |

## 🏗 Architecture

```
├── src/                     # React frontend
│   ├── lib/db.ts            # reads (Firestore REST + auth token) and writes (callable functions)
│   ├── components/          # shared UI, assistant panel, customer/supplier ledger
│   └── pages/               # dashboard, inventory, sales, purchases, expenses, partners, accounting...
├── functions/               # Cloud Functions (codebase: luxebloom)
│   ├── src/domain/          # accounting engine: sales, purchases, money, reversal, migration
│   ├── src/assistant/       # assistant tools and loop
│   └── test/                # domain tests against an in-memory store
└── firestore.luxebloom.rules
```

Business logic lives on the server only. The browser never writes to Firestore directly; it calls `luxeAction` with an action type and payload, and the function validates it, runs it inside a transaction and posts the journal entry.

## 🚀 Getting Started

```bash
git clone https://github.com/bilal-qunaibe/luxebloom-accounting-system.git
cd luxebloom-accounting-system

npm install
npm --prefix functions install

cp .env.example .env    # fill in the Firebase web config
npm run dev
```

Run the backend tests:

```bash
npm test
```

## ☁️ Deployment

The Firebase project is shared with another app, so every command targets LuxeBloom only.

1. The project must be on the Blaze plan (Cloud Functions + outbound calls to the Claude API).
2. Set the owner emails and the assistant key:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   On the first deploy the CLI asks for `LUXE_OWNER_EMAILS` (comma-separated emails allowed to use the system).
3. Deploy:
   ```bash
   npm run build
   firebase deploy --only functions:luxebloom,hosting:luxebloom-f6aec
   ```
4. Add the block in `firestore.luxebloom.rules` to the project's Firestore rules from the Firebase Console, without changing the rules of other apps.
5. Sign in, open **Settings → ترحيل البيانات**, preview, then run the migration once.

## 👤 Author

Bilal Qunaibe — Full-Stack Developer
📧 bilalfadel200@gmail.com · 💼 [LinkedIn](https://www.linkedin.com/in/bilal-qunaibe-854304408/)
