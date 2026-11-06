'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { request } from '@/lib/api';
import type { AdminCertificateRequest, AdminCertificateRequestDetail, CertificateRequestStatus, Course, Pagination } from '@/lib/types';
import { CERT_STATUS, CertStatus } from './certificate-status';
import { ConfirmDialog, Empty, ErrorState, Loading, PaginationNav } from './ui';

type ListData = Pagination<AdminCertificateRequest> & { pendingCount: number; onHoldCount: number; profilesAvailable?: boolean };
type Action = { kind: 'APPROVE' | 'REJECT' | 'REVOKE'; id: string };

const STATUSES: CertificateRequestStatus[] = ['PENDING', 'ON_HOLD', 'APPROVED', 'REJECTED', 'REVOKED'];
const when = (value: string | null) => (value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '—');
const who = (user: AdminCertificateRequest['user']) => user.fullName || user.email || `Học viên ${user.id}`;

/** Admin review of certificate requests: the live eligibility of the learner is shown next to the decision buttons. */
export function AdminCertificates() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [status, setStatus] = useState<CertificateRequestStatus | ''>('PENDING');
  const [courseId, setCourseId] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');
  const [detail, setDetail] = useState<AdminCertificateRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const listNumber = useRef(0);
  const detailNumber = useRef(0);

  useEffect(() => { void request.get<Pagination<Course>>('/course?page=1&limit=100').then((value) => setCourses(value.items)).catch(() => setCourses([])); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const current = ++listNumber.current;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (courseId) params.set('courseId', courseId);
      if (search) params.set('search', search);
      const next = await request.get<ListData>(`/admin/certificate-requests?${params}`);
      if (current === listNumber.current) setData(next);
    } catch (reason) { if (current === listNumber.current) setError(reason instanceof Error ? reason.message : 'Không tải được danh sách'); }
    finally { if (current === listNumber.current) setLoading(false); }
  }, [status, courseId, search, page]);
  useEffect(() => { void load(); }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    const current = ++detailNumber.current;
    setDetailLoading(true); setDetailError('');
    try {
      const next = await request.get<AdminCertificateRequestDetail>(`/admin/certificate-requests/${encodeURIComponent(id)}`);
      if (current === detailNumber.current) setDetail(next);
    } catch (reason) { if (current === detailNumber.current) { setDetail(null); setDetailError(reason instanceof Error ? reason.message : 'Không tải được chi tiết'); } }
    finally { if (current === detailNumber.current) setDetailLoading(false); }
  }, []);
  useEffect(() => { if (openId) void loadDetail(openId); else { detailNumber.current += 1; setDetail(null); } }, [openId, loadDetail]);

  const run = async () => {
    if (!action) return;
    const trimmed = note.trim();
    if ((action.kind !== 'APPROVE') && !trimmed) { setDetailError('Cần nhập lý do.'); return; }
    setBusy(true); setDetailError(''); setNotice('');
    try {
      if (action.kind === 'REVOKE') await request.patch(`/admin/certificate-requests/${encodeURIComponent(action.id)}/revoke`, { reason: trimmed });
      else await request.patch(`/admin/certificate-requests/${encodeURIComponent(action.id)}/review`, { decision: action.kind, note: trimmed || undefined });
      setNotice(action.kind === 'APPROVE' ? 'Đã duyệt và cấp chứng chỉ.' : action.kind === 'REJECT' ? 'Đã từ chối yêu cầu.' : 'Đã thu hồi chứng chỉ.');
      setAction(null); setNote('');
      await Promise.all([load(), loadDetail(action.id)]);
    } catch (reason) {
      // A conflict means the request changed meanwhile (another admin, or the course changed): show why and refresh.
      setDetailError(reason instanceof Error ? reason.message : 'Không thực hiện được');
      setAction(null);
      await Promise.all([load(), loadDetail(action.id)]);
    } finally { setBusy(false); }
  };

  const actionCopy = action && {
    APPROVE: { title: 'Duyệt và cấp chứng chỉ?', message: 'Hệ thống kiểm tra lại điều kiện theo khóa học hiện tại trước khi cấp. Học viên sẽ nhận thông báo.', confirm: 'Duyệt và cấp', noteLabel: 'Ghi chú (không bắt buộc)', required: false, danger: false },
    REJECT: { title: 'Từ chối yêu cầu?', message: 'Học viên sẽ thấy lý do và có thể gửi lại yêu cầu.', confirm: 'Từ chối', noteLabel: 'Lý do (bắt buộc)', required: true, danger: true },
    REVOKE: { title: 'Thu hồi chứng chỉ?', message: 'Mã chứng chỉ sẽ báo không còn hợp lệ ở trang xác minh công khai. Học viên sẽ thấy lý do.', confirm: 'Thu hồi', noteLabel: 'Lý do (bắt buộc)', required: true, danger: true },
  }[action.kind];

  return <section className="section panel" aria-label="Duyệt chứng chỉ">
    <div className="section-title"><h2>Duyệt chứng chỉ</h2>{data ? <span aria-live="polite">Chờ duyệt: <strong>{data.pendingCount}</strong> · Tạm hoãn: <strong>{data.onHoldCount}</strong></span> : null}</div>
    <p>Hoàn thành khóa học chỉ tạo yêu cầu. Chứng chỉ chỉ được cấp khi bạn duyệt.</p>
    <div className="grid grid-2">
      <label className="field"><span>Trạng thái</span><select value={status} onChange={(event) => { setStatus(event.target.value as CertificateRequestStatus | ''); setPage(1); }}><option value="">Tất cả</option>{STATUSES.map((item) => <option key={item} value={item}>{CERT_STATUS[item].label}</option>)}</select></label>
      <label className="field"><span>Khóa học</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setPage(1); }}><option value="">Tất cả khóa học</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Tìm theo tên người dùng</span><span className="leaderboard-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc email" />{query.trim() && (query.trim() !== search || loading) ? <CircleNotch className="spin" aria-label="Đang tìm kiếm" /> : null}</span></label>
    </div>
    {notice ? <p className="notice" role="status">{notice}</p> : null}
    {error ? <ErrorState message={error} retry={() => void load()} /> : null}
    {loading && !data ? <Loading label="Đang tải yêu cầu" /> : null}
    {data ? (data.items.length ? <>
      <div className="list">{data.items.map((item) => <div className="list-row" key={item.id}>
        <div><strong>{who(item.user)}</strong><small>{item.user.email ? `${item.user.email} · ` : ''}{item.course.name} · yêu cầu {when(item.requestedAt)}</small></div>
        <div className="list-actions"><CertStatus value={item.status} /><button className="button secondary" aria-pressed={openId === item.id} onClick={() => setOpenId(openId === item.id ? '' : item.id)}>{openId === item.id ? 'Đóng' : 'Xem xét'}</button></div>
      </div>)}</div>
      <PaginationNav {...data.pagination} disabled={loading} onChange={setPage} />
    </> : <Empty title="Không có yêu cầu nào" description={status === 'PENDING' ? 'Chưa có học viên nào chờ duyệt chứng chỉ.' : 'Không có yêu cầu phù hợp bộ lọc.'} />) : null}

    {openId ? <section className="panel section" id="certificate-detail" aria-label="Chi tiết yêu cầu" aria-busy={detailLoading}>
      {detailLoading && !detail ? <Loading label="Đang kiểm tra điều kiện" /> : null}
      {detailError ? <p className="form-error" role="alert">{detailError}</p> : null}
      {detail ? <>
        <div className="section-title"><h3>{who(detail.user)} · {detail.eligibility.course.name}</h3><CertStatus value={detail.status} /></div>
        <p role="status" className={detail.eligibility.eligible ? 'notice' : 'form-error'}>{detail.eligibility.eligible ? 'Đủ điều kiện: đã hoàn thành khóa học theo nội dung hiện tại.' : `Chưa đủ điều kiện: ${detail.eligibility.reasons.join('; ') || 'khóa học chưa hoàn thành'}`}</p>
        {detail.eligibility.warnings.map((warning) => <p className="notice" key={warning}>{warning}</p>)}
        <p>Topic: <strong>{detail.eligibility.topicsDone}/{detail.eligibility.topicsTotal}</strong>{detail.eligibility.project.required ? <> · Đồ án: <strong>{detail.eligibility.project.status ?? 'chưa nộp'}</strong></> : ' · Không có đồ án'}</p>
        <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Các topic của khóa học, cuộn ngang để xem hết cột">
          <table className="admin-leaderboard-table"><caption className="sr-only">Tiến độ từng topic</caption>
            <thead><tr><th scope="col">Topic</th><th scope="col">Trạng thái</th><th className="num" scope="col">Chính xác</th><th className="num" scope="col">Số lượt</th></tr></thead>
            <tbody>{detail.eligibility.topics.map((topic) => <tr key={topic.id}>
              <th scope="row">{topic.name}{topic.addedAfterRequest ? <span className="status status-late"> Mới thêm</span> : null}</th>
              <td>{topic.completed ? 'Đã hoàn thành' : 'Chưa hoàn thành'}</td>
              <td className="num">{topic.accuracy == null ? '—' : `${topic.accuracy}%`}</td>
              <td className="num">{topic.totalAttempts}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p><small>Yêu cầu {when(detail.requestedAt)}{detail.resubmittedAt ? ` · gửi lại ${when(detail.resubmittedAt)}` : ''}{detail.reviewedAt ? ` · quyết định ${when(detail.reviewedAt)}` : ''}</small></p>
        {detail.reviewerNote ? <p className="notice"><strong>Ghi chú/lý do gần nhất:</strong> {detail.reviewerNote}</p> : null}
        {detail.certificate ? <p>Mã chứng chỉ: <code>{detail.certificate.certificateCode}</code>{detail.certificate.revokedAt ? ` · đã thu hồi ${when(detail.certificate.revokedAt)}` : ''}</p> : null}
        <div className="list-actions">
          {detail.status === 'PENDING' || detail.status === 'REVOKED' ? <button className="button" disabled={!detail.eligibility.eligible} onClick={() => { setAction({ kind: 'APPROVE', id: detail.id }); setNote(''); setDetailError(''); }}>{detail.status === 'REVOKED' ? 'Cấp lại' : 'Duyệt'}</button> : null}
          {detail.status === 'PENDING' ? <button className="button danger" onClick={() => { setAction({ kind: 'REJECT', id: detail.id }); setNote(''); setDetailError(''); }}>Từ chối</button> : null}
          {detail.status === 'APPROVED' ? <button className="button danger" onClick={() => { setAction({ kind: 'REVOKE', id: detail.id }); setNote(''); setDetailError(''); }}>Thu hồi chứng chỉ</button> : null}
          {detail.status === 'ON_HOLD' ? <small>Đang tạm hoãn: chờ học viên hoàn thành nội dung mới của khóa học.</small> : null}
        </div>
      </> : null}
    </section> : null}

    <ConfirmDialog
      open={Boolean(action)}
      title={actionCopy?.title ?? ''}
      message={actionCopy?.message ?? ''}
      confirmLabel={actionCopy?.confirm}
      danger={actionCopy?.danger}
      busy={busy}
      noteLabel={actionCopy?.noteLabel}
      noteValue={note}
      noteRequired={actionCopy?.required}
      notePlaceholder={actionCopy?.required ? 'Học viên sẽ đọc được nội dung này' : 'Ghi chú nội bộ'}
      onNoteChange={setNote}
      onCancel={() => { if (!busy) { setAction(null); setNote(''); } }}
      onConfirm={() => void run()}
    />
  </section>;
}
