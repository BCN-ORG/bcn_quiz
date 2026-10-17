'use client';

import { Bell, Check } from '@phosphor-icons/react';
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

const icons: Record<string, string> = {
  LEADERBOARD_RESULT: '🎯',
  LEADERBOARD_TOP10: '🔥',
  LEADERBOARD_TOP3: '🏆',
  LEADERBOARD_RANK_DROPPED: '👀',
  DAILY_REMINDER: '📚',
  WEEKLY_PROGRESS: '📈',
  WEEKLY_SUMMARY: '🏁',
};

export function NotificationCenter() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<Notification | null>(null);
  const seen = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const [page, count] = await Promise.all([
      request.get<NotificationPage>('/notifications?limit=20'),
      request.get<{ count: number }>('/notifications/unread-count'),
    ]);
    setItems(page.items);
    setUnread(count.count);
    page.items.forEach((row) => seen.current.add(row.id));
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    seen.current.clear();
    setItems([]);
    setUnread(0);
    void refresh().catch(() => undefined);
    const stream = new EventSource(apiUrl('/notifications/stream'), {
      withCredentials: true,
    });
    const onNotification = (event: Event) => {
      if (!active) return;
      try {
        const { notification, unreadCount } = JSON.parse(
          (event as MessageEvent).data,
        ) as NotificationEvent;
        setUnread(unreadCount);
        if (seen.current.has(notification.id)) return;
        seen.current.add(notification.id);
        setItems((previous) =>
          [notification, ...previous.filter((row) => row.id !== notification.id)].slice(0, 20),
        );
        setToast(notification);
      } catch {
        void refresh().catch(() => undefined);
      }
    };
    stream.addEventListener('notification', onNotification);
    stream.onopen = () => { if (active) void refresh().catch(() => undefined); };
    const onFocus = () => { if (active) void refresh().catch(() => undefined); };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      stream.close();
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const markRead = async (row: Notification) => {
    if (!row.isRead) {
      await request.patch(`/notifications/${row.id}/read`);
      setItems((previous) => previous.map((item) =>
        item.id === row.id ? { ...item, isRead: true } : item));
      setUnread((value) => Math.max(0, value - 1));
    }
    setOpen(false);
    setToast(null);
    if (row.topicId) router.push(`/topics/${row.topicId}#topic-leaderboard`);
  };

  const markAllRead = async () => {
    await request.patch('/notifications/read-all');
    setItems((previous) => previous.map((row) => ({ ...row, isRead: true })));
    setUnread(0);
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
            <span aria-hidden="true">{icons[row.type] ?? '🔔'}</span>
            <span><strong>{row.title}</strong><span>{row.message}</span><small>{new Date(row.createdAt).toLocaleString('vi-VN')}</small></span>
          </button>) : <p className="notification-empty">Chưa có thông báo.</p>}
        </div>
      </section> : null}
      {toast ? <button className="notification-toast" type="button" role="status" onClick={() => void markRead(toast).catch(() => { void refresh().catch(() => undefined); })}>
        <span aria-hidden="true">{icons[toast.type] ?? '🔔'}</span><span><strong>{toast.title}</strong><span>{toast.message}</span></span>
      </button> : null}
    </div>
  );
}
