import { useEffect, useMemo, useState } from 'react';
import { Share, X } from 'lucide-react';
import { getInstallEvent, onInstallChange, promptInstall } from '../lib/install';

const DISMISS_KEY = 'kachier:install-dismissed';
const DISMISS_DAYS = 14;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const recentlyDismissed = () => {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY));
    return t > 0 && Date.now() - t < DISMISS_DAYS * 864e5;
  } catch {
    return false;
  }
};

/** Pop-up on the home page asking phone users to add KACHIER to their home screen. */
export function InstallPrompt() {
  const [canInstall, setCanInstall] = useState(getInstallEvent() !== null);
  const [ready, setReady] = useState(false);
  const [steps, setSteps] = useState(false);
  const [closed, setClosed] = useState(false);
  const ios = useMemo(isIos, []);
  const eligible = useMemo(() => !isStandalone() && !recentlyDismissed() && window.matchMedia('(pointer: coarse)').matches, []);

  useEffect(() => onInstallChange(() => setCanInstall(getInstallEvent() !== null)), []);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setClosed(true);
  };

  const install = async () => {
    if (ios) {
      if (steps) dismiss();
      else setSteps(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === 'accepted') setClosed(true);
    else dismiss();
  };

  if (!eligible || closed || !ready || !(canInstall || ios)) return null;

  return (
    <section className="install-card" role="region" aria-label="Install KACHIER">
      <img className="install-icon" src="/icon-192.png" alt="" width={44} height={44} />
      <div className="install-copy">
        <h2>Put KACHIER on your home screen</h2>
        <p>Full screen and faster to open, like a real app.</p>
      </div>
      <button type="button" className="install-x" aria-label="Close" onClick={dismiss}>
        <X size={18} aria-hidden="true" />
      </button>
      {ios && steps && (
        <ol className="install-steps">
          <li>
            Tap the <Share size={16} aria-label="Share" /> Share button at the bottom of Safari.
          </li>
          <li>
            Scroll down and tap <b>Add to Home Screen</b>.
          </li>
          <li>
            Tap <b>Add</b>.
          </li>
        </ol>
      )}
      <button type="button" className="btn primary lg full install-btn" onClick={() => void install()}>
        {ios ? (steps ? 'Got it' : 'Show me how') : 'Install'}
      </button>
    </section>
  );
}
