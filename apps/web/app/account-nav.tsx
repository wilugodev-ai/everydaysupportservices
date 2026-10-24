'use client';
import { useEffect, useState } from 'react';
import { api, Auth } from './lib/api';
export default function AccountNav() {
  const [auth, setAuth] = useState<Auth | null>(null);
  useEffect(() => { api<Auth>('auth').then(setAuth).catch(() => setAuth(null)); }, []);
  return <a className="account-nav" href={auth?.authenticated ? auth.user?.role === 'admin' ? '/admin' : '/account' : '/login'}>{auth?.authenticated ? auth.user?.role === 'admin' ? 'Admin dashboard' : 'My account' : 'Sign in'}</a>;
}
