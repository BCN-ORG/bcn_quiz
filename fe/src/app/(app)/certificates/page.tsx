'use client';

import { Certificate, Copy, ArrowSquareOut } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { CERT_STATUS, CertStatus } from '@/components/certificate-status';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { request } from '@/lib/api';
import type { MyCertificateRequest } from '@/lib/types';

export default function CertificatesPage() {
  const [items, setItems] = useState<MyCertificateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems((await request.get<{ items: MyCertificateRequest[] }>('/certificate/requests/me')).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được chứng chỉ'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resubmit = async (item: MyCertificateRequest) => {
    setBusyId(item.id); setActionError('');
    try { await request.post(`/certificate/requests/${encodeURIComponent(item.course.id)}/resubmit`, {}); await load(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Không gửi lại được'); }
    finally { setBusyId(''); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Thành tựu</p><h1>Chứng chỉ</h1><p>Hoàn thành khóa học để gửi yêu cầu; quản trị viên xem xét rồi cấp chứng chỉ. Chia sẻ mã để người khác xác minh.</p></div></header>
      {actionError ? <p className="notice" role="alert">{actionError}</p> : null}
      {items.length ? <div className="grid grid-2">{items.map((item) => {
        const issued = item.status === 'APPROVED' && item.certificate && !item.certificate.revokedAt;
        return <article className="panel" key={item.id} aria-label={`Chứng chỉ ${item.course.name}`}>
          <Certificate size={36} color="var(--accent)" />
          <h2>{item.course.name}</h2>
          <p><CertStatus value={item.status} /></p>
          <p>{CERT_STATUS[item.status].hint}</p>
          {(item.status === 'REJECTED' || item.status === 'REVOKED') && item.reviewerNote ? <p className="notice"><strong>Lý do:</strong> {item.reviewerNote}</p> : null}
          {issued ? <>
            <p>Cấp ngày {new Date(item.certificate!.issuedAt).toLocaleDateString('vi-VN')}</p>
            <div className="list-row"><code>{item.certificate!.certificateCode}</code><button className="icon-button" onClick={() => void navigator.clipboard.writeText(item.certificate!.certificateCode)} aria-label="Sao chép mã"><Copy /></button></div>
            <a className="button secondary" style={{ marginTop: 16 }} href={`/verify?code=${encodeURIComponent(item.certificate!.certificateCode)}`} target="_blank" rel="noreferrer">Xác minh <ArrowSquareOut /></a>
          </> : null}
          {item.status === 'REJECTED' ? <button className="button" style={{ marginTop: 16 }} disabled={busyId === item.id} onClick={() => void resubmit(item)}>{busyId === item.id ? 'Đang gửi…' : 'Gửi lại yêu cầu'}</button> : null}
        </article>;
      })}</div> : <Empty title="Chưa có chứng chỉ" description="Hoàn thành khóa học để gửi yêu cầu nhận chứng chỉ." />}
    </>
  );
}
