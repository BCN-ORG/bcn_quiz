import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { HttpExceptionEnvelopeFilter } from './http-exception-envelope.filter';

describe('HttpExceptionEnvelopeFilter', () => {
  const filter = new HttpExceptionEnvelopeFilter();

  function mockHost(statusWriter: { statusCode?: number; body?: unknown }) {
    const response = {
      status(code: number) {
        statusWriter.statusCode = code;
        return this;
      },
      json(body: unknown) {
        statusWriter.body = body;
        return body;
      },
    };
    return {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'GET', url: '/x', originalUrl: '/x' }),
      }),
    };
  }

  it('wraps HttpException into envelope', () => {
    const out: { statusCode?: number; body?: unknown } = {};
    filter.catch(new UnauthorizedException('Nope'), mockHost(out) as never);
    expect(out.statusCode).toBe(401);
    expect(out.body).toEqual({
      statusCode: 401,
      message: 'Nope',
      error: 'Unauthorized',
      data: null,
    });
  });

  it('keeps validation message arrays', () => {
    const out: { statusCode?: number; body?: unknown } = {};
    filter.catch(
      new BadRequestException({
        message: ['email must be an email'],
        error: 'Bad Request',
      }),
      mockHost(out) as never,
    );
    expect(out.statusCode).toBe(400);
    expect(out.body).toMatchObject({
      statusCode: 400,
      message: ['email must be an email'],
      error: 'Bad Request',
      data: null,
    });
  });
});
