import { useState } from 'react';
import { signIn, signUp } from '../lib/cloud';
import { Input, Modal, Segmented } from './ui';

type Mode = 'signup' | 'login';
type Msg = { ok: boolean; text: string } | null;

/** Pop-up for creating an account or logging in. Calls onDone once the person has a live session. */
export function AuthModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const up = mode === 'signup';

  const close = () => {
    setMsg(null);
    onClose();
  };

  const submit = async () => {
    const e = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setMsg({ ok: false, text: 'Enter a valid email address.' });
    if (pw.length < 6) return setMsg({ ok: false, text: 'Your password needs at least 6 characters.' });
    setBusy(true);
    setMsg(null);
    try {
      if (up && !(await signUp(e, pw))) {
        setMode('login');
        setMsg({ ok: true, text: 'Account created. Check your email and tap the confirmation link, then log in here.' });
        setBusy(false);
        return;
      }
      if (!up) await signIn(e, pw);
      setPw('');
      setBusy(false);
      onDone();
      return;
    } catch (err) {
      const text = (err as Error).message;
      setMsg({ ok: false, text: /not confirmed/i.test(text) ? 'Confirm your email first. Check your inbox for the link.' : text });
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={close} title={up ? 'Create your account' : 'Log in'}>
      <p className="muted">Your projects, sales and expenses are saved in your own account, so they are safe on any phone or computer.</p>
      <Segmented
        label="Account"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setMsg(null);
        }}
        options={[
          { value: 'signup', label: 'Sign up' },
          { value: 'login', label: 'Log in' },
        ]}
      />
      {msg && (
        <div className={`bk-banner ${msg.ok ? 'ok' : 'err'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </div>
      )}
      <form
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit();
        }}
      >
        <Input label="Email" required type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={setEmail} />
        <Input
          label="Password"
          required
          type={show ? 'text' : 'password'}
          autoComplete={up ? 'new-password' : 'current-password'}
          hint="At least 6 characters"
          value={pw}
          onChange={setPw}
        />
        <label className="bk-check">
          <input type="checkbox" checked={show} onChange={(ev) => setShow(ev.target.checked)} /> Show password
        </label>
        <button type="submit" className="btn primary lg full" disabled={busy}>
          {busy ? 'Please wait...' : up ? 'Create account' : 'Log in'}
        </button>
      </form>
    </Modal>
  );
}
