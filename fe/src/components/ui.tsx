'use client';

import { Warning } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';

export function Loading({ label = 'Đang tải dữ liệu' }: { label?: string }) {
  return (
    <div className="skeleton-panel" role="status" aria-live="polite">
      <p className="skeleton-label">{label}…</p>
      <div className="skeleton skeleton-title" aria-hidden="true" />
      <div className="skeleton skeleton-line" aria-hidden="true" />
      <div className="skeleton skeleton-line short" aria-hidden="true" />
      <div className="skeleton skeleton-block" aria-hidden="true" />
    </div>
  );
}

export function ErrorState({ title = 'Không tải được dữ liệu', message, retry }: { title?: string; message: string; retry?: () => void }) {
  return (
    <div className="state-panel error" role="alert">
      <Warning aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {retry ? <button onClick={retry}>Thử lại</button> : null}
    </div>
  );
}

export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function PaginationNav({
  page,
  totalPages,
  total,
  disabled = false,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  disabled?: boolean;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="list-actions" style={{ justifyContent: 'center', marginTop: 20 }} aria-label="Phân trang">
      <button type="button" className="button secondary" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>Trang trước</button>
      <span>Trang {page}/{totalPages} · {total} mục</span>
      <button type="button" className="button secondary" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>Trang sau</button>
    </nav>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className="progress-wrap" aria-label={`${label || 'Tiến độ'} ${safe}%`}>
      <div className="progress-meta"><span>{label || 'Tiến độ'}</span><strong>{safe}%</strong></div>
      <div className="progress-track"><span style={{ width: `${safe}%` }} /></div>
    </div>
  );
}

export function Status({ value }: { value?: string | null }) {
  const labels: Record<string, string> = {
    IN_PROGRESS: 'Đang học',
    SUBMITTED: 'Đã nộp',
    EXPIRED: 'Hết hạn',
    TOPICS_COMPLETED: 'Đã xong phần học',
    PROJECT_PENDING_APPROVAL: 'Chờ duyệt project',
    COMPLETED: 'Hoàn thành',
    PENDING_REVIEW: 'Chờ duyệt',
    NOT_SUBMITTED: 'Chưa nộp',
    APPROVED: 'Đã duyệt',
    REJECTED: 'Cần chỉnh sửa',
    OPEN: 'Đang mở',
    SCHEDULED: 'Chưa mở',
    CLOSED: 'Đã đóng',
  };
  const key = (value || 'IN_PROGRESS').toUpperCase();
  return <span className={`status status-${key.toLowerCase()}`}>{labels[key] || key}</span>;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  danger = false,
  cancelPrimary = false,
  busy = false,
  noteLabel,
  noteValue,
  notePlaceholder,
  noteRequired = false,
  onNoteChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Nút quay lại nổi bật hơn nút xác nhận, và nhận focus đầu tiên (dùng cho hành động khó hoàn tác). */
  cancelPrimary?: boolean;
  busy?: boolean;
  noteLabel?: string;
  noteValue?: string;
  notePlaceholder?: string;
  noteRequired?: boolean;
  onNoteChange?: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const latest = useRef({ busy, onCancel });
  useEffect(() => { latest.current = { busy, onCancel }; });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => dialogRef.current?.querySelectorAll<HTMLElement>('textarea, button:not(:disabled)');
    (cancelPrimary ? cancelRef.current : focusable()?.[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.busy) { latest.current.onCancel(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [open, cancelPrimary]);

  if (!open) return null;
  const noteBlocked = Boolean(noteRequired && !(noteValue || '').trim());
  return (
    <div className="dialog-backdrop" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
      >
        <strong id="confirm-dialog-title">{title}</strong>
        <p id="confirm-dialog-message">{message}</p>
        {onNoteChange ? (
          <label className="field" style={{ marginBottom: 16 }}>
            <span>{noteLabel || 'Ghi chú'}</span>
            <textarea
              value={noteValue || ''}
              placeholder={notePlaceholder}
              rows={3}
              disabled={busy}
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>
        ) : null}
        <div className="list-actions" style={{ justifyContent: 'flex-end' }}>
          <button ref={cancelRef} type="button" className={`button ${cancelPrimary ? '' : 'secondary'}`} disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={`button ${danger ? 'danger' : cancelPrimary ? 'secondary' : ''}`}
            disabled={busy || noteBlocked}
            onClick={onConfirm}
          >
            {busy ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
