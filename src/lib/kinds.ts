import type { DocKind } from '../types';

/** Wording that changes from one document type to the next. Used by the editor and the homepage. */
export interface KindCopy {
  /** lower case: "invoice" */
  noun: string;
  /** capitalised: "Invoice" */
  Noun: string;
  numberLabel: string;
  dateLabel: string;
  businessTitle: string;
  partyTitle: string;
  partyNameLabel: string;
  partyNamePlaceholder: string;
  /** "Billed to" style label used in the confirmation window */
  partyShort: string;
  /** Route / hash name, e.g. #/invoice */
  path: string;
  /** Label and hint for the optional `reference` field (not every document uses it). */
  refLabel?: string;
  refPlaceholder?: string;
}

export const KIND_COPY: Record<DocKind, KindCopy> = {
  invoice: {
    noun: 'invoice',
    Noun: 'Invoice',
    numberLabel: 'Invoice number',
    dateLabel: 'Issue date',
    businessTitle: 'Your business',
    partyTitle: 'Customer',
    partyNameLabel: 'Customer name',
    partyNamePlaceholder: 'e.g. Emeka Okafor',
    partyShort: 'Billed to',
    path: 'invoice',
  },
  receipt: {
    noun: 'receipt',
    Noun: 'Receipt',
    numberLabel: 'Receipt number',
    dateLabel: 'Date',
    businessTitle: 'Your business',
    partyTitle: 'Received from',
    partyNameLabel: 'Name of payer',
    partyNamePlaceholder: 'Who paid you?',
    partyShort: 'Received from',
    path: 'receipt',
  },
  quotation: {
    noun: 'quotation',
    Noun: 'Quotation',
    numberLabel: 'Quotation number',
    dateLabel: 'Issue date',
    businessTitle: 'Your business',
    partyTitle: 'Customer',
    partyNameLabel: 'Customer name',
    partyNamePlaceholder: 'Who is this quote for?',
    partyShort: 'Prepared for',
    path: 'quotation',
  },
  waybill: {
    noun: 'waybill',
    Noun: 'Waybill',
    numberLabel: 'Waybill number',
    dateLabel: 'Dispatch date',
    businessTitle: 'Sender (your business)',
    partyTitle: 'Receiver',
    partyNameLabel: 'Receiver name',
    partyNamePlaceholder: 'Who will receive the goods?',
    partyShort: 'Receiver',
    path: 'waybill',
  },
  'purchase-order': {
    noun: 'purchase order',
    Noun: 'Purchase order',
    numberLabel: 'PO number',
    dateLabel: 'Order date',
    businessTitle: 'Buyer (your business)',
    partyTitle: 'Supplier',
    partyNameLabel: 'Supplier name',
    partyNamePlaceholder: 'Who are you ordering from?',
    partyShort: 'Supplier',
    path: 'purchase-order',
  },
  'payment-voucher': {
    noun: 'payment voucher',
    Noun: 'Payment voucher',
    numberLabel: 'Voucher number',
    dateLabel: 'Payment date',
    businessTitle: 'Paid by (your business)',
    partyTitle: 'Paid to',
    partyNameLabel: 'Name of payee',
    partyNamePlaceholder: 'Who is being paid?',
    partyShort: 'Paid to',
    path: 'payment-voucher',
    refLabel: 'Cheque or transfer reference (optional)',
    refPlaceholder: 'e.g. cheque number or transfer reference',
  },
  'credit-note': {
    noun: 'credit note',
    Noun: 'Credit note',
    numberLabel: 'Credit note number',
    dateLabel: 'Date',
    businessTitle: 'Your business',
    partyTitle: 'Customer',
    partyNameLabel: 'Customer name',
    partyNamePlaceholder: 'Who is receiving the credit?',
    partyShort: 'Credit to',
    path: 'credit-note',
    refLabel: 'Original invoice number (optional)',
    refPlaceholder: 'e.g. INV-2026-0012',
  },
  'debit-note': {
    noun: 'debit note',
    Noun: 'Debit note',
    numberLabel: 'Debit note number',
    dateLabel: 'Date',
    businessTitle: 'Your business',
    partyTitle: 'Customer',
    partyNameLabel: 'Customer name',
    partyNamePlaceholder: 'Who is being debited?',
    partyShort: 'Debit to',
    path: 'debit-note',
    refLabel: 'Original invoice number (optional)',
    refPlaceholder: 'e.g. INV-2026-0012',
  },
  'sales-order': {
    noun: 'sales order',
    Noun: 'Sales order',
    numberLabel: 'Order number',
    dateLabel: 'Order date',
    businessTitle: 'Your business',
    partyTitle: 'Customer',
    partyNameLabel: 'Customer name',
    partyNamePlaceholder: 'Who placed the order?',
    partyShort: 'Sold to',
    path: 'sales-order',
  },
};

export const KIND_ORDER: DocKind[] = [
  'invoice',
  'receipt',
  'quotation',
  'sales-order',
  'purchase-order',
  'payment-voucher',
  'credit-note',
  'debit-note',
  'waybill',
];

export const NUMBER_PREFIX: Record<DocKind, string> = {
  invoice: 'INV',
  receipt: 'RCT',
  quotation: 'QTN',
  waybill: 'WB',
  'purchase-order': 'PO',
  'payment-voucher': 'PV',
  'credit-note': 'CN',
  'debit-note': 'DN',
  'sales-order': 'SO',
};

/** Documents that show a second date: due date, valid-until date or delivery date. */
export const DUE_LABEL: Partial<Record<DocKind, string>> = {
  invoice: 'Due date',
  quotation: 'Valid until',
  'purchase-order': 'Delivery date',
  'sales-order': 'Delivery date',
};

/** Words for the big total line at the bottom of a document (invoices decide this from payment status). */
export const TOTAL_LABEL: Partial<Record<DocKind, string>> = {
  receipt: 'Amount received',
  quotation: 'Quotation total',
  'purchase-order': 'Order total',
  'payment-voucher': 'Amount paid',
  'credit-note': 'Total credit',
  'debit-note': 'Total debit',
  'sales-order': 'Order total',
};


/** Short help line shown next to the Generate button of each generator. */
export const KIND_HELP: Record<DocKind, string> = {
  invoice: 'Use this document to request payment from your customer.',
  receipt: 'Use this document to confirm that you have received payment.',
  quotation: 'Use this document to show your proposed prices before a customer agrees to buy.',
  'sales-order': "Use this document to record a customer's confirmed order.",
  'purchase-order': 'Use this document to request goods or services from a supplier.',
  'payment-voucher': 'Use this document to record or authorise business payments.',
  'credit-note': 'Use this document to record a reduction in an amount previously charged.',
  'debit-note': 'Use this document to record an additional charge or upward adjustment.',
  waybill: 'Use this document to record goods being transported or delivered.',
};
