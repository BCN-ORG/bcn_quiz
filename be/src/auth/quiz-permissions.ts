/** Profiles-registered QUIZ permissions (see docs/profiles-manifest.yaml). */
export const QuizPermission = {
  QuestionRead: 'quiz.question.read',
  QuestionCreate: 'quiz.question.create',
  QuestionUpdate: 'quiz.question.update',
  QuestionDelete: 'quiz.question.delete',
  ResultRead: 'quiz.result.read',
} as const;

/** Create or update content (mentor + admin). */
export const CONTENT_WRITE = [
  QuizPermission.QuestionCreate,
  QuizPermission.QuestionUpdate,
] as const;

/** Delete content (admin only in default manifest). */
export const CONTENT_DELETE = [QuizPermission.QuestionDelete] as const;
