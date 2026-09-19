import { BadRequestException, ForbiddenException } from '@nestjs/common';

export type TopicAvailability = 'OPEN' | 'SCHEDULED' | 'CLOSED';

export type TopicScheduleFields = {
  startsAt: Date | null;
  endsAt: Date | null;
};

export type TopicWindowMode = 'start' | 'mutate' | 'submit';

/** Inclusive start, exclusive end. Null bounds mean unbounded. */
export function isTopicWindowOpen(
  schedule: TopicScheduleFields,
  now: Date = new Date(),
): boolean {
  const { startsAt, endsAt } = schedule;
  if (startsAt && now.getTime() < startsAt.getTime()) {
    return false;
  }
  if (endsAt && now.getTime() >= endsAt.getTime()) {
    return false;
  }
  return true;
}

export function getTopicAvailability(
  schedule: TopicScheduleFields,
  now: Date = new Date(),
): TopicAvailability {
  const { startsAt, endsAt } = schedule;
  if (startsAt && now.getTime() < startsAt.getTime()) {
    return 'SCHEDULED';
  }
  if (endsAt && now.getTime() >= endsAt.getTime()) {
    return 'CLOSED';
  }
  return 'OPEN';
}

export function validateTopicScheduleWindow(
  startsAt?: Date | null,
  endsAt?: Date | null,
): void {
  if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
    throw new BadRequestException({
      message: 'startsAt must be before endsAt',
      code: 'INVALID_TOPIC_SCHEDULE',
    });
  }
}

/**
 * start/mutate: must be inside the open window.
 * submit: blocked only before startsAt; allowed after endsAt (hand-in late).
 */
export function assertTopicWindow(
  schedule: TopicScheduleFields,
  mode: TopicWindowMode,
  now: Date = new Date(),
): void {
  const { startsAt, endsAt } = schedule;

  if (startsAt && now.getTime() < startsAt.getTime()) {
    throw new ForbiddenException({
      message: 'Topic is not open yet',
      code: 'TOPIC_NOT_OPEN_YET',
      startsAt,
      endsAt,
    });
  }

  if (mode === 'submit') {
    return;
  }

  if (endsAt && now.getTime() >= endsAt.getTime()) {
    throw new ForbiddenException({
      message: 'Topic is closed',
      code: 'TOPIC_CLOSED',
      startsAt,
      endsAt,
    });
  }
}

export function computeSessionExpiresAt(
  now: Date,
  expiresInMinutes: number,
  endsAt?: Date | null,
): Date {
  const fromDuration = new Date(now.getTime() + expiresInMinutes * 60_000);
  if (!endsAt) {
    return fromDuration;
  }
  return fromDuration.getTime() <= endsAt.getTime() ? fromDuration : endsAt;
}

export function withTopicAvailability<T extends TopicScheduleFields>(
  topic: T,
  now: Date = new Date(),
): T & { availability: TopicAvailability } {
  return {
    ...topic,
    availability: getTopicAvailability(topic, now),
  };
}
