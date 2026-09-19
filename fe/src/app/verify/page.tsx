'use client';

import Link from 'next/link';
import { Certificate, CheckCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { request } from '@/lib/api';
import type { CertificateVerification } from '@/lib/types';

type Suggestion = {
  certificateCode: string;
  issuedAt: string;
  courseName: string;
};

export default function VerifyCertificatePage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<CertificateVerification | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const verify = async (certificateCode: string) => {
    if (!certificateCode.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setOpen(false);
    try {
      setResult(
        await request.get<CertificateVerification>(
          `/certificate/verify/${encodeURIComponent(certificateCode.trim())}`,
        ),
      );
    } catch {
      setError('Không tìm thấy chứng chỉ hợp lệ với mã này.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialCode =
      new URLSearchParams(window.location.search).get('code')?.trim() || '';
    setCode(initialCode);
    if (initialCode) void verify(initialCode);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = code.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void request
        .get<Suggestion[]>(`/certificate/suggest?q=${encodeURIComponent(q)}`)
        .then((items) => {
          setSuggestions(items);
          setOpen(true);
        })
        .catch(() => setSuggestions([]));
    }, 220);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [code]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void verify(code);
  };

  const pick = (item: Suggestion) => {
    setCode(item.certificateCode);
    setOpen(false);
    void verify(item.certificateCode);
  };

  return (
    <main className="verify-page">
      <nav className="landing-nav" aria-label="Điều hướng đầu trang">
        <Link href="/" className="brand">
          <span>B</span>
          <strong>BCN Quiz</strong>
        </Link>
        <Link className="button secondary" href="/">
          Trang chủ
        </Link>
      </nav>
      <section className="verify-card" aria-labelledby="verify-title">
        <div className="verify-icon">
          <Certificate aria-hidden="true" />
        </div>
        <p className="eyebrow">Xác minh công khai</p>
        <h1 id="verify-title">Kiểm tra chứng chỉ BCN</h1>
        <p>Nhập mã trên chứng chỉ để kiểm tra khóa học và ngày cấp.</p>
        <form className="verify-form" onSubmit={submit}>
          <label className="field verify-code-field">
            <span>Mã chứng chỉ</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onFocus={() => suggestions.length && setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              placeholder="Ví dụ: CRT-..."
              autoComplete="off"
              required
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls="verify-suggestions"
            />
            {open && suggestions.length ? (
              <ul id="verify-suggestions" className="verify-suggest" role="listbox">
                {suggestions.map((item) => (
                  <li key={item.certificateCode}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(item)}
                    >
                      <strong>{item.certificateCode}</strong>
                      <span>{item.courseName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>
          <button
            className="button"
            disabled={loading || !code.trim()}
            type="submit"
          >
            <MagnifyingGlass aria-hidden="true" />
            {loading ? 'Đang kiểm tra' : 'Xác minh'}
          </button>
        </form>
        {error ? (
          <p className="verify-error" role="alert">
            {error}
          </p>
        ) : null}
        {result ? (
          <article className="verify-result" aria-live="polite">
            <CheckCircle aria-hidden="true" />
            <div>
              <strong>Chứng chỉ hợp lệ</strong>
              <h2>{result.course.name}</h2>
              <p>
                Mã: <code>{result.certificateCode}</code>
              </p>
              <p>
                Cấp ngày{' '}
                {new Date(result.issuedAt).toLocaleDateString('vi-VN')}
              </p>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
