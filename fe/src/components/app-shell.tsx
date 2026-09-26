'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Certificate,
  BookOpen,
  Gauge,
  ClockCounterClockwise,
  SignOut,
  List,
  Moon,
  GearSix,
  Sun,
  X,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { canManageContent, canReadQuestions, canReadResults } from '@/lib/permissions';
import { useAuth } from './auth-provider';
import { Empty, Loading } from './ui';

const primary = [
  { href: '/dashboard', label: 'Tổng quan', icon: Gauge, allow: () => true },
  { href: '/courses', label: 'Khóa học', icon: BookOpen, allow: canReadQuestions },
  { href: '/history', label: 'Lịch sử', icon: ClockCounterClockwise, allow: canReadResults },
  { href: '/certificates', label: 'Chứng chỉ', icon: Certificate, allow: canReadResults },
];

const PROFILES_APP_URL = (
  process.env.NEXT_PUBLIC_PROFILES_APP_URL || 'http://localhost:3002'
).replace(/\/$/, '');

function roleLabel(role: string) {
  const map: Record<string, string> = {
    admin: 'Admin',
    mentor: 'Mentor',
    member: 'Member',
    user: 'User',
  };
  return map[role.toLowerCase()] || role;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const enabled = localStorage.getItem('quiz-theme') === 'dark' ||
      (!localStorage.getItem('quiz-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(enabled);
    document.documentElement.dataset.theme = enabled ? 'dark' : 'light';
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [loading, router, user]);

  if (loading || !user) return <main className="center-page"><Loading label="Đang xác thực phiên BCN" /></main>;

  const appRoles = (user.roles ?? []).map((role) => role.toLowerCase());
  const links = primary.filter((item) => item.allow(user));
  if (canManageContent(user)) {
    links.push({ href: '/admin', label: 'Quản trị', icon: GearSix, allow: canManageContent });
  }

  const setTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('quiz-theme', next ? 'dark' : 'light');
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
  };

  return (
    <div className="app-layout">
      <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <Link href="/dashboard" className="brand"><span>B</span><strong>BCN Quiz</strong></Link>
          <button className="icon-button mobile-only" onClick={() => setMenu(false)} aria-label="Đóng menu"><X /></button>
        </div>
        <nav aria-label="Điều hướng chính">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMenu(false)} className={pathname.startsWith(href) ? 'active' : ''}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-compact">
            <div className="avatar">{(user.fullName || user.email).slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{user.fullName || 'Thành viên BCN'}</strong>
              <small>{user.email}</small>
              <div className="role-pills" aria-label="Vai trò Quiz">
                {appRoles.length ? (
                  appRoles.map((role) => (
                    <span key={role} className="role-pill">{roleLabel(role)}</span>
                  ))
                ) : (
                  <span className="role-pill muted">Member</span>
                )}
                {user.role?.toLowerCase() === 'admin' ? (
                  <span className="role-pill platform" title="Vai trò nền tảng Profiles">Platform Admin</span>
                ) : null}
              </div>
              <a
                className="roles-link"
                href={`${PROFILES_APP_URL}/vi/applications`}
                target="_blank"
                rel="noreferrer"
              >
                Xem role mọi app
              </a>
            </div>
          </div>
          <div className="sidebar-actions">
            <button className="icon-button" onClick={setTheme} aria-label={dark ? 'Dùng giao diện sáng' : 'Dùng giao diện tối'}>{dark ? <Sun /> : <Moon />}</button>
            <button className="icon-button" onClick={() => void logout()} aria-label="Đăng xuất"><SignOut /></button>
          </div>
        </div>
      </aside>
      {menu ? <button className="menu-backdrop" onClick={() => setMenu(false)} aria-label="Đóng menu" /> : null}
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMenu(true)} aria-label="Mở menu"><List /></button>
          <span>Học chắc từng chủ đề</span>
          <button className="icon-button" onClick={setTheme} aria-label={dark ? 'Dùng giao diện sáng' : 'Dùng giao diện tối'}>{dark ? <Sun /> : <Moon />}</button>
        </header>
        <main className="page-content">
          {pathname.startsWith('/courses') || pathname.startsWith('/topics') ? (
            canReadQuestions(user) ? children : <Empty title="Không có quyền xem khóa học" description="Tài khoản cần quyền xem khóa học và làm bài." />
          ) : pathname.startsWith('/history') || pathname.startsWith('/certificates') ? (
            canReadResults(user) ? children : <Empty title="Không có quyền xem lịch sử" description="Tài khoản cần quyền xem lịch sử làm bài." />
          ) : children}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Điều hướng di động">
        {links.slice(0, 5).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={pathname.startsWith(href) ? 'active' : ''}><Icon /><span>{label}</span></Link>
        ))}
      </nav>
    </div>
  );
}
