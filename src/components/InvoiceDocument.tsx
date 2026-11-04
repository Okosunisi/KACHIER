import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { DocData } from '../types';
import { buildSummary, computeTotals } from '../lib/calc';
import { formatMoney } from '../lib/currency';
import { buildModel, itemCells } from '../lib/docModel';
import { STATUS_COLORS, THEMES } from '../lib/theme';

/** Shows the value, or a faint placeholder while the field is still empty. */
function V({ v, ph }: { v: string; ph: string }) {
  return v.trim() ? <>{v}</> : <span className="ph">{ph}</span>;
}

function PartyBlock({ label, name, address, phone, email, namePh, taxId, regNo }: {
  label: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  namePh: string;
  taxId?: string;
  regNo?: string;
}) {
  return (
    <div className="party">
      <h4 className="lbl">{label}</h4>
      <div className="p-name">
        <V v={name} ph={namePh} />
      </div>
      {address.trim() && <div className="pre">{address}</div>}
      {phone.trim() && <div>{phone}</div>}
      {email.trim() && <div>{email}</div>}
      {taxId?.trim() && <div>Tax ID: {taxId.trim()}</div>}
      {regNo?.trim() && <div>RC No.: {regNo.trim()}</div>}
    </div>
  );
}

export function InvoiceDocument({ data }: { data: DocData }) {
  const totals = useMemo(() => computeTotals(data), [data]);
  const summary = useMemo(() => buildSummary(data, totals), [data, totals]);
  const model = useMemo(() => buildModel(data), [data]);
  const theme = THEMES[data.template];
  const sc = model.statusKey ? STATUS_COLORS[model.statusKey] : null;

  const vars = {
    '--ink': theme.ink,
    '--text': theme.text,
    '--muted': theme.muted,
    '--accent': theme.accent,
    '--rule': theme.rule,
    '--soft': theme.soft,
  } as CSSProperties;

  const logo = data.logo ? <img className="logo" src={data.logo.dataUrl} alt="" /> : null;
  const bizName = <V v={data.businessName} ph="Your Business Name" />;
  const badge = sc ? (
    <span className="badge" style={{ color: sc.fg, background: sc.bg }}>
      {model.statusText}
    </span>
  ) : null;
  const statusCell: Array<[string, ReactNode]> = sc
    ? [['Status', <span key="s" style={{ color: sc.fg }}>{model.statusText}</span>]]
    : [];

  let header: ReactNode;
  if (data.template === 'classic') {
    header = (
      <>
        <header className="hdr">
          <div className="brand">
            {logo}
            <div className="biz-name">{bizName}</div>
          </div>
          <div className="hdr-right">
            <div className="doc-title">{model.title}</div>
            <dl className="meta">
              {model.fields.map(([k, v]) => (
                <div key={k} className="meta-row">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {badge}
          </div>
        </header>
        <div className="hdr-rule" />
      </>
    );
  } else if (data.template === 'minimal') {
    const cells: Array<[string, ReactNode]> = [...model.fields.map(([k, v]) => [k, v] as [string, ReactNode]), ...statusCell];
    header = (
      <>
        <header className="hdr">
          <div className="brand">
            {logo}
            <div className="biz-name">{bizName}</div>
          </div>
          <div className="doc-title">{model.title}</div>
        </header>
        <div className="meta-strip" style={{ '--cols': cells.length } as CSSProperties}>
          {cells.map(([k, v]) => (
            <div key={k}>
              <div className="lbl">{k}</div>
              <div className="val">{v}</div>
            </div>
          ))}
        </div>
      </>
    );
  } else {
    const [numberField, ...rest] = model.fields;
    const cards: Array<[string, ReactNode]> = [...rest.map(([k, v]) => [k, v] as [string, ReactNode]), ...statusCell];
    header = (
      <>
        <header className="hdr-block">
          <div className="hdr-left">
            {logo && <div className="logo-tile">{logo}</div>}
            <div className="biz-name">{bizName}</div>
          </div>
          <div className="hdr-right">
            <div className="doc-title">{model.title}</div>
            <div className="doc-no">{numberField[1]}</div>
          </div>
        </header>
        <div className="meta-cards" style={{ '--cols': cards.length } as CSSProperties}>
          {cards.map(([k, v]) => (
            <div key={k} className="meta-card">
              <div className="lbl">{k}</div>
              <div className="val">{v}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  const hasNotes = !!model.notes;
  const hasTerms = !!model.terms;

  return (
    <article className={`doc tpl-${data.template}`} data-kind={data.kind} data-longtitle={model.title.length > 9 ? 'true' : undefined} style={vars}>
      {header}

      <section className="parties">
        <PartyBlock
          label={model.fromLabel}
          name={data.businessName}
          namePh="Your Business Name"
          address={data.businessAddress}
          phone={data.businessPhone}
          email={data.businessEmail}
          taxId={data.businessTaxId}
          regNo={data.businessRegNo}
        />
        <PartyBlock
          label={model.toLabel}
          name={data.customerName}
          namePh={model.toPlaceholder}
          address={data.customerAddress}
          phone={data.customerPhone}
          email={data.customerEmail}
          taxId={data.customerTaxId}
        />
      </section>

      {model.route && (
        <section className="route" aria-label="Route">
          <div>
            <h4 className="lbl">From</h4>
            <div className="route-place">{model.route.from}</div>
          </div>
          <svg className="route-arrow" viewBox="0 0 48 12" aria-hidden="true">
            <path d="M1 6h44M40 1.5 46 6l-6 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="right">
            <h4 className="lbl">To</h4>
            <div className="route-place">{model.route.to}</div>
          </div>
        </section>
      )}

      <table className="items">
        <thead>
          <tr>
            <th className="c-desc">Description</th>
            <th className="c-qty">{model.columns[0]}</th>
            <th className="c-price">{model.columns[1]}</th>
            <th className="c-amt">{model.columns[2]}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => {
            const cells = itemCells(data, totals, i);
            return (
            <tr key={it.id}>
              <td className="c-desc">
                <div className="it-name">
                  <V v={it.description} ph="Item description" />
                </div>
                {it.details.trim() && <div className="it-det pre">{it.details}</div>}
              </td>
              <td className="c-qty">{cells[0]}</td>
              <td className="c-price">{cells[1]}</td>
              <td className="c-amt">{cells[2]}</td>
            </tr>
            );
          })}
        </tbody>
      </table>

      <section className="summary">
        <div className="pay-wrap">
          {model.pay && (
            <div className="pay">
              <h4 className="lbl">{model.pay.title}</h4>
              {model.pay.rows.length > 0 && (
                <dl>
                  {model.pay.rows.map((r) => (
                    <div key={r.label} className="pay-row">
                      <dt>{r.label}</dt>
                      <dd className={r.strong ? 'strong' : ''}>{r.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {model.pay.note && <div className="pay-note pre">{model.pay.note}</div>}
            </div>
          )}
        </div>
        <div className="totals">
          {summary.map((r, i) => (
            <div key={i} className={`t-row ${r.kind}`}>
              <span>{r.label}</span>
              <span className="amt">
                {r.text !== undefined ? r.text : `${r.negative ? '−' : ''}${formatMoney(r.amount, data.currency)}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      {(hasNotes || hasTerms) && (
        <section className={`notes${hasNotes && hasTerms ? '' : ' single'}`}>
          {hasNotes && (
            <div>
              <h4 className="lbl">{model.notesLabel}</h4>
              <div className="pre">{model.notes}</div>
            </div>
          )}
          {hasTerms && (
            <div>
              <h4 className="lbl">Terms &amp; conditions</h4>
              <div className="pre">{model.terms}</div>
            </div>
          )}
        </section>
      )}

      {model.taxInfo && (
        <section className="notes single">
          <div>
            <h4 className="lbl">Tax information</h4>
            <div className="pre">{model.taxInfo}</div>
          </div>
        </section>
      )}

      {data.nrsQrDataUrl?.trim() && (
        <section className="notes single">
          <div>
            <h4 className="lbl">NRS QR code</h4>
            <img src={data.nrsQrDataUrl} alt="Official NRS QR code" style={{ maxWidth: 140, maxHeight: 140 }} />
          </div>
        </section>
      )}

      {model.signatures.length > 0 && (
        <section className="sigs" style={{ '--cols': model.signatures.length } as CSSProperties}>
          {model.signatures.map((s) => (
            <div key={s} className="sig">
              <h4 className="lbl">{s}</h4>
              <div className="sig-line" />
              <div className="sig-cap">Name &amp; signature</div>
              <div className="sig-line short" />
              <div className="sig-cap">Date</div>
            </div>
          ))}
        </section>
      )}

      <footer className="doc-foot">{model.footer}</footer>
    </article>
  );
}
