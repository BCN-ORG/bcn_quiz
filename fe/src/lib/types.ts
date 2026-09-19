export type User = {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  /** Platform role from Profiles (USER | ADMIN). */
  role?: string;
  /** QUIZ app roles from Profiles RBAC (member | mentor | admin). */
  roles?: string[];
  /** QUIZ permissions from Profiles (quiz.question.create, …). */
  permissions?: string[];
};

export type Pagination<T> = {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type Topic = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  availability?: 'OPEN' | 'SCHEDULED' | 'CLOSED';
  _count?: { quizzes?: number };
};

export type Course = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  hasProject: boolean;
  topicWeight: number;
  projectWeight: number;
  topicCount?: number;
  _count?: { topics?: number; submissions?: number; certificates?: number };
  topics?: Array<{ id: string; sortOrder: number; topic: Topic }>;
  projectRequirement?: ProjectRequirement | null;
};

export type CourseProgress = {
  id: string;
  courseId: string;
  progressPercent: number;
  topicProgressPercent: number;
  projectProgressPercent: number;
  status: string;
  course: Course & { topicCount?: number };
};

export type QuizOption = { label: string; content: string; isCode: boolean };
export type Quiz = {
  id: string;
  quizCode: string;
  topicId?: string;
  question?: string;
  content?: { text: string; code?: string | null; image?: string | null };
  options: QuizOption[] | { data: Record<string, string>; is_code?: boolean };
  answer?: string;
  explanation?: string;
};

export type QuizSession = {
  id: string;
  topicId: string;
  currentQuizId?: string | null;
  status: string;
  answers: Record<string, string>;
  expiresAt: string;
};

export type SessionResult = {
  sessionId: string;
  score: number;
  correctCount: number;
  attemptedQuizCount: number;
  quizResults: Array<{
    quizId: string;
    quizCode: string;
    content: { text: string; code?: string | null; image?: string | null };
    options: { data: Record<string, string> };
    selectedAnswer: string | null;
    correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  }>;
};

export type ProjectRequirement = {
  id: string;
  title: string;
  description?: string | null;
  isRequired: boolean;
  attachmentUrl?: string | null;
  attachmentPublicId?: string | null;
  attachmentOriginalName?: string | null;
};

export type Submission = {
  id: string;
  userId: string;
  userFullName?: string | null;
  userEmail?: string | null;
  userAvatarUrl?: string | null;
  status: string;
  note?: string | null;
  reviewerNote?: string | null;
  submittedAt: string;
  files: Array<{ id: string; secureUrl: string; publicId?: string; originalName: string }>;
};

export type Certificate = {
  id: string;
  certificateCode: string;
  issuedAt: string;
  course: { id: string; name: string; slug: string };
};

export type CertificateVerification = {
  valid: true;
  certificateCode: string;
  issuedAt: string;
  course: { id: string; name: string; slug: string };
};
