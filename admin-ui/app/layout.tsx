import '@fontsource-variable/manrope';
import './globals.css';

export const metadata = {
  title: 'Finify Control',
  description: 'Secure financial operations administration',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
