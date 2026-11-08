import type { Metadata } from 'next';
import { IBM_Plex_Sans, JetBrains_Mono, Be_Vietnam_Pro } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import './globals.css';
import './styles/quizzy-layout.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

/* Tieu de trang dang nhap (phuong an D, 07/11/2026): Be Vietnam Pro 800 --
   font thiet ke cho tieng Viet, dau thanh thoang hon. */
const display = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'BCN Quiz', template: '%s | BCN Quiz' },
  description: 'Học, luyện tập và theo dõi tiến độ cùng BCN.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
