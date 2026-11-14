import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="center-page">
      <div className="panel" style={{ maxWidth: 440, textAlign: 'center', padding: '32px 24px' }}>
        <h2 style={{ marginBottom: 12 }}>404 - Trang không tồn tại</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Đường dẫn bạn yêu cầu không tồn tại hoặc đã được di chuyển.
        </p>
        <Link href="/dashboard" className="button">
          Về trang tổng quan
        </Link>
      </div>
    </main>
  );
}
