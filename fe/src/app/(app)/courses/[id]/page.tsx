'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, FolderSimple, UploadSimple } from '@phosphor-icons/react';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CERT_STATUS, CertStatus } from '@/components/certificate-status';
import { ProjectDue } from '@/components/project-due';
import { Empty, ErrorState, Loading, PaginationNav, Status } from '@/components/ui';
import { ApiError, UploadStageError, logUploadStageError, request, uploadFileWithProgress } from '@/lib/api';
import { isLateSubmission, topicOpen } from '@/lib/format';
import type { Course, CourseProgress, MyCertificateRequest, Pagination, ProjectRequirement, Submission, Topic } from '@/lib/types';

type CourseTopic = NonNullable<Course['topics']>[number];

const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['zip', 'rar', 'pdf', 'docx'];

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Kiểm tra nhanh ở client; server vẫn là nơi quyết định cuối cùng. */
function addFiles(current: File[], incoming: File[]) {
  const next = [...current];
  const problems: string[] = [];
  for (const file of incoming) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(extension)) problems.push(`"${file.name}" không đúng định dạng. Chỉ nhận ZIP, RAR, PDF hoặc DOCX.`);
    else if (file.size < 1) problems.push(`"${file.name}" là file rỗng.`);
    else if (file.size > MAX_BYTES) problems.push(`"${file.name}" nặng ${formatSize(file.size)}, vượt giới hạn 20 MB mỗi file.`);
    else if (next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) continue;
    else if (next.length >= MAX_FILES) problems.push(`Chỉ nộp tối đa ${MAX_FILES} file; "${file.name}" chưa được thêm.`);
    else next.push(file);
  }
  return { next, problems };
}

function describeSubmitError(reason: unknown) {
  if (reason instanceof UploadStageError) {
    if (reason.stage === 'signature') return 'Không chuẩn bị được kênh tải lên. Hãy thử lại sau ít phút; file của bạn vẫn được giữ.';
    return 'Không tải được file lên kho lưu trữ. Kiểm tra kết nối mạng rồi bấm Nộp để thử lại; file của bạn vẫn được giữ.';
  }
  if (reason instanceof ApiError) return `Chưa lưu được bài nộp (${reason.message}). File đã tải lên không bị mất; bấm Nộp để thử lại.`;
  if (reason instanceof TypeError) return 'Mất kết nối mạng. Kiểm tra mạng rồi bấm Nộp để thử lại; file của bạn vẫn được giữ.';
  return reason instanceof Error ? reason.message : 'Không thể nộp project. Hãy thử lại.';
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [certRequest, setCertRequest] = useState<MyCertificateRequest | null>(null);
  const [requirement, setRequirement] = useState<ProjectRequirement | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [topicPage, setTopicPage] = useState(1);
  const [topicPagination, setTopicPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [error, setError] = useState('');
  const [topicsError, setTopicsError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('');
  const [success, setSuccess] = useState('');
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const signedRef = useRef(new Map<File, { secureUrl: string; publicId: string }>());

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [courseData, progressPayload] = await Promise.all([
        request.get<Course>(`/course/${id}`),
        request.get<{ progress: CourseProgress | null; latestSubmission: Submission | null }>(
          `/course/${id}/progress/me`,
        ),
      ]);
      setCourse(courseData);
      setProgress(
        progressPayload.progress ?? {
          id: '',
          courseId: id,
          progressPercent: 0,
          topicProgressPercent: 0,
          projectProgressPercent: 0,
          status: 'IN_PROGRESS',
          course: courseData,
        },
      );
      setRequirement(courseData.projectRequirement || null);
      if (courseData.hasProject) {
        try { setRequirement(await request.get<ProjectRequirement>(`/course/${id}/project-requirement`)); }
        catch { setRequirement(courseData.projectRequirement || null); }
        if (progressPayload.latestSubmission) {
          setSubmission(progressPayload.latestSubmission);
        } else {
          try { setSubmission(await request.get<Submission>(`/course/${id}/project-submission/me`)); }
          catch { setSubmission(null); }
        }
      } else {
        setSubmission(null);
      }
      // The certificate status is secondary information: a failure here must not break the course page.
      try { setCertRequest((await request.get<{ items: MyCertificateRequest[] }>('/certificate/requests/me')).items.find((item) => item.course.id === id) ?? null); }
      catch { setCertRequest(null); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  // Đang tải lên hoặc còn file chưa nộp: nhắc trước khi đóng/tải lại tab và khi bấm link nội bộ.
  useEffect(() => {
    if (!submitting && !selected.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guardLinks = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      const message = submitting
        ? 'Bài đang được tải lên. Rời trang bây giờ có thể làm mất bài nộp. Bạn vẫn muốn rời đi?'
        : 'Bạn đã chọn file nhưng chưa nộp. Rời trang bây giờ sẽ mất danh sách file. Bạn vẫn muốn rời đi?';
      if (!window.confirm(message)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLinks, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardLinks, true);
    };
  }, [submitting, selected.length]);

  useEffect(() => {
    void request.get<Pagination<CourseTopic>>(`/course/${id}/topics?page=${topicPage}&limit=10`)
      .then((data) => { setTopics(data.items); setTopicPagination(data.pagination); setTopicsError(''); })
      .catch((reason) => setTopicsError(reason instanceof Error ? reason.message : 'Không tải được chủ đề'));
  }, [id, topicPage]);

  const canResubmit = !submission || submission.status === 'REJECTED' || submission.status === 'PENDING_REVIEW';

  const pickFiles = (incoming: File[]) => {
    const { next, problems } = addFiles(selected, incoming);
    setSelected(next);
    setFileError(problems.join(' '));
    setSuccess('');
  };

  const submitProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (abortRef.current) return;
    const formElement = event.currentTarget;
    const note = String(new FormData(formElement).get('note') || '');
    if (!selected.length) {
      setFileError('Chọn ít nhất một file để nộp.');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSubmitting(true); setSubmitError(''); setSuccess(''); setUploadPct(0);
    const total = selected.reduce((sum, file) => sum + file.size, 0);
    let finished = 0;
    try {
      const uploaded = [];
      for (const [index, file] of selected.entries()) {
        setUploadLabel(`Đang tải file ${index + 1}/${selected.length}: ${file.name}`);
        let signed = signedRef.current.get(file);
        if (!signed) {
          const result = await uploadFileWithProgress(`/course/${id}/upload/signature`, file, {
            signal: controller.signal,
            onProgress: (loaded) => setUploadPct(Math.round(((finished + loaded) / total) * 100)),
          });
          signed = { secureUrl: result.secureUrl, publicId: result.publicId };
          signedRef.current.set(file, signed);
        }
        finished += file.size;
        setUploadPct(Math.round((finished / total) * 100));
        uploaded.push({
          secureUrl: signed.secureUrl,
          publicId: signed.publicId,
          originalName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
        });
      }
      setUploadLabel('Đang lưu bài nộp…');
      const body = { note, files: uploaded };
      if (submission && (submission.status === 'REJECTED' || submission.status === 'PENDING_REVIEW')) {
        await request.patch(`/course/${id}/project-submission/${submission.id}`, body);
      } else {
        await request.post(`/course/${id}/project-submission`, body);
      }
      formElement.reset();
      setSelected([]);
      signedRef.current.clear();
      await load();
      setSuccess(`Đã nộp bài lúc ${new Date().toLocaleString('vi-VN')}. Bài đang chờ giảng viên duyệt.`);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        setSubmitError('Đã hủy tải lên. File bạn chọn vẫn được giữ; bấm Nộp khi muốn tải lại.');
      } else {
        logUploadStageError(reason);
        setSubmitError(describeSubmitError(reason));
      }
    } finally {
      abortRef.current = null;
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;
  if (error && !course) return <ErrorState message={error} retry={() => void load()} />;
  if (!course || !progress) return <Empty title="Không tìm thấy khóa học" description="Khóa học có thể đã được gỡ." />;

  return (
    <>
      {/* Bố cục Quizzes detail của Figma: quay lại + 4 thẻ số liệu + 2 cột (Chủ đề / Project) */}
      <Link className="back-link" href="/courses"><ArrowLeft /> Khóa học</Link>
      <header className="page-heading">
        <div><h1>{course.name}</h1><p>{course.description || 'Hoàn thành từng topic để tiến tới chứng nhận.'}</p></div>
        <Status value={progress.status} />
      </header>
      <div className="figma-stats" aria-label="Số liệu khóa học">
        <div className="figma-stat"><span>Tiến độ tổng</span><strong>{progress.progressPercent}%</strong><small>toàn khóa</small></div>
        <div className="figma-stat"><span>Quiz</span><strong>{progress.topicProgressPercent}%</strong><small>tiến độ topic</small></div>
        <div className="figma-stat"><span>Project</span><strong>{course.hasProject ? `${progress.projectProgressPercent}%` : '—'}</strong><small>{course.hasProject ? 'tiến độ project' : 'không yêu cầu project'}</small></div>
        <div className="figma-stat"><span>Chủ đề</span><strong>{topicPagination.total}</strong><small>Mỗi topic cần 80% đáp án đúng</small></div>
      </div>
      {certRequest ? <section className="panel section" id="course-certificate"><h2>Chứng nhận</h2><p><CertStatus value={certRequest.status} /> {CERT_STATUS[certRequest.status].hint} <Link href="/certificates">Xem chứng nhận</Link></p></section> : null}
      <div className="figma-split">
      <section className="section">
        <div className="section-title"><h2>Nội dung khóa học</h2><span>{topicPagination.total} chủ đề</span></div>
        {topicsError ? <p className="form-error" role="alert">{topicsError}</p> : null}
        <div className="topic-list">
          {topics.map((link, index) => {
            const topic = link.topic as Topic;
            const open = topicOpen(topic.availability);
            return (
              <div className={`topic-row ${open ? '' : 'is-locked'}`} key={topic.id}>
                <span className="topic-number">{String((topicPage - 1) * topicPagination.limit + index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{topic.name}</h3>
                  <p><BookOpen size={14} /> {topic._count?.quizzes ?? 0} câu hỏi{topic.availability && topic.availability !== 'OPEN' ? ` · ${topic.availability === 'SCHEDULED' ? 'Chưa tới lịch thi' : 'Đã đóng'}` : ''}</p>
                </div>
                {open ? <Link className="button secondary" href={`/topics/${topic.id}?courseId=${id}`}>Làm bài <ArrowRight /></Link> : <Status value={topic.availability || 'CLOSED'} />}
              </div>
            );
          })}
        </div>
        <PaginationNav {...topicPagination} onChange={setTopicPage} />
      </section>
      {course.hasProject ? (
        <section className="section panel">
          <div className="section-title"><h2>Project cuối khóa</h2>{submission ? <Status value={submission.status} /> : null}</div>
          <h3>{requirement?.title || 'Bài project'}</h3>
          <p className="project-rules"><strong>Quy định nộp bài:</strong> định dạng ZIP, RAR, PDF hoặc DOCX · tối đa {MAX_FILES} file · mỗi file không quá 20 MB.</p>
          <p>{requirement?.description || 'Xem yêu cầu từ giảng viên và nộp file hoàn chỉnh.'}</p>
          {requirement?.dueAt ? <ProjectDue dueAt={requirement.dueAt} /> : null}
          {requirement?.attachmentUrl ? <a className="button secondary" href={requirement.attachmentUrl} target="_blank" rel="noreferrer"><FolderSimple /> Tải đề bài{requirement.attachmentOriginalName ? `: ${requirement.attachmentOriginalName}` : ''}</a> : null}
          {success ? <div className="notice notice-success" role="status"><strong>{success}</strong></div> : null}
          {submission ? (
            <div className="list-row" style={{ marginTop: 18 }}>
              <div>
                <strong>Lần nộp gần nhất: {new Date(submission.submittedAt).toLocaleString('vi-VN')}</strong>
                <small>{submission.note || `${submission.files.length} file`}</small>
                <div className="file-links">{submission.files.map((file) => <a key={file.id} href={file.secureUrl} target="_blank" rel="noreferrer">{file.originalName}</a>)}</div>
              </div>
              <div className="list-actions"><Status value={submission.status} />{isLateSubmission(submission.submittedAt, requirement?.dueAt) ? <span className="status status-late">Nộp muộn</span> : null}</div>
            </div>
          ) : <p><Status value="NOT_SUBMITTED" /> Bạn chưa nộp bài cho project này.</p>}
          {submission?.status === 'REJECTED' ? (
            <div className="notice notice-danger" role="status">
              <strong>Bài đã bị từ chối. Nộp lại bản đã chỉnh sửa.</strong>
              <p>{submission.reviewerNote || 'Giảng viên yêu cầu chỉnh sửa trước khi duyệt lại.'}</p>
            </div>
          ) : null}
          {canResubmit ? (
            <form className="form" style={{ marginTop: 20 }} onSubmit={submitProject}>
              {submission ? <div className="notice notice-info" role="note"><strong>Nộp lại sẽ thay thế toàn bộ file đã nộp trước đó.</strong></div> : null}
              <div className="field">
                <span id="project-files-label">{submission ? 'File project mới' : 'File project'}</span>
                <div
                  className={`dropzone ${dragging ? 'is-dragging' : ''}`}
                  onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); if (!submitting) pickFiles(Array.from(event.dataTransfer.files)); }}
                >
                  <UploadSimple aria-hidden="true" />
                  <p>Kéo thả file vào đây hoặc</p>
                  <label className="button secondary dropzone-button">
                    Chọn file
                    <input
                      name="files"
                      type="file"
                      multiple
                      accept=".zip,.rar,.pdf,.docx"
                      aria-labelledby="project-files-label"
                      disabled={submitting}
                      onChange={(event) => { pickFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }}
                    />
                  </label>
                </div>
                {fileError ? <p className="form-error" role="alert">{fileError}</p> : null}
              </div>
              {selected.length ? (
                <ul className="selected-files" aria-label="File đã chọn">
                  {selected.map((file) => (
                    <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                      <span>{file.name} <small>{formatSize(file.size)}</small></span>
                      <button type="button" className="button secondary" disabled={submitting} onClick={() => setSelected((value) => value.filter((item) => item !== file))}>Bỏ file</button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="field"><span>Ghi chú</span><textarea name="note" placeholder="Mô tả ngắn về bài nộp" defaultValue={submission?.note || ''} disabled={submitting} /></label>
              {submitting ? (
                <div className="upload-progress" role="status">
                  <div className="progress-meta"><span>{uploadLabel}</span><strong>{uploadPct}%</strong></div>
                  <progress max={100} value={uploadPct} aria-label="Tiến trình tải lên" />
                </div>
              ) : null}
              {submitError ? <p className="form-error" role="alert">{submitError}</p> : null}
              <div className="list-actions">
                <button className="button" disabled={submitting}>
                  <UploadSimple /> {submitting ? 'Đang tải lên…' : submitError ? 'Thử lại' : submission?.status === 'REJECTED' ? 'Nộp lại project' : submission ? 'Cập nhật bài nộp' : 'Nộp project'}
                </button>
                {submitting ? <button type="button" className="button secondary" onClick={() => abortRef.current?.abort()}>Hủy tải lên</button> : null}
              </div>
            </form>
          ) : null}
        </section>
      ) : null}
      </div>
    </>
  );
}
