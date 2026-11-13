import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { Input, Modal, Segmented, Select, Textarea } from './ui';
import { formatDate, parseISO, todayISO } from '../lib/dates';
import {
  CATS, PAYS, dropExpense, dropProject, dropSale, loadBooks, localCount, makePdf, moveLocalToCloud, newProject, putExpense, putProject, putSale, SAMPLE_DATE, downloadCsv, downloadXlsx, inRange, isNum, kobo2n, naira, money, newId,
  sampleExpenses, sampleSales, sumExpenses, toKobo, totals, totalsByCurrency, currencyTotalLines, currencyOptions, DEFAULT_CURRENCY,
  byCategory, deliverReport, fin, makeReportPdf, monthlyBreakdown, reportSentence, newPState, periodLabel, rangeOf, stepPeriod, NET_NOTE,
} from '../lib/books';
import type { Books, Expense, Fin, Pay, PdfSection, Project, PState, Sale } from '../lib/books';
import { AUTH_EVENT, cloudOn, sessionEmail, signOut } from '../lib/cloud';
import { AuthModal } from './AuthModal';

type Msg = { ok: boolean; text: string } | null;
const payOpts = PAYS.map((p) => ({ value: p, label: p }));

function Page({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="container bk-page">
      <h1 className="bk-title">{title}</h1>
      <p className="muted">{intro}</p>
      {children}
    </main>
  );
}
const Banner = ({ ok, children }: { ok?: boolean; children: ReactNode }) => <div className={`bk-banner ${ok === false ? 'err' : ok ? 'ok' : ''}`} role="status">{children}</div>;
const Cards = ({ items }: { items: Array<[string, string]> }) => (
  <div className="bk-cards">{items.map(([k, v]) => <div key={k} className="bk-card"><span>{k}</span><b>{v}</b></div>)}</div>
);
function Table({ head, rows, foot, empty }: { head: string[]; rows: ReactNode[][]; foot?: ReactNode[]; empty: string }) {
  if (!rows.length) return <p className="bk-empty">{empty}</p>;
  return (
    <div className="bk-table-wrap">
      <table className="bk-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        {foot && <tfoot><tr>{foot.map((c, j) => <td key={j}>{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}
function Bars({ items }: { items: Array<[string, number]> }) {
  const max = Math.max(1, ...items.map((i) => i[1]));
  return (
    <div className="bk-bars" role="img" aria-label="Sales chart">
      {items.map(([l, v], i) => (
        <div key={i} className="bk-bar" title={`${l}: ${naira(v)}`}>
          <i style={{ height: `${(v / max) * 100}%` }} />
          <small>{l}</small>
        </div>
      ))}
    </div>
  );
}
function Confirm({ what, onYes, onNo }: { what: string; onYes: () => void; onNo: () => void }) {
  return (
    <Modal open onClose={onNo} title={`Delete this ${what}?`}>
      <p>This cannot be undone.</p>
      <div className="grid-2">
        <button type="button" className="btn outline" onClick={onNo}>Cancel</button>
        <button type="button" className="btn primary" onClick={onYes}>Delete</button>
      </div>
    </Modal>
  );
}
function Actions({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void }) {
  return (
    <span className="bk-actions">
      {onEdit && <button type="button" className="btn outline sm" onClick={onEdit} aria-label="Edit"><Pencil size={14} /></button>}
      <button type="button" className="btn outline sm" onClick={onDelete} aria-label="Delete"><Trash2 size={14} /></button>
    </span>
  );
}

/* ------------------------------------------------------------------ forms */
function SaleForm({ projectId, initial, onSave, onClose }: { projectId: string; initial: Sale | null; onSave: (s: Sale) => void; onClose: () => void }) {
  const [f, setF] = useState({
    date: initial?.date ?? todayISO(), product: initial?.product ?? '', qty: initial ? String(initial.qty) : '1', price: initial ? kobo2n(initial.price) : '',
    pay: (initial?.pay ?? 'Cash') as Pay, customer: initial?.customer ?? '', notes: initial?.notes ?? '',
    currency: initial?.currency ?? DEFAULT_CURRENCY,
  });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const qtyOk = isNum(f.qty) && Number(f.qty) > 0;
  const err = {
    date: parseISO(f.date) ? '' : 'Pick a valid date.',
    product: f.product.trim() ? '' : 'Enter the product or service.',
    qty: qtyOk ? '' : 'Enter a quantity above 0 (no negative numbers).',
    price: isNum(f.price) ? '' : 'Enter a price of 0 or more.',
  };
  const total = qtyOk && isNum(f.price) ? Math.round(Number(f.qty) * toKobo(f.price)) : 0;
  const submit = () => {
    setTried(true);
    if (Object.values(err).some(Boolean)) return;
    onSave({ id: initial?.id ?? newId(), date: f.date, product: f.product.trim(), qty: Number(f.qty), price: toKobo(f.price), total, pay: f.pay, customer: f.customer.trim(), notes: f.notes.trim(), currency: f.currency || DEFAULT_CURRENCY, project_id: projectId });
  };
  const e = (k: keyof typeof err) => (tried ? err[k] : undefined);
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit transaction' : 'Add transaction'}>
      <Input label="Date" type="date" required value={f.date} onChange={set('date')} error={e('date')} />
      <Input label="Product or service name" required value={f.product} onChange={set('product')} error={e('product')} />
      <Select label="Currency" value={f.currency} onChange={set('currency')} options={currencyOptions} />
      <div className="grid-2">
        <Input label="Quantity sold" required inputMode="decimal" value={f.qty} onChange={set('qty')} error={e('qty')} />
        <Input label="Unit price" required inputMode="decimal" value={f.price} onChange={set('price')} error={e('price')} placeholder="0.00" />
      </div>
      <div className="bk-total">Total amount <b>{money(total, f.currency)}</b></div>
      <Select label="Payment method" value={f.pay} onChange={set('pay')} options={payOpts} />
      <Input label="Customer name (optional)" value={f.customer} onChange={set('customer')} />
      <Textarea label="Notes (optional)" rows={2} value={f.notes} onChange={set('notes')} />
      <button type="button" className="btn primary lg full" onClick={submit}>Save transaction</button>
    </Modal>
  );
}
function ExpenseForm({ projectId, initial, onSave, onClose }: { projectId: string; initial: Expense | null; onSave: (x: Expense) => void; onClose: () => void }) {
  const [f, setF] = useState({
    date: initial?.date ?? todayISO(), name: initial?.name ?? '', amount: initial ? kobo2n(initial.amount) : '', category: initial?.category ?? CATS[0],
    pay: (initial?.pay ?? '') as Pay | '', notes: initial?.notes ?? '',
  });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const err = { date: parseISO(f.date) ? '' : 'Pick a valid date.', name: f.name.trim() ? '' : 'Enter what you spent money on.', amount: isNum(f.amount) && toKobo(f.amount) > 0 ? '' : 'Enter an amount above 0.' };
  const submit = () => {
    setTried(true);
    if (Object.values(err).some(Boolean)) return;
    onSave({ id: initial?.id ?? newId(), date: f.date, name: f.name.trim(), amount: toKobo(f.amount), category: f.category, pay: f.pay as Pay | '', notes: f.notes.trim(), project_id: projectId });
  };
  const e = (k: keyof typeof err) => (tried ? err[k] : undefined);
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit expense' : 'Add expense'}>
      <Input label="Date" type="date" required value={f.date} onChange={set('date')} error={e('date')} />
      <Input label="Expense description" required value={f.name} onChange={set('name')} error={e('name')} placeholder="e.g. Shop electricity" />
      <Input label="Amount spent (₦)" required inputMode="decimal" value={f.amount} onChange={set('amount')} error={e('amount')} placeholder="0.00" />
      <Select label="Expense category" value={f.category} onChange={set('category')} options={CATS.map((c) => ({ value: c, label: c }))} />
      <Select label="Payment method (optional)" value={f.pay} onChange={set('pay')} options={[{ value: '', label: 'Not stated' }, ...payOpts]} />
      <Textarea label="Extra notes (optional)" rows={2} value={f.notes} onChange={set('notes')} />
      <button type="button" className="btn primary lg full" onClick={submit}>Save expense</button>
    </Modal>
  );
}

/* ------------------------------------------------------------ shared pieces */
const go = (hash: string) => { window.location.hash = hash; };
const signed = (cents: number) => (cents < 0 ? `-${naira(-cents)}` : naira(cents));
const upsert = <T extends { id: string }>(list: T[], x: T): T[] => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x]);
const SALE_HEAD = ['Date', 'Product / service', 'Quantity', 'Unit price', 'Total amount', 'Currency', 'Payment', 'Customer', 'Actions'];
const EXP_HEAD = ['Date', 'Description', 'Category', 'Amount', 'Payment', 'Actions'];
const saleRows = (list: Sale[], actions: (s: Sale) => ReactNode): ReactNode[][] =>
  list.map((s) => [formatDate(s.date), s.product, s.qty, money(s.price, s.currency), money(s.total, s.currency), s.currency, s.pay, s.customer || '—', actions(s)]);
const expRows = (list: Expense[], actions: (e: Expense) => ReactNode): ReactNode[][] =>
  list.map((e) => [formatDate(e.date), e.name, e.category, naira(e.amount), e.pay || '—', actions(e)]);

/** Builds the PDF from the tables and cards currently on the screen, so it always matches what the person sees. */
function pagePdf(file: string, title: string, subtitle: string) {
  const sections: PdfSection[] = [];
  const cards = [...document.querySelectorAll('.bk-page .bk-card')].map((c) => [c.querySelector('span')?.textContent ?? '', c.querySelector('b')?.textContent ?? '']);
  if (cards.length) sections.push({ head: ['Summary', ''], rows: cards });
  document.querySelectorAll('.bk-page .bk-table').forEach((t) => {
    const heads = [...t.querySelectorAll('thead th')].map((h) => h.textContent ?? '');
    const keep = heads.map((h, i) => (h === 'Actions' ? -1 : i)).filter((i) => i >= 0);
    const pick = (tr: Element) => keep.map((i) => tr.children[i]?.textContent ?? '');
    const foot = t.querySelector('tfoot tr');
    sections.push({ head: keep.map((i) => heads[i]), rows: [...t.querySelectorAll('tbody tr')].map(pick), foot: foot ? pick(foot) : undefined });
  });
  return makePdf(file, title, subtitle, sections);
}
function ExportBar({ file, title, sub, rows, onError }: { file: string; title: string; sub: string; rows: Array<Array<string | number>>; onError: (t: string) => void }) {
  return (
    <div className="bk-row">
      <button type="button" className="btn outline sm" onClick={() => downloadCsv(file, rows)}><Download size={15} /> Export CSV</button>
      <button type="button" className="btn outline sm" onClick={() => downloadXlsx(file, [{ title: title.slice(0, 30), rows: [[title], ['Period', sub], [], ...rows] }])}><Download size={15} /> Export Excel</button>
      <button type="button" className="btn outline sm" onClick={() => void pagePdf(file, title, sub).catch(() => onError('Could not make the PDF. Please try again.'))}><Download size={15} /> Export PDF</button>
    </div>
  );
}

/** Daily / Weekly / Monthly / Yearly switcher with a picker for the exact date, week, month or year. */
function PeriodBar({ value, onChange }: { value: PState; onChange: (v: PState) => void }) {
  const set = (patch: Partial<PState>) => onChange({ ...value, ...patch });
  const thisYear = new Date().getFullYear();
  const year = Number(value.anchor.slice(0, 4)) || thisYear;
  const years = [...new Set([...Array.from({ length: 8 }, (_, i) => thisYear - 6 + i), year])].sort((a, b) => a - b);
  return (
    <div className="bk-period">
      <div className="bk-tabs">
        <Segmented label="Period" value={value.period} onChange={(period) => set({ period })} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }, { value: 'custom', label: 'Choose dates' }]} />
      </div>
      {value.period !== 'custom' && (
        <div className="bk-row bk-pager">
          <button type="button" className="btn outline sm" onClick={() => onChange(stepPeriod(value, -1))}>Previous</button>
          <b>{periodLabel(value)}</b>
          <button type="button" className="btn outline sm" onClick={() => onChange(stepPeriod(value, 1))}>Next</button>
        </div>
      )}
      {(value.period === 'daily' || value.period === 'weekly') && <Input label={value.period === 'weekly' ? 'Pick any day in the week you want' : 'Pick a date'} type="date" value={value.anchor} onChange={(v) => parseISO(v) && set({ anchor: v })} />}
      {value.period === 'monthly' && <Input label="Pick a month" type="month" value={value.anchor.slice(0, 7)} onChange={(v) => /^\d{4}-\d{2}$/.test(v) && set({ anchor: `${v}-01` })} />}
      {value.period === 'yearly' && <Select label="Pick a year" value={String(year)} onChange={(v) => set({ anchor: `${v}-01-01` })} options={years.map((y) => ({ value: String(y), label: String(y) }))} />}
      {value.period === 'custom' && <div className="grid-2"><Input label="From" type="date" value={value.from} onChange={(v) => parseISO(v) && set({ from: v })} /><Input label="To" type="date" value={value.to} onChange={(v) => parseISO(v) && set({ to: v })} /></div>}
    </div>
  );
}

function FinSummary({ f, projects }: { f: Fin; projects?: number }) {
  const items: Array<[string, string]> = [['Total Sales', naira(f.sales)], ['Total Expenses', naira(f.expenses)], [projects === undefined ? 'Net Balance' : 'Overall Net Balance', signed(f.net)]];
  if (projects !== undefined) items.push(['Total Number of Projects', String(projects)]);
  return (
    <>
      <Cards items={items} />
      {f.otherSales.length > 0 && <p className="hint">Sales in other currencies are not included above (they cannot be added to naira): {f.otherSales.join(' · ')}</p>}
      <p className="hint">{NET_NOTE}</p>
    </>
  );
}
function YearTable({ sales, exps, year }: { sales: Sale[]; exps: Expense[]; year: string }) {
  const rows = monthlyBreakdown(sales, exps, year);
  const t = fin(sales, exps);
  return (
    <>
      <h3>Month by month in {year}</h3>
      <Table head={['Month', 'Sales', 'Expenses', 'Net Balance']} empty="" rows={rows.map((m) => [m.name, naira(m.sales), naira(m.expenses), signed(m.net)])} foot={['TOTAL', naira(t.sales), naira(t.expenses), signed(t.net)]} />
    </>
  );
}
function CategoryTable({ exps }: { exps: Expense[] }) {
  const rows = byCategory(exps);
  const total = sumExpenses(exps);
  return (
    <>
      <h3>Expenses by category</h3>
      <Table head={['Category', 'Amount', 'Share']} empty="No expenses recorded for this period." rows={rows.map(([c, v]) => [c, naira(v), `${total ? Math.round((v / total) * 100) : 0}%`])} foot={rows.length ? ['TOTAL', naira(total), '100%'] : undefined} />
    </>
  );
}


type PdfTable = PdfSection & { title?: string };
/** Summary-first PDF report, with a button to share it (WhatsApp, email...) from a phone. */
function ReportShare({ file, title, sub, who, f, tables, onMsg }: { file: string; title: string; sub: string; who: string; f: Fin; tables: PdfTable[]; onMsg: (m: Msg) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (share: boolean) => {
    setBusy(true);
    try {
      const sentence = reportSentence(who, sub, f);
      const blob = await makeReportPdf({ title, subtitle: sub, summary: f, sentence, tables });
      const how = await deliverReport(blob, file, `${title} (${sub})\n${sentence}`, share);
      if (how === 'saved') onMsg({ ok: true, text: 'Your summary report was saved as a PDF.' });
      else if (how === 'shared') onMsg({ ok: true, text: 'Your report was shared.' });
      else if (how === 'whatsapp') onMsg({ ok: true, text: 'The PDF was saved and WhatsApp opened with a short summary. Attach the saved PDF in the chat before sending.' });
    } catch {
      onMsg({ ok: false, text: 'Could not make the report PDF. Please try again.' });
    }
    setBusy(false);
  };
  return (
    <div className="card bk-share">
      <h3>Share a summary report</h3>
      <p className="muted">A clean PDF with your main figures at the top. Send it to a manager, partner or accountant.</p>
      <div className="bk-row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void run(false)}><Download size={16} /> {busy ? 'Please wait...' : 'Download summary PDF'}</button>
        <button type="button" className="btn outline" disabled={busy} onClick={() => void run(true)}>Share on WhatsApp</button>
      </div>
    </div>
  );
}
const monthSection = (sales: Sale[], exps: Expense[], year: string): PdfTable => {
  const t = fin(sales, exps);
  return { title: `Month by month in ${year}`, head: ['Month', 'Sales', 'Expenses', 'Net Balance'], rows: monthlyBreakdown(sales, exps, year).map((m) => [m.name, naira(m.sales), naira(m.expenses), signed(m.net)]), foot: ['TOTAL', naira(t.sales), naira(t.expenses), signed(t.net)] };
};
const categorySection = (exps: Expense[]): PdfTable => {
  const rows = byCategory(exps);
  const total = sumExpenses(exps);
  return { title: 'Expenses by category', head: ['Category', 'Amount', 'Share'], rows: rows.map(([c, v]) => [c, naira(v), `${total ? Math.round((v / total) * 100) : 0}%`]), foot: rows.length ? ['TOTAL', naira(total), '100%'] : undefined };
};

/* ------------------------------------------------------------ project forms */
function ProjectForm({ initial, onSave, onClose }: { initial: Project | null; onSave: (name: string, description: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [tried, setTried] = useState(false);
  const err = name.trim() ? '' : 'Enter a name for your project. You can use any name you like.';
  return (
    <Modal open onClose={onClose} title={initial ? 'Rename project' : 'Create new project'}>
      <Input label="Project name" required value={name} maxLength={80} onChange={setName} error={tried ? err : undefined} placeholder="e.g. My Supermarket" />
      <Textarea label="Description (optional)" rows={2} value={desc} onChange={setDesc} />
      <button type="button" className="btn primary lg full" onClick={() => { setTried(true); if (!err) onSave(name, desc); }}>{initial ? 'Save changes' : 'Create project'}</button>
    </Modal>
  );
}
function DeleteProject({ p, sales, exps, onYes, onNo }: { p: Project; sales: number; exps: number; onYes: () => void; onNo: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <Modal open onClose={onNo} title={`Delete "${p.name}"?`}>
      <p><b>Warning:</b> this project has {sales} sale{sales === 1 ? '' : 's'} and {exps} expense{exps === 1 ? '' : 's'}. If you delete it, those records will be deleted too, and your Business Reports will no longer include them. This cannot be undone.</p>
      <label className="bk-check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I understand. Delete this project and its records.</label>
      <div className="grid-2">
        <button type="button" className="btn outline" onClick={onNo}>Keep project</button>
        <button type="button" className="btn primary" disabled={!sure} onClick={onYes}>Delete project</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ My Projects page */
function ProjectsPage() {
  const [books, setBooks] = useState<Books | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [form, setForm] = useState<'new' | Project | null>(null);
  const [del, setDel] = useState<Project | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  /** With Supabase on, people must have an account before they create a project. */
  const startNew = () => { if (cloudOn && !sessionEmail()) setAuthOpen(true); else setForm('new'); };
  const reload = () => loadBooks().then(setBooks).catch((e: Error) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { void reload(); }, []);
  const fail = (e: unknown) => setMsg({ ok: false, text: (e as Error).message });
  return (
    <Page title="My Projects" intro="Create projects to organise and manage your business records separately.">
      {msg && <Banner ok={msg.ok}>{msg.text}</Banner>}
      <div className="bk-row"><button type="button" className="btn primary lg" onClick={startNew}><Plus size={18} /> Create New Project</button></div>
      {!books ? <p className="bk-empty">Loading your projects...</p> : !books.projects.length ? (
        <p className="bk-empty">You have no projects yet. Tap Create New Project to start recording your sales and expenses.</p>
      ) : (
        <div className="bk-projects">
          {books.projects.map((p) => {
            const ns = books.sales.filter((s) => s.project_id === p.id).length;
            const ne = books.expenses.filter((e) => e.project_id === p.id).length;
            return (
              <div key={p.id} className="card bk-proj">
                <h3>{p.name}</h3>
                {p.description && <p className="muted">{p.description}</p>}
                <small className="muted">{ns} sale{ns === 1 ? '' : 's'} · {ne} expense{ne === 1 ? '' : 's'}</small>
                <div className="bk-row">
                  <button type="button" className="btn primary sm" onClick={() => go(`#/sales/${p.id}`)}>Open</button>
                  <button type="button" className="btn outline sm" onClick={() => setForm(p)}><Pencil size={14} /> Rename</button>
                  <button type="button" className="btn outline sm" onClick={() => setDel(p)}><Trash2 size={14} /> Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onDone={() => { setAuthOpen(false); void reload(); setForm('new'); }} />
      {form && (
        <ProjectForm
          initial={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSave={(name, description) => {
            const cur = form;
            setForm(null);
            if (cur === 'new') { const p = newProject(name, description); putProject(p).then(() => go(`#/sales/${p.id}`)).catch(fail); }
            else putProject({ ...cur, name: name.trim(), description: description.trim() }).then(() => { setMsg({ ok: true, text: 'Project renamed.' }); return reload(); }).catch(fail);
          }}
        />
      )}
      {del && books && (
        <DeleteProject
          p={del}
          sales={books.sales.filter((s) => s.project_id === del.id).length}
          exps={books.expenses.filter((e) => e.project_id === del.id).length}
          onNo={() => setDel(null)}
          onYes={() => { const p = del; setDel(null); dropProject(p.id).then(() => { setMsg({ ok: true, text: `"${p.name}" was deleted.` }); return reload(); }).catch(fail); }}
        />
      )}
    </Page>
  );
}

/* ------------------------------------------------------------ Project workspace (Sales & Expenses) */
function Workspace({ projectId }: { projectId: string }) {
  const [books, setBooks] = useState<Books | null>(null);
  const [tab, setTab] = useState<'sales' | 'expenses'>('sales');
  const [ps, setPs] = useState<PState>(() => newPState('daily'));
  const [sample, setSample] = useState(false);
  const [q, setQ] = useState('');
  const [pay, setPay] = useState('all');
  const [cat, setCat] = useState('all');
  const [sEdit, setSEdit] = useState<Sale | 'new' | null>(null);
  const [sDel, setSDel] = useState<Sale | null>(null);
  const [eEdit, setEEdit] = useState<Expense | 'new' | null>(null);
  const [eDel, setEDel] = useState<Expense | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { loadBooks().then(setBooks).catch((e: Error) => setMsg({ ok: false, text: e.message })); }, []);
  const changeTab = (t: 'sales' | 'expenses') => { setTab(t); setQ(''); setPay('all'); setCat('all'); };

  const project = books?.projects.find((p) => p.id === projectId);
  if (!books) return <Page title="Sales & Expenses" intro="">{msg ? <Banner ok={false}>{msg.text}</Banner> : <p className="bk-empty">Loading your records...</p>}</Page>;
  if (!project) return <Page title="Project not found" intro="This project may have been deleted."><a className="btn primary" href="#/sales">Go to My Projects</a></Page>;

  const mine = { s: books.sales.filter((s) => s.project_id === projectId), e: books.expenses.filter((e) => e.project_id === projectId) };
  const allS = sample ? sampleSales() : mine.s;
  const allE = sample ? sampleExpenses() : mine.e;
  const r = rangeOf(ps);
  const inS = allS.filter((s) => inRange(s.date, r));
  const inE = allE.filter((e) => inRange(e.date, r));
  const f = fin(inS, inE);
  const shownS = inS.filter((s) => (pay === 'all' || s.pay === pay) && (!q.trim() || `${s.product} ${s.customer}`.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date));
  const shownE = inE.filter((e) => (cat === 'all' || e.category === cat) && (!q.trim() || `${e.name} ${e.notes}`.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date));
  const sub = periodLabel(ps);

  const commit = async (op: () => Promise<void>, patch: (b: Books) => Books, ok: string) => {
    try { await op(); setBooks((b) => (b ? patch(b) : b)); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const startSample = () => { setSample(true); setPs({ ...newPState('daily'), anchor: SAMPLE_DATE }); setQ(''); setPay('all'); setCat('all'); };
  const exitSample = () => { setSample(false); setPs(newPState('daily')); setMsg(null); };
  const firstSales = !sample && tab === 'sales' && mine.s.length === 0;
  const firstExp = !sample && tab === 'expenses' && mine.e.length === 0;

  return (
    <Page title={project.name} intro={project.description || 'Record the sales and expenses of this project.'}>
      <div className="bk-row">
        <a className="btn outline sm" href="#/sales">All projects</a>
        <Select label="Switch project" value={projectId} onChange={(v) => go(`#/sales/${v}`)} options={books.projects.map((p) => ({ value: p.id, label: p.name }))} />
        <a className="btn outline sm" href={`#/reports/${projectId}`}>View this project's report</a>
      </div>
      {msg && <Banner ok={msg.ok}>{msg.text}</Banner>}
      <div className="bk-tabs"><Segmented label="Section" value={tab} onChange={changeTab} options={[{ value: 'sales', label: 'Sales' }, { value: 'expenses', label: 'Expenses' }]} /></div>
      {sample && (
        <Banner>
          <b>Sample records, for demonstration only.</b> Abraham's Construction Company, 27 October 2026. Nothing here is saved or counted in your reports.
          <div className="bk-row"><button type="button" className="btn outline sm" onClick={startSample}>Reset sample</button><button type="button" className="btn primary sm" onClick={exitSample}>Exit sample</button></div>
        </Banner>
      )}
      <PeriodBar value={ps} onChange={setPs} />
      <FinSummary f={f} />
      {ps.period === 'yearly' && <YearTable sales={inS} exps={inE} year={r.from.slice(0, 4)} />}

      {tab === 'sales' && (firstSales ? (
        <div className="card bk-first">
          <h2>No sales recorded in this project yet</h2>
          <p className="muted">Add your first sale, or look at an example first.</p>
          <div className="bk-row">
            <button type="button" className="btn primary lg" onClick={() => setSEdit('new')}><Plus size={18} /> Add My First Transaction</button>
            <button type="button" className="btn outline lg" onClick={startSample}>Try Sample Data</button>
          </div>
        </div>
      ) : (
        <>
          <h2>Sales for {sub}</h2>
          <div className="bk-row">
            {!sample && <button type="button" className="btn primary" onClick={() => setSEdit('new')}><Plus size={17} /> Add Transaction</button>}
            <button type="button" className="btn outline" disabled={!shownS.length || sample} onClick={() => downloadCsv('sales', [['Date', 'Product', 'Quantity', 'Unit price', 'Total', 'Currency', 'Payment', 'Customer', 'Notes'], ...shownS.map((s) => [s.date, s.product, s.qty, kobo2n(s.price), kobo2n(s.total), s.currency, s.pay, s.customer, s.notes])])}><Download size={16} /> Export CSV</button>
            <button type="button" className="btn outline" disabled={!shownS.length || sample} onClick={() => void pagePdf('sales', `${project.name} - Sales Record`, sub).catch(() => setMsg({ ok: false, text: 'Could not make the PDF. Please try again.' }))}><Download size={16} /> Export PDF</button>
          </div>
          <div className="grid-2">
            <Input label="Search product or customer" value={q} onChange={setQ} />
            <Select label="Payment method" value={pay} onChange={setPay} options={[{ value: 'all', label: 'All payment methods' }, ...payOpts]} />
          </div>
          <Table head={SALE_HEAD} rows={saleRows(shownS, (s) => (sample ? '—' : <Actions onEdit={() => setSEdit(s)} onDelete={() => setSDel(s)} />))} foot={shownS.length ? ['TOTAL', '', String(totals(shownS).qty), '', currencyTotalLines(shownS).join(' · '), '', '', '', ''] : undefined} empty={inS.length ? 'No transactions match your search.' : 'No sales for this period.'} />
        </>
      ))}

      {tab === 'expenses' && (firstExp ? (
        <div className="card bk-first">
          <h2>No expenses recorded in this project yet</h2>
          <p className="muted">Record money spent on running this business: rent, transport, stock and more.</p>
          <div className="bk-row">
            <button type="button" className="btn primary lg" onClick={() => setEEdit('new')}><Plus size={18} /> Add My First Expense</button>
            <button type="button" className="btn outline lg" onClick={startSample}>See an example</button>
          </div>
        </div>
      ) : (
        <>
          <h2>Expenses for {sub}</h2>
          <p className="muted">All expenses ever recorded in this project: <b>{naira(sumExpenses(allE))}</b></p>
          <div className="bk-row">
            {!sample && <button type="button" className="btn primary" onClick={() => setEEdit('new')}><Plus size={17} /> Add Expense</button>}
            <button type="button" className="btn outline" disabled={!shownE.length || sample} onClick={() => downloadCsv('expenses', [['Date', 'Description', 'Category', 'Amount', 'Payment', 'Notes'], ...shownE.map((e) => [e.date, e.name, e.category, kobo2n(e.amount), e.pay, e.notes])])}><Download size={16} /> Export CSV</button>
          </div>
          <div className="grid-2">
            <Input label="Search expenses" value={q} onChange={setQ} />
            <Select label="Category" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...CATS.map((c) => ({ value: c, label: c }))]} />
          </div>
          <Table head={EXP_HEAD} rows={expRows(shownE, (e) => (sample ? '—' : <Actions onEdit={() => setEEdit(e)} onDelete={() => setEDel(e)} />))} foot={shownE.length ? ['TOTAL SPENT', '', '', naira(sumExpenses(shownE)), '', ''] : undefined} empty={inE.length ? 'No expenses match your search.' : 'No expenses for this period.'} />
          <CategoryTable exps={inE} />
        </>
      ))}

      {sEdit && <SaleForm projectId={projectId} initial={sEdit === 'new' ? null : sEdit} onClose={() => setSEdit(null)} onSave={(s) => { setSEdit(null); void commit(() => putSale(s), (b) => ({ ...b, sales: upsert(b.sales, s) }), 'Transaction saved.'); }} />}
      {sDel && <Confirm what="transaction" onNo={() => setSDel(null)} onYes={() => { const s = sDel; setSDel(null); void commit(() => dropSale(s.id), (b) => ({ ...b, sales: b.sales.filter((x) => x.id !== s.id) }), 'Transaction deleted.'); }} />}
      {eEdit && <ExpenseForm projectId={projectId} initial={eEdit === 'new' ? null : eEdit} onClose={() => setEEdit(null)} onSave={(x) => { setEEdit(null); void commit(() => putExpense(x), (b) => ({ ...b, expenses: upsert(b.expenses, x) }), 'Expense saved.'); }} />}
      {eDel && <Confirm what="expense" onNo={() => setEDel(null)} onYes={() => { const x = eDel; setEDel(null); void commit(() => dropExpense(x.id), (b) => ({ ...b, expenses: b.expenses.filter((y) => y.id !== x.id) }), 'Expense deleted.'); }} />}
    </Page>
  );
}

/* ------------------------------------------------------------ Business Reports */
function ReportsPage({ projectId }: { projectId?: string }) {
  const [books, setBooks] = useState<Books | null>(null);
  const [ps, setPs] = useState<PState>(() => newPState('monthly'));
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { loadBooks().then(setBooks).catch((e: Error) => setMsg({ ok: false, text: e.message })); }, []);
  if (!books) return <Page title="Business Reports" intro="">{msg ? <Banner ok={false}>{msg.text}</Banner> : <p className="bk-empty">Loading your records...</p>}</Page>;

  const r = rangeOf(ps);
  const sub = periodLabel(ps);
  const ids = new Set(books.projects.map((p) => p.id));
  const sales = books.sales.filter((s) => ids.has(s.project_id) && inRange(s.date, r));
  const exps = books.expenses.filter((e) => ids.has(e.project_id) && inRange(e.date, r));
  const err = (text: string) => setMsg({ ok: false, text });
  const switcher = (
    <Select label="Show report for" value={projectId ?? 'all'} onChange={(v) => go(v === 'all' ? '#/reports' : `#/reports/${v}`)} options={[{ value: 'all', label: 'Overall Business Summary (all projects)' }, ...books.projects.map((p) => ({ value: p.id, label: p.name }))]} />
  );

  if (!projectId) {
    const rows = books.projects.map((p) => ({ p, f: fin(sales.filter((s) => s.project_id === p.id), exps.filter((e) => e.project_id === p.id)) }));
    const all = fin(sales, exps);
    return (
      <Page title="Overall Business Summary" intro="Your sales and expenses from all your projects together. Everything here is made automatically from what you record in Sales & Expenses.">
        {msg && <Banner ok={msg.ok}>{msg.text}</Banner>}
        {!books.projects.length ? (
          <div className="card bk-first"><h2>No projects yet</h2><p className="muted">Create a project and record your sales and expenses. Your reports will appear here.</p><a className="btn primary lg" href="#/sales">Go to Sales & Expenses</a></div>
        ) : (
          <>
            {switcher}
            <PeriodBar value={ps} onChange={setPs} />
            <FinSummary f={all} projects={books.projects.length} />
            <h3>Projects compared ({sub})</h3>
            <p className="muted">Tap a project name to open its full report.</p>
            <Table head={['Project', 'Total Sales', 'Total Expenses', 'Net Balance']} empty="" rows={rows.map(({ p, f }) => [<a key={p.id} href={`#/reports/${p.id}`}><b>{p.name}</b></a>, naira(f.sales), naira(f.expenses), signed(f.net)])} foot={['Overall Total', naira(all.sales), naira(all.expenses), signed(all.net)]} />
            {ps.period === 'yearly' && <YearTable sales={sales} exps={exps} year={r.from.slice(0, 4)} />}
            <CategoryTable exps={exps} />
            <ReportShare file={`overall-summary-${r.from}`} title="Overall Business Summary" sub={sub} who="your projects" f={all} onMsg={setMsg} tables={[
              { title: 'Projects compared', head: ['Project', 'Total Sales', 'Total Expenses', 'Net Balance'], rows: rows.map(({ p, f }) => [p.name, naira(f.sales), naira(f.expenses), signed(f.net)]), foot: ['Overall Total', naira(all.sales), naira(all.expenses), signed(all.net)] },
              ...(ps.period === 'yearly' ? [monthSection(sales, exps, r.from.slice(0, 4))] : []),
              categorySection(exps),
            ]} />
            <ExportBar file={`overall-summary-${r.from}`} title="Overall Business Summary" sub={sub} onError={err} rows={[['Project', 'Total sales (NGN)', 'Total expenses (NGN)', 'Net balance (NGN)'], ...rows.map(({ p, f }) => [p.name, kobo2n(f.sales), kobo2n(f.expenses), kobo2n(f.net)]), ['Overall total', kobo2n(all.sales), kobo2n(all.expenses), kobo2n(all.net)]]} />
          </>
        )}
      </Page>
    );
  }

  const project = books.projects.find((p) => p.id === projectId);
  if (!project) return <Page title="Project not found" intro="This project may have been deleted."><a className="btn primary" href="#/reports">Back to Overall Business Summary</a></Page>;
  const ps2 = sales.filter((s) => s.project_id === projectId).sort((a, b) => b.date.localeCompare(a.date));
  const pe = exps.filter((e) => e.project_id === projectId).sort((a, b) => b.date.localeCompare(a.date));
  const f = fin(ps2, pe);
  return (
    <Page title={project.name} intro="Project report. Only the sales and expenses of this project are shown.">
      {msg && <Banner ok={msg.ok}>{msg.text}</Banner>}
      <div className="bk-row"><a className="btn outline sm" href="#/reports">Back to Overall Business Summary</a><a className="btn outline sm" href={`#/sales/${projectId}`}>Add or change records</a></div>
      {switcher}
      <PeriodBar value={ps} onChange={setPs} />
      <FinSummary f={f} />
      {ps.period === 'yearly' && <YearTable sales={ps2} exps={pe} year={r.from.slice(0, 4)} />}
      <CategoryTable exps={pe} />
      {totalsByCurrency(ps2).map(({ currency, t: ct }) => (
        <div key={currency}>
          <h3>Sales by payment method ({currency})</h3>
          <Table head={['Method', 'Amount']} empty="" rows={PAYS.map((p) => [p, money(ct.byPay[p], currency)])} foot={['TOTAL', money(ct.total, currency)]} />
        </div>
      ))}
      <h3>Sales history ({sub})</h3>
      <Table head={SALE_HEAD.slice(0, -1)} rows={saleRows(ps2, () => null).map((row) => row.slice(0, -1))} empty="No sales for this period." foot={ps2.length ? ['TOTAL', '', String(totals(ps2).qty), '', currencyTotalLines(ps2).join(' · '), '', '', ''] : undefined} />
      <h3>Expense history ({sub})</h3>
      <Table head={EXP_HEAD.slice(0, -1)} rows={expRows(pe, () => null).map((row) => row.slice(0, -1))} empty="No expenses for this period." foot={pe.length ? ['TOTAL SPENT', '', '', naira(sumExpenses(pe)), ''] : undefined} />
      <ReportShare file={`${project.name.replace(/[^\w-]+/g, '-')}-summary-${r.from}`} title={`${project.name} - Financial Report`} sub={sub} who={project.name} f={f} onMsg={setMsg} tables={[
        ...(ps.period === 'yearly' ? [monthSection(ps2, pe, r.from.slice(0, 4))] : []),
        categorySection(pe),
        { title: 'Sales history', head: ['Date', 'Product / service', 'Qty', 'Unit price', 'Total'], rows: ps2.map((s) => [formatDate(s.date), s.product, String(s.qty), money(s.price, s.currency), money(s.total, s.currency)]) },
        { title: 'Expense history', head: ['Date', 'Description', 'Category', 'Amount'], rows: pe.map((e) => [formatDate(e.date), e.name, e.category, naira(e.amount)]) },
      ]} />
      <ExportBar file={`${project.name.replace(/[^\w-]+/g, '-')}-report-${r.from}`} title={`${project.name} - Report`} sub={sub} onError={err} rows={[['Total sales (NGN)', kobo2n(f.sales)], ['Total expenses (NGN)', kobo2n(f.expenses)], ['Net balance (NGN)', kobo2n(f.net)], [], ['Sales: Date', 'Product', 'Qty', 'Unit price', 'Total', 'Currency', 'Payment', 'Customer'], ...ps2.map((s) => [s.date, s.product, s.qty, kobo2n(s.price), kobo2n(s.total), s.currency, s.pay, s.customer]), [], ['Expenses: Date', 'Description', 'Category', 'Amount', 'Payment'], ...pe.map((e) => [e.date, e.name, e.category, kobo2n(e.amount), e.pay])]} />
    </Page>
  );
}

/** With Supabase on, people can look around freely and sign in only when they create a project (or tap Sign in). Without it, the pages open straight away. */
function Gate({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState(sessionEmail());
  const [local, setLocal] = useState(localCount());
  const [authOpen, setAuthOpen] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [k, setK] = useState(0);
  useEffect(() => {
    const sync = () => { setEmail(sessionEmail()); setLocal(localCount()); };
    window.addEventListener(AUTH_EVENT, sync);
    return () => window.removeEventListener(AUTH_EVENT, sync);
  }, []);
  if (!cloudOn) return <>{children}</>;
  return (
    <>
      <div className="container bk-account">
        {email ? (
          <>
            <span>Signed in as <b>{email}</b></span>
            <button type="button" className="btn outline sm" onClick={() => { signOut(); setK(k + 1); }}>Sign out</button>
          </>
        ) : (
          <>
            <span>You are not signed in. Your records stay on this device.</span>
            <button type="button" className="btn outline sm" onClick={() => setAuthOpen(true)}>Sign in</button>
          </>
        )}
      </div>
      {msg && <div className="container"><Banner ok={msg.ok}>{msg.text}</Banner></div>}
      {email && local > 0 && (
        <div className="container">
          <Banner>
            You have {local} record{local === 1 ? '' : 's'} saved only on this device.
            <div className="bk-row">
              <button type="button" className="btn primary sm" onClick={() => void moveLocalToCloud().then(() => { setLocal(0); setK(k + 1); }).catch((e: Error) => setMsg({ ok: false, text: e.message }))}>Move them to my account</button>
            </div>
          </Banner>
        </div>
      )}
      <div key={k}>{children}</div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onDone={() => { setAuthOpen(false); setK(k + 1); }} />
    </>
  );
}
export const Sales = ({ projectId }: { projectId?: string }) => <Gate>{projectId ? <Workspace key={projectId} projectId={projectId} /> : <ProjectsPage />}</Gate>;
export const Reports = ({ projectId }: { projectId?: string }) => <Gate><ReportsPage key={projectId ?? 'all'} projectId={projectId} /></Gate>;
