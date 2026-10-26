'use client';
import Brand from '../brand';
import AccountNav from '../account-nav';
﻿
import { FormEvent, useState } from 'react';
import PasswordField from '../password-field';
import { api, json } from '../lib/api';

export default function RecoverPassword() {
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try { const result = await api<{ message: string }>('auth/request-recovery', json('POST', { email })); setNotice(result.message); setStep('reset'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (body.password !== body.confirmPassword) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try { await api('auth/recover-password', json('POST', { ...body, email })); setStep('done'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="admin-shell"><header className="admin-header"><Brand /><div><a href="/login" className="text-link">Back to sign in</a><AccountNav /></div></header><main className="auth-wrap"><div className="booking-card"><span className="eyebrow">PASSWORD RECOVERY</span><h1>{step === 'done' ? 'Ready to sign in.' : step === 'email' ? 'Forgot your password?' : 'Check your inbox.'}</h1>{step === 'done' ? <div role="status"><p>Your password has been updated. Sign in again to access your account.</p><a className="button full" href="/login">Back to sign in</a></div> : <>{error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}{step === 'email' ? <><p>Enter the email you registered with. We’ll email a recovery code if an active account matches.</p><form onSubmit={sendCode}><label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></label><button className="button full" disabled={busy}>{busy ? 'Requesting code…' : 'Email me a recovery code'}</button></form></> : <><p>Enter the six-digit code for <strong>{email}</strong>. Codes expire after 10 minutes.</p><form onSubmit={reset}><label>Recovery code<input name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="000000" /></label><PasswordField label="New password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required /><PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={128} required /><button className="button full" disabled={busy}>{busy ? 'Updating password…' : 'Reset password'}</button></form><p className="auth-switch"><button className="text-button" disabled={busy} onClick={() => sendCode()}>Send a new code</button><button className="text-button" disabled={busy} onClick={() => { setStep('email'); setError(''); setNotice(''); }}>Use another email</button></p></>}</>}</div></main></div>;
}
