export type LeaderboardRow = {
  rank: number;
  user: { id: string; fullName: string; avatarUrl: string | null };
  score?: number;
  weeklyScore?: number;
  correctCount?: number;
  totalQuestions?: number;
  durationMs?: number;
  completedDays?: number;
  totalDurationMs?: number;
};

export function leaderboardPoints(row: LeaderboardRow) {
  return row.weeklyScore ?? row.score ?? 0;
}

export function leaderboardDuration(ms?: number) {
  const seconds = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/** The server falls back to this name when Profiles has no usable name for the user. */
const HIDDEN_NAME = 'Người dùng';

export function LeaderboardPlayer({ row, current = false }: { row: LeaderboardRow; current?: boolean }) {
  const name = row.user.fullName.trim() || HIDDEN_NAME;
  const hidden = name === HIDDEN_NAME;
  const initials = name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
  return <span className="leaderboard-player">
    {/* Profiles avatar URLs are external and not configured for Next image optimization. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {row.user.avatarUrl ? <img src={row.user.avatarUrl} alt="" width={36} height={36} /> : <span className="leaderboard-initials" aria-hidden="true">{initials}</span>}
    <span className="leaderboard-player-name">
      <strong title={hidden ? 'Tên không được hiển thị' : name} className={hidden ? 'leaderboard-hidden-name' : undefined}>{hidden ? 'Người dùng (ẩn tên)' : name}</strong>
      {current ? <small className="leaderboard-you">Bạn</small> : null}
    </span>
  </span>;
}

export function LeaderboardTable({ rows, mode, currentUserId, caption = 'Bảng xếp hạng' }: { rows: LeaderboardRow[]; mode: 'daily' | 'weekly'; currentUserId?: string; caption?: string }) {
  return <table className="leaderboard-table">
    <caption className="sr-only">{caption}</caption>
    <thead><tr>
      <th className="num" scope="col">Hạng</th>
      <th scope="col">Người chơi</th>
      <th className="num" scope="col">{mode === 'daily' ? 'Điểm' : 'Tổng điểm'}</th>
      <th className="leaderboard-detail num" scope="col">{mode === 'daily' ? 'Đúng' : 'Số ngày'}</th>
      <th className="leaderboard-detail num" scope="col">{mode === 'daily' ? 'Thời gian' : 'Tổng thời gian'}</th>
    </tr></thead>
    <tbody>{rows.map((row) => {
      const mine = row.user.id === currentUserId;
      return <tr key={row.user.id} className={mine ? 'leaderboard-current' : undefined} aria-current={mine ? 'true' : undefined}>
        <td className="num"><strong><span className="sr-only">Hạng </span>#{row.rank}</strong></td>
        <th scope="row"><LeaderboardPlayer row={row} current={mine} /><small className="leaderboard-mobile-detail">{mode === 'daily' ? `${row.correctCount ?? 0}/${row.totalQuestions ?? 0} đúng · ${leaderboardDuration(row.durationMs)}` : `${row.completedDays ?? 0} ngày · ${leaderboardDuration(row.totalDurationMs)}`}</small></th>
        <td className="num"><strong>{leaderboardPoints(row).toLocaleString('vi-VN')}</strong><span className="sr-only"> điểm</span></td>
        <td className="leaderboard-detail num">{mode === 'daily' ? `${row.correctCount ?? 0}/${row.totalQuestions ?? 0}` : row.completedDays ?? 0}</td>
        <td className="leaderboard-detail num">{leaderboardDuration(mode === 'daily' ? row.durationMs : row.totalDurationMs)}</td>
      </tr>;
    })}</tbody>
  </table>;
}
