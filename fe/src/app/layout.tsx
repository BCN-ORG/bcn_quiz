import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth-provider';
import './globals.css';
import './styles/quizzy-layout.css';

export const metadata: Metadata = {
  title: { default: 'BCN Arena', template: '%s | BCN Arena' },
  description: 'Học, luyện tập và theo dõi tiến độ cùng BCN.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
