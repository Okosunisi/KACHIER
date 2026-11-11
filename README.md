# KACHIER

A simple bookkeeping and record-keeping website for small and large business owners.
Record sales and spending, see daily, weekly and monthly reports, and make professional documents
(invoices, receipts, quotations, sales and purchase orders, payment vouchers, credit and debit notes, waybills).

- Three templates for every document: Classic Corporate, Modern Minimal, Bold Business
- Real A4 PDF download (text, not a screenshot), print, and WhatsApp sharing
- Naira (₦) by default, plus other currencies
- Built with React, TypeScript and Vite. PDFs are drawn with jsPDF.

## Put it online (GitHub + Vercel, free)

You need two free accounts: **github.com** and **vercel.com** (sign up to Vercel with the "Continue with GitHub" button).

### Step 1: put the project on GitHub
1. On GitHub tap **+** then **New repository**. Name it `kachier`. Leave everything else as it is and tap **Create repository**.
2. Unzip the project on a computer. Open the new `kachier` folder.
3. On the repository page click **uploading an existing file**. Drag in **everything inside** the folder
   (`src`, `public`, `index.html`, `package.json`, `vercel.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `README.md`).
   Do not upload a `node_modules` folder if you have one.
4. Click **Commit changes**.

(Comfortable with a terminal? Inside the folder run: `git init`, `git add .`, `git commit -m "KACHIER"`, `git branch -M main`,
`git remote add origin https://github.com/YOUR-NAME/kachier.git`, `git push -u origin main`.)

### Step 2: deploy on Vercel
1. On vercel.com click **Add New**, then **Project**.
2. Pick the `kachier` repository and click **Import**.
3. Vercel detects Vite by itself (the settings come from `vercel.json`). Do not change anything. Click **Deploy**.
4. Wait about a minute. You get a link like `kachier.vercel.app`. That is your website.

Every time you change a file on GitHub, Vercel updates the website automatically.

### After it is live, test once
Open the link on your phone and on a computer. For **each** of the nine documents (Invoice, Receipt, Quotation, Sales order, Purchase order, Payment voucher, Credit note, Debit note and Waybill):
press **Fill with sample**, press **Generate**, then **Download PDF**, **Print** and **WhatsApp**.
If anything fails, open the Vercel project, click the failed deployment and copy the build log.

## Run it on your own computer
Needs Node 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production site in /dist
npm run typecheck  # TypeScript check
```

## What is where

| Path | What it does |
| --- | --- |
| `src/components/Home.tsx` | Homepage, How It Works, footer, document switcher |
| `src/components/Editor.tsx` | The form for all nine documents, live preview, buttons |
| `src/components/InvoiceDocument.tsx` + `src/styles/doc.css` | The document itself (3 templates), also used for printing |
| `src/pdf/buildPdf.ts` | PDF engine: A4, repeated table headings, multi-page, keeps totals and signatures together |
| `src/lib/docModel.ts`, `src/lib/kinds.ts` | What goes on each document type, and its wording |
| `src/lib/calc.ts` | All money maths, done in whole kobo/cents |
| `src/lib/validate.ts` | Required-field and number checks |
| `public/fonts` | Fonts for screen, print and PDF (include the Naira sign) |
| `vercel.json` | Vercel settings |

## Privacy
No tracking. Without the database, records stay in the browser on that device. With Supabase turned on, each person signs in and can see only their own records.

## Sales Management and Business Reports
Two more sections sit beside Business Documents in the main menu:

- **Sales Management** (`#/sales`): a digital sales book. Add, edit, delete, search and filter sales. "Try Sample Data" shows a demo that is never saved.
- **Business Reports** (`#/reports`): daily, weekly and monthly reports, Record Business Spending, transaction history, and a Business Summary. Every table exports to CSV.

Every table has **Export CSV** (opens in Excel) and **Export PDF**.

## Keep records safe: turn on the database (Supabase, free)
Without this, records stay only in the browser on that one phone or computer. With it, each person signs in and their
records are saved in their own account, safe on any device. Nobody can see another person's records.

1. Go to **supabase.com**, sign up, and tap **New project**. Give it a name and a database password, then wait a minute.
2. In the project, open **SQL Editor**, tap **New query**, paste everything from the file `supabase/setup.sql`, and tap **Run**.
   It should say "Success".
3. Open **Project Settings**, then **API**. Copy the **Project URL** and the **anon public** key.
   (Do NOT copy the "service_role" key. It must never go in this project.)
4. On **vercel.com**, open your project, go to **Settings**, then **Environment Variables**, and add two:
   `VITE_SUPABASE_URL` = the Project URL, and `VITE_SUPABASE_ANON_KEY` = the anon public key.
5. Go to **Deployments**, tap the three dots on the latest one, and tap **Redeploy**.
6. In Supabase open **Authentication**, then **Providers**, then **Email**. If you want people to start without confirming an email, turn **Confirm email** off.
7. Open the site, tap **Sales Management**, create an account, and add a sale. Sign in on another phone to check that it is there.

Records already typed on a device before this step are not lost. After signing in, a yellow box offers **Move them to my account**.

The code that talks to the database is `src/lib/cloud.ts` and the six functions in `src/lib/books.ts`.

## NRS e-invoice data (invoice, credit note, debit note)
Each of these three documents has an optional card, "NRS e-invoice data", that prepares the data an NRS e-invoice needs.
It is off by default, so existing invoices do not change. When it is on you get: Business ID, invoice kind, issue time,
tax point date, structured addresses, original-invoice IRN (credit and debit notes), and per-item HSN/ISIC code, category,
tax category (standard, zero-rated, exempt) and unit code. The PDF then prints a "Tax information" block with the VAT analysis.

KACHIER does **not** submit to NRS, and it never creates an IRN, cryptographic stamp or QR code. Those come from NRS after the
taxpayer is onboarded and the invoice is validated. The code is in `src/lib/nrs.ts`. Field names follow the NRS schema as
published by an integrator (docs.interswitchgroup.com/docs/nrs-e-invoicing). The official NRS documentation is the final
authority, and `NRS_TYPE_CODE` in that file is marked UNCONFIRMED until it is checked against it.
