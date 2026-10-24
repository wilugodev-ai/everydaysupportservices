export type Worker = { id: string; name: string; bio: string; credential: string; expiry: string; days: string; start_hour: number; end_hour: number; verified?: number; active?: number };
export type Client = { id: string; name: string; email: string; phone: string; address: string };
export type User = { id: string; name: string; email: string; role: 'admin' | 'client'; active?: number; client_id: string | null };
export type Auth = { authenticated: boolean; setupRequired: boolean; user: User | null };
export type Booking = { id: string; client_id: string; worker_id: string | null; client_name: string; email: string; phone: string; address: string; worker_name: string | null; service: string; date: string; hour: number; duration: number; status: string };
export const services = ['Personal care', 'Companionship', 'Respite care', 'Everyday home support'];
export const time = (hour: number) => `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'Something went wrong. Please try again.');
  return result;
}
export const json = (method: string, value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });
