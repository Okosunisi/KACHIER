import { Check, FileText, ShieldCheck } from 'lucide-react';
import type { DocKind } from '../types';
import { KIND_COPY } from '../lib/kinds';

/** Generators that offer the NRS Standard / Normal Business Document choice. */
export const MODE_KINDS: DocKind[] = ['invoice', 'sales-order', 'credit-note'];

interface Props {
  kind: DocKind;
  nrs: boolean;
  onChange: (nrs: boolean) => void;
}

export function DocModeSelect({ kind, nrs, onChange }: Props) {
  const noun = KIND_COPY[kind].noun;
  const opts = [
    {
      nrs: true,
      Icon: ShieldCheck,
      label: 'NRS Standard',
      desc: 'For businesses that need documents structured according to applicable Nigeria Revenue Service (NRS) e-invoicing requirements.',
    },
    {
      nrs: false,
      Icon: FileText,
      label: 'Normal Business Document',
      desc: 'For businesses that want to generate regular business documents without NRS e-invoicing integration.',
    },
  ];
  return (
    <section className="card mode-select" aria-labelledby="mode-title" data-testid="mode-select">
      <h2 className="card-title" id="mode-title">
        Choose document type
      </h2>
      <div className="mode-options" role="radiogroup" aria-labelledby="mode-title">
        {opts.map((o) => {
          const on = nrs === o.nrs;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={on}
              className={`mode-opt${on ? ' on' : ''}`}
              data-mode={o.nrs ? 'nrs' : 'normal'}
              onClick={() => onChange(o.nrs)}
            >
              <span className="mode-ico">
                <o.Icon size={20} aria-hidden="true" />
              </span>
              <span className="mode-txt">
                <strong>{o.label}</strong>
                <span>{o.desc}</span>
              </span>
              {on && <Check size={18} className="mode-check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="hint mode-note" data-testid="mode-note">
        {nrs ? (
          kind === 'sales-order' ? (
            <>A sales order is not itself an NRS e-invoice. This option keeps your sales order ready with seller and buyer Tax IDs. The invoice you raise from it is the document that goes through NRS. KACHIER does not validate, stamp or transmit anything to NRS.</>
          ) : (
            <>KACHIER prepares your {noun} data in an NRS-compatible structure and lets you add official NRS details you receive. It does not validate, stamp or transmit anything to NRS, so this document is not NRS-validated unless you add official details received from NRS.</>
          )
        ) : (
          <>A regular {noun} for your business records. Not every business needs NRS e-invoicing. You can switch to NRS Standard any time before you generate.</>
        )}
      </p>
    </section>
  );
}
