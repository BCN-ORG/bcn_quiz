'use client';

import { CircleNotch, Warning } from '@phosphor-icons/react';

export function Loading({ label = 'Đang tải dữ liệu' }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <CircleNotch className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-panel error" role="alert">
      <Warning aria-hidden="true" />
      <div>
        <strong>Không tải được dữ liệu</strong>
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
  busy?: boolean;
  noteLabel?: string;
  noteValue?: string;
  notePlaceholder?: string;
  noteRequired?: boolean;
  onNoteChange?: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  const noteBlocked = Boolean(noteRequired && !(noteValue || '').trim());
  return (
    <div className="dialog-backdrop" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
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
          <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={`button ${danger ? 'danger' : ''}`}
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
