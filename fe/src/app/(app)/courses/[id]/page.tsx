'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, FolderSimple, UploadSimple } from '@phosphor-icons/react';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Empty, ErrorState, Loading, Progress, Status } from '@/components/ui';
import { request, uploadFile } from '@/lib/api';
import { topicOpen } from '@/lib/format';
import type { Course, CourseProgress, ProjectRequirement, Submission, Topic } from '@/lib/types';

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [requirement, setRequirement] = useState<ProjectRequirement | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const canResubmit = !submission || submission.status === 'REJECTED' || submission.status === 'PENDING_REVIEW';

  const submitProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const files = Array.from(form.getAll('files')).filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) {
      setError('Chọn ít nhất một file để nộp.');
      return;
    }
    if (files.length > 5) {
      setError('Tối đa 5 file cho mỗi bài nộp.');
      return;
    }
    setSubmitting(true); setError('');
    try {
      const uploaded = [];
      for (const file of files) {
        const signed = await uploadFile(`/course/${id}/upload/signature`, file);
        uploaded.push({
          secureUrl: signed.secureUrl,
          publicId: signed.publicId,
          originalName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
        });
      }
      const body = { note: String(form.get('note') || ''), files: uploaded };
      if (submission && (submission.status === 'REJECTED' || submission.status === 'PENDING_REVIEW')) {
        await request.patch(`/course/${id}/project-submission/${submission.id}`, body);
      } else {
        await request.post(`/course/${id}/project-submission`, body);
      }
      event.currentTarget.reset();
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể nộp project'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <Loading />;
  if (error && !course) return <ErrorState message={error} retry={() => void load()} />;
  if (!course || !progress) return <Empty title="Không tìm thấy khóa học" description="Khóa học có thể đã được gỡ." />;

  return (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">Lộ trình học</p><h1>{course.name}</h1><p>{course.description || 'Hoàn thành từng topic để tiến tới chứng chỉ.'}</p></div>
        <Status value={progress.status} />
      </header>
      <div className="grid grid-2">
        <section className="panel"><h2>Tiến độ tổng</h2><Progress value={progress.progressPercent} label="Toàn khóa" /><Progress value={progress.topicProgressPercent} label="Quiz" />{course.hasProject ? <Progress value={progress.projectProgressPercent} label="Project" /> : null}</section>
        <section className="panel"><h2>Điều kiện hoàn thành</h2><p>Mỗi topic cần coverage đáp án đúng từ 80%. {course.hasProject ? 'Project cần được quản trị viên duyệt.' : 'Khóa học này không yêu cầu project.'}</p></section>
      </div>
      <section className="section">
        <div className="section-title"><h2>Nội dung khóa học</h2><span>{course.topics?.length || 0} chủ đề</span></div>
        <div className="topic-list">
          {course.topics?.map((link, index) => {
            const topic = link.topic as Topic;
            const open = topicOpen(topic.availability);
            return (
              <div className={`topic-row ${open ? '' : 'is-locked'}`} key={topic.id}>
                <span className="topic-number">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{topic.name}</h3>
                  <p><BookOpen size={14} /> {topic._count?.quizzes ?? 0} câu hỏi{topic.availability && topic.availability !== 'OPEN' ? ` · ${topic.availability === 'SCHEDULED' ? 'Chưa tới lịch thi' : 'Đã đóng'}` : ''}</p>
                </div>
                {open ? <Link className="button secondary" href={`/topics/${topic.id}?courseId=${id}`}>Làm bài <ArrowRight /></Link> : <Status value={topic.availability || 'CLOSED'} />}
              </div>
            );
          })}
        </div>
      </section>
      {course.hasProject ? (
        <section className="section panel">
          <div className="section-title"><h2>Project cuối khóa</h2>{submission ? <Status value={submission.status} /> : null}</div>
          <h3>{requirement?.title || 'Bài project'}</h3>
          <p>{requirement?.description || 'Xem yêu cầu từ giảng viên và nộp file hoàn chỉnh.'}</p>
          {requirement?.attachmentUrl ? <a className="button secondary" href={requirement.attachmentUrl} target="_blank" rel="noreferrer"><FolderSimple /> Tải đề bài{requirement.attachmentOriginalName ? `: ${requirement.attachmentOriginalName}` : ''}</a> : null}
          {submission ? (
            <div className="list-row" style={{ marginTop: 18 }}>
              <div>
                <strong>Đã nộp {new Date(submission.submittedAt).toLocaleDateString('vi-VN')}</strong>
                <small>{submission.note || `${submission.files.length} file`}</small>
                <div className="file-links">{submission.files.map((file) => <a key={file.id} href={file.secureUrl} target="_blank" rel="noreferrer">{file.originalName}</a>)}</div>
              </div>
              <Status value={submission.status} />
            </div>
          ) : null}
          {submission?.status === 'REJECTED' ? (
            <div className="notice notice-danger" role="status">
              <strong>Bài đã bị từ chối. Nộp lại bản đã chỉnh sửa.</strong>
              <p>{submission.reviewerNote || 'Giảng viên yêu cầu chỉnh sửa trước khi duyệt lại.'}</p>
            </div>
          ) : null}
          {canResubmit ? (
            <form className="form" style={{ marginTop: 20 }} onSubmit={submitProject}>
              <label className="field">
                <span>{submission ? 'File project mới' : 'File project'}</span>
                <input name="files" type="file" required multiple accept=".zip,.rar,.pdf,.docx" />
                <small>Tối đa 5 file, mỗi file 20 MB. Định dạng ZIP, RAR, PDF hoặc DOCX. File mới sẽ thay thế toàn bộ file cũ.</small>
              </label>
              <label className="field"><span>Ghi chú</span><textarea name="note" placeholder="Mô tả ngắn về bài nộp" defaultValue={submission?.note || ''} /></label>
              {error ? <p className="form-error">{error}</p> : null}
              <button className="button" disabled={submitting}>
                <UploadSimple /> {submitting ? 'Đang tải lên' : submission?.status === 'REJECTED' ? 'Nộp lại project' : submission ? 'Cập nhật bài nộp' : 'Nộp project'}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
