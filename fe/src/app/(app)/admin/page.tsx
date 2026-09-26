'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowSquareOut, FloppyDisk, PencilSimple, Trash } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Empty, ErrorState, Loading, PaginationNav, Status, ConfirmDialog } from '@/components/ui';
import { ApiError, request, uploadFile } from '@/lib/api';
import { optionContent, toDatetimeLocal } from '@/lib/format';
import { downloadQuizImportTemplate, parseQuizSpreadsheet } from '@/lib/quiz-import';
import {
  canCreateContent,
  canDeleteContent,
  canManageContent,
  canUpdateContent,
} from '@/lib/permissions';
import type { Course, Pagination, Quiz, Submission, Topic } from '@/lib/types';

type Tab = 'courses' | 'topics' | 'quizzes' | 'reviews';
const labels: Record<Tab, string> = { courses: 'Khóa học', topics: 'Chủ đề', quizzes: 'Câu hỏi', reviews: 'Duyệt project' };
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
    setFormKey((value) => value + 1);
  };

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
    setTab('courses');
    setError('');
    setNotice('');
  };

  const remove = async () => {
    if (!pendingDelete) return;
    if (!allowDelete) {
      setError('Tài khoản không có quyền quiz.question.delete.');
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
      setNotice('Đã xóa.');
      setPendingDelete(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa');
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
      setError('Khóa học có project cần tên và mô tả đề bài.');
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
      if (cover instanceof File && cover.size) {
        const uploaded = await uploadFile('/course/upload/image-signature', cover);
        body.imageUrl = uploaded.secureUrl;
        body.imagePublicId = uploaded.publicId;
      }
      const saved = wasEditing
        ? await request.put<Course>(`/course/${editingCourse!.id}`, body)
        : await request.post<Course>('/course', body);
      // Always sync curriculum on edit (incl. empty = unlink all). On create, only if selected.
      if (wasEditing || selectedTopicIds.length) {
        await request.put(`/course/${saved.id}/topics`, { topicIds: selectedTopicIds });
      }
      if (hasProject) {
        const requirement: Record<string, unknown> = { title: projectTitle, description: projectDescription, isRequired: true };
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
      setNotice(wasEditing ? 'Đã cập nhật khóa học.' : 'Đã tạo khóa học.');
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu khóa học');
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
        setError(`Slug "${slug}" đã có. Đang mở form sửa chủ đề hiện có — lưu để cập nhật, không tạo mới.`);
        setEditing(duplicate);
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
      setNotice(wasEditing ? 'Đã cập nhật chủ đề.' : 'Đã tạo chủ đề.');
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
            setError(`${message}. Đã chuyển sang sửa chủ đề có sẵn.`);
            setSaving(false);
            return;
          }
        } catch {
          /* keep original error */
        }
      }
      setError(message);
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
      if (image instanceof File && image.size) {
        const uploaded = await uploadFile('/quiz/upload/signature', image);
        body.imageUrl = uploaded.secureUrl;
        body.imagePublicId = uploaded.publicId;
      }
      const saved = wasEditing
        ? await request.put<Quiz>(`/quiz/${editingQuiz!.id}`, body)
        : await request.post<Quiz>('/quiz', body);
      setQuizTopicId(topicId);
      setQuizzes((items) => upsertById(items, saved));
      resetCreateForm();
      setNotice(wasEditing ? 'Đã cập nhật câu hỏi.' : 'Đã tạo câu hỏi.');
      await loadTopicQuizzes(topicId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu câu hỏi');
    } finally {
      setSaving(false);
    }
  };

  const review = async () => {
    if (!pendingReview) return;
    const { id: submissionId, decision } = pendingReview;
    const reviewerNote = reviewNote.trim();
    if (decision === 'REJECT' && !reviewerNote) {
      setError('Khi từ chối bài, hãy nêu rõ nội dung cần sửa.');
      return;
    }
    setReviewing(true); setError('');
    try {
      await request.patch(`/course/${courseId}/project-submission/${submissionId}/review`, { decision, reviewerNote });
      await loadReviews(courseId, reviewPagination.page);
      setNotice(decision === 'APPROVE' ? 'Đã duyệt bài.' : 'Đã yêu cầu sửa.');
      setPendingReview(null);
      setReviewNote('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể duyệt bài');
    } finally {
      setReviewing(false);
    }
  };

  const importBulk = async (quizzes: unknown[]) => {
    if (saving) return;
    if (!quizTopicId && !quizzes.some((item) => item && typeof item === 'object' && 'topicId' in item && (item as { topicId?: string }).topicId)) {
      setError('Chọn chủ đề ở danh sách bên phải trước khi import.');
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
      setNotice(`Đã import ${result.count} câu hỏi.`);
      await loadTopicQuizzes(quizTopicId);
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không import được');
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
      setError(reason instanceof Error ? reason.message : 'Không import được JSON');
    }
  };

  const importBulkFile = async (file: File | null) => {
    if (!file || saving) return;
    setError(''); setNotice('');
    try {
      const quizzes = await parseQuizSpreadsheet(await file.arrayBuffer());
      await importBulk(quizzes);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đọc được file Excel/CSV');
    }
  };

  const editingCourse = tab === 'courses' && editing && 'hasProject' in editing ? (editing as Course) : null;
  const editingQuiz = tab === 'quizzes' && editing && 'quizCode' in editing ? (editing as Quiz) : null;
  const editingTopic =
    tab === 'topics' && editing && !('hasProject' in editing) && !('quizCode' in editing)
      ? (editing as Topic)
      : null;
  const projectCourses = useMemo(() => courseOptions.filter((item) => item.hasProject), [courseOptions]);

  if (authLoading || loading) return <Loading />;
  if (!allowed) return null;
  if (error && !courses.length && !topics.length) return <ErrorState message={error} retry={() => void load()} />;

  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Quản trị nội dung</p><h1>Quiz Studio</h1><p>Quản lý lộ trình, câu hỏi, đề project và bài nộp tại một nơi.</p></div></header>
      <div className="tabs" role="tablist">{(Object.keys(labels) as Tab[]).filter((item) => item !== 'reviews' || allowUpdate).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} key={item} onClick={() => { setTab(item); resetCreateForm(); setError(''); setNotice(''); if (item === 'reviews') void loadReviews(courseId, 1); if (item === 'quizzes') void loadTopicQuizzes(quizTopicId, 1); }}>{labels[item]}</button>)}</div>
      {error ? <p className="form-error" style={{ marginTop: 16 }} role="alert">{error}</p> : null}
      {notice ? <p className="form-success" style={{ marginTop: 16 }} role="status">{notice}</p> : null}

      {tab === 'courses' ? <div className="admin-grid section">
        {(editingCourse ? allowUpdate : allowCreate) ? <form className="panel form" key={`course-${editingCourse?.id || 'new'}-${formKey}`} onSubmit={saveCourse}>
          <h2>{editingCourse ? 'Sửa khóa học' : 'Tạo khóa học'}</h2>
          <label className="field"><span>Tên</span><input name="name" defaultValue={editingCourse?.name} required onBlur={(event) => { const slug = event.currentTarget.form?.elements.namedItem('slug') as HTMLInputElement; if (slug && !slug.value) slug.value = slugify(event.currentTarget.value); }} /></label>
          <label className="field"><span>Slug</span><input name="slug" defaultValue={editingCourse?.slug} required /></label>
          <label className="field"><span>Mô tả</span><textarea name="description" defaultValue={editingCourse?.description || ''} /></label>
          <label className="field"><span>Ảnh bìa</span><input name="cover" type="file" accept="image/*" /><small>Không bắt buộc. Giữ trống để dùng ảnh hiện tại.</small></label>
          <fieldset className="fieldset"><legend>Chủ đề trong khóa</legend>
            <div className="choice-list">
              {topicOptions.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={selectedTopicIds.includes(item.id)} onChange={(event) => setSelectedTopicIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
                  <span>{item.name} <small>({item.slug})</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="check-field"><input type="checkbox" name="hasProject" checked={hasProject} onChange={(event) => setHasProject(event.target.checked)} /> Có project cuối khóa</label>
          {hasProject ? (
            <fieldset className="form fieldset">
              <legend>Đề project</legend>
              <label className="field"><span>Tên đề bài</span><input name="projectTitle" defaultValue={editingCourse?.projectRequirement?.title || ''} required={hasProject} /></label>
              <label className="field"><span>Mô tả yêu cầu</span><textarea name="projectDescription" defaultValue={editingCourse?.projectRequirement?.description || ''} required={hasProject} /></label>
              <label className="field"><span>File đề bài</span><input name="projectAttachment" type="file" accept=".pdf,.docx,.zip,.rar" /><small>{editingCourse?.projectRequirement?.attachmentOriginalName || 'PDF, DOCX, ZIP hoặc RAR. Không bắt buộc.'}</small></label>
            </fieldset>
          ) : null}
          <div className="list-actions"><button className="button" disabled={saving}><FloppyDisk /> {saving ? 'Đang lưu…' : 'Lưu'}</button>{editingCourse ? <button type="button" className="button secondary" onClick={() => { resetCreateForm(); setError(''); setNotice(''); }}>Hủy</button> : null}</div>
        </form> : null}
        <div className="panel"><div className="section-title"><h2>Danh sách</h2><span>{coursePagination.total}</span></div><div className="list">{courses.map((item) => <div className="list-row" key={item.id}><div><strong>{item.name}</strong><small>{item.slug} · {item.hasProject ? 'Có project' : 'Không có project'}</small></div><div className="list-actions">{allowUpdate ? <button className="icon-button" onClick={() => void editCourse(item)} aria-label={`Sửa ${item.name}`}><PencilSimple /></button> : null}{allowDelete ? <button className="icon-button" onClick={() => setPendingDelete({ kind: 'course', id: item.id })} aria-label={`Xóa ${item.name}`}><Trash /></button> : null}</div></div>)}</div><PaginationNav {...coursePagination} onChange={(page) => void loadCoursesPage(page)} /></div>
      </div> : null}

      {tab === 'topics' ? <div className="admin-grid section">
        {(editingTopic ? allowUpdate : allowCreate) ? <form className="panel form" key={`topic-${editingTopic?.id || 'new'}-${formKey}`} onSubmit={saveTopic}>
          <h2>{editingTopic ? `Sửa chủ đề · ${editingTopic.slug}` : 'Tạo chủ đề'}</h2>
          {!editingTopic ? <label className="field"><span>Khóa học</span><select name="courseId" required>{courseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
          <label className="field"><span>Tên</span><input name="name" defaultValue={editingTopic?.name} required onBlur={(event) => { const slug = event.currentTarget.form?.elements.namedItem('slug') as HTMLInputElement; if (slug && !slug.value) slug.value = slugify(event.currentTarget.value); }} /></label>
          <label className="field"><span>Slug</span><input name="slug" defaultValue={editingTopic?.slug} required /><small>Slug unique trong khóa. Trùng → mở form sửa.</small></label>
          <div className="form-grid">
            <label className="field"><span>Mở từ</span><input name="startsAt" type="datetime-local" defaultValue={toDatetimeLocal(editingTopic?.startsAt)} /></label>
            <label className="field"><span>Đóng lúc</span><input name="endsAt" type="datetime-local" defaultValue={toDatetimeLocal(editingTopic?.endsAt)} /></label>
          </div>
          <div className="list-actions"><button className="button" disabled={saving}><FloppyDisk /> {saving ? 'Đang lưu…' : 'Lưu'}</button>{editingTopic ? <button type="button" className="button secondary" onClick={() => { resetCreateForm(); setError(''); setNotice(''); }}>Hủy</button> : null}</div>
        </form> : null}
        <div className="panel"><div className="section-title"><h2>Danh sách</h2><span>{topicPagination.total}</span></div><div className="list">{topics.map((item) => <div className="list-row" key={item.id}><div><strong>{item.name}</strong><small>{item.slug} · {item._count?.quizzes || 0} câu hỏi · {item.availability || 'OPEN'}</small></div><div className="list-actions">{allowUpdate ? <button className="icon-button" onClick={() => { setEditing(item); setError(''); setNotice(''); }} aria-label={`Sửa ${item.name}`}><PencilSimple /></button> : null}{allowDelete ? <button className="icon-button" onClick={() => setPendingDelete({ kind: 'topic', id: item.id })} aria-label={`Xóa ${item.name}`}><Trash /></button> : null}</div></div>)}</div><PaginationNav {...topicPagination} onChange={(page) => void loadTopicsPage(page)} /></div>
      </div> : null}

      {tab === 'quizzes' ? <div className="admin-grid section">
        <div style={{ display: 'grid', gap: 16 }}>
          {(editingQuiz ? allowUpdate : allowCreate) ? <form className="panel form" key={`quiz-${editingQuiz?.id || 'new'}-${formKey}`} onSubmit={saveQuiz}>
            <h2>{editingQuiz ? 'Sửa câu hỏi' : 'Tạo câu hỏi'}</h2>
            <label className="field"><span>Chủ đề</span><select name="topicId" defaultValue={editingQuiz?.topicId || quizTopicId} required>{topicOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="field"><span>Câu hỏi</span><textarea name="question" defaultValue={editingQuiz?.content?.text || editingQuiz?.question} required /></label>
            <label className="field"><span>Đoạn code (không bắt buộc)</span><textarea name="code" defaultValue={editingQuiz?.content?.code || ''} /></label>
            <label className="field"><span>Ảnh minh họa</span><input name="image" type="file" accept="image/*" /><small>Không bắt buộc. Giữ trống để dùng ảnh hiện tại.</small></label>
            {editingQuiz?.content?.image ? <small>Ảnh hiện tại: đã gắn.</small> : null}
            {['A', 'B', 'C', 'D'].map((label) => <label className="field" key={label}><span>Đáp án {label}</span><input name={`option${label}`} defaultValue={optionContent(editingQuiz, label)} required /></label>)}
            <label className="field"><span>Đáp án đúng</span><select name="answer" defaultValue={editingQuiz?.answer || 'A'}>{['A', 'B', 'C', 'D'].map((label) => <option key={label}>{label}</option>)}</select></label>
            <label className="field"><span>Giải thích</span><textarea name="explanation" defaultValue={editingQuiz?.explanation || ''} /></label>
            <div className="list-actions"><button className="button" disabled={saving}><FloppyDisk /> {saving ? 'Đang lưu…' : 'Lưu'}</button>{editingQuiz ? <button type="button" className="button secondary" onClick={() => { resetCreateForm(); setError(''); setNotice(''); }}>Hủy</button> : null}</div>
          </form> : null}
          {allowCreate ? <form className="panel form" onSubmit={(event) => { event.preventDefault(); void importBulkJson(); }}>
            <h2>Import hàng loạt</h2>
            <label className="field">
              <span>File Excel / CSV</span>
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                disabled={saving}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = '';
                  void importBulkFile(file);
                }}
              />
              <small>
                Cột chuẩn: question, A, B, C, D, answer — hoặc format docs: content__text, options__1..4, answer (1–4). Tối đa 200 dòng.
                {' '}
                <button type="button" className="linkish" onClick={() => void downloadQuizImportTemplate()} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
                  Tải mẫu .xlsx
                </button>
              </small>
            </label>
            <label className="field">
              <span>Hoặc dán JSON</span>
              <textarea
                rows={6}
                value={bulkJson}
                onChange={(event) => setBulkJson(event.target.value)}
                placeholder='[{"question":"...","answer":"A","options":[{"label":"A","content":"..."},{"label":"B","content":"..."},{"label":"C","content":"..."},{"label":"D","content":"..."}]}]'
              />
              <small>Thiếu topicId → dùng chủ đề đang chọn ở danh sách bên phải.</small>
            </label>
            <div className="list-actions"><button className="button" disabled={saving || !bulkJson.trim()}>{saving ? 'Đang import…' : 'Import JSON'}</button></div>
          </form> : null}
        </div>
        <div className="panel"><div className="section-title"><h2>Danh sách</h2><label className="field"><span>Chủ đề</span><select value={quizTopicId} onChange={(event) => void loadTopicQuizzes(event.target.value, 1)}>{topicOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="list">{quizzes.map((item) => <div className="list-row" key={item.id}><div><strong>{item.quizCode}</strong><small>{item.content?.text || item.question}</small></div><div className="list-actions">{allowUpdate ? <button className="icon-button" onClick={() => { setEditing(item); setError(''); setNotice(''); }} aria-label={`Sửa ${item.quizCode}`}><PencilSimple /></button> : null}{allowDelete ? <button className="icon-button" onClick={() => setPendingDelete({ kind: 'quiz', id: item.id })} aria-label={`Xóa ${item.quizCode}`}><Trash /></button> : null}</div></div>)}</div><PaginationNav {...quizPagination} onChange={(page) => void loadTopicQuizzes(quizTopicId, page)} /></div>
      </div> : null}

      {tab === 'reviews' && allowUpdate ? (
        <section className="section panel">
          <div className="section-title">
            <h2>Bài nộp project</h2>
            {projectCourses.length ? (
              <label className="field"><span>Khóa học</span><select value={courseId} onChange={(event) => void loadReviews(event.target.value, 1)}>{projectCourses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            ) : null}
          </div>
          {!projectCourses.length ? (
            <Empty title="Chưa có khóa có project" description="Bật «Có project cuối khóa» khi tạo/sửa khóa học trước." />
          ) : submissions.length ? (
            <>
              <div className="list">
                {submissions.map((item) => (
                  <div className="list-row" key={item.id}>
                    <div>
                      <strong>{item.userFullName || item.userEmail || `Học viên ${item.userId}`}</strong>
                      <small>{item.userEmail ? `${item.userEmail} · ` : ''}Nộp {new Date(item.submittedAt).toLocaleString('vi-VN')} · {item.reviewerNote || item.note || `${item.files.length} file`}</small>
                      <div className="file-links">{item.files.map((file) => <a key={file.id} href={file.secureUrl} target="_blank" rel="noreferrer">{file.originalName} <ArrowSquareOut aria-hidden="true" /></a>)}</div>
                    </div>
                    <div className="list-actions">
                      <Status value={item.status} />
                      {item.status === 'PENDING_REVIEW' ? <><button className="button" onClick={() => { setPendingReview({ id: item.id, decision: 'APPROVE' }); setReviewNote(''); setError(''); }}>Duyệt</button><button className="button danger" onClick={() => { setPendingReview({ id: item.id, decision: 'REJECT' }); setReviewNote(''); setError(''); }}>Yêu cầu sửa</button></> : null}
                    </div>
                  </div>
                ))}
              </div>
              <PaginationNav {...reviewPagination} onChange={(page) => void loadReviews(courseId, page)} />
            </>
          ) : <Empty title="Chưa có bài cần duyệt" description="Bài nộp project sẽ xuất hiện tại đây." />}
        </section>
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
    </>
  );
}
