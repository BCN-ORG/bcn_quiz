'use client';

import { Certificate, Copy, ArrowSquareOut, CheckCircle } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { CERT_STATUS, CertStatus } from '@/components/certificate-status';
import { Empty, ErrorState, Loading, PaginationNav } from '@/components/ui';
import { request } from '@/lib/api';
import type { MyCertificateRequest } from '@/lib/types';

export default function CertificatesPage() {
  const [items, setItems] = useState<MyCertificateRequest[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems((await request.get<{ items: MyCertificateRequest[] }>('/certificate/requests/me')).items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được chứng nhận');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resubmit = async (item: MyCertificateRequest) => {
    setBusyId(item.id);
    setActionError('');
    try {
      await request.post(`/certificate/requests/${encodeURIComponent(item.course.id)}/resubmit`, {});
      await load();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không gửi lại được');
    } finally {
      setBusyId('');
    }
  };

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;

  const pagedItems = items.slice((page - 1) * 6, page * 6);
  const totalPages = Math.max(1, Math.ceil(items.length / 6));

  return (
    <div className="cert-page-container">
      <header className="page-heading">
        <div>
          <h1>Chứng nhận năng lực BCN</h1>
          <p>
            Hoàn thành khóa học để gửi yêu cầu cấp chứng nhận. Chia sẻ mã chứng nhận hoặc đường link xác minh công khai.
          </p>
        </div>
      </header>

      {actionError ? <p className="notice notice-danger" role="alert">{actionError}</p> : null}

      {items.length ? (
        <>
          <div className="cert-grid">
            {pagedItems.map((item) => {
              const issued = item.status === 'APPROVED' && item.certificate && !item.certificate.revokedAt;
              const certCode = item.certificate?.certificateCode;
              return (
                <article
                  className={`panel cert-card ${issued ? 'is-issued' : ''}`}
                  key={item.id}
                  aria-label={`Chứng nhận ${item.course.name}`}
                >
                  <div className="cert-card-header">
                    <div className="cert-icon-badge" aria-hidden="true">
                      <Certificate size={26} weight={issued ? 'fill' : 'duotone'} />
                    </div>
                    <CertStatus value={item.status} />
                  </div>

                  <div className="cert-card-body">
                    <h2 className="cert-course-title">{item.course.name}</h2>
                    <p className="cert-hint">{CERT_STATUS[item.status].hint}</p>

                    {(item.status === 'REJECTED' || item.status === 'REVOKED') && item.reviewerNote ? (
                      <div className="notice notice-danger cert-rejection-note">
                        <strong>Lý do từ chối:</strong> {item.reviewerNote}
                      </div>
                    ) : null}

                    {issued && item.certificate && certCode ? (
                      <div className="cert-issued-box">
                        <div className="cert-meta-row">
                          <span className="cert-meta-label">Ngày cấp:</span>
                          <span className="cert-meta-val">
                            {new Date(item.certificate.issuedAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>

                        <div className="cert-code-row">
                          <span className="cert-meta-label">Mã chứng nhận:</span>
                          <div className="cert-code-pill">
                            <code>{certCode}</code>
                            <button
                              type="button"
                              className="icon-button cert-copy-btn"
                              onClick={() => handleCopy(certCode)}
                              title={copiedCode === certCode ? 'Đã sao chép!' : 'Sao chép mã'}
                              aria-label="Sao chép mã"
                            >
                              {copiedCode === certCode ? (
                                <CheckCircle size={15} weight="fill" style={{ color: 'var(--accent)' }} />
                              ) : (
                                <Copy size={15} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="cert-card-footer">
                    {issued && certCode ? (
                      <a
                        className="button cert-verify-action"
                        href={`/verify?code=${encodeURIComponent(certCode)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <CheckCircle size={16} weight="fill" />
                        <span>Xác minh trực tuyến</span>
                        <ArrowSquareOut size={14} weight="bold" />
                      </a>
                    ) : null}

                    {item.status === 'REJECTED' ? (
                      <button
                        type="button"
                        className="button"
                        disabled={busyId === item.id}
                        onClick={() => void resubmit(item)}
                      >
                        {busyId === item.id ? 'Đang gửi…' : 'Gửi lại yêu cầu'}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="cert-pagination-wrap">
            <PaginationNav page={page} totalPages={totalPages} total={items.length} onChange={setPage} />
          </div>
        </>
      ) : (
        <Empty
          title="Chưa có chứng nhận"
          description="Hoàn thành các chủ đề và dự án khóa học để gửi yêu cầu nhận chứng nhận chính thức từ BCN."
        />
      )}
    </div>
  );
}
