'use client';

import Image from 'next/image';
import Link from 'next/link';
import { BookOpen } from '@phosphor-icons/react';
import type { Course, CourseProgress } from '@/lib/types';
import { Progress, Status } from './ui';

export function CourseCard({ course, progress }: { course: Course; progress?: CourseProgress }) {
  return (
    <Link href={`/courses/${course.id}`} className="course-card">
      {course.imageUrl ? (
        <div className="course-image" style={{ position: 'relative' }}>
          <Image
            src={course.imageUrl}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 680px) 100vw, 50vw"
            style={{ objectFit: 'cover' }}
          />
        </div>
      ) : (
        <div className="course-image course-placeholder"><BookOpen aria-hidden="true" /></div>
      )}
      <div className="course-body">
        <h3>{course.name}</h3>
        <p>{course.description || 'Nội dung học và bài luyện tập theo chủ đề.'}</p>
        <div className="card-meta">
          <span><BookOpen size={16} /> {course._count?.topics ?? course.topicCount ?? course.topics?.length ?? 0} chủ đề</span>
          {progress ? <Status value={progress.status} /> : null}
        </div>
        {progress ? <Progress value={progress.progressPercent} /> : null}
      </div>
    </Link>
  );
}
