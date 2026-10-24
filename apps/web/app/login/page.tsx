'use client';
import PasswordField from '../password-field';
import { FormEvent, useEffect, useState } from 'react';
import { api, Auth, json } from '../lib/api';
export default function Login() {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api<Auth>('auth').then(a => { if (a.authenticated) location.replace(a.user?.role === 'admin' ? '/admin' : '/account'); }).catch(() => {}); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api<Auth>(`auth/${register ? 'register' : 'login'}`, json('POST', Object.fromEntries(new FormData(event.currentTarget))));
      location.assign(result.user?.role === 'admin' ? '/admin' : '/account');
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <div className="admin-shell"><header className="admin-header"><a href="/" className="brand">everyday<span className="brand-sub">SUPPORT SERVICES</span></a><a className="text-link" href="/">Back to home ↗</a></header><main className="auth-wrap"><div className="booking-card"><span className="eyebrow">YOUR CARE, ALL IN ONE PLACE</span><h1>{register ? 'Let’s get to know you.' : 'Welcome back.'}</h1><p>{register ? 'Create your client account to keep your details and care appointments together.' : 'Sign in to see your details and appointments. Administrators can access the care dashboard here too.'}</p><form key={register ? 'register' : 'login'} onSubmit={submit}>{register && <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={100} /></label>}<label>Email<input name="email" type="email" autoComplete="username" required maxLength={254} /></label><PasswordField label="Password" name="password"  autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 12 : 1} maxLength={128} required />{register && <p className="field-note">Use at least 12 characters. If you’ve already requested care with this email, ask your administrator to create access to your existing appointments.</p>}{error && <p role="alert" className="error">{error}</p>}<button className="button full" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create my account' : 'Sign in'}</button></form>{!register && <p className="auth-switch"><a className="text-link" href="/recover-password">Forgot your password?</a></p>}<p className="auth-switch">{register ? 'Already have an account?' : 'New to Everyday?'} <button className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Sign in' : 'Create an account'}</button></p></div></main></div>;
}
