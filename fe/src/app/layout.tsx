import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth-provider';
import { QueryProvider } from '@/components/query-provider';
import './globals.css';
import './styles/quizzy-layout.css';
import './styles/rpg-dashboard.css';
import './styles/arena-features.css';

export const metadata: Metadata = {
  title: { default: 'BCN Arena', template: '%s | BCN Arena' },
  description: 'Học, luyện tập và theo dõi tiến độ cùng BCN.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
