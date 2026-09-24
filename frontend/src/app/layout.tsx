import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MarketPulse',
  description: 'Personal Market Intelligence & Trade Discovery',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-100 dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
