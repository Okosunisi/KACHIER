/**
 * Talks to Supabase with plain fetch (no extra package needed).
 * Turned on only when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set. Otherwise records stay on the device.
 * Only the public "anon" key is used here. Never put the service-role key in this project.
 */
const URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
export const cloudOn = Boolean(URL && KEY);

interface Session { access_token: string; refresh_token: string; expires_at: number; email: string }
const SK = 'kobodox:session:v1';
function readS(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SK) || 'null');
  } catch {
    return null;
  }
}
function writeS(s: Session | null) {
  try {
    if (s) localStorage.setItem(SK, JSON.stringify(s));
    else localStorage.removeItem(SK);
  } catch {
    /* ignore */
  }
}
export const sessionEmail = (): string | null => readS()?.email ?? null;

async function auth(path: string, body: unknown) {
  const r = await fetch(`${URL}/auth/v1/${path}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'Something went wrong. Please try again.');
  return j;
}
const toSession = (j: any, email: string): Session => ({
  access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600), email: j.user?.email ?? email,
});
export async function signIn(email: string, password: string) {
  writeS(toSession(await auth('token?grant_type=password', { email, password }), email));
}
/** Returns false when the person must confirm their email before signing in. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const j = await auth('signup', { email, password });
  if (j.access_token) { writeS(toSession(j, email)); return true; }
  return false;
}
export const signOut = () => writeS(null);

async function token(): Promise<string> {
  let s = readS();
  if (!s) throw new Error('Please sign in again.');
  if (s.expires_at - 60 < Date.now() / 1000) {
    try {
      s = toSession(await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token }), s.email);
      writeS(s);
    } catch {
      writeS(null);
      throw new Error('Your login expired. Please sign in again.');
    }
  }
  return s.access_token;
}
export async function rest<T = void>(path: string, init: { method?: string; body?: unknown; upsert?: boolean } = {}): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: { apikey: KEY, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', Prefer: init.upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || 'Could not reach your records. Check your internet and try again.');
  }
  return (!init.method || init.method === 'GET' ? await r.json() : undefined) as T;
}
