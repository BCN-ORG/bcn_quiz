import { Injectable, type MessageEvent } from '@nestjs/common';
import { Observable, type Subscriber } from 'rxjs';

@Injectable()
export class NotificationRealtimeService {
  private readonly subscribers = new Map<
    string,
    Set<Subscriber<MessageEvent>>
  >();

  subscribe(userId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const connections = this.subscribers.get(userId) ?? new Set();
      connections.add(subscriber);
      this.subscribers.set(userId, connections);
      const heartbeat = setInterval(
        () => subscriber.next({ type: 'ping', data: {} }),
        25_000,
      );
      return () => {
        clearInterval(heartbeat);
        connections.delete(subscriber);
        if (connections.size === 0) this.subscribers.delete(userId);
      };
    });
  }

  publish(userId: string, data: object): void {
    for (const subscriber of this.subscribers.get(userId) ?? []) {
      subscriber.next({ type: 'notification', data });
    }
  }

  activeCount(userId: string): number {
    return this.subscribers.get(userId)?.size ?? 0;
  }
}
