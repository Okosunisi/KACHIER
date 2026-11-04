export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira (₦)' },
  { code: 'USD', symbol: '$', name: 'US Dollar ($)' },
  { code: 'GBP', symbol: '£', name: 'British Pound (£)' },
  { code: 'EUR', symbol: '€', name: 'Euro (€)' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi (GH₵)' },
  { code: 'KES', symbol: 'KSh ', name: 'Kenyan Shilling (KSh)' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand (R)' },
  { code: 'XOF', symbol: 'CFA ', name: 'West African CFA Franc (XOF)' },
  { code: 'XAF', symbol: 'FCFA ', name: 'Central African CFA Franc (XAF)' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar (CA$)' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar (A$)' },
];

export const DEFAULT_CURRENCY = 'NGN';

export function getCurrency(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** Formats an amount in cents as "1,234.50" (always 2 decimals, comma thousands). */
export function formatAmount(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}.${frac}`;
}

/** Formats an amount in cents with the currency symbol, e.g. "₦1,234.50". */
export function formatMoney(cents: number, code: string): string {
  return `${getCurrency(code).symbol}${formatAmount(cents)}`;
}

/** Formats a quantity string: trims trailing zeros, keeps up to 3 decimals. */
export function formatQty(value: string): string {
  const n = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 1000) / 1000);
}
