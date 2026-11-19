'use client';

import {
  Bell,
  BookOpen,
  ChartLineUp,
  Check,
  CheckCircle,
  Coins,
  Fire,
  Flag,
  type Icon,
  PaperPlaneTilt,
  Target,
  TrendDown,
  Trophy,
  Warning,
} from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, request } from '@/lib/api';
import { useAuth } from './auth-provider';

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  topicId: string | null;
  isRead: boolean;
  createdAt: string;
};
type NotificationPage = { items: Notification[] };
type NotificationEvent = { notification: Notification; unreadCount: number };

type IconConfig = {
  icon: Icon;
  color: string;
};

const notificationIcons: Record<string, IconConfig> = {
  LEADERBOARD_RESULT: { icon: Target, color: 'var(--accent)' },
  LEADERBOARD_TOP10: { icon: Fire, color: '#f97316' },
  LEADERBOARD_TOP3: { icon: Trophy, color: '#eab308' },
  LEADERBOARD_RANK_DROPPED: { icon: TrendDown, color: 'var(--danger)' },
  DAILY_REMINDER: { icon: BookOpen, color: '#3b82f6' },
  WEEKLY_PROGRESS: { icon: ChartLineUp, color: 'var(--accent)' },
  WEEKLY_SUMMARY: { icon: Flag, color: '#8b5cf6' },
  BOUNTY_SUBMITTED: { icon: PaperPlaneTilt, color: '#0284c7' },
  BOUNTY_APPROVED: { icon: CheckCircle, color: 'var(--accent)' },
  BOUNTY_REJECTED: { icon: Warning, color: 'var(--danger)' },
  BOUNTY_CLAIMED: { icon: Coins, color: '#eab308' },
};

const fallbackNotificationIcon: IconConfig = {
  icon: Bell,
  color: 'var(--muted)',
};

export function NotificationTypeIcon({ type }: { type: string }) {
  const { icon: IconComponent, color } = notificationIcons[type] ?? fallbackNotificationIcon;
  return (
    <IconComponent
      size={20}
      weight="fill"
      color={color}
      aria-hidden="true"
      style={{ marginTop: 2, flexShrink: 0 }}
    />
  );
}

type NotificationCache = {
  items: Notification[];
  unread: number;
};

export function NotificationCenter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);
  const seen = useRef(new Set<string>());
  const lastRefreshRef = useRef(0);
  const queryKey = ['notifications', user?.id ?? ''] as const;

  const { data } = useQuery<NotificationCache>({
    queryKey,
    queryFn: async () => {
      lastRefreshRef.current = Date.now();
      const [page, count] = await Promise.all([
        request.get<NotificationPage>('/notifications?limit=20'),
        request.get<{ count: number }>('/notifications/unread-count'),
      ]);
      page.items.forEach((row) => seen.current.add(row.id));
      return { items: page.items, unread: count.count };
    },
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const refresh = useCallback(async () => {
    lastRefreshRef.current = Date.now();
    await queryClient.invalidateQueries({ queryKey: ['notifications', user?.id ?? ''] });
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const stream = new EventSource(apiUrl('/notifications/stream'), {
      withCredentials: true,
    });
    const onNotification = (event: Event) => {
      if (!active) return;
      try {
        const { notification, unreadCount } = JSON.parse(
          (event as MessageEvent).data,
        ) as NotificationEvent;
        if (seen.current.has(notification.id)) {
          queryClient.setQueryData<NotificationCache>(
            ['notifications', user.id],
            (prev) => ({ items: prev?.items ?? [], unread: unreadCount }),
          );
          return;
        }
        seen.current.add(notification.id);
        queryClient.setQueryData<NotificationCache>(
          ['notifications', user.id],
          (prev) => ({
            items: [
              notification,
              ...(prev?.items ?? []).filter((row) => row.id !== notification.id),
            ].slice(0, 20),
            unread: unreadCount,
          }),
        );
        setToast(notification);
      } catch {
        void refresh().catch(() => undefined);
      }
    };
    stream.addEventListener('notification', onNotification);
    // Recover over REST after every reconnect (AGENTS.md invariant); the first open is a no-op because mount already refreshed.
    let firstOpen = true;
    stream.onopen = () => {
      if (firstOpen) { firstOpen = false; return; }
      if (active) void refresh().catch(() => undefined);
    };
    const onFocus = () => {
      if (active && Date.now() - lastRefreshRef.current > 30_000) {
        void refresh().catch(() => undefined);
      }
    };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      stream.close();
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, queryClient, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const markRead = async (row: Notification) => {
    if (!row.isRead) {
      await request.patch(`/notifications/${row.id}/read`);
      queryClient.setQueryData<NotificationCache>(queryKey, (prev) => ({
        items: (prev?.items ?? []).map((item) =>
          item.id === row.id ? { ...item, isRead: true } : item,
        ),
        unread: Math.max(0, (prev?.unread ?? 0) - 1),
      }));
    }
    setOpen(false);
    setToast(null);
    if (row.type.startsWith('CERTIFICATE_')) router.push('/certificates');
    else if (row.type.startsWith('WEEKLY_')) router.push('/leaderboard');
    else if (row.type === 'BOUNTY_APPROVED' || row.type === 'BOUNTY_CLAIMED' || row.type === 'BOUNTY_REJECTED') router.push('/bounties');
    else if (row.type === 'BOUNTY_SUBMITTED') {
      const isAdminOrMentor = user?.role === 'ADMIN' || user?.roles?.includes('admin') || user?.roles?.includes('mentor');
      router.push(isAdminOrMentor ? '/admin?tab=bounties' : '/bounties');
    }
    else if (row.topicId) router.push(row.type.startsWith('LEADERBOARD_') ? `/topics/${row.topicId}/leaderboard` : `/topics/${row.topicId}`);
  };

  const markAllRead = async () => {
    await request.patch('/notifications/read-all');
    queryClient.setQueryData<NotificationCache>(queryKey, (prev) => ({
      items: (prev?.items ?? []).map((row) => ({ ...row, isRead: true })),
      unread: 0,
    }));
  };

  return (
    <div className="notification-center">
      <button className="icon-button notification-bell" type="button" aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`} aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void refresh().catch(() => undefined); }}>
        <Bell aria-hidden="true" />
        {unread > 0 ? <span className="notification-badge">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open ? <section className="notification-panel" aria-label="Danh sách thông báo">
        <div className="notification-heading"><strong>Thông báo</strong><button type="button" onClick={() => void markAllRead().catch(() => { void refresh().catch(() => undefined); })} disabled={unread === 0}><Check aria-hidden="true" /> Đọc tất cả</button></div>
        <div className="notification-list">
          {items.length ? items.map((row) => <button key={row.id} type="button" className={`notification-row ${row.isRead ? '' : 'unread'}`} onClick={() => void markRead(row).catch(() => { void refresh().catch(() => undefined); })}>
            <NotificationTypeIcon type={row.type} />
            <span><strong>{row.title}</strong><span>{row.message}</span><small>{new Date(row.createdAt).toLocaleString('vi-VN')}</small></span>
          </button>) : <p className="notification-empty">Chưa có thông báo.</p>}
        </div>
      </section> : null}
      {toast ? <button className="notification-toast" type="button" role="status" onClick={() => void markRead(toast).catch(() => { void refresh().catch(() => undefined); })}>
        <NotificationTypeIcon type={toast.type} /><span><strong>{toast.title}</strong><span>{toast.message}</span></span>
      </button> : null}
    </div>
  );
}
