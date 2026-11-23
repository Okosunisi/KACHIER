import { useEffect, useState } from 'react';
import { COOKIE_SETTINGS_EVENT, getConsent, setConsent } from '../lib/analytics';

/** Asks once whether Google Analytics may run. The footer's Cookie settings link reopens it. */
export function CookieNotice() {
  const [open, setOpen] = useState(getConsent() === null);
  const [current, setCurrent] = useState(getConsent());

  useEffect(() => {
    const show = () => {
      setCurrent(getConsent());
      setOpen(true);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, show);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, show);
  }, []);

  if (!open) return null;

  const choose = (value: 'granted' | 'denied') => {
    setConsent(value);
    setOpen(false);
  };

  return (
    <section className="cookie-card" role="region" aria-label="Cookie choices">
      <p className="cookie-text">
        <b>Analytics cookies.</b> We use Google Analytics to count visits and see which pages are used. Your sales, expenses and documents are never sent. <a href="#/privacy">Privacy Policy</a>.
        {current && <> Analytics is currently {current === 'granted' ? 'on' : 'off'}.</>}
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn outline" onClick={() => choose('denied')}>
          Decline
        </button>
        <button type="button" className="btn primary" onClick={() => choose('granted')}>
          Accept
        </button>
      </div>
    </section>
  );
}
