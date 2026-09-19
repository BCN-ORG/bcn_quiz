import { extractBearerToken } from './auth-header.util';

describe('auth header utilities', () => {
  describe('extractBearerToken', () => {
    it('extracts bearer tokens case-insensitively', () => {
      expect(extractBearerToken('bearer abc.def')).toBe('abc.def');
    });

    it('ignores non-bearer authorization headers', () => {
      expect(extractBearerToken('Basic abc.def')).toBeUndefined();
    });
  });
});
