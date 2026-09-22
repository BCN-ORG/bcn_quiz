'use client';

import { Certificate, Copy, ArrowSquareOut } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorState, Loading, PaginationNav } from '@/components/ui';
import { request } from '@/lib/api';
import type { Certificate as QuizCertificate, Pagination } from '@/lib/types';

export default function CertificatesPage() {
  const [items, setItems] = useState<QuizCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const load = useCallback(async (targetPage = page) => {
    setLoading(true); setError('');
    try {
      const data = await request.get<Pagination<QuizCertificate>>(`/certificate/me?page=${targetPage}&limit=10`);
      setItems(data.items); setPagination(data.pagination);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được chứng chỉ'); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(page); }, [load, page]);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Thành tựu</p><h1>Chứng chỉ</h1><p>Chia sẻ mã để người khác xác minh kết quả học tập.</p></div></header>
      {items.length ? <div className="grid grid-2">{items.map((item) => <article className="panel" key={item.id}><Certificate size={36} color="var(--accent)" /><h2>{item.course.name}</h2><p>Cấp ngày {new Date(item.issuedAt).toLocaleDateString('vi-VN')}</p><div className="list-row"><code>{item.certificateCode}</code><button className="icon-button" onClick={() => void navigator.clipboard.writeText(item.certificateCode)} aria-label="Sao chép mã"><Copy /></button></div><a className="button secondary" style={{ marginTop: 16 }} href={`/verify?code=${encodeURIComponent(item.certificateCode)}`} target="_blank" rel="noreferrer">Xác minh <ArrowSquareOut /></a></article>)}</div> : <Empty title="Chưa có chứng chỉ" description="Hoàn thành khóa học để nhận chứng chỉ đầu tiên." />}
      <PaginationNav {...pagination} disabled={loading} onChange={setPage} />
    </>
  );
}
