import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  ImagePlus,
  Info,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { DocData, DocKind, ExtraCharge, LineItem, TemplateId } from '../types';
import { computeTotals, lineTotal } from '../lib/calc';
import { CURRENCIES, formatMoney } from '../lib/currency';
import { FREIGHT_PAYER_OPTIONS, SHIPMENT_STATUS_OPTIONS } from '../lib/docModel';
import { fileBase, fileName, saveBlob } from '../lib/files';
import { DUE_LABEL, KIND_COPY, KIND_HELP, TOTAL_LABEL } from '../lib/kinds';
import { DocsIntro } from './DocsGuide';
import { DocModeSelect, MODE_KINDS } from './DocModeSelect';
import { TAX_CATEGORIES, nrsApplies, nrsPayload, nrsReadiness } from '../lib/nrs';
import { processLogoFile } from '../lib/logo';
import { sampleDoc } from '../lib/sample';
import { canShareFiles, defaultMessage, whatsappLink, whatsappNumber } from '../lib/share';
import { clearDraft, commitNumber, createDefaultDoc, createSeededDoc, loadDraft, newCharge, newItem, peekNumber, saveDraft } from '../lib/storage';
import { TEMPLATE_ORDER, THEMES } from '../lib/theme';
import { validate } from '../lib/validate';
import { InvoiceDocument } from './InvoiceDocument';
import { ScaledPage } from './ScaledPage';
import { Input, Modal, NumInput, Segmented, Select, Textarea } from './ui';

type Dialog = null | 'ready' | 'whatsapp' | 'reset';
type Toast = { msg: string; kind: 'ok' | 'error' } | null;

function initialDoc(kind: DocKind, template?: TemplateId): DocData {
  const d = loadDraft(kind) ?? createSeededDoc(kind);
  return template ? { ...d, template } : d;
}

export function Editor({ kind, template }: { kind: DocKind; template?: TemplateId }) {
  const isInvoice = kind === 'invoice';
  const isReceipt = kind === 'receipt';
  const isQuote = kind === 'quotation';
  const isWaybill = kind === 'waybill';
  const isPO = kind === 'purchase-order';
  const isVoucher = kind === 'payment-voucher';
  const isNote = kind === 'credit-note' || kind === 'debit-note';
  const isSO = kind === 'sales-order';
  const nrsKind = nrsApplies(kind);
  const priced = !isWaybill; // waybills list goods, not prices
  const dueLabel = DUE_LABEL[kind]; // invoices, quotations and orders show a second date
  const hasRef = isReceipt || isVoucher || isNote;
  const hasPayCard = isInvoice || isQuote || isSO || isPO || isVoucher;
  const copy = KIND_COPY[kind];
  const [data, setData] = useState<DocData>(() => initialDoc(kind, template));
  const [attempted, setAttempted] = useState(false);
  const [qrBad, setQrBad] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState<null | 'download' | 'share'>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [logoError, setLogoError] = useState('');
  const [waPhone, setWaPhone] = useState('');
  const [waMsg, setWaMsg] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const errors = useMemo(() => validate(data), [data]);
  const shown = attempted ? errors : {};
  const errorCount = Object.keys(errors).length;
  const totals = useMemo(() => computeTotals(data), [data]);
  const money = (c: number) => formatMoney(c, data.currency);

  // Remember the draft on this device only (debounced).
  useEffect(() => {
    const t = window.setTimeout(() => saveDraft(data), 500);
    return () => window.clearTimeout(t);
  }, [data]);

  // Warm up the PDF engine and fonts so the first download is instant.
  useEffect(() => {
    const t = window.setTimeout(() => {
      import('../pdf/buildPdf').then((m) => m.warmUp()).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const showToast = useCallback((msg: string, k: 'ok' | 'error' = 'ok') => {
    setToast({ msg, kind: k });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  function set<K extends keyof DocData>(key: K, value: DocData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }
  const updateItem = (id: string, patch: Partial<LineItem>) =>
    setData((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  const removeItem = (id: string) => setData((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }));
  const addItem = () => setData((d) => ({ ...d, items: [...d.items, newItem()] }));
  const updateCharge = (id: string, patch: Partial<ExtraCharge>) =>
    setData((d) => ({ ...d, charges: d.charges.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const removeCharge = (id: string) => setData((d) => ({ ...d, charges: d.charges.filter((c) => c.id !== id) }));
  const addCharge = () => setData((d) => ({ ...d, charges: [...d.charges, newCharge()] }));

  async function onLogoChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError('');
    try {
      const logo = await processLogoFile(file);
      set('logo', logo);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'That image could not be used.');
    }
  }

  function focusFirstError() {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]') ?? document.querySelector<HTMLElement>('[data-error-block]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => el.focus?.({ preventScroll: true }), 250);
  }

  function onGenerate() {
    setAttempted(true);
    if (Object.keys(validate(data)).length > 0) {
      setTab('edit');
      window.setTimeout(focusFirstError, 60);
      return;
    }
    setDialog('ready');
  }

  async function makePdfBlob(): Promise<Blob> {
    const { buildPdf } = await import('../pdf/buildPdf');
    return buildPdf(data);
  }

  async function onDownload() {
    setBusy('download');
    try {
      const blob = await makePdfBlob();
      saveBlob(blob, fileName(data));
      commitNumber(kind, data.number);
      showToast('PDF downloaded. Check your downloads folder.');
    } catch (err) {
      console.error(err);
      showToast("We couldn't create the PDF. Please check your connection once and try again.", 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onPrint() {
    setDialog(null);
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
    const previousTitle = document.title;
    document.title = fileBase(data);
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.setTimeout(restore, 120_000);
    commitNumber(kind, data.number);
    window.setTimeout(() => window.print(), 200);
  }

  function openWhatsApp() {
    setWaPhone(whatsappNumber(data.customerPhone, data.currency));
    setWaMsg(defaultMessage(data, totals));
    setDialog('whatsapp');
  }

  async function onSharePdf() {
    setBusy('share');
    try {
      const blob = await makePdfBlob();
      const file = new File([blob], fileName(data), { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileBase(data), text: waMsg });
        commitNumber(kind, data.number);
      } else {
        saveBlob(blob, fileName(data));
        showToast('Your phone cannot share files from here, so the PDF was downloaded instead.');
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error(err);
        showToast("We couldn't share the PDF. Try downloading it instead.", 'error');
      }
    } finally {
      setBusy(null);
    }
  }

  function onReset() {
    clearDraft(kind);
    setData(createDefaultDoc(kind));
    setAttempted(false);
    setLogoError('');
    setDialog(null);
    showToast(`Started a fresh ${copy.noun}.`);
  }

  function onSample() {
    setData((d) => ({ ...sampleDoc(kind, d.template, 'partial'), logo: d.logo, number: d.number }));
    setAttempted(false);
    showToast('Sample details added. Replace them with your own.');
  }

  const waDigits = waPhone.replace(/\D/g, '');
  const canShare = useMemo(() => canShareFiles(), []);
  const docWord = copy.noun;
  let stepNo = 0;
  const nextStep = () => ++stepNo;

  return (
    <>
      <div className="app-shell editor-page">
        <DocsIntro />
        <div className="editor-toolbar">
          <div>
            <h1>Create {copy.noun}</h1>
            <p className="muted">Fill in the details. The preview updates as you type.</p>
          </div>
          <div className="toolbar-actions">
            <button type="button" className="btn ghost sm" onClick={onSample}>
              <Sparkles size={16} /> Fill with sample
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setDialog('reset')}>
              <RotateCcw size={16} /> Start over
            </button>
          </div>
        </div>

        <div className="editor-grid" data-tab={tab}>
          {/* ------------------------------ FORM ------------------------------ */}
          <div className="form-col">
            {MODE_KINDS.includes(kind) && (
              <DocModeSelect kind={kind} nrs={data.nrsEnabled} onChange={(v) => set('nrsEnabled', v)} />
            )}
            <section className="card">
              <h2 className="card-title">
                <span className="step">{nextStep()}</span> {copy.businessTitle}
              </h2>
              <Input label="Business name" required value={data.businessName} onChange={(v) => set('businessName', v)} error={shown.businessName} placeholder="e.g. Adaeze Interiors Ltd" autoComplete="organization" />
              <div className="logo-row">
                <div className="logo-box">
                  {data.logo ? <img src={data.logo.dataUrl} alt="Your logo" /> : <ImagePlus size={22} aria-hidden="true" />}
                </div>
                <div className="logo-actions">
                  <span className="label-like">Business logo</span>
                  <div className="row">
                    <button type="button" className="btn outline sm" onClick={() => fileInput.current?.click()}>
                      {data.logo ? 'Change logo' : 'Upload logo'}
                    </button>
                    {data.logo && (
                      <button type="button" className="btn ghost sm" onClick={() => set('logo', null)}>
                        Remove
                      </button>
                    )}
                  </div>
                  <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={onLogoChosen} />
                  {logoError ? (
                    <p className="err" role="alert">
                      {logoError}
                    </p>
                  ) : (
                    <p className="hint">PNG or JPG, up to 5 MB. It never leaves your device.</p>
                  )}
                </div>
              </div>
              <div className="grid-2">
                <Input label="Phone number" type="tel" value={data.businessPhone} onChange={(v) => set('businessPhone', v)} placeholder="+234 803 000 0000" autoComplete="tel" />
                <Input label="Email" type="email" value={data.businessEmail} onChange={(v) => set('businessEmail', v)} error={shown.businessEmail} placeholder="you@business.com" autoComplete="email" />
              </div>
              <div className="grid-2">
                <Input label="Tax ID (optional)" inputMode="numeric" value={data.businessTaxId} onChange={(v) => set('businessTaxId', v)} hint="Your 13-digit Tax ID from the Nigeria Revenue Service" />
                <Input label="RC number (optional)" value={data.businessRegNo} onChange={(v) => set('businessRegNo', v)} placeholder="e.g. RC 1234567" hint="Your CAC registration number" />
              </div>
              <Textarea label="Address" rows={2} value={data.businessAddress} onChange={(v) => set('businessAddress', v)} placeholder={'Street, area\nCity, State'} />
            </section>

            <section className="card">
              <h2 className="card-title">
                <span className="step">{nextStep()}</span> {copy.partyTitle}
              </h2>
              <Input label={copy.partyNameLabel} required value={data.customerName} onChange={(v) => set('customerName', v)} error={shown.customerName} placeholder={copy.partyNamePlaceholder} />
              <div className="grid-2">
                <Input label="Phone number" type="tel" value={data.customerPhone} onChange={(v) => set('customerPhone', v)} placeholder="+234 809 000 0000" />
                <Input label="Email" type="email" value={data.customerEmail} onChange={(v) => set('customerEmail', v)} error={shown.customerEmail} placeholder="customer@email.com" />
              </div>
              <Input label="Customer Tax ID (optional)" inputMode="numeric" value={data.customerTaxId} onChange={(v) => set('customerTaxId', v)} hint="Business customers may ask for it to claim VAT" />
              <Textarea label="Address" rows={2} value={data.customerAddress} onChange={(v) => set('customerAddress', v)} placeholder={'Street, area\nCity, State'} />
            </section>

            <section className="card">
              <h2 className="card-title">
                <span className="step">{nextStep()}</span> {copy.Noun} details
              </h2>
              <div className="number-row">
                <Input label={copy.numberLabel} required value={data.number} onChange={(v) => set('number', v)} error={shown.number} />
                <button type="button" className="btn outline sm" onClick={() => set('number', peekNumber(kind))} title="Generate the next number automatically">
                  <RefreshCw size={15} /> Auto
                </button>
              </div>
              <div className="grid-2">
                <Input label={copy.dateLabel} type="date" required value={data.issueDate} onChange={(v) => set('issueDate', v)} error={shown.issueDate} />
                {dueLabel && (
                  <Input label={dueLabel} type="date" required value={data.dueDate} onChange={(v) => set('dueDate', v)} error={shown.dueDate} />
                )}
                {isWaybill && <Input label="Expected delivery (optional)" type="date" value={data.expectedDate} onChange={(v) => set('expectedDate', v)} error={shown.expectedDate} />}
                {(isReceipt || isVoucher) && (
                  <Select
                    label="Payment method"
                    value={data.paymentMethod}
                    onChange={(v) => set('paymentMethod', v)}
                    options={['Cash', 'Bank transfer', 'POS / Card', 'Cheque', 'Mobile money', 'Other'].map((m) => ({ value: m, label: m }))}
                  />
                )}
              </div>
              {isWaybill && (
                <div className="grid-2">
                  <Input label="From (pick-up town / city)" required value={data.origin} onChange={(v) => set('origin', v)} error={shown.origin} placeholder="e.g. Enugu" />
                  <Input label="To (delivery town / city)" required value={data.destination} onChange={(v) => set('destination', v)} error={shown.destination} placeholder="e.g. Lagos" />
                </div>
              )}
              {hasRef && (
                <Input
                  label={copy.refLabel ?? 'Payment reference (optional)'}
                  value={data.reference}
                  onChange={(v) => set('reference', v)}
                  placeholder={copy.refPlaceholder ?? 'e.g. transfer reference or invoice number'}
                />
              )}
              <Select label="Currency" value={data.currency} onChange={(v) => set('currency', v)} options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))} />
            </section>

            {isWaybill && (
              <section className="card">
                <h2 className="card-title">
                  <span className="step">{nextStep()}</span> Transport
                </h2>
                <div className="grid-2">
                  <Select
                    label="Mode of transport"
                    value={data.transportMode}
                    onChange={(v) => set('transportMode', v)}
                    options={['Road', 'Rail', 'Air', 'Sea', 'Courier / dispatch rider', 'Other'].map((m) => ({ value: m, label: m }))}
                  />
                  <Select
                    label="Shipment status"
                    value={data.shipmentStatus}
                    onChange={(v) => set('shipmentStatus', v as DocData['shipmentStatus'])}
                    options={SHIPMENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  />
                </div>
                <div className="grid-2">
                  <Input label="Vehicle number (optional)" value={data.vehicleNo} onChange={(v) => set('vehicleNo', v)} placeholder="e.g. ENU 482 XA" />
                  <Input label="Driver name (optional)" value={data.driverName} onChange={(v) => set('driverName', v)} />
                </div>
                <Input label="Driver phone (optional)" type="tel" value={data.driverPhone} onChange={(v) => set('driverPhone', v)} placeholder="+234 802 000 0000" />
              </section>
            )}

            <section className="card" data-error-block={shown.items ? 'true' : undefined} tabIndex={-1}>
              <h2 className="card-title">
                <span className="step">{nextStep()}</span> {isWaybill ? 'Goods being sent' : 'Items & services'}
              </h2>
              {shown.items && (
                <p className="err banner-err" role="alert">
                  <AlertCircle size={16} /> {shown.items}
                </p>
              )}
              {data.items.map((it, i) => (
                <div className="item-card" key={it.id}>
                  <div className="item-head">
                    <span className="item-n">Item {i + 1}</span>
                    <button type="button" className="icon-btn danger" onClick={() => removeItem(it.id)} disabled={data.items.length === 1} aria-label={`Remove item ${i + 1}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <Input
                    label="Description"
                    required
                    value={it.description}
                    onChange={(v) => updateItem(it.id, { description: v })}
                    error={shown[`item-${it.id}-description`]}
                    placeholder={isWaybill ? 'What goods are being sent?' : 'What are you charging for?'}
                  />
                  <Input
                    label="Extra details (optional)"
                    value={it.details}
                    onChange={(v) => updateItem(it.id, { details: v })}
                    placeholder={isWaybill ? 'Packaging, condition, handling notes...' : 'Size, colour, scope of work...'}
                  />
                  {isWaybill ? (
                    <div className="grid-3">
                      <NumInput label="Quantity" required value={it.qty} onChange={(v) => updateItem(it.id, { qty: v })} error={shown[`item-${it.id}-qty`]} />
                      <Input label="Unit" value={it.unit} onChange={(v) => updateItem(it.id, { unit: v })} placeholder="bags, cartons..." />
                      <NumInput label="Weight kg (optional)" value={it.weight} onChange={(v) => updateItem(it.id, { weight: v })} error={shown[`item-${it.id}-weight`]} placeholder="0" />
                    </div>
                  ) : (
                    <div className="grid-3">
                      <NumInput label="Quantity" required value={it.qty} onChange={(v) => updateItem(it.id, { qty: v })} error={shown[`item-${it.id}-qty`]} />
                      <NumInput label="Unit price" required value={it.price} onChange={(v) => updateItem(it.id, { price: v })} error={shown[`item-${it.id}-price`]} placeholder="0.00" />
                      <div className="line-total">
                        <span>Amount</span>
                        <strong>{money(lineTotal(it))}</strong>
                      </div>
                    </div>
                  )}
                  {nrsKind && data.nrsEnabled && (
                    <div className="nrs-item">
                      <strong>NRS product details</strong>
                      <div className="grid-2">
                        <Select label="Code type" value={it.classType} onChange={(v) => updateItem(it.id, { classType: v as LineItem['classType'] })} options={[{ value: 'HSN', label: 'HSN (goods)' }, { value: 'ISIC', label: 'ISIC (services)' }]} />
                        <Input label={it.classType === 'ISIC' ? 'ISIC code' : 'HSN code'} value={it.code} onChange={(v) => updateItem(it.id, { code: v })} placeholder={it.classType === 'ISIC' ? 'e.g. 0114' : 'e.g. 2523.10'} />
                      </div>
                      <Input label={it.classType === 'ISIC' ? 'Service category' : 'Product category'} value={it.category} onChange={(v) => updateItem(it.id, { category: v })} />
                      <div className="grid-2">
                        <Select label="Tax category" value={it.taxCategory} onChange={(v) => updateItem(it.id, { taxCategory: v as LineItem['taxCategory'] })} options={[{ value: '', label: 'Follow invoice VAT rate' }, ...TAX_CATEGORIES]} />
                        <Input label="Unit code" value={it.unitCode} onChange={(v) => updateItem(it.id, { unitCode: v.toUpperCase() })} hint="EA (each), KGM (kg), LTR (litre)" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className="btn outline full" onClick={addItem}>
                <Plus size={16} /> Add another item
              </button>
            </section>

            {priced && (
            <section className="card">
              <h2 className="card-title">
                <span className="step">{nextStep()}</span> Discount, tax &amp; charges
              </h2>
              <div className="adjust">
                <div className="adjust-head">
                  <span className="label-like">Discount</span>
                  <Segmented
                    label="Discount type"
                    value={data.discountMode}
                    onChange={(v) => set('discountMode', v)}
                    options={[
                      { value: 'percent', label: '%' },
                      { value: 'fixed', label: data.currency },
                    ]}
                  />
                </div>
                <NumInput label={data.discountMode === 'percent' ? 'Discount (%)' : 'Discount amount'} value={data.discountValue} onChange={(v) => set('discountValue', v)} error={shown.discountValue} placeholder="0" />
              </div>
              <div className="grid-2">
                <Input label="Tax name" value={data.taxLabel} onChange={(v) => set('taxLabel', v)} placeholder="VAT" />
                <NumInput label="Tax rate (%)" value={data.taxRate} onChange={(v) => set('taxRate', v)} error={shown.taxRate} placeholder="7.5" />
              </div>
              <div className="charges">
                <span className="label-like">Additional charges (delivery, installation...)</span>
                {data.charges.map((c) => (
                  <div className="charge-row" key={c.id}>
                    <Input label="Charge name" value={c.label} onChange={(v) => updateCharge(c.id, { label: v })} error={shown[`charge-${c.id}-label`]} placeholder="Delivery" />
                    <NumInput label="Amount" value={c.amount} onChange={(v) => updateCharge(c.id, { amount: v })} error={shown[`charge-${c.id}-amount`]} placeholder="0.00" />
                    <button type="button" className="icon-btn danger" onClick={() => removeCharge(c.id)} aria-label="Remove charge">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn outline sm" onClick={addCharge}>
                  <Plus size={15} /> Add a charge
                </button>
              </div>
              <div className="calc-box" aria-live="polite">
                <div>
                  <span>Subtotal</span>
                  <b>{money(totals.subtotal)}</b>
                </div>
                <div className="total">
                  <span>Total</span>
                  <b>{money(totals.total)}</b>
                </div>
              </div>
            </section>
            )}

            {isWaybill && (
              <section className="card">
                <h2 className="card-title">
                  <span className="step">{nextStep()}</span> Freight &amp; value (optional)
                </h2>
                <div className="grid-2">
                  <NumInput label="Freight charge" value={data.freightCharge} onChange={(v) => set('freightCharge', v)} error={shown.freightCharge} placeholder="0.00" />
                  <Select
                    label="Freight paid by"
                    value={data.freightPayer}
                    onChange={(v) => set('freightPayer', v as DocData['freightPayer'])}
                    options={FREIGHT_PAYER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  />
                </div>
                <NumInput label="Declared value of goods" value={data.declaredValue} onChange={(v) => set('declaredValue', v)} error={shown.declaredValue} placeholder="0.00" />
                <p className="hint">Amounts are shown in the currency chosen above. Leave them empty to hide them on the waybill.</p>
              </section>
            )}

            {hasPayCard && (
              <section className="card">
                <h2 className="card-title">
                  <span className="step">{nextStep()}</span> {isInvoice ? 'Payment' : isPO ? 'Delivery details (optional)' : isVoucher ? 'Payee bank details (optional)' : 'Payment details (optional)'}
                </h2>
                {isInvoice && (
                  <>
                    <span className="label-like">Payment status</span>
                    <Segmented
                      label="Payment status"
                      value={data.status}
                      onChange={(v) => set('status', v)}
                      options={[
                        { value: 'unpaid', label: 'Unpaid' },
                        { value: 'partial', label: 'Partially paid' },
                        { value: 'paid', label: 'Paid' },
                      ]}
                    />
                    {data.status === 'partial' && (
                      <div className="partial-box">
                        <NumInput label="Amount already paid" required value={data.amountPaid} onChange={(v) => set('amountPaid', v)} error={shown.amountPaid} placeholder="0.00" />
                        <p className="hint">Balance due: {money(totals.balance)}</p>
                      </div>
                    )}
                  </>
                )}
                {!isPO && (
                  <>
                    <div className="grid-2">
                      <Input label="Bank name" value={data.bankName} onChange={(v) => set('bankName', v)} placeholder="e.g. Zenith Bank" />
                      <Input label="Account name" value={data.accountName} onChange={(v) => set('accountName', v)} />
                    </div>
                    <Input label="Account number" inputMode="numeric" value={data.accountNumber} onChange={(v) => set('accountNumber', v)} placeholder="10 digits" />
                  </>
                )}
                {!isVoucher && (
                <Textarea label={isPO ? 'Delivery address & instructions' : 'Payment instructions'} rows={2} value={data.paymentInstructions} onChange={(v) => set('paymentInstructions', v)} placeholder={isPO ? 'e.g. Deliver to our workshop. Call before arrival.' : isQuote ? 'e.g. Pay the deposit into this account to confirm the order.' : 'e.g. Please use the invoice number as your transfer reference.'} />
                )}
              </section>
            )}

            {nrsKind && (data.nrsEnabled || kind === 'debit-note') && (
            <section className="card">
              <h2 className="card-title">
                <span className="step">{nextStep()}</span> {kind === 'invoice' ? 'NRS e-invoice data' : 'NRS adjustment document data'}
              </h2>
              {kind === 'debit-note' && (
                <label className="nrs-toggle">
                  <input type="checkbox" checked={data.nrsEnabled} onChange={(e) => set('nrsEnabled', e.target.checked)} />
                  <span>Prepare this document's data for NRS e-invoicing</span>
                </label>
              )}
              <div className="hint" data-testid="nrs-distinction" style={{ margin: '8px 0' }}>
                {kind === 'invoice' ? (
                  <>
                    <b>Standard Business Invoice:</b> generated by KACHIER for normal business transactions and records. <b>Officially Validated E-Invoice:</b> an invoice successfully processed through the official NRS electronic invoicing system. A KACHIER PDF is only validated if it carries official NRS details that you entered after real validation.
                  </>
                ) : (
                  <>
                    <b>Standard {KIND_COPY[kind].Noun}:</b> generated by KACHIER for normal business records. <b>Officially Validated NRS adjustment document:</b> a {KIND_COPY[kind].noun} successfully processed through the official NRS system. A KACHIER PDF is only validated if it carries official NRS details that you entered after real validation. It adjusts an earlier invoice, so check with an accountant or NRS whether yours must be submitted.
                  </>
                )}
              </div>
              {data.nrsEnabled && (
                <>
                  <p className="hint">
                    This only prepares the data. KACHIER does not send {kind === 'invoice' ? 'invoices' : 'documents'} to NRS, so this document is <b>not</b> NRS-validated. The IRN and QR code are issued by NRS after validation and are not created here.
                  </p>
                  <Input label="NRS Business ID" value={data.businessId} onChange={(v) => set('businessId', v.trim())} hint="Given by NRS when your business is onboarded" />
                  <div className="grid-2">
                    <Select label="Invoice kind" value={data.invoiceKind} onChange={(v) => set('invoiceKind', v as DocData['invoiceKind'])} options={[{ value: '', label: 'Automatic (B2B if customer has a Tax ID)' }, { value: 'B2B', label: 'B2B (business to business)' }, { value: 'B2C', label: 'B2C (business to consumer)' }, { value: 'B2G', label: 'B2G (business to government)' }]} />
                    <Input label="Issue time" type="time" step={1} value={data.issueTime} onChange={(v) => set('issueTime', v)} />
                  </div>
                  <Input label="Tax point date (optional)" type="date" value={data.taxPointDate} onChange={(v) => set('taxPointDate', v)} hint="Leave empty to use the issue date" />
                  <div className="grid-3">
                    <Input label="Your city" value={data.businessCity} onChange={(v) => set('businessCity', v)} />
                    <Input label="Postal code" value={data.businessPostalZone} onChange={(v) => set('businessPostalZone', v)} />
                    <Input label="Country code" value={data.businessCountry} onChange={(v) => set('businessCountry', v.toUpperCase().slice(0, 2))} />
                  </div>
                  <div className="grid-3">
                    <Input label="Customer city" value={data.customerCity} onChange={(v) => set('customerCity', v)} />
                    <Input label="Postal code" value={data.customerPostalZone} onChange={(v) => set('customerPostalZone', v)} />
                    <Input label="Country code" value={data.customerCountry} onChange={(v) => set('customerCountry', v.toUpperCase().slice(0, 2))} />
                  </div>
                  {kind !== 'invoice' && (
                    <div className="grid-2">
                      <Input label="Original invoice IRN" value={data.originalIrn} onChange={(v) => set('originalIrn', v.trim())} hint="The IRN NRS gave the original invoice" />
                      <Input label="Original invoice date" type="date" value={data.originalIssueDate} onChange={(v) => set('originalIssueDate', v)} />
                    </div>
                  )}
                  {(() => {
                    const r = nrsReadiness(data);
                    return (
                      <div className="nrs-check">
                        <strong>{r.missing.length ? `${r.missing.length} detail${r.missing.length === 1 ? '' : 's'} still missing for NRS` : 'All NRS details are filled in'}</strong>
                        {r.missing.length > 0 && <ul>{r.missing.slice(0, 12).map((m) => <li key={m}>{m}</li>)}{r.missing.length > 12 && <li>and {r.missing.length - 12} more</li>}</ul>}
                        <p className="hint">Cannot be done inside KACHIER:</p>
                        <ul>{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                      </div>
                    );
                  })()}
                  <button type="button" className="btn outline full" onClick={() => saveBlob(new Blob([JSON.stringify(nrsPayload(data), null, 2)], { type: 'application/json' }), `${fileBase(data)}-nrs-draft-data.json`)}>
                    Download NRS draft data (JSON)
                  </button>
                  <p className="hint" style={{ marginTop: '0.5rem' }}>
                    This JSON file contains structured {kind === 'invoice' ? 'invoice' : KIND_COPY[kind].noun} data prepared for NRS e-invoicing integration. You can download it for your records or use it with an NRS-supported submission method, where applicable.
                  </p>
                  <a className="btn primary full" href="https://einvoice.nrs.gov.ng" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', marginTop: '0.5rem' }}>
                    Go to NRS Platform to Get Stamped
                  </a>
                </>
              )}
            </section>
            )}

            {nrsKind && data.nrsEnabled && (
            <section className="card">
              <h2 className="card-title">
                <span className="step">{nextStep()}</span> NRS Validation Details
              </h2>
              <p className="hint">
                After submitting your {kind === 'invoice' ? 'invoice' : KIND_COPY[kind].noun} through an NRS-supported process and receiving your IRN, cryptographic stamp and QR code, enter them below. Then click Generate to create your final stamped PDF.
              </p>
              <Input label="IRN (Invoice Reference Number)" value={data.nrsIrn} onChange={(v) => set('nrsIrn', v.trim())} placeholder="Paste the official IRN from NRS" />
              <Input label="Cryptographic Stamp / CSID" value={data.nrsCsid} onChange={(v) => set('nrsCsid', v.trim())} placeholder="Paste the official CSID / stamp from NRS" />
              <Input
                label="QR code image URL (optional)"
                value={data.nrsQrDataUrl.startsWith('data:') ? '' : data.nrsQrDataUrl}
                onChange={(v) => set('nrsQrDataUrl', v.trim())}
                placeholder="https://… or leave empty and upload below"
              />
              <div className="field">
                <label className="label">Or upload QR code image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') set('nrsQrDataUrl', reader.result);
                    };
                    reader.readAsDataURL(f);
                  }}
                />
                {data.nrsQrDataUrl && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <img
                      key={data.nrsQrDataUrl}
                      src={data.nrsQrDataUrl}
                      crossOrigin={data.nrsQrDataUrl.startsWith('data:') ? undefined : 'anonymous'}
                      alt="NRS QR preview"
                      style={{ maxWidth: 120, maxHeight: 120, border: '1px solid #ddd' }}
                      onError={() => setQrBad(true)}
                      onLoad={() => setQrBad(false)}
                    />
                    {qrBad && <p className="err">This link cannot be used in the PDF (the image is missing, or its website blocks other sites). Save the QR image to your device and upload it instead.</p>}
                    <button type="button" className="btn outline sm" style={{ marginLeft: 8 }} onClick={() => set('nrsQrDataUrl', '')}>Clear QR</button>
                  </div>
                )}
              </div>
              <p className="hint">These fields are optional until you receive official NRS validation details. KACHIER never generates fake IRNs, stamps or QR codes.</p>
            </section>
            )}

            <section className="card">
              <h2 className="card-title">
                <span className="step">{nextStep()}</span> {isReceipt ? 'Notes' : isWaybill ? 'Instructions & terms' : isVoucher ? 'Purpose of payment' : isNote ? 'Reason & terms' : 'Notes & terms'}
              </h2>
              <Textarea
                label={isWaybill ? 'Special instructions' : isVoucher ? 'Purpose of payment' : isNote ? (kind === 'credit-note' ? 'Reason for credit' : 'Reason for debit') : 'Notes'}
                rows={3}
                value={data.notes}
                onChange={(v) => set('notes', v)}
                placeholder={isWaybill ? 'e.g. Call the receiver before arrival. Handle with care.' : isVoucher ? 'e.g. Part payment for materials, invoice no. 8841.' : isNote ? 'e.g. Goods returned damaged, or extra work not billed before.' : isPO ? 'Anything the supplier should know about this order.' : 'A thank-you message or anything the customer should know.'}
              />
              {!isReceipt && !isVoucher && (
                <Textarea
                  label="Terms & conditions"
                  rows={3}
                  value={data.terms}
                  onChange={(v) => set('terms', v)}
                  placeholder={isQuote ? 'Validity, deposit, delivery time...' : isWaybill ? 'Liability, inspection on delivery...' : 'Late payment, refunds, delivery terms...'}
                />
              )}
            </section>

            <div className="generate-card">
              {attempted && errorCount > 0 && (
                <div className="error-summary" role="alert">
                  <AlertCircle size={18} />
                  <div>
                    <strong>
                      Please fix {errorCount} {errorCount === 1 ? 'thing' : 'things'} first:
                    </strong>
                    <ul>
                      {Object.values(errors)
                        .slice(0, 4)
                        .map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      {errorCount > 4 && <li>...and {errorCount - 4} more</li>}
                    </ul>
                  </div>
                </div>
              )}
              <p className="doc-help" data-testid="doc-help">
                <Info size={16} aria-hidden="true" /> <span>{KIND_HELP[kind]}</span>
              </p>
              <button type="button" className="btn primary lg full" onClick={onGenerate}>
                <FileText size={18} /> Generate {docWord}
              </button>
              <p className="hint center">You'll confirm before anything is downloaded.</p>
            </div>
          </div>

          {/* ----------------------------- PREVIEW ----------------------------- */}
          <aside className="preview-col">
            <div className="preview-sticky">
              <div className="template-tabs" role="tablist" aria-label="Choose a template">
                {TEMPLATE_ORDER.map((id) => (
                  <button key={id} type="button" role="tab" aria-selected={data.template === id} className={data.template === id ? 'on' : ''} onClick={() => set('template', id)}>
                    <i style={{ background: THEMES[id].accent }} aria-hidden="true" />
                    <span>{THEMES[id].name}</span>
                  </button>
                ))}
              </div>
              <div className="preview-paper">
                <ScaledPage>
                  <InvoiceDocument data={data} />
                </ScaledPage>
              </div>
              <button type="button" className="btn primary full desktop-only" onClick={onGenerate}>
                <FileText size={17} /> Generate {docWord}
              </button>
            </div>
          </aside>
        </div>

        {/* Mobile bottom bar */}
        <div className="mobile-bar">
          <div className="segmented small" role="tablist" aria-label="Switch view">
            <button type="button" role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>
              <Pencil size={15} /> Edit
            </button>
            <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>
              <Eye size={15} /> Preview
            </button>
          </div>
          <button type="button" className="btn primary" onClick={onGenerate}>
            Generate
          </button>
        </div>

        {/* ------------------------------ DIALOGS ------------------------------ */}
        <Modal open={dialog === 'ready'} onClose={() => setDialog(null)} title={`Your ${docWord} is ready`}>
          <div className="ready-summary">
            <div>
              <span>{copy.Noun} no.</span>
              <b>{data.number}</b>
            </div>
            <div>
              <span>{copy.partyShort}</span>
              <b>{data.customerName}</b>
            </div>
            {isWaybill ? (
              <div>
                <span>Route</span>
                <b>
                  {data.origin} → {data.destination}
                </b>
              </div>
            ) : (
              <div>
                <span>{isInvoice && data.status === 'partial' ? 'Balance due' : (TOTAL_LABEL[kind] ?? 'Total')}</span>
                <b>{money(isInvoice && data.status === 'partial' ? totals.balance : totals.total)}</b>
              </div>
            )}
          </div>
          <p className="muted">Everything is created on your device. Choose what you'd like to do:</p>
          <div className="stack">
            <button type="button" className="btn primary lg full" onClick={onDownload} disabled={busy !== null}>
              {busy === 'download' ? <Loader2 size={18} className="spin" /> : <Download size={18} />} Download PDF
            </button>
            <div className="grid-2">
              <button type="button" className="btn outline full" onClick={onPrint}>
                <Printer size={17} /> Print
              </button>
              <button type="button" className="btn outline full" onClick={openWhatsApp}>
                <MessageCircle size={17} /> WhatsApp
              </button>
            </div>
            <button type="button" className="btn ghost full" onClick={() => setDialog(null)}>
              Keep editing
            </button>
          </div>
        </Modal>

        <Modal open={dialog === 'whatsapp'} onClose={() => setDialog(null)} title="Share on WhatsApp">
          <Input label="Customer's WhatsApp number (optional)" type="tel" inputMode="tel" value={waPhone} onChange={setWaPhone} hint="With country code, e.g. 2348031234567. Leave empty to pick a chat in WhatsApp." />
          <Textarea label="Message" rows={6} value={waMsg} onChange={setWaMsg} />
          <div className="stack">
            {canShare && (
              <button type="button" className="btn primary lg full" onClick={onSharePdf} disabled={busy !== null}>
                {busy === 'share' ? <Loader2 size={18} className="spin" /> : <Share2 size={18} />} Share the PDF (choose WhatsApp)
              </button>
            )}
            <a
              className={`btn ${canShare ? 'outline' : 'primary lg'} full`}
              href={whatsappLink(waDigits, waMsg)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => commitNumber(kind, data.number)}
            >
              <MessageCircle size={18} /> Open WhatsApp with this message
            </a>
            <button type="button" className="btn outline full" onClick={onDownload} disabled={busy !== null}>
              {busy === 'download' ? <Loader2 size={17} className="spin" /> : <Download size={17} />} Download the PDF to attach
            </button>
          </div>
          <p className="hint">
            {canShare
              ? 'Tip: "Share the PDF" sends the real file. The message button only opens a chat with text.'
              : 'WhatsApp links cannot attach files by themselves. Download the PDF first, then attach it in the chat.'}
          </p>
          <button type="button" className="btn ghost full" onClick={() => setDialog('ready')}>
            Back
          </button>
        </Modal>

        <Modal open={dialog === 'reset'} onClose={() => setDialog(null)} title="Start over?">
          <p>This clears everything you've typed for this {docWord}, including your logo. This can't be undone.</p>
          <div className="grid-2">
            <button type="button" className="btn outline full" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button type="button" className="btn danger full" onClick={onReset}>
              Yes, clear it
            </button>
          </div>
        </Modal>

        {toast && (
          <div className={`toast ${toast.kind}`} role="status" aria-live="polite">
            {toast.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{toast.msg}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>
              <Check size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Only this is shown when printing. */}
      <div className="print-only">
        <InvoiceDocument data={data} />
      </div>
    </>
  );
}
