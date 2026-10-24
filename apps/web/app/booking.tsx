'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api, Auth, Client, json, services, time, Worker } from './lib/api';

export default function BookingForm() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [worker, setWorker] = useState('');
  const [day, setDay] = useState('');
  const [duration, setDuration] = useState('2');
  const [slots, setSlots] = useState<number[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<Client | null>(null);
  useEffect(() => { api<Auth>('auth').then(async auth => { if (auth.authenticated && auth.user?.client_id) setProfile((await api<{ profile: Client }>('account')).profile); }).catch(() => {}); }, []);
  useEffect(() => { api<Worker[]>('workers').then(setWorkers).catch(e => setError(e.message)).finally(() => setLoaded(true)); }, []);
  useEffect(() => {
    if (!worker || !day) { setSlots([]); return; }
    let current = true; setLoadingSlots(true); setSlots([]);
    api<number[]>(`availability/${worker}/${day}/${duration}`).then(data => { if (current) setSlots(data); }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoadingSlots(false); });
    return () => { current = false; };
  }, [worker, day, duration]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try { const result = await api<{ reference: string }>('bookings', json('POST', form)); setReference(result.reference); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const minDate = new Date(Date.now() + 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const maxDate = new Date(Date.now() + 180 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return <section className="booking-section" id="book">
    <div className="section-intro"><span className="eyebrow">LET’S MAKE EVERYDAY EASIER</span><h2>A little help starts<br />with a conversation.</h2><p>Tell us when you need care. Choose a verified team member or let us help you find the right match.</p><div className="booking-note"><span className="round-icon">♡</span><div><strong>Care built around you</strong><p>We review every request with you before confirming your visit and discussing your care plan and cost.</p></div></div><p className="small">Visits are scheduled in Eastern Time. Please share contact and scheduling information only; your coordinator will discuss personal care needs privately.</p></div>
    <div className="booking-card">{reference ? <div className="success-state" role="status"><span className="round-icon">✓</span><h3>Your care request is in.</h3><p>Your visit is pending review. A care coordinator will contact you to discuss availability, care needs, and pricing before confirming.</p><p className="reference">Reference: {reference}</p><button className="button secondary" onClick={() => { setReference(''); setWorker(''); setDay(''); }}>Make another request</button></div> : <form onSubmit={submit}>
      <div className="form-heading"><span className="eyebrow">BOOK A CARE VISIT</span><h3>How can we support you?</h3></div>
      <label>Type of care<select name="service" required>{services.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Your care professional<select name="worker_id" value={worker} onChange={e => setWorker(e.target.value)} disabled={!loaded}><option value="">Help me find the right match</option>{workers.map(w => <option value={w.id} key={w.id}>{w.name} · {w.credential}</option>)}</select></label>
      {loaded && !workers.length && <p className="field-note">Our coordinator will help arrange a suitable care professional.</p>}
      <div className="form-grid"><label>Preferred date<input type="date" name="date" min={minDate} max={maxDate} value={day} onChange={e => setDay(e.target.value)} required /></label><label>Visit length<select name="duration" value={duration} onChange={e => setDuration(e.target.value)}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>{i + 1} {i ? 'hours' : 'hour'}</option>)}</select></label></div>
      <label>Start time (Eastern)<select key={`${worker}-${day}-${duration}-${slots.join(',')}`} name="hour" required disabled={loadingSlots || !!worker && !day}><option value="">{loadingSlots ? 'Checking availability…' : 'Choose a time'}</option>{(worker ? slots : Array.from({ length: Math.max(0, 19 - Number(duration) - 8 + 1) }, (_, i) => i + 8)).map(h => <option value={h} key={h}>{time(h)}</option>)}</select></label>
      {!!worker && !!day && !loadingSlots && !slots.length && <p className="field-note">No available times for this visit. Try another date, visit length, or care professional.</p>}
      <div className="form-divider">Your contact details</div>{profile ? <p className="field-note">This visit will appear in <a className="text-link" href="/account">your account</a>.</p> : <p className="field-note"><a className="text-link" href="/login">Sign in or create an account</a> to keep track of your care appointments.</p>}
      <label>Full name<input key={`name-${profile?.id}`} defaultValue={profile?.name} name="name" autoComplete="name" minLength={2} maxLength={100} required placeholder="Name of the person arranging care" /></label>
      <div className="form-grid"><label>Email<input key={`email-${profile?.id}`} defaultValue={profile?.email} readOnly={!!profile} type="email" name="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" /></label><label>Phone<input key={`phone-${profile?.id}`} defaultValue={profile?.phone} type="tel" name="phone" autoComplete="tel" minLength={7} maxLength={30} required placeholder="Your phone number" /></label></div>
      <label>Visit address<input key={`address-${profile?.id}`} defaultValue={profile?.address} name="address" autoComplete="street-address" minLength={5} maxLength={250} required placeholder="Street address, city, state, ZIP" /></label>
      <label className="check"><input type="checkbox" required /> <span>I agree to be contacted about this care request and understand my visit is subject to confirmation.</span></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button full" disabled={busy || loadingSlots || !loaded}>{busy ? 'Sending your request…' : 'Request a care visit'} <span aria-hidden="true">↗</span></button>
      <p className="field-note centered">No payment is collected at this stage.</p>
    </form>}</div>
  </section>;
}
