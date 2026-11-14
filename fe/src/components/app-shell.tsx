'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Certificate,
  BookOpen,
  CaretDoubleLeft,
  CaretDoubleRight,
  Gauge,
  ClockCounterClockwise,
  SignOut,
  Sword,
  Trophy,
  List,
  Lightning,
  Moon,
  GearSix,
  Plus,
  Sun,
  X,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { canManageContent, canReadQuestions, canReadResults } from '@/lib/permissions';
import { request } from '@/lib/api';
import type { MyCertificateRequest } from '@/lib/types';
import { useAuth } from './auth-provider';
import { RankBadge } from './leaderboard-table';
import { CertStatus } from './certificate-status';
import { Empty, Loading } from './ui';
import { NotificationCenter } from './notification-center';

const primary = [
  { href: '/dashboard', label: 'Tổng quan', icon: Gauge, allow: () => true },
  { href: '/courses', label: 'Khóa học', icon: BookOpen, allow: canReadQuestions },
  { href: '/tower', label: 'Leo Tháp', icon: Lightning, allow: canReadQuestions },
  { href: '/boss', label: 'Săn Boss', icon: Sword, allow: canReadQuestions },
  { href: '/leaderboard', label: 'Xếp hạng', icon: Trophy, allow: canReadQuestions },
  { href: '/history', label: 'Lịch sử', icon: ClockCounterClockwise, allow: canReadResults },
  { href: '/certificates', label: 'Chứng nhận', icon: Certificate, allow: canReadResults },
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
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [certs, setCerts] = useState<MyCertificateRequest[] | null>(null);
  const [weeklyRank, setWeeklyRank] = useState<number | null>(null);
  const [certsError, setCertsError] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const enabled = localStorage.getItem('quiz-theme') === 'dark' ||
      (!localStorage.getItem('quiz-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(enabled);
    document.documentElement.dataset.theme = enabled ? 'dark' : 'light';
    setCollapsed(localStorage.getItem('quiz-sidebar-collapsed') === '1');
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem('quiz-sidebar-collapsed', v ? '0' : '1');
      return !v;
    });
  };

  // Hang tuan cua minh de hien huy hieu o muc Xep hang (aside); loi thi khong hien.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void request.get<{ currentUserRank: number | null }>('/leaderboards/weekly?limit=1')
      .then((data) => { if (!cancelled && typeof data.currentUserRank === 'number') setWeeklyRank(data.currentUserRank); })
      .catch(() => { /* khong hien huy hieu */ });
    return () => { cancelled = true; };
  }, [user]);

  // Tai chung nhan khi mo the ho so lan dau (kieu Discord: chi tai khi can).
  useEffect(() => {
    if (!profileOpen || certs !== null) return;
    let cancelled = false;
    void request.get<{ items: MyCertificateRequest[] }>('/certificate/requests/me')
      .then((data) => { if (!cancelled) setCerts(data.items); })
      .catch(() => { if (!cancelled) setCertsError(true); });
    return () => { cancelled = true; };
  }, [profileOpen, certs]);

  // Dong the ho so khi bam ra ngoai, bam Escape, hoac chuyen trang.
  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  useEffect(() => { setProfileOpen(false); }, [pathname]);

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
    <div className={`app-layout${collapsed ? ' app-layout-collapsed' : ''}`}>
      <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <Link href="/dashboard" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bcn-card-back.webp" alt="BCN" className="brand-logo" width={36} height={36} />
            <strong>BCN Quiz</strong>
          </Link>
          <button className="icon-button mobile-only" onClick={() => setMenu(false)} aria-label="Đóng menu"><X /></button>
        </div>
        <nav aria-label="Điều hướng chính">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMenu(false)} className={pathname.startsWith(href) ? 'active' : ''}>
              <Icon aria-hidden="true" /><span>{label}</span>
              {href === '/leaderboard' && weeklyRank != null ? <span className="nav-rank"><RankBadge rank={weeklyRank} /></span> : null}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer" ref={profileRef}>
          <div className="sidebar-footer-row">
            <button type="button" className="user-compact profile-trigger" onClick={() => setProfileOpen((v) => !v)} aria-expanded={profileOpen} aria-haspopup="dialog" aria-label="Mở hồ sơ của bạn">
              <div className="avatar">{(user.fullName || user.email).slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{user.fullName || 'Thành viên BCN'}</strong>
                <small>{user.email}</small>
              </div>
            </button>
            <button type="button" className="icon-button sidebar-collapse" onClick={toggleCollapsed} aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} aria-expanded={!collapsed} title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}>
              {collapsed ? <CaretDoubleRight /> : <CaretDoubleLeft />}
            </button>
          </div>
          {profileOpen ? (
            <div className="profile-card" role="dialog" aria-label="Hồ sơ của bạn">
              <div className="profile-card-head">
                <div className="avatar avatar-lg">{(user.fullName || user.email).slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{user.fullName || 'Thành viên BCN'}</strong>
                  <small>{user.email}</small>
                </div>
              </div>
              <div className="profile-card-section">
                <p className="profile-card-label">Vai trò</p>
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
              <div className="profile-card-section">
                <p className="profile-card-label">Chứng nhận</p>
                {certs === null ? (
                  certsError ? (
                    <small className="profile-card-muted">Không tải được chứng nhận.</small>
                  ) : (
                    <small className="profile-card-muted">Đang tải chứng nhận…</small>
                  )
                ) : certs.length === 0 ? (
                  <small className="profile-card-muted">Chưa có chứng nhận.</small>
                ) : (
                  <ul className="profile-cert-list">
                    {certs.map((item) => (
                      <li key={item.id}>
                        <span>{item.course.name}</span>
                        <CertStatus value={item.status} />
                      </li>
                    ))}
                  </ul>
                )}
                <Link className="roles-link" href="/certificates" onClick={() => setProfileOpen(false)}>Xem tất cả chứng nhận</Link>
              </div>
              <button type="button" className="button danger profile-logout" onClick={() => void logout()}><SignOut /> Đăng xuất</button>
            </div>
          ) : null}
        </div>
      </aside>
      {menu ? <button className="menu-backdrop" onClick={() => setMenu(false)} aria-label="Đóng menu" /> : null}
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMenu(true)} aria-label="Mở menu"><List /></button>
          <span className="topbar-tagline">Học chắc từng chủ đề</span>
          <div className="topbar-actions">
            {/* Nút tắt sang trang Quản trị, chỉ hiện với tài khoản quản trị (kịch bản Figma 05/11/2026) */}
            {canManageContent(user) ? <Link className="button" href="/admin"><Plus /> Tạo khóa học</Link> : null}
            <NotificationCenter />
            <button className="icon-button" onClick={setTheme} aria-label={dark ? 'Dùng giao diện sáng' : 'Dùng giao diện tối'}>{dark ? <Sun /> : <Moon />}</button>
          </div>
        </header>
        <main className="page-content">
          {pathname.startsWith('/courses') || pathname.startsWith('/topics') || pathname.startsWith('/leaderboard') ? (
            canReadQuestions(user) ? children : <Empty title="Không có quyền xem khóa học" description="Tài khoản cần quyền xem khóa học và làm bài." />
          ) : pathname.startsWith('/history') || pathname.startsWith('/certificates') ? (
            canReadResults(user) ? children : <Empty title="Không có quyền xem lịch sử" description="Tài khoản cần quyền xem lịch sử làm bài." />
          ) : children}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Điều hướng di động">
        {links.slice(0, 6).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={pathname.startsWith(href) ? 'active' : ''}><Icon /><span>{label}</span></Link>
        ))}
      </nav>
    </div>
  );
}
