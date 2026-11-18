'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  CheckCircle,
  Clock,
  Database,
  Folders,
  Info,
  ShieldCheck,
  Stack,
  WarningCircle,
  WarningOctagon,
} from '@phosphor-icons/react';
import { useAuth } from '@/components/auth-provider';
import { Empty, ErrorState, Loading, Progress } from './ui';
import {
  towerApi,
  type TowerAdminPoolStatsResponse,
  type TowerPoolSyncResponse,
} from '@/lib/tower';
import { canUpdateContent } from '@/lib/permissions';

const DIFFICULTY_CONFIG: Record<
  string,
  { label: string; badgeClass: string; color: string }
> = {
  EASY: { label: 'Dễ', badgeClass: 'easy', color: 'var(--accent)' },
  MEDIUM: { label: 'Trung bình', badgeClass: 'medium', color: 'var(--warning)' },
  HARD: { label: 'Khó', badgeClass: 'hard', color: 'var(--danger)' },
};

function formatDateTime(val?: string | null): string {
  if (!val) return 'Chưa chạy';
  try {
    return new Date(val).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
    });
  } catch {
    return val;
  }
}

export function AdminTower() {
  const { user } = useAuth();
  const canManage = canUpdateContent(user);

  const [stats, setStats] = useState<TowerAdminPoolStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'breakdown' | 'courses' | 'antirepeat'
  >('overview');

  const loadStats = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError('');
    try {
      const data = await towerApi.getAdminPoolStats();
      setStats(data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Không thể tải thống kê Tower Question Pool',
      );
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const handleSyncPool = async () => {
    if (syncing || !canManage) return;
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const res: TowerPoolSyncResponse = await towerApi.syncAdminPool();
      if (res.status === 'SUCCESS') {
        setNotice(
          `Đồng bộ Question Pool thành công! Đã thu thập ${res.totalCollected} câu hỏi (${res.totalEligible} hợp lệ, ${res.totalDuplicates} trùng lặp).`,
        );
      } else if (res.status === 'RUNNING') {
        setNotice('Tiến trình đồng bộ Question Pool đang chạy ngầm...');
      } else {
        setError(
          `Đồng bộ hoàn tất với trạng thái: ${res.status}. ${res.errorMessage || ''}`,
        );
      }
      await loadStats(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Đồng bộ Question Pool thất bại',
      );
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <Loading label="Đang tải dữ liệu Tower Question Pool" />;
  }

  if (error && !stats) {
    return (
      <ErrorState
        title="Lỗi tải dữ liệu Question Pool"
        message={error}
        retry={() => void loadStats()}
      />
    );
  }

  if (!stats) {
    return (
      <Empty
        title="Chưa có dữ liệu Question Pool"
        description="Vui lòng nhấn Đồng bộ Question Pool để bắt đầu quét toàn bộ ngân hàng câu hỏi."
      />
    );
  }

  // Safe KPI extractors with flexible fallback naming
  const kpis = stats.kpis || {};
  const totalCollected = kpis.totalCollected ?? kpis.collectedInPool ?? 0;
  const totalEligible = kpis.totalEligible ?? kpis.eligibleCount ?? 0;
  const totalDuplicates = kpis.totalDuplicates ?? kpis.duplicateCount ?? 0;
  const ineligibleCount =
    kpis.ineligibleCount ??
    Math.max(0, totalCollected - totalEligible) ??
    0;

  const eligiblePercent =
    totalCollected > 0
      ? Math.round((totalEligible / totalCollected) * 100)
      : 0;

  // Last Job Info
  const lastJob = stats.lastJob || stats.lastJobLog || null;
  const jobStatus = (lastJob?.status || 'IDLE').toUpperCase();

  // Anti-repeat
  const antiRepeat = stats.antiRepeatStats || stats.usage || {
    seasonKey: 'N/A',
    unusedInSeason: totalEligible,
    reusedInSeason: 0,
    totalUsedInSeason: 0,
    totalUsesCount: 0,
  };
  const seasonKey = antiRepeat.seasonKey || 'Hiện tại';
  const unusedInSeason =
    antiRepeat.unusedInSeason ??
    antiRepeat.unusedEligibleInCurrentSeason ??
    Math.max(0, totalEligible - (antiRepeat.totalUsedInSeason ?? 0));
  const reusedInSeason = antiRepeat.reusedInSeason ?? 0;
  const totalUsed =
    antiRepeat.totalUsedInSeason ??
    antiRepeat.totalUniqueUsedCurrentSeason ??
    0;

  // Coverage report
  const coverage = stats.coverage || {};
  const floorRanges = coverage.floorRanges || coverage.tiers || [];
  const coverageScore = coverage.coverageScore ?? coverage.scorePercent ?? 100;
  const coverageWarnings = coverage.warnings || [];

  return (
    <div className="admin-tower">
      {/* Page Heading & Action Header */}
      <section className="panel admin-tower-head" aria-label="Điều khiển Question Pool">
        <div className="admin-tower-title">
          <h2>Quản trị Tower Question Pool & Phân bổ Kiến thức</h2>
          <p className="muted">
            Thu thập câu hỏi tập trung, phân loại chủ đề & độ khó tự động, chống
            lặp câu hỏi theo mùa và bảo đảm phân bổ tầng tháp (1–30, 31–70, 71–100).
          </p>
        </div>
        <div className="list-actions">
          <button
            type="button"
            className="button secondary"
            disabled={loading || syncing}
            onClick={() => void loadStats(true)}
            title="Làm mới thống kê"
          >
            <ArrowsClockwise className={loading ? 'spin' : ''} size={16} />
            Làm mới
          </button>
          {canManage ? (
            <button
              type="button"
              className="button"
              disabled={syncing}
              onClick={() => void handleSyncPool()}
              title="Quét lại toàn bộ câu hỏi từ các khóa học và phân loại vào Question Pool"
            >
              <Database size={16} />
              {syncing ? 'Đang đồng bộ...' : 'Đồng bộ Question Pool'}
            </button>
          ) : null}
        </div>
      </section>

      {/* Notifications */}
      {error ? (
        <div className="notice form-error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <WarningCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="notice form-success" role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      ) : null}

      {/* Collection Job Status Banner */}
      <section className="admin-tower-job-banner" aria-label="Trạng thái tác vụ quét câu hỏi">
        <div className="admin-tower-job-info">
          <Clock size={20} className="muted" />
          <div>
            <strong>Lần đồng bộ gần nhất:</strong>{' '}
            <span>{formatDateTime(lastJob?.startedAt)}</span>
          </div>
          <div>
            Trạng thái:{' '}
            {jobStatus === 'SUCCESS' ? (
              <span className="admin-tower-status-badge success">
                <CheckCircle size={14} weight="bold" /> Thành công
              </span>
            ) : jobStatus === 'RUNNING' ? (
              <span className="admin-tower-status-badge running">
                <ArrowsClockwise size={14} className="spin" /> Đang chạy
              </span>
            ) : jobStatus === 'FAILED' ? (
              <span className="admin-tower-status-badge failed">
                <WarningCircle size={14} weight="bold" /> Thất bại
              </span>
            ) : (
              <span className="admin-tower-status-badge">Chưa chạy</span>
            )}
          </div>
          {lastJob?.completedAt ? (
            <small className="muted">
              (Hoàn tất lúc: {formatDateTime(lastJob.completedAt)})
            </small>
          ) : null}
        </div>

        {lastJob?.errorMessage ? (
          <div className="admin-tower-warning-banner" style={{ width: '100%', marginTop: '0.5rem' }}>
            <WarningOctagon size={18} />
            <div>
              <strong>Lỗi tác vụ quét:</strong> {lastJob.errorMessage}
            </div>
          </div>
        ) : null}
      </section>

      {/* KPIs Grid */}
      <section className="admin-tower-kpis" aria-label="Chỉ số KPI Question Pool">
        <div className="admin-tower-kpi-card">
          <span className="admin-tower-kpi-title">Tổng câu hỏi thu thập</span>
          <b className="admin-tower-kpi-val">{totalCollected.toLocaleString('vi-VN')}</b>
          <span className="admin-tower-kpi-sub">Từ tất cả các khóa và chủ đề</span>
        </div>

        <div className="admin-tower-kpi-card">
          <span className="admin-tower-kpi-title">Câu hỏi hợp lệ đưa vào Tháp</span>
          <b className="admin-tower-kpi-val" style={{ color: 'var(--accent)' }}>
            {totalEligible.toLocaleString('vi-VN')}
          </b>
          <span className="admin-tower-kpi-sub">
            Chiếm {eligiblePercent}% tổng số câu quét được
          </span>
        </div>

        <div className="admin-tower-kpi-card">
          <span className="admin-tower-kpi-title">Phát hiện trùng lặp</span>
          <b
            className="admin-tower-kpi-val"
            style={{ color: totalDuplicates > 0 ? 'var(--warning)' : 'inherit' }}
          >
            {totalDuplicates.toLocaleString('vi-VN')}
          </b>
          <span className="admin-tower-kpi-sub">Dựa trên Content Hash SHA-256</span>
        </div>

        <div className="admin-tower-kpi-card">
          <span className="admin-tower-kpi-title">Không đủ điều kiện / Hết hạn</span>
          <b className="admin-tower-kpi-val" style={{ color: 'var(--danger)' }}>
            {ineligibleCount.toLocaleString('vi-VN')}
          </b>
          <span className="admin-tower-kpi-sub">Chủ đề hết hạn lịch hoặc trùng nội dung</span>
        </div>
      </section>

      {/* Global Coverage Warnings Banner if any */}
      {coverageWarnings.length > 0 ? (
        <section className="admin-tower-warning-banner" role="alert" aria-label="Cảnh báo độ phủ">
          <WarningOctagon size={24} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Cảnh báo độ phủ Question Pool ({coverageWarnings.length}):</strong>
            <ul style={{ margin: '0.375rem 0 0 1.25rem', padding: 0 }}>
              {coverageWarnings.map((w, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>{w}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Section Sub-Navigation Tabs */}
      <div className="tabs" role="tablist" aria-label="Mục quản trị Question Pool" style={{ flexWrap: 'wrap', gap: '6px' }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          <Stack size={16} /> Độ phủ Tầng Tháp ({coverageScore}%)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'breakdown'}
          className={activeTab === 'breakdown' ? 'active' : ''}
          onClick={() => setActiveTab('breakdown')}
        >
          <Folders size={16} /> Phân loại Chủ đề & Độ khó
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'antirepeat'}
          className={activeTab === 'antirepeat' ? 'active' : ''}
          onClick={() => setActiveTab('antirepeat')}
        >
          <ShieldCheck size={16} /> Chống lặp mùa ({seasonKey})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'courses'}
          className={activeTab === 'courses' ? 'active' : ''}
          onClick={() => setActiveTab('courses')}
        >
          <Database size={16} /> Nguồn Khóa học & Topic
        </button>
      </div>

      {/* TAB 1: OVERVIEW & FLOOR RANGE COVERAGE */}
      {activeTab === 'overview' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <section className="panel" aria-label="Tổng quan phân bổ tầng tháp">
            <div className="section-title">
              <div>
                <h2>Phân bổ Kiến thức Tầng Tháp (Floors 1–100)</h2>
                <p className="muted">
                  Đánh giá độ sẵn sàng của pool câu hỏi đáp ứng yêu cầu streak liên tiếp từng tầng.
                </p>
              </div>
              <span className="admin-tower-badge">
                Độ phủ chung: <strong>{coverageScore}%</strong>
              </span>
            </div>

            <div className="admin-tower-coverage-grid" style={{ marginTop: '1rem' }}>
              {floorRanges.map((fr, idx) => {
                const rangeLabel =
                  fr.range ||
                  (fr.minFloor && fr.maxFloor
                    ? `Tầng ${fr.minFloor}–${fr.maxFloor}`
                    : `Khoảng tầng ${idx + 1}`);
                const available =
                  fr.availableQuestions ?? fr.matchingCount ?? 0;
                const requiredStreak = fr.requiredStreakMax ?? fr.maxFloor ?? 30;
                const hasWarnings = (fr.warnings?.length || 0) > 0 || !fr.isSufficient;

                return (
                  <div
                    key={idx}
                    className={`admin-tower-coverage-card ${
                      hasWarnings ? 'warning-border' : ''
                    }`}
                  >
                    <div className="admin-tower-coverage-head">
                      <span className="admin-tower-coverage-range">{rangeLabel}</span>
                      {fr.isSufficient && !hasWarnings ? (
                        <span className="admin-tower-status-badge success">
                          <CheckCircle size={14} /> Đạt yêu cầu
                        </span>
                      ) : (
                        <span className="admin-tower-status-badge failed">
                          <WarningCircle size={14} /> Thiếu / Cảnh báo
                        </span>
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                        <span className="muted">Câu hỏi phù hợp trong pool:</span>
                        <strong>{available} câu</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                        <span className="muted">Streak yêu cầu tối đa:</span>
                        <span>{requiredStreak} câu</span>
                      </div>
                    </div>

                    {fr.subjectCoverage ? (
                      <div style={{ marginTop: '0.25rem' }}>
                        <small className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>
                          Phân bổ Chủ đề theo cấu hình:
                        </small>
                        <div className="admin-tower-badges">
                          {Object.entries(fr.subjectCoverage).map(([sub, count]) => (
                            <span key={sub} className="admin-tower-badge">
                              {sub}: <b>{count}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {fr.difficultyCoverage ? (
                      <div>
                        <small className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>
                          Phân bổ Độ khó:
                        </small>
                        <div className="admin-tower-badges">
                          {Object.entries(fr.difficultyCoverage).map(([diff, count]) => {
                            const conf = DIFFICULTY_CONFIG[diff] || {
                              label: diff,
                              badgeClass: 'medium',
                            };
                            return (
                              <span
                                key={diff}
                                className={`admin-tower-badge ${conf.badgeClass}`}
                              >
                                {conf.label}: <b>{count}</b>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {fr.warnings && fr.warnings.length > 0 ? (
                      <div
                        style={{
                          background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
                          borderRadius: 8,
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.75rem',
                          color: 'var(--danger)',
                        }}
                      >
                        {fr.warnings.map((w, wIdx) => (
                          <div key={wIdx}>• {w}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {/* TAB 2: SUBJECT & DIFFICULTY BREAKDOWN */}
      {activeTab === 'breakdown' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          {/* Breakdown by Difficulty */}
          <section className="panel" aria-label="Phân bổ theo Độ khó">
            <div className="section-title">
              <div>
                <h2>Phân bổ theo Độ khó</h2>
                <p className="muted">
                  Dựa trên tỷ lệ làm đúng lịch sử (&gt;=70% Dễ, 40–70% Trung bình, &lt;40% Khó) hoặc độ phức tạp code.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginTop: '1rem' }}>
              {(stats.breakdown?.byDifficulty || []).map((diffRow) => {
                const conf = DIFFICULTY_CONFIG[diffRow.difficulty] || {
                  label: diffRow.label || diffRow.difficulty,
                  badgeClass: 'medium',
                  color: '#6366f1',
                };
                const count = diffRow.count || 0;
                const eligible = diffRow.eligibleCount ?? count;
                const pct =
                  totalEligible > 0 ? Math.round((eligible / totalEligible) * 100) : 0;

                return (
                  <div key={diffRow.difficulty} className="admin-tower-kpi-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className={`admin-tower-badge ${conf.badgeClass}`}>
                        {conf.label} ({diffRow.difficulty})
                      </span>
                      <b>{eligible.toLocaleString('vi-VN')} câu ({pct}%)</b>
                    </div>
                    <Progress value={pct} label={`Tỷ trọng ${conf.label}`} />
                    <span className="admin-tower-kpi-sub">
                      Tổng đã quét: {count} câu
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Breakdown by Subject */}
          <section className="panel" aria-label="Phân bổ theo Chủ đề">
            <div className="section-title">
              <div>
                <h2>Phân bổ theo Chủ đề</h2>
                <p className="muted">
                  Tự động phân nhóm từ thông tin Khóa học và Chủ đề (Topic) liên kết.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
              <table className="admin-tower-table">
                <thead>
                  <tr>
                    <th>Chủ đề (Subject)</th>
                    <th style={{ textAlign: 'right' }}>Hợp lệ</th>
                    <th style={{ textAlign: 'right' }}>Tổng quét</th>
                    <th style={{ textAlign: 'right' }}>Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.breakdown?.bySubject || []).map((sub) => {
                    const eligible = sub.eligibleCount ?? sub.count;
                    const pct =
                      totalEligible > 0
                        ? Math.round((eligible / totalEligible) * 100)
                        : 0;
                    return (
                      <tr key={sub.subject}>
                        <td>
                          <strong>{sub.subject}</strong>
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>
                          {eligible}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>
                          {sub.count}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="admin-tower-badge">{pct}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {/* TAB 3: MONTHLY ANTI-REPEAT */}
      {activeTab === 'antirepeat' ? (
        <section className="panel" aria-label="Chống lặp câu hỏi theo mùa">
          <div className="section-title">
            <div>
              <h2>Chiến lược Chống lặp Câu hỏi theo Mùa (Monthly Anti-Repeat)</h2>
              <p className="muted">
                Ưu tiên câu hỏi chưa từng xuất hiện qua các mùa để đảm bảo trải nghiệm leo tháp luôn mới mẻ.
              </p>
            </div>
            <span className="admin-tower-badge">Mùa: <strong>{seasonKey}</strong></span>
          </div>

          <div className="admin-tower-anti-repeat-box" style={{ marginTop: '1rem' }}>
            <div>
              <span className="admin-tower-kpi-title">Câu hỏi chưa dùng trong mùa này</span>
              <b className="admin-tower-kpi-val" style={{ color: 'var(--accent)' }}>
                {unusedInSeason.toLocaleString('vi-VN')}
              </b>
              <span className="admin-tower-kpi-sub">
                Ưu tiên cấp 1 & 2 khi sinh câu hỏi mới
              </span>
            </div>

            <div>
              <span className="admin-tower-kpi-title">Câu hỏi đã dùng trong mùa này</span>
              <b className="admin-tower-kpi-val" style={{ color: 'var(--accent-strong)' }}>
                {totalUsed.toLocaleString('vi-VN')}
              </b>
              <span className="admin-tower-kpi-sub">Đã phục vụ người chơi mùa này</span>
            </div>

            <div>
              <span className="admin-tower-kpi-title">Câu hỏi tái sử dụng (&gt;1 lần)</span>
              <b className="admin-tower-kpi-val" style={{ color: reusedInSeason > 0 ? 'var(--warning)' : 'inherit' }}>
                {reusedInSeason.toLocaleString('vi-VN')}
              </b>
              <span className="admin-tower-kpi-sub">Chỉ tái sử dụng khi cạn pool</span>
            </div>

            <div>
              <span className="admin-tower-kpi-title">Tổng số lượt phục vụ câu hỏi</span>
              <b className="admin-tower-kpi-val">
                {(antiRepeat.totalUsesCount ?? antiRepeat.totalHistoricalUsages ?? 0).toLocaleString('vi-VN')}
              </b>
              <span className="admin-tower-kpi-sub">Ghi nhận qua TowerQuestionUsage</span>
            </div>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <Progress
              value={totalEligible > 0 ? Math.round((totalUsed / totalEligible) * 100) : 0}
              label={`Mức độ khai thác pool trong mùa ${seasonKey}`}
            />
          </div>

          <div
            style={{
              marginTop: '1.5rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '1rem 1.25rem',
              fontSize: '0.875rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Info size={18} className="muted" />
              <strong>Thuật toán lựa chọn câu hỏi 4 cấp độ:</strong>
            </div>
            <ol style={{ margin: '0 0 0 1.25rem', padding: 0, lineHeight: 1.6 }}>
              <li>
                <strong>Cấp 1 (Tối ưu nhất):</strong> Ưu tiên câu hỏi chưa từng xuất hiện trong bất kỳ mùa nào.
              </li>
              <li>
                <strong>Cấp 2 (Trong mùa):</strong> Nếu hết, chọn câu hỏi chưa từng xuất hiện trong mùa hiện tại.
              </li>
              <li>
                <strong>Cấp 3 (LRU / Ít dùng nhất):</strong> Sắp xếp theo số lần sử dụng tăng dần (<code>usageCount ASC</code>) và thời gian dùng cũ nhất (<code>usedAt ASC</code>).
              </li>
              <li>
                <strong>Cấp 4 (Cạn kiệt pool trong lượt chơi):</strong> Nới lỏng danh sách loại trừ trong attempt để tránh treo người chơi, đảm bảo không trùng 2 câu liền kề.
              </li>
            </ol>
          </div>
        </section>
      ) : null}

      {/* TAB 4: COURSES & TOPICS BREAKDOWN */}
      {activeTab === 'courses' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          <section className="panel" aria-label="Nguồn Khóa học">
            <div className="section-title">
              <div>
                <h2>Nguồn Khóa học đóng góp</h2>
                <p className="muted">Số lượng câu hỏi được trích xuất từ mỗi khóa học.</p>
              </div>
            </div>
            <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
              <table className="admin-tower-table">
                <thead>
                  <tr>
                    <th>Khóa học</th>
                    <th style={{ textAlign: 'right' }}>Số câu</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.breakdown?.byCourse || []).map((course, cIdx) => (
                    <tr key={course.courseId || `c-${cIdx}`}>
                      <td>
                        <strong>{course.courseName}</strong>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {course.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" aria-label="Nguồn Chủ đề (Topic)">
            <div className="section-title">
              <div>
                <h2>Nguồn Chủ đề (Topic) đóng góp</h2>
                <p className="muted">Top các Topic cung cấp câu hỏi cho Tháp.</p>
              </div>
            </div>
            <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
              <table className="admin-tower-table">
                <thead>
                  <tr>
                    <th>Chủ đề (Topic)</th>
                    <th style={{ textAlign: 'right' }}>Số câu</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.breakdown?.byTopic || []).slice(0, 15).map((topic, tIdx) => (
                    <tr key={topic.topicId || `t-${tIdx}`}>
                      <td>
                        <span>{topic.topicName}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {topic.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
