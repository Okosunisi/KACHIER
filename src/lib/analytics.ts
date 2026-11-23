/** Google Analytics 4 for kachier.com. It loads only on the live site and only after the visitor taps Accept on the cookie notice. */
const GA_ID = 'G-QEZFKLJJJ5';
const CONSENT_KEY = 'kachier:analytics-consent';
const DISABLE_KEY = `ga-disable-${GA_ID}`;
export const COOKIE_SETTINGS_EVENT = 'kachier:cookie-settings';

export type Consent = 'granted' | 'denied' | null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const flags = window as unknown as Record<string, unknown>;

export function getConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

let current: { path: string; title: string } | null = null;
let last: string | null = null;

function send(path: string, title: string): void {
  window.gtag?.('event', 'page_view', {
    page_location: `${window.location.origin}${path}`,
    page_title: title,
    ...(last ? { page_referrer: `${window.location.origin}${last}` } : {}),
  });
  last = path;
}

function start(): void {
  if (!import.meta.env.PROD) return;
  flags[DISABLE_KEY] = false;
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  // gtag.js only understands the `arguments` object, so this cannot be an arrow function with rest parameters.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  // The site uses #/ addresses, so page views are sent by hand on every page change (see trackPageView).
  window.gtag('config', GA_ID, { send_page_view: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  if (current) send(current.path, current.title);
}

function stop(): void {
  flags[DISABLE_KEY] = true;
  const host = window.location.hostname;
  const base = host.replace(/^www\./, '');
  for (const name of ['_ga', `_ga_${GA_ID.slice(2)}`]) {
    for (const domain of ['', host, `.${base}`]) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}

/** Called once at startup: turns tracking on only if the visitor already accepted. */
export function initAnalytics(): void {
  if (getConsent() === 'granted') start();
}

export function setConsent(value: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
  if (value === 'granted') start();
  else stop();
}

/** Reopens the cookie notice (used by the footer link). */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}

/** Records one page view. `path` is a clean page path such as /sales: never a project id, token or query string. */
export function trackPageView(path: string, title: string): void {
  current = { path, title };
  if (!window.gtag || flags[DISABLE_KEY] === true) return;
  send(path, title);
}
