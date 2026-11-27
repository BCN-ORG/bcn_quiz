import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DiscordWebhookService {
  private readonly logger = new Logger(DiscordWebhookService.name);

  async sendAnnouncement(params: {
    title: string;
    description: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  }): Promise<void> {
    const url = process.env.DISCORD_ANNOUNCEMENT_WEBHOOK_URL?.trim();
    if (!url) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          embeds: [
            {
              title: params.title,
              description: params.description,
              color: params.color ?? 0x38bdf8,
              fields: params.fields ?? [],
              timestamp: new Date().toISOString(),
              footer: { text: 'BCN Arena' },
            },
          ],
        }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[DiscordWebhook] Failed to send announcement: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
