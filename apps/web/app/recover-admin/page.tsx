'use client';
import AccountNav from '../account-nav';
﻿
import { FormEvent, useState } from 'react';
import PasswordField from '../password-field';
import { api, json } from '../lib/api';
export default function LocalRecovery() {
  const [error, setError] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('auth/recover-password', json('POST', Object.fromEntries(new FormData(event.currentTarget)))); setDone(true); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="admin-shell"><main className="auth-wrap"><div className="booking-card"><div className="auth-appearance"><AccountNav /></div><span className="eyebrow">LOCAL OPERATOR RECOVERY</span><h1>{done ? 'Password updated.' : 'Local recovery'}</h1>{done ? <a href="/login" className="button full">Back to sign in</a> : <><p>Use the private local recovery code only if email delivery is unavailable. For normal recovery, <a className="text-link" href="/recover-password">request an email code</a>.</p><form onSubmit={submit}><label>Account email<input type="email" name="email" required autoComplete="username" /></label><PasswordField label="Private local code" name="token" required autoComplete="off" /><PasswordField label="New password" name="password" minLength={12} maxLength={128} required autoComplete="new-password" /><PasswordField label="Confirm new password" name="confirmPassword" minLength={12} maxLength={128} required autoComplete="new-password" />{error && <p className="error" role="alert">{error}</p>}<button className="button full" disabled={busy}>Reset password</button></form></>}</div></main></div>;
}
