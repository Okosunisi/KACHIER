import { useState } from 'react';
import { ArrowRight, BarChart3, BookOpen, Check, FileText, Menu, X } from 'lucide-react';
import type { DocKind } from '../types';
import { KIND_COPY, KIND_ORDER } from '../lib/kinds';
import { Brand } from './ui';

type Current = 'home' | 'sales' | 'reports' | 'documents' | 'privacy' | DocKind;

/** The three main sections. Business Documents opens the document maker (it has the switcher for every document type). */
const SECTIONS = [
  { label: 'Business Documents', href: '#/invoice' },
  { label: 'Sales & Expenses', href: '#/sales' },
  { label: 'Business Reports', href: '#/reports' },
] as const;

export function SiteHeader({ current }: { current: Current }) {
  const [open, setOpen] = useState(false);
  const isDoc = current !== 'home' && current !== 'sales' && current !== 'reports' && current !== 'privacy';
  const isKind = isDoc && current !== 'documents';
  const on = (href: string) => (href === '#/sales' ? current === 'sales' : href === '#/reports' ? current === 'reports' : isDoc);
  return (
    <header className="site-header">
      <div className="container bar">
        <a href="#/" className="brand-link" aria-label="KACHIER home" onClick={() => setOpen(false)}>
          <Brand />
        </a>
        <nav className="top-links" aria-label="Main">
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href} className={on(s.href) ? 'on' : ''} aria-current={on(s.href) ? 'page' : undefined}>
              {s.label}
            </a>
          ))}
        </nav>
        <button type="button" className="menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav className="container mobile-menu" aria-label="Main">
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href} className={on(s.href) ? 'on' : ''} onClick={() => setOpen(false)}>
              {s.label}
            </a>
          ))}
        </nav>
      )}
      {isDoc && (
        <div className="container doc-row">
          <div className="segmented small doc-switch" aria-label="Document type">
            {KIND_ORDER.map((k) => (
              <a key={k} href={`#/${KIND_COPY[k].path}`} className={current === k && isKind ? 'on' : ''} aria-current={current === k && isKind ? 'page' : undefined}>
                {KIND_COPY[k].Noun}
              </a>
            ))}
            <a href="#/documents" className={current === 'documents' ? 'on' : ''} aria-current={current === 'documents' ? 'page' : undefined}>
              Guide
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

const DOC_LINKS: DocKind[] = ['invoice', 'quotation', 'receipt', 'sales-order', 'purchase-order', 'payment-voucher', 'credit-note', 'debit-note', 'waybill'];

const FEATURES = [
  { icon: BookOpen, title: 'Sales & Expenses', text: 'Create projects for your businesses, then record daily sales and the money you spend on each one.', button: 'Manage Sales & Expenses', href: '#/sales' },
  { icon: BarChart3, title: 'Business Reports', text: 'See daily, weekly, monthly and yearly sales, expenses and net balance for all your projects together or one by one.', button: 'View Business Reports', href: '#/reports' },
  { icon: FileText, title: 'Business Documents', text: 'Create professional invoices, quotations, receipts, sales orders, purchase orders, payment vouchers, credit notes, debit notes, and waybills.', button: 'Create Documents', href: '#/invoice' },
];

const BENEFITS = [
  'Keep daily sales organized.',
  'Track recorded business spending.',
  'Find previous transactions easily.',
  'Compare sales across different periods.',
  'Generate professional business documents.',
  'Access useful business reports in one place.',
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container foot-grid">
        <div>
          <Brand small />
          <p className="muted">Simple bookkeeping and record-keeping for small and large business owners.</p>
        </div>
        <div>
          <strong>Sections</strong>
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href}>
              {s.label}
            </a>
          ))}
        </div>
        <div>
          <strong>Privacy</strong>
          <p className="muted">Your business records belong to you. Every person can see only their own records.</p>
          <a href="#/privacy">Privacy Policy</a>
        </div>
      </div>
      <div className="container foot-base">© {new Date().getFullYear()} KACHIER. Simple bookkeeping for business owners.</div>
    </footer>
  );
}

export function Home() {
  return (
    <div className="app-shell home">
      <SiteHeader current="home" />
      <main>
        <section className="hp-hero">
          <div className="container">
            <span className="pill">Simple bookkeeping for every business</span>
            <h1>Keep Your Business Records in One Place.</h1>
            <p className="lead">
              Record your daily sales, track your business spending, and understand how your business is performing. Keep your transactions organized and create professional business documents whenever you need them.
            </p>
            <div className="hp-cta">
              <a className="btn primary lg" href="#/sales">
                Start Recording Sales <ArrowRight size={18} />
              </a>
              <a className="btn outline lg" href="#/invoice">
                Explore Business Documents
              </a>
            </div>
          </div>
        </section>

        <section className="hp-section">
          <div className="container">
            <h2>Everything Your Business Needs to Stay Organized</h2>
            <div className="hp-features">
              {FEATURES.map(({ icon: Icon, title, text, button, href }) => (
                <div key={title} className="hp-feature">
                  <span className="hp-icon" aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <a className="btn outline" href={href}>
                    {button}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="hp-section alt" id="documents">
          <div className="container">
            <h2>Create the Business Documents You Need</h2>
            <div className="hp-docs">
              {DOC_LINKS.map((k) => (
                <a key={k} href={`#/${KIND_COPY[k].path}`}>
                  <FileText size={16} aria-hidden="true" /> {KIND_COPY[k].Noun.replace(/\b\w/g, (c) => c.toUpperCase())}
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="hp-section">
          <div className="container">
            <h2>Run Your Business With Better Records</h2>
            <ul className="hp-benefits">
              {BENEFITS.map((b) => (
                <li key={b}>
                  <Check size={18} aria-hidden="true" /> {b}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
