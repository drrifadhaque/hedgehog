# Hedgehog 🦔 — SM Nabho Group owner dashboard

Single-page, Odoo-inspired owner dashboard covering all SM Nabho Group businesses.
**This repository contains public UI code only** — no exports, secrets, or financial snapshots.

## Architecture
- **Frontend (this repo)** — static SPA on GitHub Pages. Holds no privileged keys.
- **Backend** — protected aggregation API on the SM Nabho VPS (`smmanager.cloud/hedgehog`).
  Holds the Supabase service key server-side; requires an owner bearer token.
- **Sources** — existing Supabase tables (cashbox, vendor_invoices, sales, stock, attendance,
  telegram_invoices, reconciliation, daily_summaries) + a historical Vyapar export.

## Using it
1. Open the dashboard.
2. Enter the **owner access token** (delivered privately) on the login screen. It is kept in
   your browser's localStorage and sent only as a bearer header to the protected API.

## Honest data rules
- Missing data shows **unavailable**, never `0`.
- Profit is labelled as a **15% estimate**.
- Stock is a **latest snapshot**, not cumulative products ever stocked.
- Mixed sale parties are **not** unique customers.
- Shilpi internal supply is **not** counted as group revenue.
- Lifetime sales: owner-reported ₹28 L shown alongside verified recorded sales and a
  coverage/reconciliation gap (see the reconciliation panel).

## Files
- `index.html` · `styles.css` · `app.js`

No secrets. No data dumps. UI code only.
