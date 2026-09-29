# Rupee Wise

A mobile-first personal expense tracker built with React and Vite. Expenses, monthly budgets, shared groups, and settings are stored locally in the browser using IndexedDB; no financial data is sent to a cloud database.

## Run locally

```sh
npm install
npm run dev
```

## Features

- Start each new expense by choosing personal or group; personal expenses stay separate from group totals. Add, edit, search, filter, and delete personal expenses across eight categories.
- Set an independent monthly budget and review spending, remaining balance, overspend, and budget history for each calendar month.
- Add category-level budget caps with live spending progress.
- Track monthly income, net cash flow, six-month trends, savings goals, and a safe-to-spend-per-day guide.
- Schedule weekly, monthly, quarterly, yearly, or custom recurring expenses with optional end dates and pause/resume.
- Split shared group expenses equally or enter custom participant shares, see each member's balance, and get simple settlement suggestions.
- Attach locally compressed receipt photos to personal or shared expenses and edit shared bills, participants, and payer.
- Review and import local CSV, OFX, or QFX bank statements from Settings with duplicate detection; select transaction types and expense categories before saving. There is no bank connection or statement upload.
- Export or restore a JSON backup from Settings, including receipts and locally imported transaction history.
- Responsive keyboard-accessible layout with five-item mobile navigation; income, calendar, recurring, and statement tools are accessible from Settings.

Run `npm run build` to create a production build and `npm run lint` to check the source.

## Combined version

This branch combines the redesigned interface with month-grouped history, date and account-type filters, CSV and print/PDF exports, and the simulated bank import from the history-fix branch. Group history links to the group for editing.

Financial data remains local to this browser and is now stored separately for each signed-in account. Old unassigned device data is preserved. To recover it, sign in to the owning account, open Settings → Restore previous device data, and confirm the replacement. Export any current account data first if you need to retain it. The old record is not deleted or automatically assigned to an account.

Saves are serialized and update the screen only after storage succeeds. Run `npm test` for regression checks covering account storage keys, legacy preservation, recurring-group migration, failed saves, and concurrent updates. These use a deterministic storage adapter; live Supabase sign-in and browser IndexedDB integration still require browser testing.
