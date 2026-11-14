"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";

export default function HomePage() {
  const { user, loading, login } = useAuth();
  const [authError, setAuthError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Video thao tác chạy chậm lại (0.75x) để dễ theo dõi từng thao tác.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.9;
  }, []);
  useEffect(() => {
    setAuthError(new URLSearchParams(window.location.search).has("auth_error"));
  }, []);
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Điều hướng đầu trang">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bcn-card-back.webp" alt="BCN" className="brand-logo" width={36} height={36} />
          <strong>BCN Arena</strong>
        </Link>
        <div className="landing-actions">
          <Link className="text-link" href="/verify">
            Xác minh chứng nhận
          </Link>
          {user ? (
            <Link className="button secondary" href="/dashboard">
              Vào ứng dụng <ArrowRight />
            </Link>
          ) : null}
        </div>
      </nav>
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Học tập dành cho BCN</p>
          <h1><span>Luyện đúng trọng tâm.</span> <span className="hero-accent">Tiến bộ thấy rõ.</span></h1>
          <p>
            Khóa học, bài quiz, project và chứng nhận trong một luồng học tập
            liền mạch.
          </p>
          {authError ? (
            <p className="form-error" role="alert">
              Đăng nhập không thành công hoặc đã hết hạn. Vui lòng thử lại.
            </p>
          ) : null}
          {user ? (
            <Link className="button" href="/dashboard">
              Tiếp tục học <ArrowRight />
            </Link>
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
        {/* Minh họa mới (06/11/2026): cụm laptop + tablet + điện thoại đang dùng app.
            Màn hình laptop chạy video thao tác làm quiz thật; tablet/điện thoại dùng ảnh chụp thật. */}
        <div className="landing-visual" aria-label="Minh họa ứng dụng trên laptop, tablet và điện thoại">
          <div className="devices">
            <div className="device device-laptop">
              <div className="device-screen">
                <video ref={videoRef} src="/brand/demo-quiz.mp4" autoPlay muted loop playsInline aria-label="Video thao tác làm quiz trên web" />
              </div>
              <div className="device-base" aria-hidden="true" />
            </div>
            <div className="device device-tablet">
              <div className="device-screen">
                <img src="/brand/shot-dashboard.png" alt="Màn hình Tổng quan của BCN Arena trên tablet" />
              </div>
            </div>
            <div className="device device-phone">
              <div className="device-screen">
                <img src="/brand/shot-quiz-mobile.png" alt="Màn hình làm bài của BCN Arena trên điện thoại" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
