import { LeaderboardPlayer, leaderboardDuration, leaderboardPoints, type LeaderboardRow } from './leaderboard-table';

/** Admin-only row: the admin endpoint adds the email and the exact submit time. Members never receive these fields. */
export type AdminLeaderboardRow = LeaderboardRow & { email?: string | null; submittedAt?: string; lastSubmittedAt?: string };

// Only a plain address becomes a mailto link: an unexpected value must not add compose parameters (?cc=...).
const SAFE_EMAIL = /^[^\s@?&#%]+@[^\s@?&#%]+\.[^\s@?&#%]+$/;
const when = (value?: string) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '—';

export function AdminLeaderboardTable({ rows, mode, namesUnavailable = false, caption = 'Bảng xếp hạng đầy đủ thông tin người dùng' }: { rows: AdminLeaderboardRow[]; mode: 'daily' | 'weekly'; namesUnavailable?: boolean; caption?: string }) {
  const daily = mode === 'daily';
  return <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Bảng xếp hạng, cuộn ngang để xem hết cột">
    <table className="admin-leaderboard-table">
      <caption className="sr-only">{caption}</caption>
      <thead><tr>
        <th className="num" scope="col">Hạng</th>
        <th scope="col">Họ tên</th>
        <th scope="col">Email</th>
        <th scope="col">ID thành viên</th>
        <th className="num" scope="col">{daily ? 'Điểm' : 'Tổng điểm'}</th>
        <th className="num" scope="col">{daily ? 'Đúng / tổng' : 'Số ngày'}</th>
        <th className="num" scope="col">{daily ? 'Thời gian làm' : 'Tổng thời gian'}</th>
        <th scope="col">{daily ? 'Nộp lúc' : 'Nộp gần nhất'}</th>
      </tr></thead>
      <tbody>{rows.map((row) => <tr key={row.user.id}>
        <td className="num"><strong><span className="sr-only">Hạng </span>#{row.rank}</strong></td>
        <th scope="row"><LeaderboardPlayer row={row} namesUnavailable={namesUnavailable} /></th>
        <td className="admin-email">{row.email && SAFE_EMAIL.test(row.email) ? <a href={`mailto:${row.email}`}>{row.email}</a> : row.email ? <span>{row.email}</span> : <span className="leaderboard-hidden-name">{namesUnavailable ? 'Chưa tải được' : '—'}</span>}</td>
        <td><code className="admin-id" title={row.user.id}>{row.user.id}</code></td>
        <td className="num"><strong>{leaderboardPoints(row).toLocaleString('vi-VN')}</strong></td>
        <td className="num">{daily ? `${row.correctCount ?? 0}/${row.totalQuestions ?? 0}` : row.completedDays ?? 0}</td>
        <td className="num">{leaderboardDuration(daily ? row.durationMs : row.totalDurationMs)}</td>
        <td>{when(daily ? row.submittedAt : row.lastSubmittedAt)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
