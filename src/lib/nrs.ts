/**
 * NRS (Nigeria Revenue Service) e-invoice DATA PREPARATION.
 *
 * This file only organises and checks the data an NRS e-invoice needs. KACHIER does not submit invoices to NRS, does not
 * create IRNs, cryptographic stamps or QR codes, and a KACHIER invoice is never "NRS validated". Those come from NRS after
 * the taxpayer is onboarded and the invoice is validated through the Merchant Buyer Solution (MBS).
 *
 * Source of the field names: the NRS invoice schema as reproduced in an integrator's published documentation
 * (docs.interswitchgroup.com/docs/nrs-e-invoicing). The official NRS documentation remains the final authority;
 * anything marked UNCONFIRMED must be checked against it before real use.
 */
import type { DocData, DocKind, LineItem } from '../types';
import { clamp, computeTotals, parseNum } from './calc';
import { formatDate } from './dates';
import { formatMoney } from './currency';

/** Only these KACHIER documents are NRS e-invoice types (invoice, credit note, debit note). */
export const NRS_KINDS: DocKind[] = ['invoice', 'credit-note', 'debit-note'];
export const nrsApplies = (k: DocKind) => NRS_KINDS.includes(k);

/**
 * invoice_type_code. UNCONFIRMED: the integrator documentation lists 381 = sales invoice, 380 = credit note, 384 = debit note.
 * That is the reverse of the common UN/UBL meaning of 380 and 381, so confirm against the official NRS schema before use.
 */
export const NRS_TYPE_CODE: Partial<Record<DocKind, string>> = { invoice: '381', 'credit-note': '380', 'debit-note': '384' };

export type TaxCat = 'STANDARD_VAT' | 'ZERO_VAT' | 'EXEMPTED';
export const TAX_CATEGORIES: Array<{ value: TaxCat; label: string }> = [
  { value: 'STANDARD_VAT', label: 'Standard VAT' },
  { value: 'ZERO_VAT', label: 'Zero-rated VAT' },
  { value: 'EXEMPTED', label: 'Exempt' },
];
const CAT_LABEL: Record<string, string> = { STANDARD_VAT: 'Standard VAT', ZERO_VAT: 'Zero-rated VAT', EXEMPTED: 'Exempt', '': 'Tax category not chosen' };

/** A line follows the invoice VAT rate (standard VAT) unless a category is chosen. With a 0% rate and no category it stays undecided. */
export function lineCategory(d: DocData, it: LineItem): TaxCat | '' {
  if (it.taxCategory === 'STANDARD_VAT' || it.taxCategory === 'ZERO_VAT' || it.taxCategory === 'EXEMPTED') return it.taxCategory;
  return parseNum(d.taxRate) > 0 ? 'STANDARD_VAT' : '';
}

export interface VatRow { category: TaxCat | ''; rate: number; taxable: number; tax: number } // cents

/** Taxable amount and VAT for each tax category, using the same maths as the invoice totals. */
export function vatAnalysis(d: DocData): VatRow[] {
  const t = computeTotals(d);
  const out: VatRow[] = [];
  for (const c of ['STANDARD_VAT', 'ZERO_VAT', 'EXEMPTED', ''] as const) {
    const idx = d.items.map((_, i) => i).filter((i) => lineCategory(d, d.items[i]) === c);
    if (!idx.length) continue;
    const taxable = idx.reduce((a, i) => a + t.lines[i] - t.lineDiscounts[i], 0);
    const rate = c === 'STANDARD_VAT' ? t.taxRate : 0;
    out.push({ category: c, rate, taxable, tax: Math.round((taxable * rate) / 100) });
  }
  return out;
}

const dec = (cents: number) => Math.round(cents) / 100;
const effKind = (d: DocData) => d.invoiceKind || (d.customerTaxId.trim() ? 'B2B' : 'B2C');

/** The invoice in the NRS JSON shape. `irn` stays empty: it is created when the invoice goes through NRS validation. */
export function nrsPayload(d: DocData) {
  const t = computeTotals(d);
  const va = vatAnalysis(d).filter((v) => v.category);
  const credit = d.kind === 'credit-note' || d.kind === 'debit-note';
  const supplier = {
    party_name: d.businessName.trim(), tin: d.businessTaxId.trim(), email: d.businessEmail.trim(), telephone: d.businessPhone.trim(),
    postal_address: { street_name: d.businessAddress.trim().replace(/\n+/g, ', '), city_name: d.businessCity.trim(), postal_zone: d.businessPostalZone.trim(), country: d.businessCountry.trim().toUpperCase() },
  };
  const customer = d.customerTaxId.trim()
    ? {
        party_name: d.customerName.trim(), tin: d.customerTaxId.trim(), email: d.customerEmail.trim(), telephone: d.customerPhone.trim(),
        postal_address: { street_name: d.customerAddress.trim().replace(/\n+/g, ', '), city_name: d.customerCity.trim(), postal_zone: d.customerPostalZone.trim(), country: d.customerCountry.trim().toUpperCase() },
      }
    : undefined;
  const lines = d.items.map((it, i) => {
    const gross = t.lines[i];
    const disc = t.lineDiscounts[i];
    const classed = it.classType === 'ISIC' ? { isic_code: it.code.trim(), service_category: it.category.trim() } : { hsn_code: it.code.trim(), product_category: it.category.trim() };
    return {
      ...classed,
      discount_rate: gross ? Math.round((disc / gross) * 10000) / 100 : 0,
      discount_amount: dec(disc),
      fee_rate: 0,
      fee_amount: 0,
      invoiced_quantity: parseNum(it.qty),
      line_extension_amount: dec(gross),
      item: { name: it.description.trim(), description: (it.details.trim() || it.description.trim()), sellers_item_identification: it.code.trim() },
      price: { price_amount: parseNum(it.price), base_quantity: 1, price_unit: it.unitCode.trim() },
    };
  });
  const tax = va.reduce((a, v) => a + v.tax, 0);
  return {
    business_id: d.businessId.trim(),
    irn: '', // assigned through NRS validation, never created here
    invoice_kind: effKind(d),
    issue_date: d.issueDate,
    due_date: d.dueDate,
    issue_time: /^\d{2}:\d{2}$/.test(d.issueTime) ? `${d.issueTime}:00` : d.issueTime,
    invoice_type_code: NRS_TYPE_CODE[d.kind] ?? '',
    payment_status: d.status === 'paid' ? 'PAID' : d.status === 'partial' ? 'PARTIAL' : 'PENDING',
    tax_point_date: d.taxPointDate || d.issueDate,
    document_currency_code: d.currency,
    tax_currency_code: d.currency,
    ...(credit ? { billing_reference: [{ irn: d.originalIrn.trim(), issue_date: d.originalIssueDate }] } : {}),
    accounting_supplier_party: supplier,
    ...(customer ? { accounting_customer_party: customer } : {}),
    invoice_line: lines,
    tax_total: [{ tax_amount: dec(tax), tax_subtotal: va.map((v) => ({ taxable_amount: dec(v.taxable), tax_amount: dec(v.tax), tax_category: { id: v.category, percent: v.rate } })) }],
    legal_monetary_total: {
      line_extension_amount: dec(t.subtotal),
      tax_exclusive_amount: dec(t.subtotal),
      tax_inclusive_amount: dec(t.subtotal + tax),
      payable_amount: dec(t.taxable + tax),
    },
  };
}

export interface Readiness { missing: string[]; notes: string[] }

/** What is still missing before this data could be sent to NRS, and what cannot be done inside KACHIER at all. */
export function nrsReadiness(d: DocData): Readiness {
  const missing: string[] = [];
  const need = (ok: boolean, what: string) => { if (!ok) missing.push(what); };
  const has = (s: string) => s.trim() !== '';
  need(has(d.businessName), 'Supplier legal business name');
  need(has(d.businessTaxId), 'Supplier Tax ID (TIN)');
  need(has(d.businessId), 'NRS Business ID (given by NRS after onboarding)');
  need(has(d.businessEmail), 'Supplier email');
  need(has(d.businessPhone), 'Supplier phone number');
  need(has(d.businessAddress), 'Supplier street address');
  need(has(d.businessCity), 'Supplier city');
  need(/^[A-Za-z]{2}$/.test(d.businessCountry.trim()), 'Supplier country code (2 letters, e.g. NG)');
  need(has(d.number), 'Invoice number');
  need(!!d.issueDate && !!d.issueTime, 'Issue date and time');
  need(!!d.dueDate, 'Due date');
  need(/^[A-Za-z]{3}$/.test(d.currency), 'Currency code');
  if (effKind(d) === 'B2B' || has(d.customerTaxId)) {
    need(has(d.customerName), 'Customer name');
    need(d.customerTaxId.trim().length >= 5, 'Customer Tax ID (at least 5 characters)');
    need(has(d.customerEmail), 'Customer email');
    need(has(d.customerPhone), 'Customer phone number');
    need(has(d.customerCity), 'Customer city');
    need(/^[A-Za-z]{2}$/.test(d.customerCountry.trim()), 'Customer country code (2 letters)');
  }
  if (d.kind !== 'invoice') {
    need(has(d.originalIrn), 'IRN of the original invoice (from NRS)');
    need(!!d.originalIssueDate, 'Issue date of the original invoice');
  }
  d.items.forEach((it, i) => {
    const n = `Item ${i + 1}`;
    need(has(it.description), `${n}: description`);
    need(has(it.code), `${n}: ${it.classType === 'ISIC' ? 'ISIC' : 'HSN'} code`);
    need(has(it.category), `${n}: ${it.classType === 'ISIC' ? 'service' : 'product'} category`);
    need(has(it.unitCode), `${n}: unit code (e.g. EA, KGM, LTR)`);
    need(parseNum(it.qty) > 0 && has(it.price), `${n}: quantity and unit price`);
    need(lineCategory(d, it) !== '', `${n}: tax category`);
  });
  const notes = [
    'The IRN, cryptographic stamp and QR code are created by NRS after validation. KACHIER cannot create them.',
    'The NRS Business ID, Access Point Provider and Tax ID setup need the business to be onboarded with NRS first.',
    'The invoice type codes (381, 380, 384) come from integrator documentation and must be confirmed against the official NRS schema.',
    'Discounts are shared across the lines in proportion to line value. Confirm how NRS expects invoice-level discounts.',
  ];
  if (computeTotals(d).chargesTotal > 0) notes.push('Extra charges (such as delivery) have no place in the NRS data and are left out of it.');
  return { missing, notes };
}

/** Text for the "Tax information" block printed on the invoice. Never invents NRS validation. */
export function nrsTaxInfo(d: DocData): string {
  const rows = vatAnalysis(d).map((v) => {
    const name = CAT_LABEL[v.category] + (v.category === 'STANDARD_VAT' ? ` ${v.rate}%` : '');
    return `${name}: taxable ${formatMoney(v.taxable, d.currency)}, VAT ${formatMoney(v.tax, d.currency)}`;
  });
  const extra: string[] = [];
  if (d.kind !== 'invoice' && d.originalIrn.trim()) extra.push(`Original invoice IRN: ${d.originalIrn.trim()}${d.originalIssueDate ? ` (${formatDate(d.originalIssueDate)})` : ''}`);
  const hasOfficial = !!(d.nrsIrn?.trim() || d.nrsCsid?.trim() || d.nrsQrDataUrl?.trim());
  if (hasOfficial) {
    if (d.nrsIrn?.trim()) extra.push(`IRN (Invoice Reference Number): ${d.nrsIrn.trim()}`);
    if (d.nrsCsid?.trim()) extra.push(`Cryptographic Stamp / CSID: ${d.nrsCsid.trim()}`);
    if (d.nrsQrDataUrl?.trim()) extra.push('Official NRS QR code is shown on this document.');
  } else {
    extra.push('Not yet submitted to or validated by NRS. The IRN and QR code are issued by NRS after validation.');
  }
  return [...rows, ...extra].join('\n');
}

export const clampRate = (n: number) => clamp(n, 0, 100);
