'use client';
import { useEffect, useState } from 'react';
import { api, Worker } from './lib/api';
export default function Team() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => { api<Worker[]>('team').then(setWorkers).catch(() => setError(true)); }, []);
  return <section className="section team-section" id="team"><div className="section-heading"><div><span className="eyebrow">GOOD CARE STARTS WITH GOOD PEOPLE</span><h2>A familiar face.<br />A helping hand.</h2></div><p>Meet the people behind your care. Choose from available professionals with verified credentials when requesting a named-worker visit.</p></div>
    {workers.length ? <div className="team-grid">{workers.map(w => <article className="worker-card" key={w.id}><div className="avatar">{w.name.split(' ').map(p => p[0]).slice(0, 2).join('')}</div><span className={w.verified ? 'verified' : 'credential-pending'}>{w.verified ? '✓ Credentials verified' : 'Credential review pending'}</span><h3>{w.name}</h3><strong>{w.credential}</strong><p>{w.bio}</p><a className="text-link" href="#book">{w.verified ? 'Check care availability ↗' : 'Ask about care options ↗'}</a></article>)}</div> : <div className="team-empty"><span className="round-icon">♡</span><div><h3>Let’s find your care match.</h3><p>{error ? 'Team availability is temporarily unavailable. Please try again shortly.' : 'Tell us what support you’re looking for. Our coordinator will help match you with a care professional as team availability is added.'}</p></div><a className="button secondary" href="#book">Arrange a care visit ↗</a></div>}
  </section>;
}
