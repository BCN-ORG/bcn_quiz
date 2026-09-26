import type { User } from './types';

/** Keep in sync with be/src/auth/quiz-permissions.ts and docs/profiles-manifest.yaml. */
export const QuizPermission = {
  QuestionRead: 'quiz.question.read',
  QuestionCreate: 'quiz.question.create',
  QuestionUpdate: 'quiz.question.update',
  QuestionDelete: 'quiz.question.delete',
  ResultRead: 'quiz.result.read',
} as const;

export function hasQuizPermission(user: User | null | undefined, code: string) {
  return (user?.permissions ?? []).some(
    (permission) => permission.toLowerCase() === code.toLowerCase(),
  );
}

export function canReadQuestions(user: User | null | undefined) {
  return hasQuizPermission(user, QuizPermission.QuestionRead);
}

export function canCreateContent(user: User | null | undefined) {
  return hasQuizPermission(user, QuizPermission.QuestionCreate);
}

export function canUpdateContent(user: User | null | undefined) {
  return hasQuizPermission(user, QuizPermission.QuestionUpdate);
}

export function canDeleteContent(user: User | null | undefined) {
  return hasQuizPermission(user, QuizPermission.QuestionDelete);
}

export function canReadResults(user: User | null | undefined) {
  return hasQuizPermission(user, QuizPermission.ResultRead);
}

export function canManageContent(user: User | null | undefined) {
  return canCreateContent(user) || canUpdateContent(user) || canDeleteContent(user);
}
