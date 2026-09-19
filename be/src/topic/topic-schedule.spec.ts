import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  assertTopicWindow,
  computeSessionExpiresAt,
  getTopicAvailability,
  isTopicWindowOpen,
  validateTopicScheduleWindow,
  withTopicAvailability,
} from './topic-schedule';

describe('topic-schedule', () => {
  const startsAt = new Date('2026-09-08T08:00:00.000Z');
  const endsAt = new Date('2026-09-08T10:00:00.000Z');

  describe('getTopicAvailability / isTopicWindowOpen', () => {
    it('treats null bounds as always open', () => {
      expect(getTopicAvailability({ startsAt: null, endsAt: null })).toBe(
        'OPEN',
      );
      expect(isTopicWindowOpen({ startsAt: null, endsAt: null })).toBe(true);
    });

    it('returns SCHEDULED before startsAt (exclusive open until start)', () => {
      const now = new Date('2026-09-08T07:59:59.999Z');
      expect(getTopicAvailability({ startsAt, endsAt }, now)).toBe('SCHEDULED');
      expect(isTopicWindowOpen({ startsAt, endsAt }, now)).toBe(false);
    });

    it('returns OPEN at startsAt inclusive', () => {
      expect(getTopicAvailability({ startsAt, endsAt }, startsAt)).toBe('OPEN');
      expect(isTopicWindowOpen({ startsAt, endsAt }, startsAt)).toBe(true);
    });

    it('returns CLOSED at endsAt exclusive', () => {
      expect(getTopicAvailability({ startsAt, endsAt }, endsAt)).toBe('CLOSED');
      expect(isTopicWindowOpen({ startsAt, endsAt }, endsAt)).toBe(false);
    });
  });

  describe('validateTopicScheduleWindow', () => {
    it('rejects startsAt >= endsAt', () => {
      expect(() => validateTopicScheduleWindow(endsAt, startsAt)).toThrow(
        BadRequestException,
      );
      expect(() => validateTopicScheduleWindow(startsAt, startsAt)).toThrow(
        BadRequestException,
      );
    });

    it('allows null sides and ordered windows', () => {
      expect(() => validateTopicScheduleWindow(null, null)).not.toThrow();
      expect(() => validateTopicScheduleWindow(startsAt, endsAt)).not.toThrow();
      expect(() => validateTopicScheduleWindow(startsAt, null)).not.toThrow();
    });
  });

  describe('assertTopicWindow', () => {
    it('blocks start/mutate/submit before startsAt', () => {
      const now = new Date('2026-09-08T07:00:00.000Z');
      for (const mode of ['start', 'mutate', 'submit'] as const) {
        expect(() =>
          assertTopicWindow({ startsAt, endsAt }, mode, now),
        ).toThrow(
          expect.objectContaining({
            response: expect.objectContaining({ code: 'TOPIC_NOT_OPEN_YET' }),
          }),
        );
      }
    });

    it('blocks start/mutate after endsAt but allows submit', () => {
      const now = new Date('2026-09-08T10:00:00.000Z');
      expect(() =>
        assertTopicWindow({ startsAt, endsAt }, 'start', now),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'TOPIC_CLOSED' }),
        }),
      );
      expect(() =>
        assertTopicWindow({ startsAt, endsAt }, 'mutate', now),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertTopicWindow({ startsAt, endsAt }, 'submit', now),
      ).not.toThrow();
    });
  });

  describe('computeSessionExpiresAt', () => {
    it('uses duration when no endsAt', () => {
      const now = new Date('2026-09-08T08:00:00.000Z');
      expect(computeSessionExpiresAt(now, 30, null)).toEqual(
        new Date('2026-09-08T08:30:00.000Z'),
      );
    });

    it('clamps to endsAt when duration would overrun', () => {
      const now = new Date('2026-09-08T09:50:00.000Z');
      expect(computeSessionExpiresAt(now, 30, endsAt)).toEqual(endsAt);
    });

    it('keeps duration when shorter than remaining window', () => {
      const now = new Date('2026-09-08T08:00:00.000Z');
      expect(computeSessionExpiresAt(now, 30, endsAt)).toEqual(
        new Date('2026-09-08T08:30:00.000Z'),
      );
    });
  });

  describe('withTopicAvailability', () => {
    it('attaches derived availability', () => {
      expect(
        withTopicAvailability(
          { id: 't1', startsAt, endsAt },
          new Date('2026-09-08T09:00:00.000Z'),
        ),
      ).toEqual({
        id: 't1',
        startsAt,
        endsAt,
        availability: 'OPEN',
      });
    });
  });
});
