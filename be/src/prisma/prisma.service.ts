import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { RequestContext } from '../common/logging/request-context';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;
  private readonly logEachQuery =
    (process.env.REQUEST_QUERY_LOG ?? 'true').toLowerCase() !== 'false';

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is not set. Please define it in your environment (.env).',
      );
    }

    const pool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      // Keep sockets warm toward the remote DB so parallel queries do not
      // each pay a fresh TCP/TLS handshake (~1s in the local→remote logs).
      keepAlive: true,
      keepAliveInitialDelayMillis: Number(
        process.env.DB_POOL_KEEPALIVE_DELAY_MS ?? 10_000,
      ),
      // Keep remote connections alive longer than default — idle reconnects were
      // showing ~1.2s TLS handshakes in local→remote Postman tests.
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS ?? 300_000),
      connectionTimeoutMillis: Number(
        process.env.DB_POOL_CONNECT_TIMEOUT_MS ?? 10_000,
      ),
      allowExitOnIdle: false,
    });

    const adapter = new PrismaPg(pool);
    super({
      adapter,
      log: [{ emit: 'event', level: 'query' }],
      transactionOptions: {
        maxWait: Number(process.env.PRISMA_TX_MAX_WAIT_MS ?? 10_000),
        timeout: Number(process.env.PRISMA_TX_TIMEOUT_MS ?? 20_000),
      },
    });

    this.pool = pool;

    this.$on('query', (event: Prisma.QueryEvent) => {
      RequestContext.recordDbQuery(event.duration, event.query);

      if (!this.logEachQuery) {
        return;
      }

      const store = RequestContext.getStore();
      this.logger.debug(
        `db_query request_id=${store?.requestId ?? 'n/a'} duration_ms=${event.duration} query=${event.query.replace(/\s+/g, ' ').trim().slice(0, 240)}`,
      );
    });
  }

  async onModuleInit() {
    const startedAt = Date.now();
    await this.$connect();

    const warmCount = Math.max(1, Number(process.env.DB_POOL_WARM ?? 4));
    await Promise.all(
      Array.from({ length: warmCount }, () => this.$queryRaw`SELECT 1`),
    );

    this.logger.log(
      `Prisma connected and warmed connections=${warmCount} durationMs=${Date.now() - startedAt}`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
