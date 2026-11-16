'use client';

import { useEffect, useState } from 'react';
import {
  ArrowSquareOut,
  Briefcase,
  CheckCircle,
  DeviceMobile,
  GameController,
  Globe,
  Lightning,
  PaintBrush,
  Plus,
  Robot,
  Star,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { request } from '@/lib/api';
import type { Bounty, BountyAssignment, BountyCategory } from '@/lib/types';
import { Empty, Loading, PaginationNav } from '@/components/ui';

const CATEGORY_ICONS: Record<BountyCategory, typeof Lightning> = {
  WEB: Globe,
  APP: DeviceMobile,
  GAME: GameController,
  DESIGN: PaintBrush,
  AI: Robot,
};

export function AdminBounties() {
  const [activeSection, setActiveSection] = useState<'reviews' | 'list'>('reviews');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Submissions (Review Queue) state
  const [submissions, setSubmissions] = useState<BountyAssignment[]>([]);
  const [submissionFilter, setSubmissionFilter] = useState<'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ALL'>('SUBMITTED');
  const [submissionPage, setSubmissionPage] = useState(1);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Bounties Management state
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [bountyFilter, setBountyFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [bountyPage, setBountyPage] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Create Bounty Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<BountyCategory>('WEB');
  const [formDifficulty, setFormDifficulty] = useState(3);
  const [formRewardCoins, setFormRewardCoins] = useState(450);
  const [formRewardXp, setFormRewardXp] = useState(150);
  const [formDurationMinutes, setFormDurationMinutes] = useState(180);
  const [formClientName, setFormClientName] = useState('');
  const [formClientRole, setFormClientRole] = useState('');
  const [formClientCompany, setFormClientCompany] = useState('');
  const [formClientNotes, setFormClientNotes] = useState('');
  const [formSkills, setFormSkills] = useState('React, TypeScript, CSS');
  const [formTasks, setFormTasks] = useState<string[]>([
    'Thiết kế giao diện chức năng chính',
    'Kiểm thử hoạt động trên trình duyệt',
  ]);
  const [newTaskInput, setNewTaskInput] = useState('');
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [submissionsData, bountiesData] = await Promise.all([
        request.get<BountyAssignment[]>('/admin/bounties/submissions'),
        request.get<Bounty[]>('/admin/bounties'),
      ]);
      setSubmissions(submissionsData || []);
      setBounties(bountiesData || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu quản trị nhiệm vụ.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered submissions
  const filteredSubmissions = submissions.filter((s) => {
    if (submissionFilter === 'ALL') return true;
    return s.status === submissionFilter;
  });

  useEffect(() => {
    setSubmissionPage(1);
  }, [submissionFilter]);

  const displayedSubmissions = filteredSubmissions.slice((submissionPage - 1) * 6, submissionPage * 6);

  // Filtered bounties
  const filteredBounties = bounties.filter((b) => {
    if (bountyFilter === 'ALL') return true;
    return b.status === bountyFilter;
  });

  useEffect(() => {
    setBountyPage(1);
  }, [bountyFilter]);

  const displayedBounties = filteredBounties.slice((bountyPage - 1) * 8, bountyPage * 8);

  // Handle Review Submission
  const handleReview = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      setProcessingId(id);
      setError(null);
      const feedback = reviewNotes[id] || undefined;
      await request.post(`/admin/bounties/submissions/${id}/review`, {
        status: decision,
        feedback,
      });

      setSuccessNotice(
        decision === 'APPROVED'
          ? 'Đã duyệt bài nộp và thưởng Coin/XP thành công!'
          : 'Đã từ chối bài nộp.',
      );
      setTimeout(() => setSuccessNotice(null), 4000);

      // Reload
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể duyệt bài nộp.';
      setError(msg);
    } finally {
      setProcessingId(null);
    }
  };

  // Toggle Bounty Status (OPEN / CLOSED)
  const handleToggleBountyStatus = async (bounty: Bounty) => {
    try {
      setError(null);
      const nextStatus = bounty.status === 'OPEN' ? 'CLOSED' : 'OPEN';
      await request.put(`/admin/bounties/${bounty.id}`, { status: nextStatus });
      setSuccessNotice(`Đã chuyển trạng thái nhiệm vụ sang ${nextStatus}.`);
      setTimeout(() => setSuccessNotice(null), 3000);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể cập nhật trạng thái nhiệm vụ.';
      setError(msg);
    }
  };

  // Delete Bounty
  const handleDeleteBounty = async (bounty: Bounty) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa hoặc đóng lưu trữ nhiệm vụ "${bounty.title}"?`)) return;
    try {
      setError(null);
      await request.delete(`/admin/bounties/${bounty.id}`);
      setSuccessNotice('Đã xóa hoặc lưu trữ nhiệm vụ thành công.');
      setTimeout(() => setSuccessNotice(null), 3000);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể xóa nhiệm vụ.';
      setError(msg);
    }
  };

  // Add task to form
  const handleAddTask = () => {
    if (!newTaskInput.trim()) return;
    setFormTasks([...formTasks, newTaskInput.trim()]);
    setNewTaskInput('');
  };

  // Remove task from form
  const handleRemoveTask = (idx: number) => {
    setFormTasks(formTasks.filter((_, i) => i !== idx));
  };

  // Submit Create Bounty Form
  const handleCreateBounty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDescription.trim() || !formClientName.trim()) {
      setError('Vui lòng điền đầy đủ các trường bắt buộc.');
      return;
    }

    try {
      setIsSubmittingForm(true);
      setError(null);

      const tasksPayload = formTasks.map((t, idx) => ({ id: idx + 1, text: t, done: false }));
      const skillsPayload = formSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await request.post('/admin/bounties', {
        title: formTitle.trim(),
        description: formDescription.trim(),
        category: formCategory,
        difficulty: Number(formDifficulty),
        rewardCoins: Number(formRewardCoins),
        rewardXp: Number(formRewardXp),
        durationMinutes: Number(formDurationMinutes),
        clientName: formClientName.trim(),
        clientRole: formClientRole.trim() || 'Product Lead',
        clientCompany: formClientCompany.trim() || 'BCN Partner',
        clientNotes: formClientNotes.trim() || undefined,
        tasks: tasksPayload,
        skills: skillsPayload,
      });

      setSuccessNotice('Tạo nhiệm vụ Freelancer mới thành công!');
      setTimeout(() => setSuccessNotice(null), 4000);

      // Reset form
      setCreateModalOpen(false);
      setFormTitle('');
      setFormDescription('');
      setFormClientName('');
      setFormClientRole('');
      setFormClientCompany('');
      setFormClientNotes('');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo nhiệm vụ.';
      setError(msg);
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Safe URL check for XSS prevention
  const isSafeUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    const lower = url.trim().toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
  };

  if (loading) {
    return <Loading label="Đang tải dữ liệu quản trị nhiệm vụ..." />;
  }

  const pendingSubmissionsCount = submissions.filter((s) => s.status === 'SUBMITTED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Notifications */}
      {error && (
        <div className="form-error" role="alert">
          <WarningCircle size={18} weight="fill" />
          <span>{error}</span>
        </div>
      )}
      {successNotice && (
        <div className="form-success" role="status">
          <CheckCircle size={18} weight="fill" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Sub-navigation Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`button ${activeSection === 'reviews' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveSection('reviews')}
          >
            <CheckCircle size={18} weight="bold" />
            <span>Duyệt bài nộp ({pendingSubmissionsCount})</span>
          </button>
          <button
            type="button"
            className={`button ${activeSection === 'list' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveSection('list')}
          >
            <Briefcase size={18} weight="bold" />
            <span>Danh sách & Tạo nhiệm vụ ({bounties.length})</span>
          </button>
        </div>

        {activeSection === 'list' && (
          <button
            type="button"
            className="button"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus size={18} weight="bold" />
            <span>Tạo nhiệm vụ mới</span>
          </button>
        )}
      </div>

      {/* SECTION 1: REVIEW QUEUE */}
      {activeSection === 'reviews' && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--line)' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', margin: 0, fontWeight: 700 }}>
                Hàng Đợi Duyệt Bài Nộp (Freelancer Deliverables)
              </h2>
              <small style={{ color: 'var(--muted)' }}>
                Xem xét link dự án nghiệm thu của học viên, ghi nhận xét và duyệt thưởng Coin/XP
              </small>
            </div>

            {/* Filter pills */}
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {(['SUBMITTED', 'APPROVED', 'REJECTED', 'ALL'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`button secondary ${submissionFilter === st ? 'active' : ''}`}
                  style={{
                    padding: '0.25rem 0.625rem',
                    minHeight: '32px',
                    fontSize: '12px',
                    borderColor: submissionFilter === st ? 'var(--accent)' : undefined,
                    background: submissionFilter === st ? 'var(--accent-soft)' : undefined,
                    color: submissionFilter === st ? 'var(--accent-strong)' : undefined,
                  }}
                  onClick={() => {
                    setSubmissionFilter(st);
                    setSubmissionPage(1);
                  }}
                >
                  {st === 'SUBMITTED' ? `Chờ duyệt (${pendingSubmissionsCount})` : st === 'APPROVED' ? 'Đã duyệt' : st === 'REJECTED' ? 'Từ chối' : 'Tất cả'}
                </button>
              ))}
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <Empty
              title="Không có bài nộp nào"
              description={submissionFilter === 'SUBMITTED' ? 'Hiện tại không có bài nộp nào đang chờ duyệt!' : 'Không có bài nộp nào trong bộ lọc này.'}
            />
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {displayedSubmissions.map((sub) => {
                  const IconComponent = CATEGORY_ICONS[sub.bounty.category] || Briefcase;
                  const isPending = sub.status === 'SUBMITTED';

                  return (
                    <div
                      key={sub.id}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius)',
                        padding: '1.25rem',
                        background: 'var(--surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.875rem',
                      }}
                    >
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: 'var(--accent-soft)',
                              color: 'var(--accent-strong)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <IconComponent size={18} weight="bold" />
                          </div>
                          <div>
                            <strong style={{ fontSize: '0.9375rem', color: 'var(--text)' }}>
                              {sub.bounty.title}
                            </strong>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              Học viên: <code>{sub.userId}</code> • Nộp lúc: {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('vi-VN') : 'Mới nộp'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            className={`status ${
                              sub.status === 'APPROVED'
                                ? 'status-approved'
                                : sub.status === 'REJECTED'
                                ? 'status-rejected'
                                : 'status-pending_review'
                            }`}
                          >
                            {sub.status === 'SUBMITTED' ? 'Chờ duyệt' : sub.status === 'APPROVED' ? 'Đã duyệt' : sub.status}
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            <span style={{ color: 'var(--warning)' }}>+{sub.bounty.rewardCoins} Coin</span>
                            <span>•</span>
                            <span style={{ color: '#6366f1' }}>+{sub.bounty.rewardXp} XP</span>
                          </div>
                        </div>
                      </div>

                      {/* Project URL & Notes */}
                      <div style={{ background: 'var(--surface-2)', padding: '0.875rem', borderRadius: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
                        <div>
                          <strong>Link dự án nghiệm thu: </strong>
                          {isSafeUrl(sub.projectUrl) ? (
                            <a
                              href={sub.projectUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--accent)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', wordBreak: 'break-all' }}
                            >
                              <span>{sub.projectUrl}</span>
                              <ArrowSquareOut size={14} />
                            </a>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>{sub.projectUrl || 'Chưa cung cấp'}</span>
                          )}
                        </div>

                        {sub.submissionNotes && (
                          <div>
                            <strong>Ghi chú từ học viên: </strong>
                            <span style={{ color: 'var(--muted)' }}>{sub.submissionNotes}</span>
                          </div>
                        )}

                        {sub.reviewFeedback && (
                          <div>
                            <strong>Nhận xét của Mentor: </strong>
                            <span style={{ fontStyle: 'italic', color: 'var(--accent-strong)' }}>&quot;{sub.reviewFeedback}&quot;</span>
                          </div>
                        )}
                      </div>

                      {/* Review Action Form (For pending submissions) */}
                      {isPending && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', paddingTop: '0.5rem', borderTop: '1px solid var(--line)' }}>
                          <input
                            type="text"
                            placeholder="Nhập nhận xét / feedback cho học viên (tùy chọn)..."
                            value={reviewNotes[sub.id] || ''}
                            onChange={(e) => setReviewNotes({ ...reviewNotes, [sub.id]: e.target.value })}
                            style={{
                              padding: '0.5rem 0.75rem',
                              borderRadius: '8px',
                              border: '1px solid var(--line)',
                              background: 'var(--bg)',
                              color: 'var(--text)',
                              fontSize: '0.8125rem',
                            }}
                          />

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                              type="button"
                              className="button danger"
                              disabled={processingId === sub.id}
                              style={{ minHeight: '36px', padding: '0 0.875rem', fontSize: '13px' }}
                              onClick={() => handleReview(sub.id, 'REJECTED')}
                            >
                              Từ chối
                            </button>
                            <button
                              type="button"
                              className="button"
                              disabled={processingId === sub.id}
                              style={{ minHeight: '36px', padding: '0 1rem', fontSize: '13px' }}
                              onClick={() => handleReview(sub.id, 'APPROVED')}
                            >
                              <CheckCircle size={16} weight="bold" />
                              <span>{processingId === sub.id ? 'Đang duyệt...' : 'Duyệt bài & Thưởng'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <PaginationNav
                page={submissionPage}
                totalPages={Math.max(1, Math.ceil(filteredSubmissions.length / 6))}
                total={filteredSubmissions.length}
                onChange={setSubmissionPage}
              />
            </>
          )}
        </div>
      )}

      {/* SECTION 2: BOUNTIES DIRECTORY & MANAGEMENT */}
      {activeSection === 'list' && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--line)' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', margin: 0, fontWeight: 700 }}>
                Danh Sách Nhiệm Vụ Freelancer ({bounties.length})
              </h2>
              <small style={{ color: 'var(--muted)' }}>
                Quản lý các đề bài mô phỏng khách hàng thực tế, cập nhật mở/đóng hoặc xóa nhiệm vụ
              </small>
            </div>

            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {(['ALL', 'OPEN', 'CLOSED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`button secondary ${bountyFilter === st ? 'active' : ''}`}
                  style={{
                    padding: '0.25rem 0.625rem',
                    minHeight: '32px',
                    fontSize: '12px',
                    borderColor: bountyFilter === st ? 'var(--accent)' : undefined,
                    background: bountyFilter === st ? 'var(--accent-soft)' : undefined,
                    color: bountyFilter === st ? 'var(--accent-strong)' : undefined,
                  }}
                  onClick={() => {
                    setBountyFilter(st);
                    setBountyPage(1);
                  }}
                >
                  {st === 'ALL' ? 'Tất cả' : st === 'OPEN' ? 'Đang mở (OPEN)' : 'Đã đóng (CLOSED)'}
                </button>
              ))}
            </div>
          </div>

          {filteredBounties.length === 0 ? (
            <Empty title="Chưa có nhiệm vụ nào" description="Hãy tạo một nhiệm vụ mới để học viên có thể nhận job!" />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {displayedBounties.map((b) => {
                  const IconComponent = CATEGORY_ICONS[b.category] || Briefcase;
                  const isOpen = b.status === 'OPEN';

                  return (
                    <div
                      key={b.id}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius)',
                        padding: '1.125rem',
                        background: 'var(--surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.875rem',
                      }}
                    >
                      <div>
                        {/* Top Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '0.125rem 0.5rem',
                              borderRadius: '9999px',
                              background: 'var(--surface-2)',
                              color: 'var(--text)',
                            }}
                          >
                            <IconComponent size={14} weight="bold" />
                            <span>{b.category}</span>
                          </span>

                          <span className={`status ${isOpen ? 'status-approved' : 'status-rejected'}`}>
                            {isOpen ? 'Đang mở' : 'Đã đóng'}
                          </span>
                        </div>

                        <h3 style={{ margin: '0 0 0.375rem 0', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
                          {b.title}
                        </h3>

                        <p style={{ margin: '0 0 0.625rem 0', fontSize: '0.75rem', color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                          {b.description}
                        </p>

                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                          Khách hàng: <strong>{b.clientName}</strong> ({b.clientRole})
                        </div>

                        {/* Difficulty & Rewards */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                weight={i < b.difficulty ? 'fill' : 'regular'}
                                style={{ color: i < b.difficulty ? 'var(--warning)' : 'var(--line)' }}
                              />
                            ))}
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            <span style={{ color: 'var(--warning)' }}>+{b.rewardCoins} Coin</span>
                            <span style={{ color: '#6366f1' }}>+{b.rewardXp} XP</span>
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--line)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {b._count?.assignments || 0} lượt nhận job
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="button secondary"
                            style={{ minHeight: '30px', padding: '0 0.625rem', fontSize: '12px' }}
                            onClick={() => handleToggleBountyStatus(b)}
                          >
                            {isOpen ? 'Đóng job' : 'Mở lại'}
                          </button>
                          <button
                            type="button"
                            className="button danger"
                            style={{ minHeight: '30px', padding: '0 0.5rem', fontSize: '12px' }}
                            title="Xóa hoặc lưu trữ"
                            onClick={() => handleDeleteBounty(b)}
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <PaginationNav
                page={bountyPage}
                totalPages={Math.max(1, Math.ceil(filteredBounties.length / 8))}
                total={filteredBounties.length}
                onChange={setBountyPage}
              />
            </>
          )}
        </div>
      )}

      {/* MODAL: CREATE NEW BOUNTY */}
      {createModalOpen && (
        <div className="bounty-modal-backdrop" onClick={() => setCreateModalOpen(false)}>
          <div
            className="bounty-modal-card"
            style={{ maxWidth: '42rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bounty-modal-header">
              <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>Tạo Nhiệm Vụ Freelancer Mới</h2>
              <button
                type="button"
                className="bounty-modal-close"
                onClick={() => setCreateModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateBounty} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="bounty-field-label">Tiêu đề nhiệm vụ *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Xây dựng Dashboard Realtime hoặc Dark Mode..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="bounty-input"
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label className="bounty-field-label">Mô tả yêu cầu dự án *</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Mô tả bối cảnh và mục tiêu học viên cần hoàn thiện..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="bounty-textarea"
                  />
                </div>

                <div>
                  <label className="bounty-field-label">Danh mục chuyên môn</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as BountyCategory)}
                    className="bounty-input"
                  >
                    <option value="WEB">Web Development</option>
                    <option value="APP">Mobile App</option>
                    <option value="GAME">Game Development</option>
                    <option value="DESIGN">UI/UX Design</option>
                    <option value="AI">AI & Data Science</option>
                  </select>
                </div>

                <div>
                  <label className="bounty-field-label">Độ khó (1 - 5 sao)</label>
                  <select
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(Number(e.target.value))}
                    className="bounty-input"
                  >
                    <option value={1}>1 sao (Cơ bản / Nhập môn)</option>
                    <option value={2}>2 sao (Thực hành nhỏ)</option>
                    <option value={3}>3 sao (Trung bình / Dự án tiêu chuẩn)</option>
                    <option value={4}>4 sao (Nâng cao / Phức tạp)</option>
                    <option value={5}>5 sao (Chuyên gia / Master)</option>
                  </select>
                </div>

                <div>
                  <label className="bounty-field-label">Thưởng BCN Coin</label>
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={formRewardCoins}
                    onChange={(e) => setFormRewardCoins(Number(e.target.value))}
                    className="bounty-input"
                  />
                </div>

                <div>
                  <label className="bounty-field-label">Thưởng Kinh Nghiệm XP</label>
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={formRewardXp}
                    onChange={(e) => setFormRewardXp(Number(e.target.value))}
                    className="bounty-input"
                  />
                </div>

                <div>
                  <label className="bounty-field-label">Thời gian làm (phút)</label>
                  <input
                    type="number"
                    min={30}
                    step={30}
                    value={formDurationMinutes}
                    onChange={(e) => setFormDurationMinutes(Number(e.target.value))}
                    className="bounty-input"
                  />
                </div>

                <div>
                  <label className="bounty-field-label">Kỹ năng (phân tách bởi dấu phẩy)</label>
                  <input
                    type="text"
                    placeholder="VD: React, TypeScript, TailwindCSS"
                    value={formSkills}
                    onChange={(e) => setFormSkills(e.target.value)}
                    className="bounty-input"
                  />
                </div>

                <div>
                  <label className="bounty-field-label">Tên Khách Hàng Mô Phỏng *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Alex Rivera, Dr. Aris Thorne..."
                    value={formClientName}
                    onChange={(e) => setFormClientName(e.target.value)}
                    className="bounty-input"
                  />
                </div>

                <div>
                  <label className="bounty-field-label">Vai Trò / Công Ty Khách Hàng</label>
                  <input
                    type="text"
                    placeholder="VD: Product Manager / CyberForge Interactive"
                    value={formClientRole}
                    onChange={(e) => setFormClientRole(e.target.value)}
                    className="bounty-input"
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label className="bounty-field-label">Lời nhắn từ Khách Hàng (Client Quote)</label>
                  <input
                    type="text"
                    placeholder="VD: Chúng tôi cần giao diện mượt mà và tối ưu hiệu năng trên mobile..."
                    value={formClientNotes}
                    onChange={(e) => setFormClientNotes(e.target.value)}
                    className="bounty-input"
                  />
                </div>

                {/* Tasks checklist builder */}
                <div style={{ gridColumn: 'span 2', background: 'var(--surface-2)', padding: '0.875rem', borderRadius: '0.75rem' }}>
                  <label className="bounty-field-label" style={{ marginBottom: '0.5rem' }}>
                    Checklist tiêu chuẩn nghiệm thu ({formTasks.length} mục)
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.5rem' }}>
                    {formTasks.map((t, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--surface)', padding: '0.375rem 0.625rem', borderRadius: '6px', fontSize: '12px' }}>
                        <span>• {t}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTask(idx)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Thêm tiêu chuẩn nghiệm thu mới..."
                      value={newTaskInput}
                      onChange={(e) => setNewTaskInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTask(); } }}
                      className="bounty-input"
                      style={{ fontSize: '12px', padding: '0.375rem 0.625rem' }}
                    />
                    <button
                      type="button"
                      className="button secondary"
                      style={{ minHeight: '34px', padding: '0 0.75rem', fontSize: '12px' }}
                      onClick={handleAddTask}
                    >
                      Thêm
                    </button>
                  </div>
                </div>
              </div>

              {/* Form Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForm}
                  className="button"
                >
                  <Plus size={16} weight="bold" />
                  <span>{isSubmittingForm ? 'Đang tạo...' : 'Xác nhận tạo nhiệm vụ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
