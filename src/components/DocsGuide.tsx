import { useState } from 'react';
import { ArrowRight, FileText, Lightbulb, RotateCcw } from 'lucide-react';
import type { DocKind } from '../types';
import { KIND_COPY, KIND_ORDER } from '../lib/kinds';

interface Guide {
  what: string;
  when: string[];
  example: string;
  choose: string; // option text in Help Me Choose
  why: string; // short explanation after choosing
  purpose: string; // comparison table
  note?: string;
}

export const GUIDE: Record<DocKind, Guide> = {
  invoice: {
    what: 'An invoice is a document a business gives to a customer showing the amount they are expected to pay for goods or services supplied or agreed upon. It tells the customer what they are paying for, how much they owe and how to make payment.',
    when: ['When you have supplied goods and need to request payment.', 'When you have completed a service and need to communicate the amount payable.', 'When you need to formally request payment from a customer.'],
    example: 'You sell 10 bags of rice to a customer for ₦450,000. You prepare an invoice showing the items, quantities, prices and total amount the customer needs to pay.',
    choose: 'I want to request payment from my customer.',
    why: 'Use an invoice to request payment from your customer.',
    purpose: 'Requests payment',
  },
  receipt: {
    what: 'A receipt is a document given to a customer as proof that payment has been received. It confirms how much the customer paid, the date of payment and what the payment was for.',
    when: ['When a customer has paid for goods or services.', 'When you want to provide evidence of payment.', 'When you want to keep a record of money received.'],
    example: 'A customer pays you ₦50,000 for a pair of shoes. You issue a receipt confirming that you have received the money.',
    choose: 'I want to confirm that my customer has paid.',
    why: 'Use a receipt as proof that you have received payment.',
    purpose: 'Confirms payment received',
  },
  quotation: {
    what: 'A quotation is a document that shows a customer the proposed cost of goods or services before the customer agrees to proceed with the purchase. It allows the customer to know how much the job or purchase will cost before making a decision.',
    when: ['When a customer asks how much a product or service will cost.', 'Before starting a project or carrying out a job.', 'When you want to provide a formal price offer.'],
    example: 'A customer asks you to supply 20 office chairs. You prepare a quotation showing the price of each chair and the total estimated cost.',
    choose: 'I want to show my customer my prices before they buy.',
    why: 'Use a quotation to show your proposed prices before a customer agrees to buy.',
    purpose: 'Provides proposed prices',
  },
  'sales-order': {
    what: "A sales order is a document a business prepares to record and confirm a customer's order after the customer has agreed to purchase goods or services. It helps the business know what the customer ordered and what needs to be supplied.",
    when: ['When a customer confirms an order.', 'When you need to record products or services ordered.', 'When your business needs to track orders before delivery.'],
    example: 'A customer agrees to purchase 30 cartons of bottled water. You create a sales order showing the products, quantities, agreed prices and customer details.',
    choose: 'My customer has confirmed an order and I want to record it.',
    why: 'Use a sales order to record what your customer has agreed to purchase.',
    purpose: "Records a customer's confirmed order",
  },
  'purchase-order': {
    what: 'A purchase order is a document a business sends to a supplier to officially request goods or services. It tells the supplier what the business wants to buy, the quantities and the agreed prices.',
    when: ['When purchasing goods from a supplier.', 'When ordering products for your shop or business.', 'When you want a written record of what you have ordered.'],
    example: 'You own a supermarket and want to purchase 100 cartons of noodles from a wholesaler. You prepare a purchase order showing the quantities and agreed prices.',
    choose: 'I want to order goods or services from a supplier.',
    why: 'Use a purchase order to formally request goods or services from a supplier.',
    purpose: 'Requests goods or services from a supplier',
  },
  'payment-voucher': {
    what: 'A payment voucher is an internal business document used to record and authorise money paid out by a business. It provides evidence of why the business made a payment, how much was paid and who received the money.',
    when: ['When your business pays a supplier.', 'When paying for business expenses.', 'When recording money paid to workers or service providers.', 'When you need to keep evidence of business payments.'],
    example: 'Your business pays ₦80,000 for office rent. You prepare a payment voucher recording the amount, reason for payment and recipient.',
    choose: 'I want to record or authorise money my business is paying out.',
    why: 'Use a payment voucher to record or authorise business payments.',
    purpose: 'Records or authorises business payments',
  },
  'credit-note': {
    what: "A credit note is a document a business issues to a customer to reduce an amount previously charged on an invoice. It may be issued when goods are returned, an invoice contains an overcharge or a discount or adjustment is granted after invoicing.",
    when: ['When a customer returns goods.', 'When you need to correct an overcharged invoice.', 'When you grant a price reduction after issuing an invoice.', "When you need to reduce a customer's outstanding balance."],
    example: 'You invoice a customer ₦100,000 for goods, but the customer returns goods worth ₦20,000. You issue a credit note for ₦20,000 to record the reduction.',
    choose: 'I want to reduce an amount previously charged to a customer.',
    why: 'Use a credit note to record a reduction in an amount previously charged.',
    purpose: 'Records a reduction in an amount previously charged',
    note: 'Which note applies can depend on the transaction and on who issues it. If you are unsure whether to reduce or increase an earlier amount, check the original invoice first, or ask your accountant.',
  },
  'debit-note': {
    what: 'A debit note is a document used to communicate an increase or adjustment to an amount previously recorded in a business transaction. Its use depends on whether it is issued by a seller or buyer and the nature of the transaction.',
    when: ['When an additional amount needs to be charged.', 'When an earlier invoice requires an upward adjustment.', 'When recording certain purchase or supplier account adjustments.'],
    example: 'You supplied goods worth ₦100,000 to a customer but later discovered that an additional agreed charge of ₦10,000 was omitted. You issue a debit note documenting the additional amount.',
    choose: 'I need to record an additional amount or upward adjustment to a previous transaction.',
    why: 'Use a debit note to document an additional charge or upward adjustment.',
    purpose: 'Records an additional charge or upward adjustment',
    note: 'A debit note is used differently depending on whether the seller or the buyer issues it. If you are unsure, check the original transaction first, or ask your accountant.',
  },
  waybill: {
    what: 'A waybill is a document that accompanies goods being transported or delivered from one location to another. It contains information about the sender, receiver, goods being transported and delivery details.',
    when: ['When transporting goods to a customer.', 'When sending products to another branch.', 'When using a delivery company or transport service.', 'When you need a record of goods dispatched.'],
    example: 'You sell 15 cartons of drinks to a customer in another town. You prepare a waybill showing the quantity of goods, sender, receiver and delivery destination.',
    choose: 'I want to document goods being transported or delivered.',
    why: 'Use a waybill to record goods being transported or delivered.',
    purpose: 'Documents goods being transported or delivered',
  },
};

const upper = (k: DocKind) => KIND_COPY[k].Noun.replace(/\b\w/g, (c) => c.toUpperCase());

/** Small information area shown at the top of the Business Documents generators. */
export function DocsIntro() {
  return (
    <section className="docs-intro" aria-labelledby="docs-intro-title">
      <div>
        <h2 id="docs-intro-title">
          <Lightbulb size={18} aria-hidden="true" /> Not Sure Which Document to Use?
        </h2>
        <p>
          Different business documents serve different purposes. Whether you are requesting payment, confirming payment, providing a price estimate, recording an order, documenting business expenses or tracking goods being delivered, choosing the right document helps you maintain proper business records.
        </p>
        <p>Learn what each document means and when to use it before generating one.</p>
      </div>
      <a className="btn primary" href="#/documents" id="understand-docs-btn">
        Understand Business Documents <ArrowRight size={16} />
      </a>
    </section>
  );
}

function HelpMeChoose() {
  const [pick, setPick] = useState<DocKind | null>(null);
  return (
    <section className="dg-block" id="help-me-choose" aria-labelledby="hmc-title">
      <h2 id="hmc-title">Help Me Choose</h2>
      <p className="muted">Not sure which business document you need? Tell us what you want to do and KACHIER will recommend the right document.</p>
      {!pick ? (
        <>
          <h3 className="dg-q">What do you want to do?</h3>
          <div className="hmc-options">
            {KIND_ORDER.map((k) => (
              <button key={k} type="button" className="hmc-opt" data-kind={k} onClick={() => setPick(k)}>
                {GUIDE[k].choose}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="hmc-result" role="status" data-testid="hmc-result">
          <span className="pill">Recommended document</span>
          <h3>{upper(pick)}</h3>
          <p>{GUIDE[pick].why}</p>
          {GUIDE[pick].note && <p className="hmc-note">{GUIDE[pick].note}</p>}
          <div className="hmc-actions">
            <a className="btn primary" href={`#/${KIND_COPY[pick].path}`} id="hmc-generate">
              Generate This Document
            </a>
            <button type="button" className="btn outline" id="hmc-restart" onClick={() => setPick(null)}>
              <RotateCcw size={16} /> Start Again
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The educational page: explanations, Help Me Choose and the comparison table. */
export function DocsGuide() {
  return (
    <main className="app-shell docs-guide">
      <div className="container">
        <header className="dg-head">
          <h1>Understand Business Documents</h1>
          <p className="muted">Learn what each document means and when to use it, then generate it.</p>
          <a className="btn outline sm" href="#/invoice">← Back to document generators</a>
        </header>

        <HelpMeChoose />

        <section className="dg-block" id="document-explanations" aria-labelledby="exp-title">
          <h2 id="exp-title">What Each Document Means</h2>
          <div className="dg-cards">
            {KIND_ORDER.map((k, i) => {
              const g = GUIDE[k];
              return (
                <article key={k} className="dg-card" id={`explain-${k}`}>
                  <h3>
                    <span className="step">{i + 1}</span> {upper(k).toUpperCase()}
                  </h3>
                  <h4>What is {/^[aeiou]/i.test(KIND_COPY[k].noun) ? 'an' : 'a'} {upper(k)}?</h4>
                  <p>{g.what}</p>
                  <h4>When should you use it?</h4>
                  <ul>
                    {g.when.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <h4>Example</h4>
                  <p>{g.example}</p>
                  <a className="btn primary full" href={`#/${KIND_COPY[k].path}`}>
                    <FileText size={16} /> Generate {upper(k)}
                  </a>
                </article>
              );
            })}
          </div>
        </section>

        <section className="dg-block" id="document-differences" aria-labelledby="diff-title">
          <h2 id="diff-title">What Is the Difference Between These Documents?</h2>
          <div className="dg-table-wrap">
            <table className="dg-table">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Main Purpose</th>
                </tr>
              </thead>
              <tbody>
                {KIND_ORDER.map((k) => (
                  <tr key={k}>
                    <th scope="row">{upper(k)}</th>
                    <td>{GUIDE[k].purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <p className="hint">This guide is general information to help you choose a document. It is not legal or tax advice. For your own tax obligations, speak to a qualified adviser or the Nigeria Revenue Service.</p>
      </div>
    </main>
  );
}
