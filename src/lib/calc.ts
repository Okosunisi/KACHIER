import type { DocData, LineItem, SummaryRow, Totals } from '../types';
import { formatQty } from './currency';
import { TOTAL_LABEL } from './kinds';

/** Parses user input such as "1,500.50" into a number. Invalid input becomes 0. */
export function parseNum(s: string): number {
  const n = Number(String(s ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** True when the string is a valid, non-negative number (empty is NOT valid). */
export function isValidNumber(s: string): boolean {
  const t = String(s ?? '').replace(/,/g, '').trim();
  if (t === '') return false;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0;
}

/** Converts a money string to whole cents (kobo). Never negative. */
export function toCents(s: string): number {
  return Math.round(Math.max(0, parseNum(s)) * 100);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function lineTotal(item: Pick<LineItem, 'qty' | 'price'>): number {
  return Math.round(Math.max(0, parseNum(item.qty)) * toCents(item.price));
}

/** Shares `total` cents across lines in proportion to `weights`; the shares always add up to `total` exactly. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
  return out;
}

/** All money maths is done in whole cents to avoid floating point drift. */
export function computeTotals(d: DocData): Totals {
  const lines = d.items.map(lineTotal);
  const subtotal = lines.reduce((a, b) => a + b, 0);

  const discount =
    d.discountMode === 'percent'
      ? Math.round((subtotal * clamp(parseNum(d.discountValue), 0, 100)) / 100)
      : Math.min(toCents(d.discountValue), subtotal);

  const taxable = subtotal - discount;
  const taxRate = clamp(parseNum(d.taxRate), 0, 100);
  // Lines marked zero-rated or exempt carry no VAT. With no such lines this is the same as taxing the whole amount.
  const lineDiscounts = allocate(discount, lines);
  const vatBase = d.items.reduce((a, it, i) => (it.taxCategory === 'ZERO_VAT' || it.taxCategory === 'EXEMPTED' ? a : a + lines[i] - lineDiscounts[i]), 0);
  const tax = Math.round((vatBase * taxRate) / 100);

  const charges = d.charges.map((c) => toCents(c.amount));
  const chargesTotal = charges.reduce((a, b) => a + b, 0);

  const total = taxable + tax + chargesTotal;

  // Only invoices and receipts track payment. Quotations and waybills never show a paid amount.
  let paid = 0;
  if (d.kind === 'receipt') paid = total;
  else if (d.kind === 'invoice') {
    if (d.status === 'paid') paid = total;
    else if (d.status === 'partial') paid = Math.min(toCents(d.amountPaid), total);
  }

  return {
    lines,
    subtotal,
    discount,
    taxable,
    taxRate,
    tax,
    lineDiscounts,
    charges,
    chargesTotal,
    total,
    paid,
    balance: total - paid,
  };
}

/** Trims "7.50" style percentages for labels: 7.5 -> "7.5", 10 -> "10". */
export function pctLabel(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** One list of summary rows, shared by the on-screen document and the PDF. */
export function buildSummary(d: DocData, t: Totals): SummaryRow[] {
  if (d.kind === 'waybill') return buildWaybillSummary(d);
  const rows: SummaryRow[] = [{ kind: 'row', label: 'Subtotal', amount: t.subtotal }];

  if (t.discount > 0) {
    const label =
      d.discountMode === 'percent' ? `Discount (${pctLabel(clamp(parseNum(d.discountValue), 0, 100))}%)` : 'Discount';
    rows.push({ kind: 'row', label, amount: t.discount, negative: true });
  }

  if (t.taxRate > 0 || t.tax > 0) {
    const name = d.taxLabel.trim() || 'Tax';
    rows.push({ kind: 'row', label: `${name} (${pctLabel(t.taxRate)}%)`, amount: t.tax });
  }

  d.charges.forEach((c, i) => {
    if (t.charges[i] > 0) rows.push({ kind: 'row', label: c.label.trim() || 'Additional charge', amount: t.charges[i] });
  });

  if (d.kind !== 'invoice') {
    rows.push({ kind: 'grand', label: TOTAL_LABEL[d.kind] ?? 'Total', amount: t.total });
  } else if (d.status === 'paid') {
    rows.push({ kind: 'grand', label: 'Total paid', amount: t.total });
  } else if (d.status === 'partial') {
    rows.push({ kind: 'grand', label: 'Total', amount: t.total });
    rows.push({ kind: 'row', label: 'Amount paid', amount: t.paid, negative: true });
    rows.push({ kind: 'balance', label: 'Balance due', amount: t.balance });
  } else {
    rows.push({ kind: 'grand', label: 'Total due', amount: t.total });
  }
  return rows;
}

/** Trims a weight/quantity total: 12 -> "12", 12.5 -> "12.5", 12.345 -> "12.35". */
export function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function waybillTotals(d: DocData): { qty: number; weight: number } {
  let qty = 0;
  let weight = 0;
  for (const it of d.items) {
    qty += Math.max(0, parseNum(it.qty));
    weight += Math.max(0, parseNum(it.weight));
  }
  return { qty, weight };
}

function buildWaybillSummary(d: DocData): SummaryRow[] {
  const w = waybillTotals(d);
  const rows: SummaryRow[] = [{ kind: 'row', label: 'Total quantity', amount: 0, text: formatWeight(w.qty) }];
  if (w.weight > 0) rows.push({ kind: 'row', label: 'Total weight', amount: 0, text: `${formatWeight(w.weight)} kg` });
  const declared = toCents(d.declaredValue);
  if (declared > 0) rows.push({ kind: 'row', label: 'Declared value', amount: declared });
  const freight = toCents(d.freightCharge);
  if (freight > 0) rows.push({ kind: 'grand', label: 'Freight charge', amount: freight });
  return rows;
}

export function statusLabel(d: DocData): string {
  if (d.kind === 'waybill') {
    return d.shipmentStatus === 'delivered' ? 'DELIVERED' : d.shipmentStatus === 'in-transit' ? 'IN TRANSIT' : 'PENDING';
  }
  if (d.kind === 'receipt') return 'PAID';
  if (d.kind !== 'invoice') return ''; // only invoices (and receipts) show a payment status
  if (d.status === 'paid') return 'PAID';
  if (d.status === 'partial') return 'PARTIALLY PAID';
  return 'UNPAID';
}

export { formatQty };
