'use client';

import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck } from '@phosphor-icons/react';
import { useAuth } from '@/components/auth-provider';

export default function HomePage() {
  const { user, loading, login } = useAuth();
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Điều hướng đầu trang">
        <Link href="/" className="brand"><span>B</span><strong>BCN Quiz</strong></Link>
        <div className="landing-actions">
          <Link className="text-link" href="/verify">Xác minh chứng chỉ</Link>
          {user ? <Link className="button secondary" href="/dashboard">Vào ứng dụng <ArrowRight /></Link> : null}
        </div>
      </nav>
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Học tập dành cho BCN</p>
          <h1>Luyện đúng trọng tâm. Tiến bộ thấy rõ.</h1>
          <p>Khóa học, bài quiz, project và chứng chỉ trong một luồng học tập liền mạch.</p>
          {user ? (
            <Link className="button" href="/dashboard">Tiếp tục học <ArrowRight /></Link>
          ) : (
            <div className="landing-cta">
              <button className="button" disabled={loading} onClick={login}>
                <ShieldCheck /> Tiếp tục với tài khoản BCN
              </button>
              <p className="landing-cta-hint">
                Bạn sẽ đăng nhập trên BCN Account rồi quay lại Quiz.
              </p>
            </div>
          )}
        </div>
        <div className="landing-visual" aria-label="Minh họa một câu hỏi quiz">
          <div className="landing-sheet">
            <p className="eyebrow">NestJS fundamentals</p>
            <h2>Guard được chạy ở giai đoạn nào?</h2>
            <div className="landing-option">Trước middleware</div>
            <div className="landing-option correct"><Check size={18} /> Sau middleware, trước interceptor</div>
            <div className="landing-option">Sau controller handler</div>
          </div>
        </div>
      </section>
    </main>
  );
}
