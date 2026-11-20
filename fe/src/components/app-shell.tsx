'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Certificate,
  BookOpen,
  Briefcase,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretDown,
  CheckSquare as FileCheck,
  Coins,
  Exam,
  Folders,
  Gauge,
  ClockCounterClockwise,
  GraduationCap,
  SignOut,
  SpeakerHigh,
  SpeakerSlash,
  Stack,
  Sword,
  Trophy,
  List,
  Lightning,
  Moon,
  GearSix,
  Plus,
  Receipt,
  Sun,
  Wallet,
  X,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import {
  canManageContent,
  canReadQuestions,
  canReadResults,
  canUpdateContent,
} from '@/lib/permissions';
import { request } from '@/lib/api';
import type { MyCertificateRequest, User } from '@/lib/types';
import { useAuth } from './auth-provider';
import { AvatarFrame } from './avatar-frame';
import { Nameplate } from './nameplate';
import { RankBadge } from './leaderboard-table';
import { CertStatus } from './certificate-status';
import { Empty, Loading } from './ui';
import { NotificationCenter } from './notification-center';
import { useDashboardSummary } from '@/lib/dashboard-queries';
import {
  getCharacterProgression,
  getCharacterTierById,
  getEquippedTransmogTier,
  TRANSMOG_EVENT,
} from '@/lib/character-progression';
import { isSfxMuted, setSfxMuted, SFX_EVENT } from '@/lib/sound-effects';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  allow: (user: User | null | undefined) => boolean;
  alsoActive?: string[];
  hasRankBadge?: boolean;
};

type NavGroup = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  allow?: (user: User | null | undefined) => boolean;
  items: NavItem[];
};

const primaryLinks: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Tổng quan',
    icon: Gauge,
    allow: () => true,
  },
  {
    href: '/wallet',
    label: 'Ví Coin',
    icon: Wallet,
    allow: () => true,
  },
];

const navGroups: NavGroup[] = [
  {
    key: 'training',
    label: 'Đào Tạo & Học Tập',
    icon: GraduationCap,
    items: [
      { href: '/courses', label: 'Khóa học', icon: BookOpen, allow: canReadQuestions },
      { href: '/certificates', label: 'Chứng nhận', icon: Certificate, allow: canReadResults },
      { href: '/history', label: 'Lịch sử', icon: ClockCounterClockwise, allow: canReadResults },
    ],
  },
  {
    key: 'arena',
    label: 'Đấu Trường & Thử Thách',
    icon: Sword,
    items: [
      { href: '/tower', label: 'Leo Tháp', icon: Lightning, allow: canReadQuestions },
      { href: '/boss', label: 'Săn Boss', icon: Sword, allow: canReadQuestions },
      { href: '/bounties', label: 'Nhiệm vụ', icon: Briefcase, allow: canReadQuestions, alsoActive: ['/missions'] },
      { href: '/leaderboard', label: 'Xếp hạng', icon: Trophy, allow: canReadQuestions, hasRankBadge: true },
    ],
  },
  {
    key: 'admin',
    label: 'Quản Trị Hệ Thống',
    icon: GearSix,
    allow: canManageContent,
    items: [
      { href: '/admin?tab=courses', label: 'Khóa học', icon: BookOpen, allow: canManageContent },
      { href: '/admin?tab=topics', label: 'Chủ đề', icon: Folders, allow: canManageContent },
      { href: '/admin?tab=quizzes', label: 'Ngân hàng câu hỏi', icon: Exam, allow: canManageContent },
      { href: '/admin?tab=reviews', label: 'Duyệt project', icon: FileCheck, allow: canUpdateContent },
      { href: '/admin?tab=certificates', label: 'Chứng nhận', icon: Certificate, allow: canUpdateContent },
      { href: '/admin?tab=leaderboards', label: 'Bảng xếp hạng', icon: Trophy, allow: canUpdateContent },
      { href: '/admin?tab=tower', label: 'Tháp & Question Pool', icon: Stack, allow: canUpdateContent },
      { href: '/admin?tab=boss', label: 'Sự kiện Boss', icon: Sword, allow: canUpdateContent },
      { href: '/admin?tab=bounties', label: 'Nhiệm vụ Freelancer', icon: Coins, allow: canUpdateContent },
      { href: '/admin?tab=coins', label: 'Giao dịch Coin', icon: Receipt, allow: canUpdateContent },
    ],
  },
];

function isItemActive(pathname: string, href: string, currentTab?: string, alsoActive?: string[]): boolean {
  if (href.startsWith('/admin')) {
    if (pathname !== '/admin') return false;
    const url = new URL(href, 'http://localhost');
    const targetTab = url.searchParams.get('tab') || 'courses';
    const activeTab = currentTab || 'courses';
    return targetTab === activeTab;
  }
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (href === '/courses' && (pathname === '/topics' || pathname.startsWith('/topics/'))) return true;
  if (alsoActive && alsoActive.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return false;
}

function isGroupActive(pathname: string, group: NavGroup, currentTab?: string): boolean {
  return group.items.some((item) => isItemActive(pathname, item.href, currentTab, item.alsoActive));
}

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
  const summaryQuery = useDashboardSummary(user, loading);
  const userLevel = summaryQuery.data?.xp?.level ?? 1;
  const serverEquippedTierId = summaryQuery.data?.xp?.equippedTierId ?? null;
  const [localTransmog, setLocalTransmog] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const sync = () => {
      setLocalTransmog(getEquippedTransmogTier(userLevel)?.tierId ?? null);
    };
    sync();
    window.addEventListener(TRANSMOG_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(TRANSMOG_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [userLevel]);
  const activeTierId =
    localTransmog !== undefined ? localTransmog : serverEquippedTierId;
  const activeTier =
    getCharacterTierById(activeTierId) ?? getCharacterProgression(userLevel);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = pathname === '/admin' ? (searchParams?.get('tab') || 'courses') : undefined;
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const syncMute = () => setMuted(isSfxMuted());
    syncMute();
    window.addEventListener(SFX_EVENT, syncMute);
    return () => window.removeEventListener(SFX_EVENT, syncMute);
  }, []);
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

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    training: true,
    arena: true,
    admin: true,
  });

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Auto-open group when pathname matches any child link so user never loses context
  useEffect(() => {
    for (const group of navGroups) {
      if (isGroupActive(pathname, group, currentTab)) {
        setOpenGroups((prev) => (prev[group.key] ? prev : { ...prev, [group.key]: true }));
      }
    }
  }, [pathname, currentTab]);

  if (loading || !user) return <main className="center-page"><Loading label="Đang xác thực phiên BCN" /></main>;

  const appRoles = (user.roles ?? []).map((role) => role.toLowerCase());

  const visibleGroups = navGroups
    .filter((g) => (g.allow ? g.allow(user) : true))
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => item.allow(user)),
    }))
    .filter((g) => g.items.length > 0);

  const bottomNavItems = [
    ...primaryLinks,
    ...navGroups
      .filter((g) => g.key !== 'admin')
      .flatMap((g) => (g.allow ? (g.allow(user) ? g.items : []) : g.items)),
  ]
    .filter((item) => item.allow(user))
    .slice(0, 6);

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
            <strong>BCN Arena</strong>
          </Link>
          <button className="icon-button mobile-only" onClick={() => setMenu(false)} aria-label="Đóng menu"><X /></button>
        </div>
        <nav aria-label="Điều hướng chính">
          {primaryLinks.map((item) => {
            const ItemIcon = item.icon;
            const active = isItemActive(pathname, item.href, currentTab);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenu(false)}
                className={`nav-direct-item ${active ? 'active' : ''}`}
                title={item.label}
                aria-label={item.label}
              >
                <ItemIcon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = openGroups[group.key] ?? false;
            const hasActiveChild = isGroupActive(pathname, group, currentTab);

            return (
              <div key={group.key} className={`nav-group ${isOpen ? 'group-open' : 'group-collapsed'}`}>
                <button
                  type="button"
                  className={`nav-group-header ${hasActiveChild ? 'has-active-child' : ''}`}
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={isOpen}
                  aria-controls={`nav-group-list-${group.key}`}
                  title={group.label}
                >
                  <span className="nav-group-header-left">
                    <GroupIcon className="nav-group-icon" aria-hidden="true" />
                    <span className="nav-group-title">{group.label}</span>
                  </span>
                  <CaretDown className={`nav-group-caret ${isOpen ? 'open' : 'closed'}`} aria-hidden="true" />
                </button>

                <ul
                  id={`nav-group-list-${group.key}`}
                  className={`nav-sub-list ${isOpen ? 'open' : 'closed'}`}
                  role="list"
                  aria-label={group.label}
                >
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const active = isItemActive(pathname, item.href, currentTab, item.alsoActive);

                    return (
                      <li key={item.href} role="none">
                        <Link
                          href={item.href}
                          onClick={() => setMenu(false)}
                          className={`nav-sub-item ${active ? 'active' : ''}`}
                          title={item.label}
                          aria-label={item.label}
                        >
                          <ItemIcon aria-hidden="true" />
                          <span>{item.label}</span>
                          {item.hasRankBadge && weeklyRank != null ? (
                            <span className="nav-rank"><RankBadge rank={weeklyRank} /></span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer" ref={profileRef}>
          <div className="sidebar-footer-row">
            <button type="button" className="user-compact profile-trigger" onClick={() => setProfileOpen((v) => !v)} aria-expanded={profileOpen} aria-haspopup="dialog" aria-label="Mở hồ sơ của bạn">
              <AvatarFrame
                name={user.fullName || user.email}
                avatarUrl={user.avatarUrl}
                level={userLevel}
                tierIdOverride={activeTierId}
                size="sm"
                showLevelBadge
              />
              <div>
                <Nameplate
                  name={user.fullName || 'Thành viên BCN'}
                  level={userLevel}
                  tierIdOverride={activeTierId}
                  showTitleBadge={false}
                  compact
                  className="rpg-nameplate--sidebar"
                />
                <small>{user.email}</small>
              </div>
            </button>
            <button type="button" className="icon-button sidebar-collapse" onClick={toggleCollapsed} aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} aria-expanded={!collapsed} title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}>
              {collapsed ? <CaretDoubleRight /> : <CaretDoubleLeft />}
            </button>
          </div>
          {profileOpen ? (
            <div className="profile-card profile-card--discord" role="dialog" aria-label="Hồ sơ của bạn">
              <div
                className="profile-card-banner"
                style={{ backgroundImage: `url('${activeTier.bannerBgUrl}')` }}
                data-tier={activeTier.tierId}
              >
                <span className="profile-card-banner-scrim" aria-hidden="true" />
                <span className="profile-card-banner-tier">
                  {activeTier.tierBadge} {activeTier.tierTitle}
                </span>
              </div>
              <div className="profile-card-body">
                <div className="profile-card-avatar-row">
                  <div className="profile-card-avatar-cutout">
                    <AvatarFrame
                      name={user.fullName || user.email}
                      avatarUrl={user.avatarUrl}
                      level={userLevel}
                      tierIdOverride={activeTierId}
                      size="lg"
                      showLevelBadge
                    />
                  </div>
                </div>
                <div className="profile-card-identity">
                  <Nameplate
                    name={user.fullName || 'Thành viên BCN'}
                    level={userLevel}
                    tierIdOverride={activeTierId}
                    pinnedBadges={summaryQuery.data?.xp?.pinnedBadges}
                    showTitleBadge={false}
                    compact
                  />
                  <small>{user.email}</small>
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
            <button
              className="icon-button"
              onClick={() => setSfxMuted(!muted)}
              aria-label={muted ? 'Bật âm thanh hiệu ứng' : 'Tắt âm thanh hiệu ứng'}
              title={muted ? 'Bật âm thanh (SFX)' : 'Tắt âm thanh (SFX)'}
            >
              {muted ? <SpeakerSlash /> : <SpeakerHigh />}
            </button>
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
        {bottomNavItems.map(({ href, label, icon: Icon, alsoActive }) => (
          <Link
            key={href}
            href={href}
            className={isItemActive(pathname, href, currentTab, alsoActive) ? 'active' : ''}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
