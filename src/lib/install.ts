/** Chrome and Edge fire this once the site can be installed. We keep it so the home page can offer it on tap. */
export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: InstallEvent | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const getInstallEvent = (): InstallEvent | null => deferred;

export function onInstallChange(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome;
}
