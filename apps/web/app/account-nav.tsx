'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { api, Auth, json } from './lib/api';
import { ThemeSelect } from './theme';

function MenuIcon({ kind }: { kind: 'user' | 'calendar' | 'dashboard' | 'exit' }) {
  const paths = {
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21v-2.5a7.5 7.5 0 0 1 15 0V21" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-12 4h.01M12 15h.01M16 15h.01" /></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    exit: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m5-12 4 4-4 4m-7-4h13" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export default function AccountNav() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    let mounted = true;
    const refresh = () => { api<Auth>('auth').then(result => { if (mounted) { setAuth(result); setError(''); } }).catch(() => { if (mounted) setError('We couldn’t check your account. Please try again.'); }); };
    refresh();
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    return () => { mounted = false; window.removeEventListener('pageshow', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button:not(:disabled), select')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  async function logout() {
    setBusy(true); setError('');
    try { await api('auth/logout', json('POST', {})); location.assign('/'); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <div className="user-menu" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} type="button" className="user-menu-trigger" aria-label="User account options" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}><MenuIcon kind="user" /><svg className="user-menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button>
    {open && <div className="user-menu-panel" id={id} ref={panel}>
      {auth?.authenticated && auth.user ? <><div className="user-menu-identity"><strong>{auth.user.name}</strong><span>{auth.user.email}</span><small>{auth.user.role === 'admin' ? 'Administrator' : 'Client account'}</small></div><nav className="user-menu-links" aria-label="Your account"><a href="/account#profile"><MenuIcon kind="user" />My profile</a><a href="/account#appointments"><MenuIcon kind="calendar" />My appointments</a>{auth.user.role === 'admin' && <a href="/admin"><MenuIcon kind="dashboard" />Admin dashboard</a>}</nav></> : auth ? <><div className="user-menu-identity"><strong>Welcome to Everyday</strong><span>Your care, all in one place.</span></div><nav className="user-menu-links" aria-label="Account access"><a href="/login"><MenuIcon kind="user" />Sign in</a><a href="/login?register=1"><MenuIcon kind="user" />Create an account</a></nav></> : <p className="user-menu-loading" role="status">{error ? 'Account unavailable' : 'Checking your account…'}</p>}
      <div className="user-menu-appearance"><ThemeSelect /></div>
      {auth?.authenticated && <button type="button" className="user-menu-signout" disabled={busy} onClick={logout}><MenuIcon kind="exit" />{busy ? 'Signing out…' : 'Sign out'}</button>}
      {error && <div className="user-menu-error"><p role="alert">{error}</p>{!auth && <button type="button" className="text-button" onClick={() => location.reload()}>Try again</button>}</div>}
    </div>}
  </div>;
}
