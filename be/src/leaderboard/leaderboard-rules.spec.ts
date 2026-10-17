import {
  businessDate,
  businessWeekEnd,
  businessWeekStart,
  calculateTopicLeaderboardScore,
  endOfBusinessDay,
  parseBusinessDate,
  startOfBusinessDay,
} from './leaderboard-rules';

describe('topic leaderboard rules', () => {
  it.each([
    [10, 10, 1000],
    [9, 10, 900],
    [8, 10, 800],
    [17, 20, 850],
    [12, 15, 800],
    [8, 15, 533],
    [0, 10, 0],
    [0, 0, 0],
  ])('scores %i/%i as %i', (correct, total, expected) => {
    expect(calculateTopicLeaderboardScore(correct, total)).toBe(expected);
  });

  it('changes business date at Vietnam midnight', () => {
    expect(businessDate(new Date('2026-10-11T16:59:59.000Z'))).toBe(
      '2026-10-11',
    );
    expect(businessDate(new Date('2026-10-11T17:00:00.000Z'))).toBe(
      '2026-10-12',
    );
    expect(startOfBusinessDay('2026-10-12').toISOString()).toBe(
      '2026-10-11T17:00:00.000Z',
    );
    expect(endOfBusinessDay('2026-10-11').toISOString()).toBe(
      '2026-10-11T16:59:59.999Z',
    );
  });

  it('starts a new week on Monday Vietnam time', () => {
    expect(
      businessWeekStart(businessDate(new Date('2026-10-11T16:59:59.000Z'))),
    ).toBe('2026-10-05');
    expect(
      businessWeekStart(businessDate(new Date('2026-10-11T17:00:00.000Z'))),
    ).toBe('2026-10-12');
    expect(businessWeekEnd('2026-10-05')).toBe('2026-10-11');
  });

  it('rejects invalid dates', () => {
    expect(() => parseBusinessDate('2026-02-30')).toThrow();
    expect(() => parseBusinessDate('2026-1-1')).toThrow();
  });
});
