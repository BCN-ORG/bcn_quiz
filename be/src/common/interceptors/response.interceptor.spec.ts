import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  it('prevents quiz responses from being cached', () => {
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/topic/t1/quizzes' }),
        getResponse: () => ({ statusCode: 200, setHeader }),
      }),
    };

    new ResponseInterceptor().intercept(context as never, {
      handle: () => of([]),
    });

    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store, max-age=0',
    );
  });
});
