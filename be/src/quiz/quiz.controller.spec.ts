import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { QuizPermission } from '../auth/quiz-permissions';
import { QuizController } from './quiz.controller';

describe('QuizController permissions', () => {
  const readMethods = [
    'getAllQuizzes',
    'getQuizByCode',
    'getQuizById',
  ] as const;

  it.each(readMethods)('%s requires quiz.question.read', (method) => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, QuizController.prototype[method]),
    ).toEqual([QuizPermission.QuestionRead]);
  });
});
