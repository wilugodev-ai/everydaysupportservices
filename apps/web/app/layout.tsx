import type { Metadata } from 'next';
import './globals.css';
import './theme.css';
import { ThemeController } from './theme';

export const metadata: Metadata = {
  title: 'Everyday Support Services',
  description: 'Professional care in the comfort of your home. Explore personal care, companionship, respite care, and everyday home support. Request a care visit.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `(()=>{let p='system';try{const v=localStorage.getItem('everyday-theme');if(v==='light'||v==='dark')p=v;}catch{}const r=document.documentElement;r.dataset.themePreference=p;r.dataset.theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;})();`;
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><ThemeController />{children}</body></html>;
}
