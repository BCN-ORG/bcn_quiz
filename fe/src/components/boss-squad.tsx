'use client';

import { serverNow } from '@/lib/api';
import type { BossLive } from '@/lib/boss';
import type { BossLiveChip } from '@/lib/use-boss-live';

const MAX_AVATARS = 6;

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function minutesAgo(iso: string) {
  const minutes = Math.max(0, Math.round((serverNow() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  return `${Math.floor(minutes / 60)} giờ trước`;
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return avatarUrl ? (
    // Profiles avatar URLs are external and not configured for Next image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="boss-squad-avatar" src={avatarUrl} alt="" width={26} height={26} />
  ) : (
    <span className="boss-squad-avatar" aria-hidden="true">{initialsOf(name)}</span>
  );
}

/** Light "fighting together" strip: who is fighting now, quick +N chips for others' hits, and (lobby only) recent runs. */
export function BossSquad({ live, chips, compact }: { live: BossLive; chips: BossLiveChip[]; compact: boolean }) {
  const shown = live.fighters.slice(0, MAX_AVATARS);
  const extra = Math.max(0, live.fightingNow - shown.length);

  return (
    <section className={`boss-squad${compact ? ' is-compact' : ''}`} aria-label="Đồng đội đang chiến đấu" aria-live="off">
      <div className="boss-squad-head">
        <span className="boss-squad-count">
          <span className="boss-squad-dot" aria-hidden="true" />
          {live.fightingNow > 0 ? `${live.fightingNow} người đang đánh Boss` : 'Chưa có ai đang đánh lúc này'}
        </span>
        {shown.length > 0 && (
          <span className="boss-squad-avatars">
            {shown.map((fighter) => (
              <span key={fighter.sessionId} title={fighter.isYou ? 'Bạn' : fighter.name}>
                <Avatar name={fighter.name} avatarUrl={fighter.avatarUrl} />
              </span>
            ))}
            {extra > 0 && <span className="boss-squad-more">+{extra}</span>}
          </span>
        )}
        <span className="boss-squad-chips" aria-hidden="true">
          {chips.map((chip) => (
            <span key={chip.key} className="boss-squad-chip">
              <Avatar name={chip.name} avatarUrl={chip.avatarUrl} />
              <span className="boss-squad-chip-name">{chip.name}</span>
              <b>+{chip.gain}</b>
            </span>
          ))}
        </span>
      </div>

      {!compact && live.recentHits.length > 0 && (
        <ul className="boss-squad-feed">
          {live.recentHits.slice(0, 5).map((hit) => (
            <li key={hit.sessionId}>
              <Avatar name={hit.name} avatarUrl={hit.avatarUrl} />
              <span className="boss-squad-feed-text">
                <b>{hit.isYou ? 'Bạn' : hit.name}</b> vừa đạt <b>{hit.score}</b> điểm
                {hit.maxCombo >= 3 ? ` · combo ×${hit.maxCombo}` : ''}
              </span>
              <time dateTime={hit.endedAt}>{minutesAgo(hit.endedAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
