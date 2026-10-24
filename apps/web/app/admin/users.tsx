'use client';
import PasswordField from '../password-field';
import { FormEvent, useState } from 'react';
import { api, Client, json, User } from '../lib/api';
type Props = { users: User[]; clients: Client[]; currentId?: string; busy: boolean; action: (work: () => Promise<unknown>, success: string) => Promise<boolean> };
export default function Users({ users, clients, currentId, busy, action }: Props) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState('');
  const [role, setRole] = useState('client');
  async function issueRecovery(user: User) {
    await action(() => api('admin/users/' + user.id + '/recovery', json('POST', {})), 'Recovery email requested. The account owner should check their inbox and spam folder.');
  }
  const selected = clients.find(c => c.id === clientId);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget));
    if (await action(() => api('admin/users', json('POST', form)), 'Account created. Share the credentials privately with the account owner.')) { setAdding(false); setClientId(''); }
  }
  async function update(event: FormEvent<HTMLFormElement>, user: User) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await action(() => api(`admin/users/${user.id}`, json('PATCH', { role: form.get('role'), active: form.get('active') === 'on' })), 'User access updated. Changed accounts must sign in again.');
  }
  return <><div className="admin-toolbar"><h2>Users & roles</h2><button className="button small-button" onClick={() => setAdding(!adding)}>{adding ? 'Close form' : '+ Add user'}</button></div><p className="small">Clients can see only their own profile and appointments. Administrators can manage all care records and user access. Changes to roles or account status revoke existing sessions. Keep at least one active administrator.</p>
    {adding && <section className="booking-card user-create"><h3>Create account access</h3><form onSubmit={create}><label>Link to existing client<select name="client_id" value={clientId} onChange={e => setClientId(e.target.value)}><option value="">New account / new client profile</option>{clients.filter(c => !users.some(u => u.client_id === c.id)).map(c => <option value={c.id} key={c.id}>{c.name} · {c.email}</option>)}</select></label><p className="field-note">Link a client only after confirming the account belongs to that person. Linked accounts can see that client’s appointments.</p><div className="form-grid"><label>Full name<input key={`name-${clientId}`} name="name" defaultValue={selected?.name} minLength={2} maxLength={100} required /></label><label>Email<input key={`email-${clientId}`} name="email" type="email" defaultValue={selected?.email} readOnly={!!selected} maxLength={254} required /></label></div><div className="form-grid"><PasswordField label="Initial password"  name="password" autoComplete="new-password" minLength={12} maxLength={128} required /><label>Role<select name="role" value={role} onChange={e => setRole(e.target.value)}><option value="client">Client</option><option value="admin">Administrator</option></select></label></div>{role === 'admin' && <p className="error">Administrators have access to all clients, appointments, workers, and user roles.</p>}<button className="button" disabled={busy}>Create user account</button></form></section>}
    <input className="user-search" aria-label="Search users" placeholder="Search name, email, or role…" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="user-list">{users.filter(u => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(query.toLowerCase())).map(u => <article className="user-row" key={`${u.id}-${u.role}-${u.active}`}><div><span className={`status ${u.active ? 'confirmed' : 'cancelled'}`}>{u.active ? 'Active' : 'Disabled'}</span><h3>{u.name} {u.id === currentId && <small>(you)</small>}</h3><p>{u.email}</p><button type="button" className="text-button" disabled={busy || !u.active} onClick={() => issueRecovery(u)}>Send recovery email</button><p className="small">{u.client_id ? 'Linked client profile' : 'No client profile'}</p></div><form onSubmit={e => update(e, u)}><label>Role<select name="role" defaultValue={u.role} disabled={u.id === currentId}><option value="client">Client</option><option value="admin">Administrator</option></select></label><label className="check"><input name="active" type="checkbox" defaultChecked={!!u.active} disabled={u.id === currentId} />Account enabled</label><button className="button secondary small-button" disabled={busy || u.id === currentId}>Save access</button>{u.id === currentId && <small className="field-note">Another admin can change your access.</small>}</form></article>)}</div>
  </>;
}
