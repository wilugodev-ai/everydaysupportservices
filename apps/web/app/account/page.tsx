'use client';
import Brand from '../brand';
import AccountNav from '../account-nav';

import { FormEvent, useEffect, useState } from 'react';
import { api, Booking, Client, json, time, User } from '../lib/api';
type Account = { user: User; profile: Client | null; bookings: Booking[] };
export default function Account() {
  const [data, setData] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data && ['#profile', '#appointments'].includes(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }); }, [data?.user.id]);
  async function load() { setData(await api<Account>('account')); }
  useEffect(() => { load().catch(e => { if (e.message === 'Please sign in.') location.replace('/login'); else setError(e.message); }); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await api('account', json('PATCH', Object.fromEntries(new FormData(event.currentTarget)))); await load(); setNotice('Your details have been saved.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="admin-shell"><header className="admin-header"><Brand subtitle="MY CARE ACCOUNT" /><div><a className="text-link" href="/#book">Book care ↗</a><AccountNav /></div></header><main className="account-main"><span className="eyebrow">YOUR PERSONAL CARE SPACE</span><h1>{data ? `Hello, ${data.user.name}.` : 'Your care account'}</h1><p>Your details, your visits, and a little peace of mind.</p>{error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}{!data && !error && <p role="status">Loading your account…</p>}{data && <div className="account-columns"><section id="profile" className="booking-card"><h2>My details</h2><p className="small">Account email: {data.user.email}</p>{data.profile ? <form key={data.profile.id} onSubmit={save}><label>Full name<input name="name" defaultValue={data.profile.name} minLength={2} maxLength={100} required /></label><label>Phone<input name="phone" type="tel" defaultValue={data.profile.phone} minLength={7} maxLength={30} required /></label><label>Visit address<input name="address" defaultValue={data.profile.address} minLength={5} maxLength={250} required /></label><button className="button full" disabled={busy}>{busy ? 'Saving…' : 'Save my details'}</button></form> : <p className="small">Your administrator account has no client profile. Open the admin dashboard to manage care.</p>}</section><section id="appointments"><div className="admin-toolbar"><h2>My appointments</h2><button className="text-button" onClick={() => load().catch(e => setError(e.message))}>↻ Refresh</button></div>{!data.bookings.length ? <div className="empty-state"><h3>Your next chapter of care.</h3><p>You don’t have any appointments yet.</p><a className="button" href="/#book">Request a care visit ↗</a></div> : <div className="account-bookings">{data.bookings.map(b => <article className="booking-card" key={b.id}><span className={`status ${b.status}`}>{b.status}</span><h3>{b.service}</h3><p><strong>{new Date(`${b.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</strong><br />{time(b.hour)} Eastern Time · {b.duration} {b.duration === 1 ? 'hour' : 'hours'}<br />Care professional: {b.worker_name || 'Your coordinator is arranging a match'}</p><small className="reference">Reference: {b.id}</small>{b.status === 'pending' && <p className="small">Your coordinator will contact you before confirming this visit.</p>}</article>)}</div>}<p className="small account-help">For appointment changes, contact your care coordinator. All visit times are Eastern Time.</p></section></div>}</main></div>;
}
