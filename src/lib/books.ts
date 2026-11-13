import { addDays, formatDate, parseISO, toISO, todayISO } from './dates';
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney, getCurrency } from './currency';
import { saveBlob } from './files';
import { cloudActive, rest } from './cloud';
import { loadDraft } from './storage';

/** Sales and spending records. Kept in this browser for now (see load/save): one place to swap for Supabase later. */
export const PAYS = ['Cash', 'Bank Transfer', 'POS', 'Other'] as const;
export type Pay = (typeof PAYS)[number];
export const CATS = ['Transportation', 'Rent', 'Electricity', 'Staff Salary', 'Stock/Purchases', 'Repairs and Maintenance', 'Internet/Data', 'Packaging', 'Other'];
/** Older records used longer category names. They are shown under the new names; the saved data is not rewritten. */
const LEGACY_CATS: Record<string, string> = { 'Electricity and Utilities': 'Electricity', 'Staff Salaries': 'Staff Salary', 'Stock Purchases': 'Stock/Purchases', 'Internet and Phone Bills': 'Internet/Data', 'Other Expenses': 'Other' };
export interface Sale {
  id: string;
  date: string;
  product: string;
  qty: number;
  price: number; // cents/kobo in the selected currency
  total: number;
  pay: Pay;
  customer: string;
  notes: string;
  /** ISO currency code. Missing on older records → treated as NGN. */
  currency: string;
  /** The project this sale belongs to. */
  project_id: string;
}
/** `pay` is optional for expenses ('' = not stated). */
export interface Expense { id: string; date: string; name: string; amount: number; category: string; pay: Pay | ''; notes: string; project_id: string }
export interface Project { id: string; name: string; description: string; created_at: string }
export interface Range { from: string; to: string }

const SALES_KEY = 'kobodox:sales:v1';
const EXP_KEY = 'kobodox:expenses:v1';
const PROJ_KEY = 'kobodox:projects:v1';
function load<T>(k: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(k) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function save(k: string, v: unknown[]): boolean {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}
type Table = 'sales_transactions' | 'business_expenses' | 'projects';
const KEYS: Record<Table, string> = { sales_transactions: SALES_KEY, business_expenses: EXP_KEY, projects: PROJ_KEY };
const FULL = 'Could not save. Your browser storage may be full or blocked.';

/** Normalize older sales that lack a currency field. */
function normalizeSale(s: Sale): Sale {
  return { ...s, currency: s.currency && String(s.currency).trim() ? String(s.currency).toUpperCase() : DEFAULT_CURRENCY };
}

/** Every read and write goes through these six functions: the database (Supabase) when it is set up, this device otherwise. */
async function list<T>(t: Table): Promise<T[]> {
  if (!cloudActive()) return load<T>(KEYS[t]);
  const all: T[] = [];
  for (let off = 0; ; off += 1000) {
    const page = await rest<T[]>(`${t}?select=*&order=${t === 'projects' ? 'created_at.asc' : 'date.desc'}&limit=1000&offset=${off}`);
    all.push(...page);
    if (page.length < 1000) return all;
  }
}
async function put<T extends { id: string }>(t: Table, item: T) {
  if (cloudActive()) return rest(`${t}?on_conflict=id`, { method: 'POST', body: item, upsert: true });
  const l = load<T>(KEYS[t]);
  const i = l.findIndex((x) => x.id === item.id);
  if (i < 0) l.push(item);
  else l[i] = item;
  if (!save(KEYS[t], l)) throw new Error(FULL);
}
async function drop(t: Table, id: string) {
  if (cloudActive()) return rest(`${t}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!save(KEYS[t], load<{ id: string }>(KEYS[t]).filter((x) => x.id !== id))) throw new Error(FULL);
}
const normalizeExpense = (e: Expense): Expense => ({ ...e, category: LEGACY_CATS[e.category] ?? e.category, pay: (e.pay ?? '') as Expense['pay'], project_id: e.project_id ?? '' });
const normalizeSaleP = (s: Sale): Sale => ({ ...normalizeSale(s), project_id: s.project_id ?? '' });
const byCreated = (a: Project, b: Project) => a.created_at.localeCompare(b.created_at);

export interface Books { projects: Project[]; sales: Sale[]; expenses: Expense[] }
/** The one place every screen reads from. Old records that have no project yet are moved into a project called "My Business" (nothing is deleted). */
export async function loadBooks(): Promise<Books> {
  const [projects, sales, expenses] = await Promise.all([list<Project>('projects'), list<Sale>('sales_transactions'), list<Expense>('business_expenses')]);
  let ps = projects.sort(byCreated);
  let ss = sales.map(normalizeSaleP);
  let es = expenses.map(normalizeExpense);
  const orphanS = ss.filter((x) => !x.project_id);
  const orphanE = es.filter((x) => !x.project_id);
  if (orphanS.length || orphanE.length) {
    let home = ps.find((p) => p.name === 'My Business');
    if (!home) {
      home = { id: newId(), name: 'My Business', description: 'Your records from before projects were added.', created_at: new Date().toISOString() };
      await put('projects', home);
      ps = [...ps, home].sort(byCreated);
    }
    const pid = home.id;
    for (const x of orphanS) await put('sales_transactions', { ...x, project_id: pid });
    for (const x of orphanE) await put('business_expenses', { ...(expenses.find((r) => r.id === x.id) ?? x), pay: x.pay || null, project_id: pid }); // original wording kept
    ss = ss.map((x) => (x.project_id ? x : { ...x, project_id: pid }));
    es = es.map((x) => (x.project_id ? x : { ...x, project_id: pid }));
  }
  return { projects: ps, sales: ss, expenses: es };
}
export const putSale = (s: Sale) => put('sales_transactions', normalizeSaleP(s));
export const dropSale = (id: string) => drop('sales_transactions', id);
export const putExpense = (e: Expense) => put('business_expenses', { ...e, pay: e.pay || null });
export const dropExpense = (id: string) => drop('business_expenses', id);
export const putProject = (p: Project) => put('projects', p);
/** Deletes a project and, only after the person has confirmed, every sale and expense inside it. */
export async function dropProject(id: string) {
  const q = encodeURIComponent(id);
  if (cloudActive()) {
    await rest(`sales_transactions?project_id=eq.${q}`, { method: 'DELETE' });
    await rest(`business_expenses?project_id=eq.${q}`, { method: 'DELETE' });
    return drop('projects', id);
  }
  if (!save(SALES_KEY, load<Sale>(SALES_KEY).filter((x) => x.project_id !== id)) || !save(EXP_KEY, load<Expense>(EXP_KEY).filter((x) => x.project_id !== id))) throw new Error(FULL);
  return drop('projects', id);
}
export const newProject = (name: string, description: string): Project => ({ id: newId(), name: name.trim(), description: description.trim(), created_at: new Date().toISOString() });

/** Records typed before the database was switched on (they only exist in this browser). */
export const localCount = () => load(SALES_KEY).length + load(EXP_KEY).length + load(PROJ_KEY).length;
export async function moveLocalToCloud() {
  for (const t of ['projects', 'sales_transactions', 'business_expenses'] as Table[]) { // projects first, because sales and expenses point at them
    const items = load<{ id: string }>(KEYS[t]);
    for (let i = 0; i < items.length; i += 200) await rest(`${t}?on_conflict=id`, { method: 'POST', body: items.slice(i, i + 200), upsert: true });
    save(KEYS[t], []);
  }
}
export const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
/** Format money for display; defaults to NGN when currency is missing. */
export const money = (cents: number, code = DEFAULT_CURRENCY) => formatMoney(cents, code).replace(/\.00$/, '');
/** @deprecated Prefer money(cents, currency). Kept for expense amounts (always NGN). */
export const naira = (kobo: number) => money(kobo, 'NGN');
export const toKobo = (s: string) => Math.round(Number(String(s).replace(/,/g, '')) * 100);
export const isNum = (s: string) => s.trim() !== '' && Number.isFinite(Number(s.replace(/,/g, ''))) && Number(s.replace(/,/g, '')) >= 0;

/** Demonstration records. Built in memory only: never written to storage, never used by reports. */
export const SAMPLE_DATE = '2026-10-27';
export const sampleSales = (): Sale[] =>
  (
    [
      ['Cement (50kg bags)', 200, 9500, 'Bank Transfer', 'NGN'],
      ['Iron rods (16mm)', 150, 12000, 'Bank Transfer', 'NGN'],
      ['Sharp sand (per trip)', 6, 85000, 'Cash', 'NGN'],
      ['Granite (per trip)', 4, 120000, 'Bank Transfer', 'NGN'],
      ['Mason and labour (per day)', 12, 15000, 'Cash', 'NGN'],
      ['Site supervision fee', 1, 250000, 'Bank Transfer', 'NGN'],
      ['Concrete mixer hire (per day)', 3, 40000, 'POS', 'NGN'],
    ] as const
  ).map(([product, qty, p, pay, currency], i) => ({
    id: `sample-${i}`,
    date: SAMPLE_DATE,
    product,
    qty,
    price: p * 100,
    total: qty * p * 100,
    pay,
    customer: '',
    notes: '',
    currency,
    project_id: 'sample',
  }));
export const sampleExpenses = (): Expense[] =>
  ([['Site transport', 'Transportation', 45000], ['Site generator fuel', 'Electricity', 60000], ['Equipment repairs', 'Repairs and Maintenance', 35000], ['Safety gear', 'Other', 25000]] as const).map(([name, category, a], i) => ({
    id: `sample-${i}`, date: SAMPLE_DATE, name, category, amount: a * 100, pay: 'Cash' as Pay, notes: '', project_id: 'sample',
  }));

export const inRange = (d: string, r: Range) => d >= r.from && d <= r.to;
export function weekRange(iso: string): Range {
  const d = parseISO(iso) ?? new Date();
  const from = addDays(toISO(d), -((d.getDay() + 6) % 7)); // weeks run Monday to Sunday
  return { from, to: addDays(from, 6) };
}
export function monthRange(iso: string): Range {
  const d = parseISO(iso) ?? new Date();
  return { from: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), to: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}
export const daysIn = (r: Range) => Number(r.to.slice(8)) - Number(r.from.slice(8)) + 1;
export function periodRange(p: 'today' | 'week' | 'month', anchor = todayISO()): Range {
  return p === 'today' ? { from: anchor, to: anchor } : p === 'week' ? weekRange(anchor) : monthRange(anchor);
}

export type CurrencyTotals = { total: number; qty: number; count: number; byPay: Record<Pay, number> };

/** Totals for a homogeneous list (same currency). Do not mix currencies. */
export function totals(list: Sale[]): CurrencyTotals {
  const byPay = Object.fromEntries(PAYS.map((p) => [p, 0])) as Record<Pay, number>;
  let total = 0, qty = 0;
  for (const s of list) { total += s.total; qty += s.qty; byPay[s.pay] = (byPay[s.pay] ?? 0) + s.total; }
  return { total, qty, count: list.length, byPay };
}

/** Group sales by currency and total each group separately — never sum across currencies. */
export function totalsByCurrency(list: Sale[]): Array<{ currency: string; t: CurrencyTotals }> {
  const map = new Map<string, Sale[]>();
  for (const s of list) {
    const c = normalizeSale(s).currency;
    const arr = map.get(c) ?? [];
    arr.push(s);
    map.set(c, arr);
  }
  // Prefer NGN first, then alphabetical
  const codes = [...map.keys()].sort((a, b) => (a === 'NGN' ? -1 : b === 'NGN' ? 1 : a.localeCompare(b)));
  return codes.map((currency) => ({ currency, t: totals(map.get(currency)!) }));
}

/** Short label lines for cards, e.g. "NGN: ₦15,000" */
export function currencyTotalLines(list: Sale[]): string[] {
  const rows = totalsByCurrency(list);
  if (!rows.length) return ['—'];
  return rows.map(({ currency, t }) => `${currency}: ${money(t.total, currency)}`);
}

export const sumExpenses = (list: Expense[]) => list.reduce((a, e) => a + e.amount, 0);
/** Sales grouped by product within one currency, biggest first. */
export function byProduct(list: Sale[]) {
  const m = new Map<string, { qty: number; total: number }>();
  for (const s of list) {
    const k = s.product.trim();
    const v = m.get(k) ?? { qty: 0, total: 0 };
    m.set(k, { qty: v.qty + s.qty, total: v.total + s.total });
  }
  return [...m.entries()].map(([product, v]) => ({ product, ...v })).sort((a, b) => b.total - a.total);
}
/** One total per day between two dates for a single-currency list (days with no sales count as zero). */
export function perDay(list: Sale[], r: Range) {
  const out: Array<{ date: string; total: number }> = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push({ date: d, total: list.filter((s) => s.date === d).reduce((a, s) => a + s.total, 0) });
  return out;
}

export function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  saveBlob(new Blob(['\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
}

/**
 * Minimal Excel-compatible workbook (SpreadsheetML XML). Opens in Excel / LibreOffice without extra libraries.
 */
export function downloadXlsx(name: string, sheets: Array<{ title: string; rows: Array<Array<string | number>> }>) {
  const esc = (v: string | number) =>
    String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const sheetXml = (rows: Array<Array<string | number>>) => {
    const body = rows
      .map(
        (row) =>
          `<Row>${row
            .map((cell) => {
              const s = String(cell);
              const num = s !== '' && /^-?\d+(\.\d+)?$/.test(s);
              return num ? `<Cell><Data ss:Type="Number">${s}</Data></Cell>` : `<Cell><Data ss:Type="String">${esc(s)}</Data></Cell>`;
            })
            .join('')}</Row>`,
      )
      .join('');
    return `<Worksheet ss:Name="${esc(sheets[0]?.title || 'Report')}"><Table>${body}</Table></Worksheet>`;
  };
  // One sheet for simplicity (first sheet only for multi); name from file
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheets.map((sh) => sheetXml(sh.rows).replace(`ss:Name="${esc(sheets[0]?.title || 'Report')}"`, `ss:Name="${esc(sh.title.slice(0, 31))}"`)).join('\n')}
</Workbook>`;
  saveBlob(new Blob([xml], { type: 'application/vnd.ms-excel' }), `${name}.xls`);
}

export const kobo2n = (k: number) => (k / 100).toFixed(2);

export interface PdfSection { head: string[]; rows: string[][]; foot?: string[] }
/** Makes a clean A4 PDF (with currency symbols) from tables of text. */
export async function makePdf(file: string, title: string, subtitle: string, sections: PdfSection[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const b64 = async (n: string) => {
    const b = new Uint8Array(await (await fetch(`/fonts/${n}.ttf`)).arrayBuffer());
    let bin = '';
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const [reg, bold] = await Promise.all([b64('SnapSans-Regular'), b64('SnapSans-Bold')]);
  const doc = new jsPDF({ orientation: sections.some((x) => x.head.length > 5) ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('SnapSans-Regular.ttf', reg);
  doc.addFont('SnapSans-Regular.ttf', 'SnapSans', 'normal');
  doc.addFileToVFS('SnapSans-Bold.ttf', bold);
  doc.addFont('SnapSans-Bold.ttf', 'SnapSans', 'bold');
  doc.setFont('SnapSans', 'bold').setFontSize(16).text((loadDraft('invoice')?.businessName ?? '').trim() || 'KACHIER', 14, 16);
  doc.setFontSize(12).text(title, 14, 23);
  doc.setFont('SnapSans', 'normal').setFontSize(9).setTextColor(90).text(`${subtitle ? subtitle + '   |   ' : ''}Created ${formatDateLong()}`, 14, 29).setTextColor(0);
  let y = 35;
  for (const sec of sections) {
    if (y > doc.internal.pageSize.getHeight() - 35) { doc.addPage(); y = 16; }
    autoTable(doc, {
      startY: y, head: [sec.head], body: sec.rows, foot: sec.foot ? [sec.foot] : undefined, margin: { left: 14, right: 14 },
      styles: { font: 'SnapSans', fontSize: 9 }, headStyles: { fillColor: [11, 107, 87], font: 'SnapSans', fontStyle: 'bold' },
      footStyles: { fillColor: [243, 248, 246], textColor: 20, font: 'SnapSans', fontStyle: 'bold' },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  saveBlob(doc.output('blob'), `${file}.pdf`);
}
/* ------------------------------------------------------------ shareable summary report (PDF) */
export interface ReportPdfInput { title: string; subtitle: string; summary: Fin; sentence: string; tables: Array<PdfSection & { title?: string }> }
const signedNaira = (cents: number) => (cents < 0 ? `-${naira(-cents)}` : naira(cents));
/** One plain sentence that says what the numbers mean. Used at the top of the PDF and in the WhatsApp message. */
export const reportSentence = (who: string, label: string, f: Fin) =>
  `For ${label}, ${who} recorded ${naira(f.sales)} in sales and ${naira(f.expenses)} in expenses. Net Balance: ${signedNaira(f.net)}.`;

/** A summary-first A4 report: key figures on top, details below, and a plain explanation of Net Balance on every page. */
export async function makeReportPdf(inp: ReportPdfInput): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const b64 = async (n: string) => {
    const b = new Uint8Array(await (await fetch(`/fonts/${n}.ttf`)).arrayBuffer());
    let bin = '';
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const [reg, bold] = await Promise.all([b64('SnapSans-Regular'), b64('SnapSans-Bold')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('SnapSans-Regular.ttf', reg);
  doc.addFont('SnapSans-Regular.ttf', 'SnapSans', 'normal');
  doc.addFileToVFS('SnapSans-Bold.ttf', bold);
  doc.addFont('SnapSans-Bold.ttf', 'SnapSans', 'bold');
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const biz = (loadDraft('invoice')?.businessName ?? '').trim() || 'KACHIER';

  doc.setFont('SnapSans', 'bold').setFontSize(16).setTextColor(11, 107, 87).text(biz, 14, 16);
  doc.setFontSize(13).setTextColor(0).text(inp.title, 14, 24);
  doc.setFont('SnapSans', 'normal').setFontSize(9).setTextColor(90).text(`${inp.subtitle}   |   Created ${formatDateLong()}`, 14, 30).setTextColor(0);

  const s = inp.summary;
  const boxes: Array<[string, string]> = [['Total Sales', naira(s.sales)], ['Total Expenses', naira(s.expenses)], ['Net Balance', signedNaira(s.net)]];
  const bw = (W - 28 - 8) / 3;
  boxes.forEach(([k, v], i) => {
    const x = 14 + i * (bw + 4);
    doc.setDrawColor(200, 215, 210).setFillColor(243, 248, 246).roundedRect(x, 36, bw, 22, 2, 2, 'FD');
    doc.setFont('SnapSans', 'normal').setFontSize(8).setTextColor(90).text(k, x + 4, 43);
    doc.setFont('SnapSans', 'bold').setFontSize(13).setTextColor(0).text(v, x + 4, 52);
  });
  let y = 65;
  doc.setFont('SnapSans', 'normal').setFontSize(10).setTextColor(30);
  const lines: string[] = doc.splitTextToSize(inp.sentence, W - 28);
  doc.text(lines, 14, y);
  y += lines.length * 5 + 2;
  if (s.otherSales.length) {
    const o: string[] = doc.splitTextToSize(`Sales in other currencies are not included in the figures above: ${s.otherSales.join(', ')}.`, W - 28);
    doc.setFontSize(8.5).setTextColor(90).text(o, 14, y);
    y += o.length * 4 + 2;
  }
  y += 4;
  for (const t of inp.tables) {
    if (y > H - 45) { doc.addPage(); y = 16; }
    if (t.title) { doc.setFont('SnapSans', 'bold').setFontSize(11).setTextColor(0).text(t.title, 14, y); y += 2; }
    autoTable(doc, {
      startY: y + 1, head: [t.head], body: t.rows, foot: t.foot ? [t.foot] : undefined, margin: { left: 14, right: 14, bottom: 22 },
      styles: { font: 'SnapSans', fontSize: 8.5 }, headStyles: { fillColor: [11, 107, 87], font: 'SnapSans', fontStyle: 'bold' },
      footStyles: { fillColor: [243, 248, 246], textColor: 20, font: 'SnapSans', fontStyle: 'bold' },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const f: string[] = doc.splitTextToSize(NET_NOTE, W - 28);
    doc.setFont('SnapSans', 'normal').setFontSize(7.5).setTextColor(110).text(f, 14, H - 15);
    doc.text(`Page ${i} of ${pages}`, W - 14, H - 7, { align: 'right' });
  }
  return doc.output('blob');
}
/** Saves the PDF, or on phones that allow it opens the share sheet (WhatsApp, email...). Falls back to saving + opening WhatsApp with the summary text. */
export async function deliverReport(blob: Blob, file: string, text: string, share: boolean): Promise<'saved' | 'shared' | 'whatsapp' | 'cancelled'> {
  if (!share) { saveBlob(blob, `${file}.pdf`); return 'saved'; }
  const f = new File([blob], `${file}.pdf`, { type: 'application/pdf' });
  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: file, text });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
  }
  saveBlob(blob, `${file}.pdf`);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'whatsapp';
}
const formatDateLong = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export const currencyOptions = CURRENCIES.map((c) => ({ value: c.code, label: c.name }));
export { getCurrency, DEFAULT_CURRENCY };

/* ------------------------------------------------------------ reporting periods */
export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export interface PState { period: Period; anchor: string; from: string; to: string }
export const newPState = (period: Period = 'monthly'): PState => ({ period, anchor: todayISO(), from: todayISO(), to: todayISO() });
export const yearRange = (iso: string): Range => { const y = (parseISO(iso) ?? new Date()).getFullYear(); return { from: `${y}-01-01`, to: `${y}-12-31` }; };
export function rangeOf(p: PState): Range {
  if (p.period === 'daily') return { from: p.anchor, to: p.anchor };
  if (p.period === 'weekly') return weekRange(p.anchor);
  if (p.period === 'monthly') return monthRange(p.anchor);
  if (p.period === 'yearly') return yearRange(p.anchor);
  return p.from <= p.to ? { from: p.from, to: p.to } : { from: p.to, to: p.from };
}
export function periodLabel(p: PState): string {
  const r = rangeOf(p);
  if (p.period === 'daily') return formatDate(r.from);
  if (p.period === 'monthly') return (parseISO(r.from) ?? new Date()).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  if (p.period === 'yearly') return r.from.slice(0, 4);
  return `${formatDate(r.from)} to ${formatDate(r.to)}`;
}
/** Move a period one step back (-1) or forward (+1). */
export function stepPeriod(p: PState, step: number): PState {
  const d = parseISO(p.anchor) ?? new Date();
  if (p.period === 'daily') return { ...p, anchor: addDays(p.anchor, step) };
  if (p.period === 'weekly') return { ...p, anchor: addDays(p.anchor, 7 * step) };
  if (p.period === 'monthly') return { ...p, anchor: toISO(new Date(d.getFullYear(), d.getMonth() + step, 1)) };
  if (p.period === 'yearly') return { ...p, anchor: toISO(new Date(d.getFullYear() + step, 0, 1)) };
  return p;
}

/* ------------------------------------------------------------ financial figures */
export interface Fin { sales: number; expenses: number; net: number; salesCount: number; expenseCount: number; otherSales: string[] }
/**
 * Totals for records that are ALREADY filtered to the right period and project.
 * Expenses are always in naira, so Net Balance uses naira sales only. Sales in other currencies are listed
 * separately and never added to or subtracted from naira.
 */
export function fin(sales: Sale[], exps: Expense[]): Fin {
  const byCur = totalsByCurrency(sales);
  const ngn = byCur.find((c) => c.currency === 'NGN')?.t.total ?? 0;
  const expenses = sumExpenses(exps);
  return {
    sales: ngn, expenses, net: ngn - expenses, salesCount: sales.length, expenseCount: exps.length,
    otherSales: byCur.filter((c) => c.currency !== 'NGN').map((c) => money(c.t.total, c.currency)),
  };
}
export const NET_NOTE = 'Net Balance = recorded sales minus recorded expenses for this period. It is a simple figure only. It is not the cash you have in hand and not your accounting profit (a customer may still owe you, and stock you bought may not be sold yet).';
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** All 12 months of a year with that month's sales, expenses and net balance. */
export function monthlyBreakdown(sales: Sale[], exps: Expense[], year: string) {
  return MONTH_NAMES.map((name, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { name, ...fin(sales.filter((s) => s.date.startsWith(key)), exps.filter((e) => e.date.startsWith(key))) };
  });
}
/** Expenses grouped by category, biggest first. */
export function byCategory(exps: Expense[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const e of exps) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
