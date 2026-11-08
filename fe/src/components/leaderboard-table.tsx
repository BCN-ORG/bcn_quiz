import { useEffect, useRef, useState } from 'react';
import { Trophy } from '@phosphor-icons/react';

export type LeaderboardRow = {
  rank: number;
  user: { id: string; fullName: string; avatarUrl: string | null };
  score?: number;
  weeklyScore?: number;
  correctCount?: number;
  totalQuestions?: number;
  durationMs?: number;
  topicsCompleted?: number;
  totalDurationMs?: number;
};

export function leaderboardPoints(row: LeaderboardRow) {
  return row.weeklyScore ?? row.score ?? 0;
}

export function leaderboardDuration(ms?: number) {
  const seconds = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/** Huy hiệu hạng (08/11/2026, anh chốt): Top 1-3 lấy icon cúp, đè số lên trên cúp (vàng/bạc/đồng); 4-10 oval kem, 11+ oval xám. */
export function RankBadge({ rank, large = false }: { rank: number; large?: boolean }) {
  const cls = `rank-badge${large ? ' rank-badge-lg' : ''}`;
  if (rank >= 1 && rank <= 3) {
    const metal = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : 'rank-bronze';
    return <span className={`rank-cup${large ? ' rank-cup-lg' : ''} ${metal}`}><Trophy weight="fill" aria-hidden="true" /><span className="rank-cup-num"><span className="sr-only">Hạng </span>{rank}</span></span>;
  }
  if (rank <= 10) return <span className={`${cls} rank-cream`}><span className="sr-only">Hạng </span>{rank}</span>;
  return <span className={`${cls} rank-gray`}><span className="sr-only">Hạng </span>{rank}</span>;
}

/** Cành lá nguyệt quế ôm cúp (08/11/2026, sửa theo góp ý của anh: thân cong xòe rộng ôm cúp, lá nghiêng ra ngoài): to 40x84, 10 lá xen đậm/nhạt + 3 quả. */
function LaurelBranch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 84" aria-hidden="true">
      <path className="laurel-stem" d="M20 82 C 5 70, 3 48, 8 30 C 11 18, 15 8, 20 2" fill="none" strokeWidth="2" strokeLinecap="round" />
      <ellipse className="laurel-leaf" cx="7" cy="70" rx="5.5" ry="2.3" transform="rotate(-55 7 70)" />
      <ellipse className="laurel-leaf laurel-leaf-deep" cx="5" cy="56" rx="5.5" ry="2.3" transform="rotate(-55 5 56)" />
      <ellipse className="laurel-leaf laurel-leaf-deep" cx="6" cy="42" rx="5.5" ry="2.3" transform="rotate(-55 6 42)" />
      <ellipse className="laurel-leaf" cx="10" cy="28" rx="5.5" ry="2.3" transform="rotate(-55 10 28)" />
      <ellipse className="laurel-leaf" cx="14" cy="16" rx="5.5" ry="2.3" transform="rotate(-55 14 16)" />
      <ellipse className="laurel-leaf" cx="13" cy="70" rx="5.5" ry="2.3" transform="rotate(55 13 70)" />
      <ellipse className="laurel-leaf laurel-leaf-deep" cx="11" cy="56" rx="5.5" ry="2.3" transform="rotate(55 11 56)" />
      <ellipse className="laurel-leaf laurel-leaf-deep" cx="12" cy="42" rx="5.5" ry="2.3" transform="rotate(55 12 42)" />
      <ellipse className="laurel-leaf" cx="16" cy="28" rx="5.5" ry="2.3" transform="rotate(55 16 28)" />
      <ellipse className="laurel-leaf" cx="19" cy="16" rx="5.5" ry="2.3" transform="rotate(55 19 16)" />
      <circle className="laurel-berry" cx="20" cy="5" r="2.2" />
      <circle className="laurel-berry" cx="16" cy="9" r="1.8" />
      <circle className="laurel-berry" cx="24" cy="9" r="1.8" />
    </svg>
  );
}

/** Cúp bục Top 3 kèm cành lá 2 bên (08/11/2026, anh duyệt demo): vàng/bạc/đồng theo hạng; mờ khi ô trống. */
export function PodiumCup({ rank, faded = false }: { rank: number; faded?: boolean }) {
  const metal = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : 'rank-bronze';
  const laurel = rank === 1 ? 'laurel-gold' : rank === 2 ? 'laurel-silver' : 'laurel-bronze';
  return (
    <span className={`trophy-wrap${faded ? ' trophy-faded' : ''}`}>
      <LaurelBranch className={`laurel ${laurel}`} />
      <span className={`rank-cup rank-cup-lg ${metal}`}><Trophy weight="fill" aria-hidden="true" /><span className="rank-cup-num"><span className="sr-only">Hạng </span>{rank}</span></span>
      <LaurelBranch className={`laurel laurel-right ${laurel}`} />
    </span>
  );
}

/** The server falls back to this name when Profiles has no usable name for the user, or could not be asked at all. */
const FALLBACK_NAME = 'Người dùng';

export function LeaderboardPlayer({ row, current = false, large = false, namesUnavailable = false }: { row: LeaderboardRow; current?: boolean; large?: boolean; namesUnavailable?: boolean }) {
  // Zero-width characters survive trim() but show as an empty name.
  const name = row.user.fullName.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim() || FALLBACK_NAME;
  const nameless = name === FALLBACK_NAME;
  // "Cannot load" (lookup failed) and "has no name" are different problems; neither is a privacy choice.
  const label = namesUnavailable ? 'Chưa tải được tên' : 'Chưa đặt tên';
  const hint = namesUnavailable ? 'Chưa lấy được tên từ BCN Profiles lúc này' : 'Thành viên này chưa đặt họ tên trên BCN Profiles';
  // Array.from keeps an emoji (a surrogate pair) in one piece; part[0] would cut it in half.
  const initials = name.split(/\s+/).slice(-2).map((part) => Array.from(part)[0]).join('').toUpperCase();
  // Marquee (08/11/2026, mobile podium): long names scroll horizontally to reveal the full name.
  // Measure only when the name is actually cut off (full text wider than the visible clip); short names stay still.
  // NOTE: the name is an inline <strong>, so scrollWidth/clientWidth are 0 — use offsetWidth instead.
  const clipRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLElement>(null);
  const [marqueeDist, setMarqueeDist] = useState(0);
  useEffect(() => {
    const nameEl = nameRef.current;
    const clipEl = clipRef.current;
    if (!nameEl || !clipEl) return;
    const check = () => {
      const dist = nameEl.offsetWidth - clipEl.clientWidth;
      setMarqueeDist(dist > 0 ? dist : 0);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return <span className={`leaderboard-player${large ? ' leaderboard-player-lg' : ''}`}>
    {/* Profiles avatar URLs are external and not configured for Next image optimization. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {row.user.avatarUrl ? <img src={row.user.avatarUrl} alt="" width={large ? 56 : 36} height={large ? 56 : 36} /> : <span className="leaderboard-initials" aria-hidden="true">{nameless ? '?' : initials}</span>}
    <span className="leaderboard-player-name">
      <span ref={clipRef} className="leaderboard-name-clip">
        <strong ref={nameRef} title={nameless ? hint : name} className={`${nameless ? 'leaderboard-hidden-name' : ''}${marqueeDist > 0 ? ' name-marquee' : ''}`.trim() || undefined} style={marqueeDist > 0 ? { '--marquee-dist': `${marqueeDist}px` } as React.CSSProperties : undefined}>{nameless ? label : name}</strong>
      </span>
      {current ? <small className="leaderboard-you">Bạn</small> : null}
    </span>
  </span>;
}

export function LeaderboardTable({ rows, mode, currentUserId, caption = 'Bảng xếp hạng', namesUnavailable = false }: { rows: LeaderboardRow[]; mode: 'daily' | 'weekly'; currentUserId?: string; caption?: string; namesUnavailable?: boolean }) {
  return <table className="leaderboard-table">
    <caption className="sr-only">{caption}</caption>
    <thead><tr>
      <th className="num" scope="col">Hạng</th>
      <th scope="col">Người chơi</th>
      <th className="num" scope="col">{mode === 'daily' ? 'Điểm' : 'Tổng điểm'}</th>
      <th className="leaderboard-detail num" scope="col">{mode === 'daily' ? 'Đúng' : 'Số topic'}</th>
      <th className="leaderboard-detail num" scope="col">{mode === 'daily' ? 'Thời gian' : 'Tổng thời gian'}</th>
    </tr></thead>
    <tbody>{rows.map((row) => {
      const mine = row.user.id === currentUserId;
      return <tr key={row.user.id} className={mine ? 'leaderboard-current' : undefined} aria-current={mine ? 'true' : undefined}>
        <td className="num leaderboard-rank-cell"><RankBadge rank={row.rank} /></td>
        <th scope="row"><LeaderboardPlayer row={row} current={mine} namesUnavailable={namesUnavailable} /><small className="leaderboard-mobile-detail">{mode === 'daily' ? `${row.correctCount ?? 0}/${row.totalQuestions ?? 0} đúng · ${leaderboardDuration(row.durationMs)}` : `${row.topicsCompleted ?? 0} topic · ${leaderboardDuration(row.totalDurationMs)}`}</small></th>
        <td className="num"><strong>{leaderboardPoints(row).toLocaleString('vi-VN')}</strong><span className="sr-only"> điểm</span></td>
        <td className="leaderboard-detail num">{mode === 'daily' ? `${row.correctCount ?? 0}/${row.totalQuestions ?? 0}` : row.topicsCompleted ?? 0}</td>
        <td className="leaderboard-detail num">{leaderboardDuration(mode === 'daily' ? row.durationMs : row.totalDurationMs)}</td>
      </tr>;
    })}</tbody>
  </table>;
}
