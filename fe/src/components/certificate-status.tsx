import type { CertificateRequestStatus } from '@/lib/types';

/** What each certificate request status means to the learner (the admin decides; nothing is automatic). */
export const CERT_STATUS: Record<CertificateRequestStatus, { label: string; cls: string; hint: string }> = {
  PENDING: { label: 'Chờ duyệt', cls: 'pending_review', hint: 'Bạn đã hoàn thành khóa học. Quản trị viên sẽ xem xét và cấp chứng chỉ.' },
  ON_HOLD: { label: 'Tạm hoãn', cls: 'in_progress', hint: 'Khóa học vừa có thêm nội dung. Hoàn thành phần mới để yêu cầu được xem xét lại.' },
  APPROVED: { label: 'Đã cấp', cls: 'approved', hint: 'Chứng chỉ đã được cấp.' },
  REJECTED: { label: 'Bị từ chối', cls: 'rejected', hint: 'Yêu cầu chưa được duyệt. Xem lý do bên dưới, sau đó gửi lại.' },
  REVOKED: { label: 'Đã thu hồi', cls: 'rejected', hint: 'Chứng chỉ đã bị thu hồi.' },
};

export function CertStatus({ value }: { value: CertificateRequestStatus }) {
  const info = CERT_STATUS[value];
  return <span className={`status status-${info.cls}`}>{info.label}</span>;
}
