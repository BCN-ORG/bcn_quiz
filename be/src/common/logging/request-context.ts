import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type DbQueryLog = {
  duration_ms: number;
  query: string;
  ended_at: number;
};

export type RequestContextStore = {
  requestId: string;
  startedAt: number;
  dbDurationMs: number;
  dbQueryCount: number;
  lastDbEndedAt: number | null;
  authDurationMs: number | null;
  queries: DbQueryLog[];
};

const storage = new AsyncLocalStorage<RequestContextStore>();
const MAX_QUERIES_KEPT = 50;
const MAX_QUERY_CHARS = 240;

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },

  getStore(): RequestContextStore | undefined {
    return storage.getStore();
  },

  createStore(
    startedAt = Date.now(),
    requestId = randomUUID(),
  ): RequestContextStore {
    return {
      requestId,
      startedAt,
      dbDurationMs: 0,
      dbQueryCount: 0,
      lastDbEndedAt: null,
      authDurationMs: null,
      queries: [],
    };
  },

  recordAuthDuration(durationMs: number): void {
    const store = storage.getStore();
    if (!store) {
      return;
    }
    store.authDurationMs = Math.round(durationMs);
  },

  recordDbQuery(durationMs: number, query: string): void {
    const store = storage.getStore();
    if (!store) {
      return;
    }

    const endedAt = Date.now();
    const roundedMs = Math.round(durationMs * 1000) / 1000;
    store.dbDurationMs += roundedMs;
    store.dbQueryCount += 1;
    store.lastDbEndedAt = endedAt;

    if (store.queries.length < MAX_QUERIES_KEPT) {
      store.queries.push({
        duration_ms: roundedMs,
        query: truncateQuery(query),
        ended_at: endedAt,
      });
    }
  },
};

function truncateQuery(query: string): string {
  const normalized = query.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_QUERY_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_QUERY_CHARS)}…`;
}
