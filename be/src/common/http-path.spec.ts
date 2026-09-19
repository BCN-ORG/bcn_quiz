import { pathWithoutApiPrefix } from './http-path';

describe('pathWithoutApiPrefix', () => {
  it('strips a single /api prefix', () => {
    expect(pathWithoutApiPrefix('/api/health')).toBe('/health');
    expect(pathWithoutApiPrefix('/api/auth/me?x=1')).toBe('/auth/me');
    expect(pathWithoutApiPrefix('/api')).toBe('/');
  });

  it('leaves unprefixed paths unchanged', () => {
    expect(pathWithoutApiPrefix('/health')).toBe('/health');
    expect(pathWithoutApiPrefix('/course')).toBe('/course');
  });
});
