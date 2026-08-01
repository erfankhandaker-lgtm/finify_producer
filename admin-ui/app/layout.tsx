import '@fontsource-variable/manrope';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'localhost:3100';
  const protocol = requestHeaders.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`;
  const previewImage = `${siteUrl}/og.png`;

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: 'Finify Command — Obsidian Interface',
      template: '%s — Finify Command',
    },
    description: 'A secure command center for Finify financial operations, credit decisions, wallets, and risk control.',
    applicationName: 'Finify Command',
    openGraph: {
      title: 'Finify Command — Obsidian Interface',
      description: 'Financial control. Absolute clarity.',
      url: siteUrl,
      siteName: 'Finify Command',
      images: [{ url: previewImage, width: 1728, height: 911, alt: 'Finify Command Obsidian Interface' }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Finify Command — Obsidian Interface',
      description: 'Financial control. Absolute clarity.',
      images: [previewImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
