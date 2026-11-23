/** Google Analytics 4 for kachier.com. Runs only on the live site, never in local development. */
const GA_ID = 'G-QEZFKLJJJ5';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function initAnalytics(): void {
  if (!import.meta.env.PROD || window.gtag) return;
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
}

let last: string | null = null;

/** Records one page view. `path` is a clean page path such as /sales: never a project id, token or query string. */
export function trackPageView(path: string, title: string): void {
  window.gtag?.('event', 'page_view', {
    page_location: `${window.location.origin}${path}`,
    page_title: title,
    ...(last ? { page_referrer: `${window.location.origin}${last}` } : {}),
  });
  last = path;
}
