'use client';

import Link from 'next/link';
import { ArrowRight, Check, Clock, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog, Empty, ErrorState, Loading, PaginationNav, Status } from '@/components/ui';
import { request } from '@/lib/api';
import type { Pagination } from '@/lib/types';

type HistoryItem = {
  id: string;
  topicId: string;
  topic: { name: string };
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  answeredCount: number;
  correctCount: number | null;
  score: number | null;
  quizTotal?: number | null;
  durationMs?: number | null;
  startedAt: string;
  submittedAt: string | null;
  lastSeenAt?: string;
};

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [abandonId, setAbandonId] = useState<string | null>(null);
  const [abandoning, setAbandoning] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const load = useCallback(async (targetPage = page) => {
    setLoading(true); setError('');
    try {
      const data = await request.get<Pagination<HistoryItem>>(`/attempt/sessions/me?page=${targetPage}&limit=10`);
      setItems(data.items); setPagination(data.pagination);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được lịch sử'); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(page); }, [load, page]);

  const abandon = async () => {
    if (!abandonId) return;
    setAbandoning(true);
    try {
      await request.post(`/attempt/session/${abandonId}/abandon`);
      setAbandonId(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không hủy được bài dở');
      setAbandonId(null);
    } finally {
      setAbandoning(false);
    }
  };

  if (loading) return <Loading />;
  if (error && !items.length) return <ErrorState message={error} retry={() => void load()} />;
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Hoạt động của bạn</p><h1>Lịch sử làm bài</h1><p>Bài đang làm dở, đã nộp, hoặc hết hạn.</p></div></header>
      {error ? <p className="form-error">{error}</p> : null}
      {items.length ? (
        <div className="list">
          {items.map((item) => {
            if (item.status === 'IN_PROGRESS') {
              return (
                <div className="list-row" key={item.id}>
                  <div>
                    <strong>{item.topic.name}</strong>
                    <small>
                      Đang học · {item.answeredCount}/{item.quizTotal ?? '?'} câu · bắt đầu {new Date(item.startedAt).toLocaleString('vi-VN')}
                    </small>
                  </div>
                  <div className="card-meta" style={{ gap: 12 }}>
                    <Status value="IN_PROGRESS" />
                    <Link className="button" href={`/topics/${item.topicId}`}>Tiếp tục <ArrowRight /></Link>
                    <button type="button" className="button secondary" onClick={() => setAbandonId(item.id)}>Hủy bài dở</button>
                  </div>
                </div>
              );
            }
            if (item.status === 'EXPIRED') {
              return (
                <div className="list-row" key={item.id}>
                  <div>
                    <strong>{item.topic.name}</strong>
                    <small>
                      Hết hạn · đã trả lời {item.answeredCount}/{item.quizTotal ?? '?'} · {new Date(item.startedAt).toLocaleString('vi-VN')}
                    </small>
                  </div>
                  <div className="card-meta" style={{ gap: 12 }}>
                    <Status value="EXPIRED" />
                    <Link className="button secondary" href={`/topics/${item.topicId}`}>Làm lại</Link>
                  </div>
                </div>
              );
            }
            return (
              <Link className="list-row" key={item.id} href={`/history/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div>
                  <strong>{item.topic.name}</strong>
                  <small>{item.submittedAt ? new Date(item.submittedAt).toLocaleString('vi-VN') : ''}</small>
                </div>
                <div className="card-meta">
                  <Status value="SUBMITTED" />
                  <span><Check size={16} /> {item.correctCount ?? 0}</span>
                  <span><X size={16} /> {(item.quizTotal ?? item.answeredCount) - (item.correctCount ?? 0)}</span>
                  <span><Clock size={16} /> {Math.round((item.durationMs || 0) / 1000)}s</span>
                  <strong>{Math.round((item.score || 0) * 100)}%</strong>
                </div>
              </Link>
            );
          })}
          <PaginationNav {...pagination} disabled={loading} onChange={setPage} />
        </div>
      ) : <Empty title="Chưa có lần làm bài" description="Bắt đầu một topic — bài dở sẽ hiện ở đây để bạn tiếp tục." />}
      <ConfirmDialog
        open={Boolean(abandonId)}
        title="Hủy bài đang làm?"
        message="Tiến độ đã lưu sẽ bị bỏ. Bạn có thể bắt đầu lại từ đầu sau đó."
        confirmLabel="Hủy bài dở"
        danger
        busy={abandoning}
        onCancel={() => { if (!abandoning) setAbandonId(null); }}
        onConfirm={() => void abandon()}
      />
    </>
  );
}
