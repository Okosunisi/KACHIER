import type { DocData, DocKind, PaymentStatus, TemplateId } from '../types';
import { addDays, todayISO } from './dates';
import { NUMBER_PREFIX } from './kinds';
import { createDefaultDoc, newItem } from './storage';

/** Realistic demo content used on the homepage and by the "Fill with sample data" button. */
export function sampleDoc(kind: DocKind = 'invoice', template: TemplateId = 'classic', status: PaymentStatus = 'unpaid'): DocData {
  const today = todayISO();
  const isInvoice = kind === 'invoice';
  const isPO = kind === 'purchase-order';
  const isVoucher = kind === 'payment-voucher';
  const isNote = kind === 'credit-note' || kind === 'debit-note';
  const credit = kind === 'credit-note';
  const plain = isVoucher || isNote; // no discount or extra charges on these
  const itemSets: Record<string, Array<[string, string, string, string]>> = {
    'purchase-order': [
      ['Premium upholstery fabric', 'Grey linen, 150 cm wide (per metre)', '60', '6500'],
      ['Sofa frame, hardwood', 'Seasoned, 3-seater', '2', '85000'],
      ['Curtain rails, brass', '3 m, with fittings', '6', '12000'],
    ],
    'payment-voucher': [
      ['Hardwood sofa frames', 'Supplier invoice INV-8841', '2', '85000'],
      ['Transport of materials', 'Enugu to Lagos', '1', '30000'],
    ],
    'credit-note': [['Decorative lamps returned', 'Two lamps damaged on delivery', '2', '18000']],
    'debit-note': [['Extra installation hours', 'Work done outside the original quotation', '6', '7500']],
  };
  const set = itemSets[kind];
  const demo = (
    set ?? [
      ['Interior design consultation', 'Space planning and mood board for the main lounge', '1', '150000'],
      ['Custom 3-seater sofa', 'Premium fabric, delivered and installed', '2', '325000'],
      ['Curtains and rail installation', '', '1', '85000'],
      ['Project coordination (hours)', '', '12', '7500'],
    ]
  ).map(([description, details, qty, price], i) => ({ ...newItem(), id: `s${i + 1}`, description, details, qty, price, unit: '', weight: '' }));
  const party = isPO
    ? { name: 'Lagos Fabrics & Furnishings Ltd', phone: '+234 807 555 0120', email: 'sales@lagosfabrics.ng', address: '8 Eric Moore Road, Surulere\nLagos, Nigeria' }
    : isVoucher
      ? { name: 'Ifeanyi Woodworks Ltd', phone: '+234 806 555 0133', email: 'accounts@ifeanyiwoodworks.ng', address: '3 Zik Avenue\nEnugu, Nigeria' }
      : { name: 'Emeka Okafor Properties', phone: '+234 809 555 0188', email: 'accounts@okaforproperties.ng', address: '27 Admiralty Way, Lekki Phase 1\nLagos, Nigeria' };
  return {
    ...createDefaultDoc(kind),
    kind,
    template,
    businessName: 'Adaeze Interiors Ltd',
    logo: null,
    businessPhone: '+234 803 555 0142',
    businessEmail: 'billing@adaezeinteriors.ng',
    businessAddress: '14 Ogui Road, Independence Layout\nEnugu, Nigeria',
    businessTaxId: '0123456789012',
    businessCity: 'Enugu',
    customerCity: 'Lagos',
    businessRegNo: 'RC 1234567',

    customerName: party.name,
    customerPhone: party.phone,
    customerEmail: party.email,
    customerAddress: party.address,
    customerTaxId: isPO || isVoucher ? '' : '9876543210123',

    number: kind === 'waybill' ? 'WB-2026-0031' : kind === 'quotation' ? 'QTN-2026-0005' : isInvoice ? 'INV-2026-0012' : kind === 'receipt' ? 'RCT-2026-0007' : `${NUMBER_PREFIX[kind]}-2026-0008`,
    issueDate: today,
    dueDate: addDays(today, kind === 'quotation' ? 30 : 14),
    currency: 'NGN',

    items:
      kind === 'waybill'
        ? [
            { ...newItem(), id: 's1', description: 'Custom 3-seater sofa', details: 'Wrapped and crated, handle with care', qty: '2', price: '', unit: 'crates', weight: '84' },
            { ...newItem(), id: 's2', description: 'Curtains and rails', details: '', qty: '6', price: '', unit: 'cartons', weight: '36' },
            { ...newItem(), id: 's3', description: 'Decorative lamps', details: 'Fragile', qty: '4', price: '', unit: 'boxes', weight: '18.5' },
          ]
        : demo,
    discountMode: 'percent',
    discountValue: plain ? '' : '5',
    taxLabel: 'VAT',
    taxRate: isVoucher ? '' : '7.5',
    charges: plain ? [] : [{ id: 'c1', label: 'Delivery', amount: '15000' }],

    status: kind === 'receipt' ? 'paid' : status,
    amountPaid: status === 'partial' ? '400000' : '',

    paymentMethod: 'Bank transfer',
    reference: isNote ? 'INV-2026-0012' : 'TRF-88213045',

    bankName: 'Zenith Bank',
    accountName: 'Adaeze Interiors Ltd',
    accountNumber: '1012345678',
    paymentInstructions: isPO
      ? 'Deliver to our workshop at 14 Ogui Road, Enugu. Call before arrival and quote the PO number on your delivery note.'
      : kind === 'quotation'
        ? 'Pay the deposit into the account above and send us the receipt.'
        : 'Please use the invoice number as your payment reference.',

    notes:
      kind === 'waybill'
        ? 'Call the receiver 30 minutes before arrival. Deliver to the site manager.'
        : isPO
          ? 'Please send your invoice with the goods.'
          : isVoucher
            ? 'Part payment for sofa frames and transport of materials for the Okafor Properties project.'
            : isNote
              ? credit
                ? 'Two lamps arrived damaged and were returned. This credit is applied against the invoice above.'
                : 'Installation hours beyond the original scope were completed at the customer\'s request.'
              : kind === 'sales-order'
                ? 'Order confirmed by phone. Delivery and installation to follow the agreed schedule.'
                : kind === 'quotation'
          ? 'Prices include delivery within Lagos. Installation can start within 7 days of acceptance.'
          : 'Thank you for choosing Adaeze Interiors. We enjoyed working on this project with you.',
    terms:
      kind === 'waybill'
        ? "Goods are carried at the owner's risk unless insured. The receiver must check the goods on delivery and note any damage or shortage on this waybill before signing."
        : kind === 'quotation'
          ? 'This quotation is valid until the date shown above. A 60% deposit confirms the order, with the balance due on delivery.'
          : isPO
            ? 'Please deliver the goods to the address shown by the delivery date. Goods that do not match this order may be rejected.'
            : isVoucher || isNote
              ? ''
              : 'Payment is due within 14 days of the issue date. Goods remain the property of the seller until paid in full.',

    origin: 'Enugu',
    destination: 'Lagos',
    transportMode: 'Road',
    vehicleNo: 'ENU 482 XA',
    driverName: 'Chukwudi Eze',
    driverPhone: '+234 802 555 0166',
    expectedDate: addDays(today, 2),
    shipmentStatus: 'in-transit',
    freightCharge: '45000',
    freightPayer: 'sender',
    declaredValue: '1200000',
  };
}
