import '@fontsource-variable/manrope';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Finify — Your money, in motion',
  description: 'Secure personal and business wallets, payments, activity, and identity in one mobile-first experience.',
  applicationName: 'Finify',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
