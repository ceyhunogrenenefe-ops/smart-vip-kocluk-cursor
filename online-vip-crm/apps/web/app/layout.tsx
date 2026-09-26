import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Source_Serif_4 } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Source_Serif_4({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Online VIP CRM',
    template: '%s · Online VIP CRM',
  },
  description: 'Online VIP Dershane için çok kanallı CRM',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
