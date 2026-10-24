import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Everyday Support Services',
  description: 'Professional care in the comfort of your home. Explore personal care, companionship, respite care, and everyday home support. Request a care visit.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
