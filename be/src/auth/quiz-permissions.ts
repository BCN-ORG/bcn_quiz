/** Profiles-registered QUIZ permissions (see docs/profiles-manifest.yaml). */
export const QuizPermission = {
  QuestionRead: 'quiz.question.read',
  QuestionCreate: 'quiz.question.create',
  QuestionUpdate: 'quiz.question.update',
  QuestionDelete: 'quiz.question.delete',
  ResultRead: 'quiz.result.read',
} as const;

/** Browse courses and take quizzes. */
export const CONTENT_READ = [QuizPermission.QuestionRead] as const;

/** Own attempt history. */
export const RESULT_READ = [QuizPermission.ResultRead] as const;

/** Create content. Mentor and admin in the registered manifest. */
export const CONTENT_CREATE = [QuizPermission.QuestionCreate] as const;

/** Update content and review submissions. Mentor and admin. */
export const CONTENT_UPDATE = [QuizPermission.QuestionUpdate] as const;

/** Upload and other edits that either create or update may perform. */
export const CONTENT_WRITE = [
  QuizPermission.QuestionCreate,
  QuizPermission.QuestionUpdate,
] as const;

/** Delete content (admin only in default manifest). */
export const CONTENT_DELETE = [QuizPermission.QuestionDelete] as const;
