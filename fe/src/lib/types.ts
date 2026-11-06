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
  leaderboard?: { totalQuestions: number; maxScore: number; questionWeight: number };
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

export type QuizOption = { id?: string; label: string; content: string; isCode: boolean };
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
  leaderboard: { isOfficial: boolean; score: number; attemptScore: number; maxScore: number; rank: number | null; businessDate: string };
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
  dueAt?: string | null;
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
  valid: boolean;
  /** Present (true) when an admin revoked the certificate: the code exists but is no longer valid. */
  revoked?: boolean;
  revokedAt?: string;
  certificateCode: string;
  issuedAt: string;
  course: { id: string; name: string; slug: string };
};

export type CertificateRequestStatus = 'PENDING' | 'ON_HOLD' | 'APPROVED' | 'REJECTED' | 'REVOKED';

/** The learner's own request for a course certificate (GET /certificate/requests/me). */
export type MyCertificateRequest = {
  id: string;
  status: CertificateRequestStatus;
  requestedAt: string;
  resubmittedAt: string | null;
  reviewedAt: string | null;
  /** The admin's reason; only sent for REJECTED and REVOKED. */
  reviewerNote: string | null;
  course: { id: string; name: string; slug: string };
  certificate: { id: string; certificateCode: string; issuedAt: string; revokedAt: string | null } | null;
};

export type AdminCertificateRequest = {
  id: string;
  status: CertificateRequestStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewerNote: string | null;
  course: { id: string; name: string };
  certificateCode: string | null;
  user: { id: string; fullName: string | null; email: string | null; avatarUrl: string | null };
};

export type CertificateEligibility = {
  eligible: boolean;
  courseStatus: string;
  course: { id: string; name: string; hasProject: boolean };
  topicsDone: number;
  topicsTotal: number;
  topics: Array<{ id: string; name: string; sortOrder: number; quizCount: number; completed: boolean; accuracy: number | null; totalAttempts: number; addedAfterRequest: boolean }>;
  project: { required: boolean; title: string | null; status: string | null; reviewedAt: string | null };
  reasons: string[];
  warnings: string[];
};

export type AdminCertificateRequestDetail = Omit<AdminCertificateRequest, 'course' | 'certificateCode'> & {
  resubmittedAt: string | null;
  certificate: { certificateCode: string; issuedAt: string; revokedAt: string | null; revokedReason: string | null } | null;
  eligibility: CertificateEligibility;
};
