'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowSquareOut, CheckCircle, DotsThree, FloppyDisk, MagnifyingGlass, Plus, WarningCircle, X } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Empty, ErrorState, Loading, PaginationNav, Status, ConfirmDialog } from '@/components/ui';
import {
  ApiError,
  logUploadStageError,
  markConfirmUploadError,
  request,
  uploadFile,
  uploadImageFile,
} from '@/lib/api';
import { optionContent, toDatetimeLocal } from '@/lib/format';
import { downloadQuizImportTemplate, parseQuizSpreadsheet } from '@/lib/quiz-import';
import { AdminCertificates } from '@/components/admin-certificates';
import { AdminLeaderboard } from '@/components/admin-leaderboard';
import {
  canCreateContent,
  canDeleteContent,
  canManageContent,
  canUpdateContent,
} from '@/lib/permissions';
import type { Course, Pagination, Quiz, Submission, Topic } from '@/lib/types';

type Tab = 'courses' | 'topics' | 'quizzes' | 'reviews' | 'certificates' | 'leaderboards';
const labels: Record<Tab, string> = { courses: 'Khóa học', topics: 'Chủ đề', quizzes: 'Câu hỏi', reviews: 'Duyệt project', certificates: 'Chứng nhận', leaderboards: 'Bảng xếp hạng' };
const EMPTY_PAGE = { page: 1, limit: 10, total: 0, totalPages: 1 };

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((row) => row.id === item.id);
  if (index < 0) return [item, ...items];
  const next = items.slice();
  next[index] = { ...items[index], ...item };
  return next;
}

/** Menu ⋮ ở mỗi dòng danh sách (kiểu Figma Action Menu): chỉ Sửa/Xóa, không thêm nhân bản. */
function RowMenu({ label, canEdit, canDelete, onEdit, onDelete }: { label: string; canEdit: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  if (!canEdit && !canDelete) return null;
  return (
    <div className="row-menu">
      <button type="button" className="icon-button" aria-label={`Tùy chọn ${label}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><DotsThree /></button>
      {open ? (
        <>
          <button type="button" className="row-menu-backdrop" aria-label="Đóng menu" onClick={() => setOpen(false)} />
          <div className="row-menu-panel" role="menu">
            {canEdit ? <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }}>Sửa</button> : null}
            {canDelete ? <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(); }}>Xóa</button> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [courseOptions, setCourseOptions] = useState<Course[]>([]);
  const [topicOptions, setTopicOptions] = useState<Topic[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [coursePagination, setCoursePagination] = useState(EMPTY_PAGE);
  const [topicPagination, setTopicPagination] = useState(EMPTY_PAGE);
  const [quizPagination, setQuizPagination] = useState(EMPTY_PAGE);
  const [reviewPagination, setReviewPagination] = useState(EMPTY_PAGE);
  const [courseId, setCourseId] = useState('');
  const [quizTopicId, setQuizTopicId] = useState('');
  const [editing, setEditing] = useState<Course | Topic | Quiz | null>(null);
  const [hasProject, setHasProject] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  // Form Khóa học (08/11/2026): tên file đã chọn cho ô chọn ảnh bìa / file đề project (hiển thị thay cho input file mặc định).
  const [coverFileName, setCoverFileName] = useState('');
  const [projectFileName, setProjectFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [bulkJson, setBulkJson] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'course' | 'topic' | 'quiz'; id: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingReview, setPendingReview] = useState<{ id: string; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  // Duyệt project 2 bên (08/11/2026): bài nộp đang chọn để duyệt ở panel trái.
  const [selectedReviewId, setSelectedReviewId] = useState('');
  // Form Khóa học dạng popup (08/11/2026): tạo/sửa đều mở popup, nút Tạo nằm trên danh sách.
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  // Form Chủ đề / Câu hỏi / Import dạng popup (08/11/2026): giống tab Khóa học.
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [quizImageFileName, setQuizImageFileName] = useState('');
  const [importFileName, setImportFileName] = useState('');
  // Toast (08/11/2026): báo tạo/sửa/xóa thành công và lỗi, thay cho dòng chữ inline (bị popup che mất).
  const [toasts, setToasts] = useState<{ id: number; kind: 'success' | 'error'; message: string }[]>([]);
  const toastId = useRef(0);
  const showToast = (kind: 'success' | 'error', message: string) => {
    const id = ++toastId.current;
    setToasts((items) => [...items, { id, kind, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((toast) => toast.id !== id)), 4500);
  };
  // Tìm kiếm (08/11/2026): lọc client-side theo tên/slug/mã/nội dung.
  // Khóa học/Chủ đề dùng danh sách đầy đủ đã tải (tối đa 100); Câu hỏi tải toàn bộ của chủ đề đang chọn khi có từ khóa.
  const [courseQuery, setCourseQuery] = useState('');
  const [topicQuery, setTopicQuery] = useState('');
  const [quizQuery, setQuizQuery] = useState('');
  const [allQuizzes, setAllQuizzes] = useState<Quiz[]>([]);
  const normQuery = (value: string) => value.trim().toLowerCase();
  const shownCourses = useMemo(() => {
    const q = normQuery(courseQuery);
    if (!q) return courses;
    return courseOptions.filter((item) => `${item.name} ${item.slug}`.toLowerCase().includes(q));
  }, [courseQuery, courses, courseOptions]);
  const shownTopics = useMemo(() => {
    const q = normQuery(topicQuery);
    if (!q) return topics;
    return topicOptions.filter((item) => `${item.name} ${item.slug}`.toLowerCase().includes(q));
  }, [topicQuery, topics, topicOptions]);
  useEffect(() => {
    const q = quizQuery.trim();
    if (!q || !quizTopicId) { setAllQuizzes([]); return; }
    const timer = window.setTimeout(() => {
      void request.get<Pagination<Quiz>>(`/topic/${quizTopicId}/quizzes/full?limit=100`)
        .then((data) => setAllQuizzes(data.items ?? []))
        .catch(() => setAllQuizzes([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [quizQuery, quizTopicId]);
  const shownQuizzes = useMemo(() => {
    const q = normQuery(quizQuery);
    if (!q) return quizzes;
    return allQuizzes.filter((item) => `${item.quizCode} ${item.content?.text || ''} ${item.question || ''}`.toLowerCase().includes(q));
  }, [quizQuery, quizzes, allQuizzes]);

  const allowed = canManageContent(user);
  const allowCreate = canCreateContent(user);
  const allowUpdate = canUpdateContent(user);
  const allowDelete = canDeleteContent(user);

  useEffect(() => {
    if (!authLoading && !allowed) router.replace('/dashboard');
  }, [authLoading, allowed, router]);

  const resetCreateForm = () => {
    setEditing(null);
    setHasProject(false);
    setSelectedTopicIds([]);
    setCoverFileName('');
    setProjectFileName('');
    setQuizImageFileName('');
    setImportFileName('');
    setCourseModalOpen(false);
    setTopicModalOpen(false);
    setQuizModalOpen(false);
    setImportModalOpen(false);
    setFormKey((value) => value + 1);
  };

  // Popup Khóa học: mở để tạo mới (form trống), đóng thì dọn form.
  const openCourseCreate = () => { resetCreateForm(); setCourseModalOpen(true); };
  const closeCourseModal = () => { resetCreateForm(); setError(''); setNotice(''); };
  // Popup Chủ đề / Câu hỏi / Import: giống popup Khóa học.
  const openTopicCreate = () => { resetCreateForm(); setTopicModalOpen(true); };
  const closeTopicModal = () => { resetCreateForm(); setError(''); setNotice(''); };
  const openQuizCreate = () => { resetCreateForm(); setQuizModalOpen(true); };
  const closeQuizModal = () => { resetCreateForm(); setError(''); setNotice(''); };
  const openImportModal = () => { resetCreateForm(); setImportModalOpen(true); };
  const closeImportModal = () => { resetCreateForm(); setError(''); setNotice(''); };

  // Đóng popup bằng Escape + khóa cuộn nền khi có popup mở.
  const anyModalOpen = courseModalOpen || topicModalOpen || quizModalOpen || importModalOpen;
  useEffect(() => {
    if (!anyModalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (courseModalOpen) closeCourseModal();
      else if (topicModalOpen) closeTopicModal();
      else if (quizModalOpen) closeQuizModal();
      else closeImportModal();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyModalOpen]);

  const load = async (soft = false) => {
    if (!soft) setLoading(true);
    setError('');
    try {
      const [courseData, topicData, allCourses, allTopics] = await Promise.all([
        request.get<Pagination<Course>>(`/course?page=${coursePagination.page}&limit=10`),
        request.get<Pagination<Topic>>(`/topic?page=${topicPagination.page}&limit=10`),
        request.get<Pagination<Course>>('/course?limit=100'),
        request.get<Pagination<Topic>>('/topic?limit=100'),
      ]);
      setCourses(courseData.items ?? []);
      setTopics(topicData.items ?? []);
      setCoursePagination(courseData.pagination);
      setTopicPagination(topicData.pagination);
      setCourseOptions(allCourses.items ?? []);
      setTopicOptions(allTopics.items ?? []);
      setCourseId((value) => value || allCourses.items?.find((item) => item.hasProject)?.id || allCourses.items?.[0]?.id || '');
      setQuizTopicId((value) => value || allTopics.items?.[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được dữ liệu quản trị');
    } finally {
      if (!soft) setLoading(false);
    }
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCoursesPage = async (page: number) => {
    setError('');
    try {
      const data = await request.get<Pagination<Course>>(`/course?page=${page}&limit=10`);
      setCourses(data.items); setCoursePagination(data.pagination);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được khóa học'); }
  };

  const loadTopicsPage = async (page: number) => {
    setError('');
    try {
      const data = await request.get<Pagination<Topic>>(`/topic?page=${page}&limit=10`);
      setTopics(data.items); setTopicPagination(data.pagination);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được chủ đề'); }
  };

  const loadTopicQuizzes = async (selected: string, page = 1) => {
    setQuizTopicId(selected); setError('');
    if (!selected) return setQuizzes([]);
    try {
      const data = await request.get<Pagination<Quiz>>(`/topic/${selected}/quizzes/full?page=${page}&limit=10`);
      setQuizzes(data.items ?? []); setQuizPagination(data.pagination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được câu hỏi');
    }
  };

  const loadReviews = async (selected: string, page = 1) => {
    setCourseId(selected); setError('');
    if (!selected) return setSubmissions([]);
    try {
      const data = await request.get<Pagination<Submission>>(`/course/${selected}/project-submission?page=${page}&limit=10`);
      setSubmissions(data.items ?? []); setReviewPagination(data.pagination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được bài nộp');
    }
  };

  const editCourse = async (item: Course) => {
    const detail = await request.get<Course>(`/course/${item.id}`);
    setEditing(detail);
    setHasProject(detail.hasProject);
    setSelectedTopicIds(detail.topics?.map((link) => link.topic.id) || []);
    setCoverFileName('');
    setProjectFileName('');
    setCourseModalOpen(true);
    setTab('courses');
    setError('');
    setNotice('');
  };

  const remove = async () => {
    if (!pendingDelete) return;
    if (!allowDelete) {
      showToast('error', 'Tài khoản không có quyền quiz.question.delete.');
      setPendingDelete(null);
      return;
    }
    const { kind, id } = pendingDelete;
    setDeleting(true);
    try {
      await request.delete(`/${kind}/${id}`);
      if (kind === 'course') setCourses((items) => items.filter((item) => item.id !== id));
      if (kind === 'topic') setTopics((items) => items.filter((item) => item.id !== id));
      if (kind === 'quiz') setQuizzes((items) => items.filter((item) => item.id !== id));
      resetCreateForm();
      await load(true);
      if (tab === 'quizzes') await loadTopicQuizzes(quizTopicId);
      showToast('success', 'Đã xóa.');
      setPendingDelete(null);
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'Không thể xóa');
    } finally {
      setDeleting(false);
    }
  };

  const saveCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const projectTitle = String(form.get('projectTitle') || '').trim();
    const projectDescription = String(form.get('projectDescription') || '').trim();
    if (hasProject && (!projectTitle || !projectDescription)) {
      showToast('error', 'Khóa học có project cần tên và mô tả đề bài.');
      setSaving(false);
      return;
    }
    const body: Record<string, unknown> = {
      name: String(form.get('name')),
      slug: String(form.get('slug')),
      description: String(form.get('description') || ''),
      hasProject,
      topicWeight: hasProject ? 50 : 100,
      projectWeight: hasProject ? 50 : 0,
    };
    const wasEditing = Boolean(editingCourse);
    try {
      const cover = form.get('cover');
      const coverFile = cover instanceof File && cover.size ? cover : undefined;
      if (coverFile) {
        const uploaded = await uploadImageFile('/course/upload/image-signature', coverFile);
        body.imageUrl = uploaded.secureUrl;
        body.imagePublicId = uploaded.publicId;
      }
      const saved = await (wasEditing
        ? request.put<Course>(`/course/${editingCourse!.id}`, body)
        : request.post<Course>('/course', body)
      ).catch((error) => coverFile ? markConfirmUploadError(error, coverFile) : Promise.reject(error));
      // Always sync curriculum on edit (incl. empty = unlink all). On create, only if selected.
      if (wasEditing || selectedTopicIds.length) {
        await request.put(`/course/${saved.id}/topics`, { topicIds: selectedTopicIds });
      }
      if (hasProject) {
        const projectDueAt = String(form.get('projectDueAt') || '');
        // Always explicit: empty clears the deadline, a value sets it (late submissions are labelled, never blocked).
        const requirement: Record<string, unknown> = { title: projectTitle, description: projectDescription, isRequired: true, dueAt: projectDueAt ? new Date(projectDueAt).toISOString() : null };
        const attachment = form.get('projectAttachment');
        if (attachment instanceof File && attachment.size) {
          const uploaded = await uploadFile(`/course/${saved.id}/project-requirement/upload/signature`, attachment);
          requirement.attachmentUrl = uploaded.secureUrl;
          requirement.attachmentPublicId = uploaded.publicId;
          requirement.attachmentOriginalName = attachment.name;
        }
        await request.put(`/course/${saved.id}/project-requirement`, requirement);
      }
      setCourses((items) => upsertById(items, saved));
      resetCreateForm();
      showToast('success', wasEditing ? 'Đã cập nhật khóa học.' : 'Đã tạo khóa học.');
      await load(true);
    } catch (reason) {
      logUploadStageError(reason);
      showToast('error', reason instanceof Error ? reason.message : 'Không thể lưu khóa học');
    } finally {
      setSaving(false);
    }
  };

  const saveTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name')).trim();
    const slug = String(form.get('slug')).trim();
    const selectedCourseId = String(form.get('courseId') || '');
    const base = {
      name,
      slug,
      startsAt: form.get('startsAt') ? new Date(String(form.get('startsAt'))).toISOString() : null,
      endsAt: form.get('endsAt') ? new Date(String(form.get('endsAt'))).toISOString() : null,
    };
    const wasEditing = Boolean(editingTopic);

    if (!wasEditing) {
      const duplicate = topicOptions.find((item) => item.slug === slug);
      if (duplicate) {
        showToast('error', `Slug "${slug}" đã có. Đang mở form sửa chủ đề hiện có — lưu để cập nhật, không tạo mới.`);
        setEditing(duplicate);
        setTopicModalOpen(true);
        setSaving(false);
        return;
      }
    }

    try {
      const saved = wasEditing
        ? await request.put<Topic>(`/topic/${editingTopic!.id}`, base)
        : await request.post<Topic>('/topic', { ...base, courseId: selectedCourseId });
      setTopics((items) => upsertById(items, saved));
      resetCreateForm();
      showToast('success', wasEditing ? 'Đã cập nhật chủ đề.' : 'Đã tạo chủ đề.');
      await load(true);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Không thể lưu chủ đề';
      if (!wasEditing && reason instanceof ApiError && reason.status === 409) {
        try {
          const topicData = await request.get<Pagination<Topic>>('/topic?limit=100');
          setTopicOptions(topicData.items ?? []);
          const existing = topicData.items?.find((item) => item.slug === slug);
          if (existing) {
            setEditing(existing);
            setTopicModalOpen(true);
            showToast('error', `${message}. Đã chuyển sang sửa chủ đề có sẵn.`);
            setSaving(false);
            return;
          }
        } catch {
          /* keep original error */
        }
      }
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  const saveQuiz = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const topicId = String(form.get('topicId'));
    const options = ['A', 'B', 'C', 'D'].map((label) => ({ label, content: String(form.get(`option${label}`)), isCode: false }));
    const body: Record<string, unknown> = {
      topicId,
      question: String(form.get('question')),
      code: String(form.get('code') || ''),
      answer: String(form.get('answer')),
      explanation: String(form.get('explanation') || ''),
      options,
    };
    const wasEditing = Boolean(editingQuiz);
    try {
      const image = form.get('image');
      const imageFile = image instanceof File && image.size ? image : undefined;
      if (imageFile) {
        const uploaded = await uploadImageFile('/quiz/upload/signature', imageFile);
        body.imageUrl = uploaded.secureUrl;
        body.imagePublicId = uploaded.publicId;
      }
      const saved = await (wasEditing
        ? request.put<Quiz>(`/quiz/${editingQuiz!.id}`, body)
        : request.post<Quiz>('/quiz', body)
      ).catch((error) => imageFile ? markConfirmUploadError(error, imageFile) : Promise.reject(error));
      setQuizTopicId(topicId);
      setQuizzes((items) => upsertById(items, saved));
      resetCreateForm();
      showToast('success', wasEditing ? 'Đã cập nhật câu hỏi.' : 'Đã tạo câu hỏi.');
      await loadTopicQuizzes(topicId);
    } catch (reason) {
      logUploadStageError(reason);
      showToast('error', reason instanceof Error ? reason.message : 'Không thể lưu câu hỏi');
    } finally {
      setSaving(false);
    }
  };

  const review = async () => {
    if (!pendingReview) return;
    const { id: submissionId, decision } = pendingReview;
    const reviewerNote = reviewNote.trim();
    if (decision === 'REJECT' && !reviewerNote) {
      showToast('error', 'Khi từ chối bài, hãy nêu rõ nội dung cần sửa.');
      return;
    }
    setReviewing(true); setError('');
    try {
      await request.patch(`/course/${courseId}/project-submission/${submissionId}/review`, { decision, reviewerNote });
      await loadReviews(courseId, reviewPagination.page);
      showToast('success', decision === 'APPROVE' ? 'Đã duyệt bài.' : 'Đã yêu cầu sửa.');
      setPendingReview(null);
      setReviewNote('');
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'Không thể duyệt bài');
    } finally {
      setReviewing(false);
    }
  };

  const importBulk = async (quizzes: unknown[]) => {
    if (saving) return;
    if (!quizTopicId && !quizzes.some((item) => item && typeof item === 'object' && 'topicId' in item && (item as { topicId?: string }).topicId)) {
      showToast('error', 'Chọn chủ đề ở danh sách bên phải trước khi import.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      if (!quizzes.length) throw new Error('Không có câu hỏi để import.');
      const withTopic = quizzes.map((item) => {
        if (!item || typeof item !== 'object') throw new Error('Mỗi phần tử phải là object.');
        const row = item as Record<string, unknown>;
        return { ...row, topicId: row.topicId || quizTopicId };
      });
      const result = await request.post<{ count: number }>('/quiz/bulk', { quizzes: withTopic });
      setBulkJson('');
      setImportFileName('');
      showToast('success', `Đã import ${result.count} câu hỏi.`);
      setImportModalOpen(false);
      await loadTopicQuizzes(quizTopicId);
      await load(true);
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'Không import được');
    } finally {
      setSaving(false);
    }
  };

  const importBulkJson = async () => {
    try {
      const parsed = JSON.parse(bulkJson) as unknown;
      const quizzes = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { quizzes?: unknown }).quizzes)
          ? (parsed as { quizzes: unknown[] }).quizzes
          : null;
      if (!quizzes?.length) throw new Error('JSON phải là mảng câu hỏi hoặc { "quizzes": [...] }.');
      await importBulk(quizzes);
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'Không import được JSON');
    }
  };

  const importBulkFile = async (file: File | null) => {
    if (!file || saving) return;
    setError(''); setNotice('');
    try {
      const quizzes = await parseQuizSpreadsheet(await file.arrayBuffer());
      await importBulk(quizzes);
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'Không đọc được file Excel/CSV');
    }
  };

  const editingCourse = tab === 'courses' && editing && 'hasProject' in editing ? (editing as Course) : null;
  const editingQuiz = tab === 'quizzes' && editing && 'quizCode' in editing ? (editing as Quiz) : null;
  const editingTopic =
    tab === 'topics' && editing && !('hasProject' in editing) && !('quizCode' in editing)
      ? (editing as Topic)
      : null;
  const projectCourses = useMemo(() => courseOptions.filter((item) => item.hasProject), [courseOptions]);
  const selectedSubmission = submissions.find((item) => item.id === selectedReviewId);

  if (authLoading || loading) return <Loading />;
  if (!allowed) return null;
  if (error && !courses.length && !topics.length) return <ErrorState message={error} retry={() => void load()} />;

  return (
    <>
      <header className="page-heading"><div><h1>Quiz Studio</h1><p>Quản lý lộ trình, câu hỏi, đề project và bài nộp tại một nơi.</p></div></header>
      <div className="tabs" role="tablist">{(Object.keys(labels) as Tab[]).filter((item) => !['reviews', 'certificates', 'leaderboards'].includes(item) || allowUpdate).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} key={item} onClick={() => { setTab(item); resetCreateForm(); setError(''); setNotice(''); if (item === 'reviews') void loadReviews(courseId, 1); if (item === 'quizzes') void loadTopicQuizzes(quizTopicId, 1); }}>{labels[item]}</button>)}</div>
      {tab === 'leaderboards' && allowUpdate ? <AdminLeaderboard /> : null}
      {tab === 'certificates' && allowUpdate ? <AdminCertificates /> : null}
      {error ? <p className="form-error" style={{ marginTop: 16 }} role="alert">{error}</p> : null}
      {notice ? <p className="form-success" style={{ marginTop: 16 }} role="status">{notice}</p> : null}

      {tab === 'courses' ? <div className="panel section">
        <div className="section-title">
          <div className="section-title-left"><h2>Danh sách</h2><span>{courseQuery.trim() ? shownCourses.length : coursePagination.total}</span></div>
          <div className="list-actions">
            <span className="admin-search admin-search-compact"><MagnifyingGlass size={18} /><input className="search-input" value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} placeholder="Tìm khóa học" aria-label="Tìm khóa học" /></span>
            {allowCreate ? <button type="button" className="button" onClick={openCourseCreate}><Plus /> Tạo khóa học</button> : null}
          </div>
        </div>
        {courseQuery.trim() && !shownCourses.length ? <div className="empty-state"><strong>Không tìm thấy khóa học</strong><p>Không có khóa học nào khớp với “{courseQuery.trim()}”.</p></div> : <div className="list">{shownCourses.map((item) => <div className="list-row" key={item.id}><div><strong>{item.name}</strong><small>{item.slug} · {item.hasProject ? 'Có project' : 'Không có project'}</small></div><div className="list-actions"><RowMenu label={item.name} canEdit={allowUpdate} canDelete={allowDelete} onEdit={() => void editCourse(item)} onDelete={() => setPendingDelete({ kind: 'course', id: item.id })} /></div></div>)}</div>}
        {courseQuery.trim() ? null : <PaginationNav {...coursePagination} onChange={(page) => void loadCoursesPage(page)} />}
      </div> : null}

      {tab === 'topics' ? <div className="panel section">
        <div className="section-title">
          <div className="section-title-left"><h2>Danh sách</h2><span>{topicQuery.trim() ? shownTopics.length : topicPagination.total}</span></div>
          <div className="list-actions">
            <span className="admin-search admin-search-compact"><MagnifyingGlass size={18} /><input className="search-input" value={topicQuery} onChange={(event) => setTopicQuery(event.target.value)} placeholder="Tìm chủ đề" aria-label="Tìm chủ đề" /></span>
            {allowCreate ? <button type="button" className="button" onClick={openTopicCreate}><Plus /> Tạo chủ đề</button> : null}
          </div>
        </div>
        {topicQuery.trim() && !shownTopics.length ? <div className="empty-state"><strong>Không tìm thấy chủ đề</strong><p>Không có chủ đề nào khớp với “{topicQuery.trim()}”.</p></div> : <div className="list">{shownTopics.map((item) => <div className="list-row" key={item.id}><div><strong>{item.name}</strong><small>{item.slug} · {item._count?.quizzes || 0} câu hỏi · {item.availability || 'OPEN'}</small></div><div className="list-actions"><RowMenu label={item.name} canEdit={allowUpdate} canDelete={allowDelete} onEdit={() => { setEditing(item); setTopicModalOpen(true); setError(''); setNotice(''); }} onDelete={() => setPendingDelete({ kind: 'topic', id: item.id })} /></div></div>)}</div>}
        {topicQuery.trim() ? null : <PaginationNav {...topicPagination} onChange={(page) => void loadTopicsPage(page)} />}
      </div> : null}

      {tab === 'quizzes' ? <div className="panel section">
        <div className="section-title">
          <div className="section-title-left"><h2>Danh sách</h2><span>{quizQuery.trim() ? shownQuizzes.length : quizPagination.total}</span></div>
          <div className="list-actions">
            <span className="admin-search admin-search-compact"><MagnifyingGlass size={18} /><input className="search-input" value={quizQuery} onChange={(event) => setQuizQuery(event.target.value)} placeholder="Tìm câu hỏi" aria-label="Tìm câu hỏi" /></span>
            {allowCreate ? <button type="button" className="button secondary" onClick={openImportModal}>Import hàng loạt</button> : null}
            {allowCreate ? <button type="button" className="button" onClick={openQuizCreate}><Plus /> Tạo câu hỏi</button> : null}
          </div>
        </div>
        <label className="field"><span>Chủ đề</span><select value={quizTopicId} onChange={(event) => void loadTopicQuizzes(event.target.value, 1)}>{topicOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {quizQuery.trim() && !shownQuizzes.length ? <div className="empty-state"><strong>Không tìm thấy câu hỏi</strong><p>Không có câu hỏi nào khớp với “{quizQuery.trim()}”.</p></div> : <div className="list">{shownQuizzes.map((item) => <div className="list-row" key={item.id}><div><strong>{item.quizCode}</strong><small>{item.content?.text || item.question}</small></div><div className="list-actions"><RowMenu label={item.quizCode} canEdit={allowUpdate} canDelete={allowDelete} onEdit={() => { setEditing(item); setQuizModalOpen(true); setError(''); setNotice(''); }} onDelete={() => setPendingDelete({ kind: 'quiz', id: item.id })} /></div></div>)}</div>}
        {quizQuery.trim() ? null : <PaginationNav {...quizPagination} onChange={(page) => void loadTopicQuizzes(quizTopicId, page)} />}
      </div> : null}

      {tab === 'reviews' && allowUpdate ? (
        <div className="admin-grid section">
          <section className="panel" aria-label="Duyệt bài nộp">
            <div className="section-title"><h2>Duyệt bài</h2></div>
            {selectedSubmission ? (
              <div className="grid">
                <div className="review-detail">
                  <div className="review-detail-head">
                    <strong>{selectedSubmission.userFullName || selectedSubmission.userEmail || `Học viên ${selectedSubmission.userId}`}</strong>
                    <Status value={selectedSubmission.status} />
                  </div>
                  <small>{selectedSubmission.userEmail ? `${selectedSubmission.userEmail} · ` : ''}Nộp {new Date(selectedSubmission.submittedAt).toLocaleString('vi-VN')}</small>
                  {selectedSubmission.reviewerNote || selectedSubmission.note ? <p>{selectedSubmission.reviewerNote || selectedSubmission.note}</p> : null}
                  <div className="file-links">{selectedSubmission.files.map((file) => <a key={file.id} href={file.secureUrl} target="_blank" rel="noreferrer">{file.originalName} <ArrowSquareOut aria-hidden="true" /></a>)}</div>
                </div>
                <label className="field"><span>Ghi chú</span><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Ghi chú duyệt hoặc nội dung cần sửa" /></label>
                {selectedSubmission.status === 'PENDING_REVIEW' ? (
                  <div className="list-actions review-actions">
                    <button className="button" onClick={() => { setPendingReview({ id: selectedSubmission.id, decision: 'APPROVE' }); setError(''); }}>Duyệt</button>
                    <button className="button danger" onClick={() => { setPendingReview({ id: selectedSubmission.id, decision: 'REJECT' }); setError(''); }}>Yêu cầu sửa</button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Empty title="Chọn một bài nộp để duyệt" description="Bấm một bài nộp ở danh sách bên phải để xem chi tiết và duyệt." />
            )}
          </section>
          <section className="panel" aria-label="Danh sách bài nộp">
            <div className="section-title">
              <h2>Bài nộp project</h2>
              {projectCourses.length ? (
                <label className="field"><span>Khóa học</span><select value={courseId} onChange={(event) => { setSelectedReviewId(''); setReviewNote(''); void loadReviews(event.target.value, 1); }}>{projectCourses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              ) : null}
            </div>
            {!projectCourses.length ? (
              <Empty title="Chưa có khóa có project" description="Bật «Có project cuối khóa» khi tạo/sửa khóa học trước." />
            ) : submissions.length ? (
              <>
                <div className="list">
                  {submissions.map((item) => (
                    <div className={`list-row${item.id === selectedReviewId ? ' selected' : ''}`} key={item.id} role="button" tabIndex={0} onClick={() => { setSelectedReviewId(item.id); setReviewNote(''); setError(''); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedReviewId(item.id); setReviewNote(''); setError(''); } }}>
                      <div>
                        <strong>{item.userFullName || item.userEmail || `Học viên ${item.userId}`}</strong>
                        <small>{item.userEmail ? `${item.userEmail} · ` : ''}Nộp {new Date(item.submittedAt).toLocaleString('vi-VN')} · {item.reviewerNote || item.note || `${item.files.length} file`}</small>
                        <div className="file-links">{item.files.map((file) => <a key={file.id} href={file.secureUrl} target="_blank" rel="noreferrer">{file.originalName} <ArrowSquareOut aria-hidden="true" /></a>)}</div>
                      </div>
                      <div className="list-actions">
                        <Status value={item.status} />
                      </div>
                    </div>
                  ))}
                </div>
                <PaginationNav {...reviewPagination} onChange={(page) => { setSelectedReviewId(''); setReviewNote(''); void loadReviews(courseId, page); }} />
              </>
            ) : <Empty title="Chưa có bài cần duyệt" description="Bài nộp project sẽ xuất hiện tại đây." />}
          </section>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Xóa mục này?"
        message="Thao tác có thể ảnh hưởng dữ liệu liên quan và không hoàn tác được."
        confirmLabel="Xóa"
        danger
        busy={deleting}
        onCancel={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        open={Boolean(pendingReview)}
        title={pendingReview?.decision === 'REJECT' ? 'Yêu cầu chỉnh sửa?' : 'Duyệt bài nộp?'}
        message={pendingReview?.decision === 'REJECT' ? 'Học viên sẽ cần sửa lại project theo ghi chú của bạn.' : 'Xác nhận duyệt project này.'}
        confirmLabel={pendingReview?.decision === 'REJECT' ? 'Gửi yêu cầu sửa' : 'Duyệt'}
        danger={pendingReview?.decision === 'REJECT'}
        busy={reviewing}
        noteLabel="Ghi chú"
        noteValue={reviewNote}
        notePlaceholder={pendingReview?.decision === 'REJECT' ? 'Nêu nội dung cần chỉnh sửa' : 'Ghi chú duyệt (không bắt buộc)'}
        noteRequired={pendingReview?.decision === 'REJECT'}
        onNoteChange={setReviewNote}
        onCancel={() => { if (!reviewing) { setPendingReview(null); setReviewNote(''); } }}
        onConfirm={() => void review()}
      />
      {/* Popup tạo/sửa khóa học (08/11/2026): form dài nên đưa vào popup, nút Tạo nằm trên danh sách. */}
      {courseModalOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={closeCourseModal}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="course-dialog-title" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <h2 id="course-dialog-title">{editingCourse ? 'Sửa khóa học' : 'Tạo khóa học'}</h2>
              <button type="button" className="icon-button" aria-label="Đóng" onClick={closeCourseModal}><X /></button>
            </div>
            {(editingCourse ? allowUpdate : allowCreate) ? (
              <form className="form dialog-form" key={`course-${editingCourse?.id || 'new'}-${formKey}`} onSubmit={saveCourse}>
                <div className="dialog-body">
                  <section className="form-section">
                    <h3 className="form-section-title">Thông tin cơ bản</h3>
                    <div className="form-grid">
                      <label className="field"><span>Tên <b className="required">*</b></span><input name="name" defaultValue={editingCourse?.name} required onBlur={(event) => { const slug = event.currentTarget.form?.elements.namedItem('slug') as HTMLInputElement; if (slug && !slug.value) slug.value = slugify(event.currentTarget.value); }} /></label>
                      <label className="field"><span>Slug <b className="required">*</b></span><input name="slug" defaultValue={editingCourse?.slug} required /><small>Dùng trong đường dẫn. Chỉ chữ thường, số và dấu gạch ngang.</small></label>
                    </div>
                    <label className="field"><span>Mô tả</span><textarea name="description" defaultValue={editingCourse?.description || ''} /></label>
                    <div className="field"><span>Ảnh bìa</span>
                      <label className="file-picker">
                        <input name="cover" type="file" accept="image/*" onChange={(event) => setCoverFileName(event.currentTarget.files?.[0]?.name || '')} />
                        <span className="file-picker-button">Chọn ảnh</span>
                        <span className="file-picker-name">{coverFileName || 'Chưa chọn ảnh'}</span>
                      </label>
                      <small>Không bắt buộc. Giữ trống để dùng ảnh hiện tại.</small>
                    </div>
                  </section>
                  <section className="form-section">
                    <h3 className="form-section-title">Chủ đề trong khóa <span className="form-section-count">Đã chọn {selectedTopicIds.length}/{topicOptions.length}</span></h3>
                    <div className="choice-list">
                      {topicOptions.map((item) => (
                        <label key={item.id}>
                          <input type="checkbox" checked={selectedTopicIds.includes(item.id)} onChange={(event) => setSelectedTopicIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
                          <span className="choice-text"><strong>{item.name}</strong><small>{item.slug}</small></span>
                        </label>
                      ))}
                    </div>
                  </section>
                  <section className="form-section">
                    <label className="check-field"><input type="checkbox" name="hasProject" checked={hasProject} onChange={(event) => setHasProject(event.target.checked)} /> <span className="check-text"><strong>Có project cuối khóa</strong><small>Học viên phải nộp bài project để hoàn thành khóa học.</small></span></label>
                    {hasProject ? (
                      <div className="form-subsection">
                        <h4 className="form-subsection-title">Đề project</h4>
                        <div className="form-grid">
                          <label className="field"><span>Tên đề bài <b className="required">*</b></span><input name="projectTitle" defaultValue={editingCourse?.projectRequirement?.title || ''} required={hasProject} /></label>
                          <label className="field"><span>Hạn nộp</span><input name="projectDueAt" type="datetime-local" defaultValue={toDatetimeLocal(editingCourse?.projectRequirement?.dueAt)} /><small>Không bắt buộc. Bài nộp sau hạn vẫn được nhận và gắn nhãn &quot;Nộp muộn&quot;.</small></label>
                        </div>
                        <label className="field"><span>Mô tả yêu cầu <b className="required">*</b></span><textarea name="projectDescription" defaultValue={editingCourse?.projectRequirement?.description || ''} required={hasProject} /></label>
                        <div className="field"><span>File đề bài</span>
                          <label className="file-picker">
                            <input name="projectAttachment" type="file" accept=".pdf,.docx,.zip,.rar" onChange={(event) => setProjectFileName(event.currentTarget.files?.[0]?.name || '')} />
                            <span className="file-picker-button">Chọn file</span>
                            <span className="file-picker-name">{projectFileName || editingCourse?.projectRequirement?.attachmentOriginalName || 'Chưa chọn file'}</span>
                          </label>
                          <small>PDF, DOCX, ZIP hoặc RAR. Không bắt buộc.</small>
                        </div>
                      </div>
                    ) : null}
                  </section>
                </div>
                <div className="form-footer dialog-footer"><button className="button" disabled={saving}><FloppyDisk /> {saving ? 'Đang lưu…' : 'Lưu'}</button>{editingCourse ? <button type="button" className="button secondary" onClick={closeCourseModal}>Hủy</button> : null}</div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
      {/* Popup tạo/sửa chủ đề (08/11/2026): giống popup Khóa học. */}
      {topicModalOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={closeTopicModal}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="topic-dialog-title" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <h2 id="topic-dialog-title">{editingTopic ? `Sửa chủ đề · ${editingTopic.slug}` : 'Tạo chủ đề'}</h2>
              <button type="button" className="icon-button" aria-label="Đóng" onClick={closeTopicModal}><X /></button>
            </div>
            {(editingTopic ? allowUpdate : allowCreate) ? (
              <form className="form dialog-form" key={`topic-${editingTopic?.id || 'new'}-${formKey}`} onSubmit={saveTopic}>
                <div className="dialog-body">
                  <section className="form-section">
                    <h3 className="form-section-title">Thông tin cơ bản</h3>
                    {!editingTopic ? <label className="field"><span>Khóa học <b className="required">*</b></span><select name="courseId" required>{courseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
                    <div className="form-grid">
                      <label className="field"><span>Tên <b className="required">*</b></span><input name="name" defaultValue={editingTopic?.name} required onBlur={(event) => { const slug = event.currentTarget.form?.elements.namedItem('slug') as HTMLInputElement; if (slug && !slug.value) slug.value = slugify(event.currentTarget.value); }} /></label>
                      <label className="field"><span>Slug <b className="required">*</b></span><input name="slug" defaultValue={editingTopic?.slug} required /><small>Slug unique trong khóa. Trùng → mở form sửa.</small></label>
                    </div>
                  </section>
                  <section className="form-section">
                    <h3 className="form-section-title">Thời gian mở</h3>
                    <div className="form-grid">
                      <label className="field"><span>Mở từ</span><input name="startsAt" type="datetime-local" defaultValue={toDatetimeLocal(editingTopic?.startsAt)} /></label>
                      <label className="field"><span>Đóng lúc</span><input name="endsAt" type="datetime-local" defaultValue={toDatetimeLocal(editingTopic?.endsAt)} /></label>
                    </div>
                  </section>
                </div>
                <div className="form-footer dialog-footer"><button className="button" disabled={saving}><FloppyDisk /> {saving ? 'Đang lưu…' : 'Lưu'}</button>{editingTopic ? <button type="button" className="button secondary" onClick={closeTopicModal}>Hủy</button> : null}</div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
      {/* Popup tạo/sửa câu hỏi (08/11/2026): giống popup Khóa học. */}
      {quizModalOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={closeQuizModal}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="quiz-dialog-title" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <h2 id="quiz-dialog-title">{editingQuiz ? 'Sửa câu hỏi' : 'Tạo câu hỏi'}</h2>
              <button type="button" className="icon-button" aria-label="Đóng" onClick={closeQuizModal}><X /></button>
            </div>
            {(editingQuiz ? allowUpdate : allowCreate) ? (
              <form className="form dialog-form" key={`quiz-${editingQuiz?.id || 'new'}-${formKey}`} onSubmit={saveQuiz}>
                <div className="dialog-body">
                  <section className="form-section">
                    <h3 className="form-section-title">Câu hỏi</h3>
                    <label className="field"><span>Chủ đề <b className="required">*</b></span><select name="topicId" defaultValue={editingQuiz?.topicId || quizTopicId} required>{topicOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    <label className="field"><span>Câu hỏi <b className="required">*</b></span><textarea name="question" defaultValue={editingQuiz?.content?.text || editingQuiz?.question} required /></label>
                    <label className="field"><span>Đoạn code</span><textarea name="code" defaultValue={editingQuiz?.content?.code || ''} /></label>
                    <div className="field"><span>Ảnh minh họa</span>
                      <label className="file-picker">
                        <input name="image" type="file" accept="image/*" onChange={(event) => setQuizImageFileName(event.currentTarget.files?.[0]?.name || '')} />
                        <span className="file-picker-button">Chọn ảnh</span>
                        <span className="file-picker-name">{quizImageFileName || 'Chưa chọn ảnh'}</span>
                      </label>
                      <small>Không bắt buộc. Giữ trống để dùng ảnh hiện tại.</small>
                    </div>
                    {editingQuiz?.content?.image ? <small>Ảnh hiện tại: đã gắn.</small> : null}
                  </section>
                  <section className="form-section">
                    <h3 className="form-section-title">Đáp án</h3>
                    <div className="form-grid">
                      {['A', 'B', 'C', 'D'].map((label) => <label className="field" key={label}><span>Đáp án {label} <b className="required">*</b></span><input name={`option${label}`} defaultValue={optionContent(editingQuiz, label)} required /></label>)}
                    </div>
                    <label className="field"><span>Đáp án đúng <b className="required">*</b></span><select name="answer" defaultValue={editingQuiz?.answer || 'A'}>{['A', 'B', 'C', 'D'].map((label) => <option key={label}>{label}</option>)}</select></label>
                    <label className="field"><span>Giải thích</span><textarea name="explanation" defaultValue={editingQuiz?.explanation || ''} /></label>
                  </section>
                </div>
                <div className="form-footer dialog-footer"><button className="button" disabled={saving}><FloppyDisk /> {saving ? 'Đang lưu…' : 'Lưu'}</button>{editingQuiz ? <button type="button" className="button secondary" onClick={closeQuizModal}>Hủy</button> : null}</div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
      {/* Popup Import hàng loạt (08/11/2026): tách khỏi form tạo/sửa, mở từ nút trên danh sách. */}
      {importModalOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={closeImportModal}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <h2 id="import-dialog-title">Import hàng loạt</h2>
              <button type="button" className="icon-button" aria-label="Đóng" onClick={closeImportModal}><X /></button>
            </div>
            <form className="form dialog-form" onSubmit={(event) => { event.preventDefault(); void importBulkJson(); }}>
              <div className="dialog-body">
                <div className="field"><span>File Excel / CSV</span>
                  <label className="file-picker">
                    <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" disabled={saving} onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ''; setImportFileName(file?.name || ''); void importBulkFile(file); }} />
                    <span className="file-picker-button">Chọn file</span>
                    <span className="file-picker-name">{importFileName || 'Chưa chọn file'}</span>
                  </label>
                  <small>
                    Cột chuẩn: question, A, B, C, D, answer — hoặc format docs: content__text, options__1..4, answer (1–4). Tối đa 200 dòng.
                    {' '}
                    <button type="button" className="linkish" onClick={() => void downloadQuizImportTemplate()} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
                      Tải mẫu .xlsx
                    </button>
                  </small>
                </div>
                <label className="field">
                  <span>Hoặc dán JSON</span>
                  <textarea rows={6} value={bulkJson} onChange={(event) => setBulkJson(event.target.value)} placeholder='[{"question":"...","answer":"A","options":[{"label":"A","content":"..."},{"label":"B","content":"..."},{"label":"C","content":"..."},{"label":"D","content":"..."}]}]' />
                  <small>Thiếu topicId → dùng chủ đề đang chọn ở danh sách.</small>
                </label>
              </div>
              <div className="form-footer dialog-footer"><button className="button" disabled={saving || !bulkJson.trim()}>{saving ? 'Đang import…' : 'Import JSON'}</button><button type="button" className="button secondary" onClick={closeImportModal}>Hủy</button></div>
            </form>
          </div>
        </div>
      ) : null}
      {/* Toast (08/11/2026): báo tạo/sửa/xóa thành công và lỗi, góc phải dưới, tự tắt sau 4,5 giây, bấm để tắt ngay. */}
      {toasts.length ? (
        <div className="admin-toasts" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <button key={toast.id} type="button" className={`admin-toast admin-toast-${toast.kind}`} onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}>
              {toast.kind === 'success' ? <CheckCircle /> : <WarningCircle />}
              <span>{toast.message}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
