'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { request } from '@/lib/api';
import type { AdminCertificateRequest, AdminCertificateRequestDetail, BulkApproveResult, CertificateRequestStatus, Course, Pagination } from '@/lib/types';
import { CERT_STATUS, CertStatus } from './certificate-status';
import { ConfirmDialog, Empty, ErrorState, Loading, PaginationNav } from './ui';

type ListData = Pagination<AdminCertificateRequest> & { pendingCount: number; onHoldCount: number; profilesAvailable?: boolean };
type Action = { kind: 'APPROVE' | 'REJECT' | 'REVOKE'; id: string; /** APPROVE of a REVOKED certificate: undoes the revocation, needs a written reason. */ reinstate?: boolean };

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
  // Duyệt hàng loạt: ticked request ids (only PENDING rows can be ticked), the confirm dialog and the last result.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkResult, setBulkResult] = useState<BulkApproveResult | null>(null);
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
      // The pending queue is shown 100 at a time so one tick-all covers a whole batch.
      const params = new URLSearchParams({ page: String(page), limit: status === 'PENDING' ? '100' : '20' });
      if (status) params.set('status', status);
      if (courseId) params.set('courseId', courseId);
      if (search) params.set('search', search);
      const next = await request.get<ListData>(`/admin/certificate-requests?${params}`);
      if (current === listNumber.current) setData(next);
    } catch (reason) { if (current === listNumber.current) setError(reason instanceof Error ? reason.message : 'Không tải được danh sách'); }
    finally { if (current === listNumber.current) setLoading(false); }
  }, [status, courseId, search, page]);
  useEffect(() => { void load(); }, [load]);
  // A selection never survives a change of filter or page (it could point at rows that are no longer shown).
  useEffect(() => { setSelected(new Set()); }, [status, courseId, search, page]);

  const loadDetail = useCallback(async (id: string, keepError = false) => {
    const current = ++detailNumber.current;
    setDetailLoading(true); if (!keepError) setDetailError('');
    try {
      const next = await request.get<AdminCertificateRequestDetail>(`/admin/certificate-requests/${encodeURIComponent(id)}`);
      if (current === detailNumber.current) setDetail(next);
    } catch (reason) { if (current === detailNumber.current) { setDetail(null); setDetailError(reason instanceof Error ? reason.message : 'Không tải được chi tiết'); } }
    finally { if (current === detailNumber.current) setDetailLoading(false); }
  }, []);
  // Switching rows must not show the previous learner's detail (with live buttons) while the next one loads.
  useEffect(() => { setDetail(null); if (openId) void loadDetail(openId); else detailNumber.current += 1; }, [openId, loadDetail]);

  const run = async () => {
    if (!action) return;
    const trimmed = note.trim();
    if ((action.kind !== 'APPROVE' || action.reinstate) && !trimmed) { setDetailError('Cần nhập lý do.'); return; }
    setBusy(true); setDetailError(''); setNotice('');
    try {
      if (action.kind === 'REVOKE') await request.patch(`/admin/certificate-requests/${encodeURIComponent(action.id)}/revoke`, { reason: trimmed });
      else await request.patch(`/admin/certificate-requests/${encodeURIComponent(action.id)}/review`, { decision: action.kind, note: trimmed || undefined });
      setNotice(action.kind === 'APPROVE' ? (action.reinstate ? 'Đã cấp lại chứng chỉ.' : 'Đã duyệt và cấp chứng chỉ.') : action.kind === 'REJECT' ? 'Đã từ chối yêu cầu.' : 'Đã thu hồi chứng chỉ.');
      setAction(null); setNote('');
      await Promise.all([load(), loadDetail(action.id)]);
    } catch (reason) {
      // A conflict means the request changed meanwhile (another admin, or the course changed): show why and refresh.
      setDetailError(reason instanceof Error ? reason.message : 'Không thực hiện được');
      setAction(null);
      // The reload must not wipe the reason the server gave (keepError).
      await Promise.all([load(), loadDetail(action.id, true)]);
    } finally { setBusy(false); }
  };

  const pendingRows = data ? data.items.filter((item) => item.status === 'PENDING') : [];
  const allTicked = pendingRows.length > 0 && pendingRows.every((item) => selected.has(item.id));
  const toggle = (id: string) => setSelected((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const nameOf = (id: string) => { const row = data?.items.find((item) => item.id === id); return row ? who(row.user) : id; };

  const runBulk = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true); setError(''); setNotice(''); setBulkResult(null);
    try {
      const result = await request.post<BulkApproveResult>('/admin/certificate-requests/bulk-approve', { ids, note: bulkNote.trim() || undefined });
      setBulkResult(result);
      setNotice(`Đã duyệt ${result.approved.length} yêu cầu${result.skipped.length ? `, bỏ qua ${result.skipped.length}` : ''}.`);
      setBulkOpen(false); setBulkNote(''); setSelected(new Set()); setOpenId('');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không duyệt hàng loạt được'); setBulkOpen(false); }
    finally { setBusy(false); }
  };

  const actionCopy = action && {
    APPROVE: action.reinstate ? { title: 'Cấp lại chứng chỉ đã thu hồi?', message: 'Chỉ hoàn tác việc thu hồi: giữ nguyên mã và ngày cấp ban đầu, không kiểm tra lại nội dung khóa học. Học viên sẽ nhận thông báo.', confirm: 'Cấp lại', noteLabel: 'Lý do cấp lại (bắt buộc)', required: true, danger: false } : { title: 'Duyệt và cấp chứng chỉ?', message: 'Hệ thống kiểm tra lại điều kiện theo khóa học hiện tại trước khi cấp. Học viên sẽ nhận thông báo.', confirm: 'Duyệt và cấp', noteLabel: 'Ghi chú (không bắt buộc)', required: false, danger: false },
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
    {bulkResult ? <div className="panel" id="bulk-result" role="status">
      <strong>Kết quả duyệt hàng loạt: đã duyệt {bulkResult.approved.length}, bỏ qua {bulkResult.skipped.length}.</strong>
      {bulkResult.skipped.length ? <ul>{bulkResult.skipped.map((item) => <li key={item.id}>{nameOf(item.id)}: {item.reason}</li>)}</ul> : null}
      <button className="button secondary" onClick={() => setBulkResult(null)}>Đóng kết quả</button>
    </div> : null}
    {error ? <ErrorState message={error} retry={() => void load()} /> : null}
    {loading && !data ? <Loading label="Đang tải yêu cầu" /> : null}
    {data ? (data.items.length ? <>
      {pendingRows.length ? <div className="list-actions" role="group" aria-label="Duyệt hàng loạt">
        <label><input type="checkbox" checked={allTicked} onChange={() => setSelected(allTicked ? new Set() : new Set(pendingRows.map((item) => item.id)))} /> Chọn tất cả chờ duyệt trên trang ({pendingRows.length})</label>
        <button className="button" disabled={!selected.size || busy} onClick={() => { setBulkNote(''); setBulkOpen(true); }}>Duyệt {selected.size ? `${selected.size} đã chọn` : 'hàng loạt'}</button>
      </div> : null}
      <div className="list">{data.items.map((item) => <div className="list-row" key={item.id}>
        {item.status === 'PENDING' ? <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} aria-label={`Chọn ${who(item.user)}`} /> : null}
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
        <p role="status" className={detail.eligibility.eligible || detail.status === 'REVOKED' ? 'notice' : 'form-error'}>{detail.eligibility.eligible ? 'Đủ điều kiện: đã hoàn thành khóa học theo nội dung hiện tại.' : detail.status === 'REVOKED' ? `Học viên hiện chưa hoàn thành khóa học theo nội dung mới (${detail.eligibility.reasons.join('; ') || 'khóa học chưa hoàn thành'}). Vẫn có thể cấp lại chứng chỉ đã thu hồi: việc này chỉ hoàn tác thu hồi và cần ghi lý do.` : `Chưa đủ điều kiện: ${detail.eligibility.reasons.join('; ') || 'khóa học chưa hoàn thành'}`}</p>
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
          {detail.status === 'PENDING' || detail.status === 'REVOKED' ? <button className="button" disabled={detail.status === 'PENDING' && !detail.eligibility.eligible} onClick={() => { setAction({ kind: 'APPROVE', id: detail.id, reinstate: detail.status === 'REVOKED' }); setNote(''); setDetailError(''); }}>{detail.status === 'REVOKED' ? 'Cấp lại' : 'Duyệt'}</button> : null}
          {detail.status === 'PENDING' && !detail.eligibility.eligible ? <small id="certificate-approve-blocked">Chưa thể duyệt: {detail.eligibility.reasons.join('; ') || 'khóa học chưa hoàn thành'}.</small> : null}
          {detail.status === 'PENDING' ? <button className="button danger" onClick={() => { setAction({ kind: 'REJECT', id: detail.id }); setNote(''); setDetailError(''); }}>Từ chối</button> : null}
          {detail.status === 'APPROVED' ? <button className="button danger" onClick={() => { setAction({ kind: 'REVOKE', id: detail.id }); setNote(''); setDetailError(''); }}>Thu hồi chứng chỉ</button> : null}
          {detail.status === 'ON_HOLD' ? <small>Đang tạm hoãn: chờ học viên hoàn thành nội dung mới của khóa học.</small> : null}
        </div>
      </> : null}
    </section> : null}

    <ConfirmDialog
      open={bulkOpen}
      title={`Duyệt ${selected.size} yêu cầu?`}
      message="Hệ thống kiểm tra điều kiện từng học viên theo khóa học hiện tại. Ai chưa đủ điều kiện sẽ bị bỏ qua và được nêu lý do; những người còn lại được cấp chứng chỉ và nhận thông báo."
      confirmLabel="Duyệt tất cả đã chọn"
      busy={busy}
      noteLabel="Ghi chú chung (không bắt buộc)"
      noteValue={bulkNote}
      notePlaceholder="Ghi chú nội bộ"
      onNoteChange={setBulkNote}
      onCancel={() => { if (!busy) { setBulkOpen(false); setBulkNote(''); } }}
      onConfirm={() => void runBulk()}
    />
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
