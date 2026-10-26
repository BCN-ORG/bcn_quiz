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

export function LeaderboardPlayer({ row, current = false }: { row: LeaderboardRow; current?: boolean }) {
  const name = row.user.fullName.trim() || 'Người dùng';
  const initials = name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
  return <span className="leaderboard-player">
    {/* Profiles avatar URLs are external and not configured for Next image optimization. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {row.user.avatarUrl ? <img src={row.user.avatarUrl} alt="" width={36} height={36} /> : <span className="leaderboard-initials" aria-hidden="true">{initials}</span>}
    <span className="leaderboard-player-name"><strong title={name}>{name}</strong>{current ? <small className="leaderboard-you">Bạn</small> : null}</span>
  </span>;
}

export function LeaderboardTable({ rows, mode, currentUserId }: { rows: LeaderboardRow[]; mode: 'daily' | 'weekly'; currentUserId?: string }) {
  return <table className="leaderboard-table">
    <thead><tr><th scope="col">Hạng</th><th scope="col">Người chơi</th><th scope="col">{mode === 'daily' ? 'Điểm' : 'Tổng điểm'}</th><th className="leaderboard-detail" scope="col">{mode === 'daily' ? 'Đúng' : 'Số ngày'}</th><th className="leaderboard-detail" scope="col">{mode === 'daily' ? 'Thời gian' : 'Tổng thời gian'}</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.user.id} className={row.user.id === currentUserId ? 'leaderboard-current' : undefined}>
      <td><strong>#{row.rank}</strong></td>
      <td><LeaderboardPlayer row={row} current={row.user.id === currentUserId} /><small className="leaderboard-mobile-detail">{mode === 'daily' ? `${row.correctCount ?? 0}/${row.totalQuestions ?? 0} đúng · ${leaderboardDuration(row.durationMs)}` : `${row.completedDays ?? 0} ngày · ${leaderboardDuration(row.totalDurationMs)}`}</small></td>
      <td><strong>{leaderboardPoints(row).toLocaleString('vi-VN')}</strong></td>
      <td className="leaderboard-detail">{mode === 'daily' ? `${row.correctCount ?? 0}/${row.totalQuestions ?? 0}` : row.completedDays ?? 0}</td>
      <td className="leaderboard-detail">{leaderboardDuration(mode === 'daily' ? row.durationMs : row.totalDurationMs)}</td>
    </tr>)}</tbody>
  </table>;
}
