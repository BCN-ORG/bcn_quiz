'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ConfirmDialog, Empty, ErrorState, Loading, Progress } from '@/components/ui';
import {
  bossApi,
  type BossAdminSeasonDetail,
  type BossAdminSeasonList,
  type BossMilestoneConfig,
  type BossSeasonInput,
  type BossSeasonPhase,
} from '@/lib/boss';
import { uploadImageFile } from '@/lib/api';
import { canDeleteContent } from '@/lib/permissions';

const PHASE_LABEL: Record<BossSeasonPhase, string> = { UPCOMING: 'Sắp diễn ra', RUNNING: 'Đang diễn ra', ENDED: 'Đã kết thúc' };
const DEFAULT_MILESTONES: BossMilestoneConfig[] = [
  { at: 300, coin: 5, name: 'Rương Đồng' },
  { at: 600, coin: 5, name: 'Rương Bạc' },
  { at: 900, coin: 5, name: 'Rương Vàng' },
  { at: 1200, coin: 5, name: 'Rương Bạch Kim' },
  { at: 1500, coin: 5, name: 'Rương Kim Cương' },
];
const when = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const emptyForm = (weekKey: string): BossSeasonInput => ({ name: `Tuần ${weekKey.split('-W')[1] ?? ''}: Đại Ma Vương Hư Không`, bossName: 'Ma Vương Hư Không', bossImageUrl: null, bossMaxHp: 1500, milestones: DEFAULT_MILESTONES.map((m) => ({ ...m })) });

export function AdminBoss() {
  const { user } = useAuth();
  const canSettle = canDeleteContent(user);
  const canConfigure = canSettle; // config changes boss HP and coin rewards: admin only, same as settle
  const [list, setList] = useState<BossAdminSeasonList | null>(null);
  const [weekKey, setWeekKey] = useState('');
  const [detail, setDetail] = useState<BossAdminSeasonDetail | null>(null);
  const [form, setForm] = useState<BossSeasonInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [panel, setPanel] = useState<'overview' | 'config' | 'players' | 'rewards'>('overview');

  const loadList = useCallback(async () => {
    const data = await bossApi.adminListSeasons();
    setList(data);
    return data;
  }, []);

  const select = useCallback(async (key: string, known?: BossAdminSeasonList) => {
    setWeekKey(key);
    setError('');
    setNotice('');
    const exists = (known ?? list)?.items.some((item) => item.weekKey === key);
    if (!exists) {
      setDetail(null);
      setForm(canConfigure && (known ?? list)?.upcomingWeekKeys.includes(key) ? emptyForm(key) : null);
      return;
    }
    try {
      const data = await bossApi.adminGetSeason(key);
      setDetail(data);
      setForm(canConfigure && data.season.editable ? { name: data.season.name, bossName: data.season.bossName, bossImageUrl: data.season.bossImageUrl, bossMaxHp: data.season.bossMaxHp, milestones: data.milestoneConfig.map((m) => ({ ...m })) } : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được mùa Boss');
    }
  }, [list, canConfigure]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await loadList();
        await select(data.currentWeekKey, data);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Không tải được dữ liệu Boss');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickImage(file: File | undefined) {
    if (!file || !form) return;
    setUploading(true); setError('');
    try {
      const uploaded = await uploadImageFile('/course/upload/image-signature', file);
      setForm((prev) => prev && { ...prev, bossImageUrl: uploaded.secureUrl });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được ảnh Boss');
    } finally { setUploading(false); }
  }

  async function save() {
    if (!form) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await bossApi.adminSaveSeason(weekKey, form);
      setDetail(saved);
      const fresh = await loadList();
      setList(fresh);
      setNotice('Đã lưu cấu hình tuần.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không lưu được cấu hình');
    } finally { setBusy(false); }
  }

  async function settle() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await bossApi.adminSettle(weekKey);
      setNotice(result.settled === false ? result.message ?? 'Không có gì để chốt.' : 'Đã chốt thưởng tuần.');
      await loadList();
      await select(weekKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không chốt được thưởng');
    } finally { setBusy(false); setConfirmSettle(false); }
  }

  async function reconcile() {
    setBusy(true); setError(''); setNotice('');
    try {
      await bossApi.adminReconcile();
      setNotice('Đã chạy đối soát giao dịch Coin chưa rõ kết quả.');
      await select(weekKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không chạy được đối soát');
    } finally { setBusy(false); }
  }

  if (loading) return <Loading />;
  if (!list) return <ErrorState message={error || 'Không tải được dữ liệu Boss'} />;

  const rows = [
    ...list.items.map((item) => ({ key: item.weekKey, phase: item.phase as BossSeasonPhase | 'NEW', hp: `${item.communityScore.toLocaleString('vi-VN')}/${item.bossMaxHp.toLocaleString('vi-VN')}`, people: item.participants, current: item.weekKey === list.currentWeekKey })),
    ...list.upcomingWeekKeys.filter((key) => !list.items.some((item) => item.weekKey === key)).map((key) => ({ key, phase: 'NEW' as const, hp: 'Chưa cấu hình', people: 0, current: false })),
  ].sort((a, b) => (a.key < b.key ? 1 : -1));
  if (!rows.some((row) => row.key === list.currentWeekKey)) rows.push({ key: list.currentWeekKey, phase: 'RUNNING', hp: 'Chưa có người chơi', people: 0, current: true });
  const patchMilestone = (index: number, patch: Partial<BossMilestoneConfig>) => setForm((prev) => prev && { ...prev, milestones: prev.milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)) });
  const choose = (key: string) => { setPanel('overview'); void select(key); };
  const problems = detail?.rewards.problems.length ?? 0;
  const activePanel = panel === 'config' && !form ? 'overview' : panel === 'overview' && !detail && form ? 'config' : panel;

  return (
    <div className="admin-boss">
      <aside className="admin-boss-weeks panel" aria-label="Danh sách tuần Boss">
        <div className="section-title"><h2>Các tuần</h2></div>
        <ul>
          {rows.map((row) => (
            <li key={row.key}>
              <button type="button" className={row.key === weekKey ? 'active' : ''} aria-current={row.key === weekKey ? 'true' : undefined} onClick={() => choose(row.key)}>
                <strong>{row.key}{row.current ? ' · tuần này' : ''}</strong>
                <span className={`admin-boss-pill phase-${row.phase.toLowerCase()}`}>{row.phase === 'NEW' ? 'Chưa tạo' : PHASE_LABEL[row.phase]}</span>
                <small>{row.hp} ST · {row.people} người</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="admin-boss-main">
        {error ? <div className="notice" role="alert">{error}</div> : null}
        {notice ? <div className="notice" role="status">{notice}</div> : null}

        <section className="panel admin-boss-head" aria-label="Tổng quan tuần">
          <div>
            <h2>{detail?.season.name ?? `Tuần ${weekKey}`}</h2>
            <p className="muted">
              {detail ? `${detail.season.bossName} · ${PHASE_LABEL[detail.season.phase]} · ${when(detail.season.startsAt)} → ${when(detail.season.endsAt)}${detail.season.isSettled && detail.season.settledAt ? ` · Đã chốt ${when(detail.season.settledAt)}` : ''}` : `Chưa có dữ liệu.${canConfigure ? '' : ' Chỉ admin mới tạo/sửa cấu hình tuần sắp tới.'}`}
            </p>
          </div>
          {detail ? (
            <div className="admin-boss-kpis">
              <div><b>{detail.community.communityScore.toLocaleString('vi-VN')}/{detail.season.bossMaxHp.toLocaleString('vi-VN')}</b><span>ST đã trừ</span></div>
              <div><b>{detail.community.totalParticipants}</b><span>Người chơi</span></div>
              <div><b>{detail.milestones.filter((m) => m.unlocked).length}/{detail.milestones.length}</b><span>Rương mở</span></div>
              <div><b className={problems ? 'bad' : ''}>{problems}</b><span>GD lỗi</span></div>
            </div>
          ) : null}
          <div className="list-actions">
            {canSettle && detail?.season.canSettle ? <button className="button" type="button" disabled={busy} onClick={() => setConfirmSettle(true)}>Chốt thưởng tuần</button> : null}
            {canSettle && detail ? <button className="button secondary" type="button" disabled={busy} onClick={() => void reconcile()}>Đối soát GD chưa rõ</button> : null}
          </div>
        </section>

        <div className="tabs" role="tablist" aria-label="Mục quản lý Boss">
          {detail ? <button role="tab" aria-selected={activePanel === 'overview'} className={activePanel === 'overview' ? 'active' : ''} onClick={() => setPanel('overview')}>Tổng quan</button> : null}
          {form ? <button role="tab" aria-selected={activePanel === 'config'} className={activePanel === 'config' ? 'active' : ''} onClick={() => setPanel('config')}>Cấu hình</button> : null}
          {detail ? <button role="tab" aria-selected={activePanel === 'players'} className={activePanel === 'players' ? 'active' : ''} onClick={() => setPanel('players')}>Người chơi ({detail.topPlayers.length})</button> : null}
          {detail ? <button role="tab" aria-selected={activePanel === 'rewards'} className={activePanel === 'rewards' ? 'active' : ''} onClick={() => setPanel('rewards')}>Thưởng Coin{problems ? ` · ${problems} lỗi` : ''}</button> : null}
        </div>

        {activePanel === 'overview' && detail ? (
          <section className="panel" aria-label="Tiến độ và mốc rương">
            <Progress value={100 - detail.community.bossHpPercent} label={`Đã trừ ${detail.community.communityScore.toLocaleString('vi-VN')} / ${detail.season.bossMaxHp.toLocaleString('vi-VN')} ST`} />
            <ul className="admin-boss-chests">{detail.milestones.map((m) => <li key={m.index} className={m.unlocked ? 'on' : ''}><b>{m.unlocked ? '✓' : '○'} {m.name}</b><span>{m.at.toLocaleString('vi-VN')} ST · +{m.coin} Coin/người</span></li>)}</ul>
            {!detail.season.editable ? <p className="muted">Tuần này đã khoá cấu hình (chỉ tuần chưa bắt đầu mới sửa được).</p> : null}
          </section>
        ) : null}

        {activePanel === 'config' && form ? (
          <section className="panel" aria-label="Cấu hình tuần">
            <div className="admin-boss-config">
              <div className="admin-boss-config-fields">
                <label className="field"><span>Tên sự kiện</span><input value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label className="field"><span>Tên Boss</span><input value={form.bossName} maxLength={60} onChange={(event) => setForm({ ...form, bossName: event.target.value })} /></label>
                <label className="field"><span>Máu Boss tối đa (ST)</span><input type="number" min={100} max={100000} value={form.bossMaxHp} onChange={(event) => setForm({ ...form, bossMaxHp: Number(event.target.value) })} /></label>
                <label className="field"><span>Ảnh Boss (PNG/JPG/WebP)</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { void pickImage(event.target.files?.[0]); event.target.value = ''; }} /></label>
              </div>
              <div className="admin-boss-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.bossImageUrl || '/images/boss-pixel.png'} alt="Ảnh Boss" />
                <small>{uploading ? 'Đang tải lên…' : form.bossImageUrl ? 'Ảnh tuỳ chỉnh' : 'Ảnh mặc định'}</small>
                {form.bossImageUrl ? <button className="button secondary" type="button" onClick={() => setForm({ ...form, bossImageUrl: null })}>Dùng ảnh mặc định</button> : null}
              </div>
            </div>
            <h3>Mốc rương (chung cả cộng đồng, tăng dần)</h3>
            <div className="admin-boss-milestones">
              {form.milestones.map((milestone, index) => (
                <div className="admin-boss-milestone" key={index}>
                  <label className="field"><span>Mốc {index + 1} (ST)</span><input type="number" min={1} value={milestone.at} onChange={(event) => patchMilestone(index, { at: Number(event.target.value) })} /></label>
                  <label className="field"><span>Coin/người</span><input type="number" min={0} max={1000} value={milestone.coin} onChange={(event) => patchMilestone(index, { coin: Number(event.target.value) })} /></label>
                  <label className="field"><span>Tên rương</span><input value={milestone.name} maxLength={40} onChange={(event) => patchMilestone(index, { name: event.target.value })} /></label>
                  <button className="button secondary" type="button" aria-label={`Xoá mốc ${index + 1}`} disabled={form.milestones.length <= 1} onClick={() => setForm({ ...form, milestones: form.milestones.filter((_, i) => i !== index) })}>Xoá</button>
                </div>
              ))}
            </div>
            <div className="admin-boss-savebar">
              <button className="button secondary" type="button" disabled={form.milestones.length >= 10} onClick={() => setForm({ ...form, milestones: [...form.milestones, { at: (form.milestones.at(-1)?.at ?? 0) + 100, coin: 5, name: `Rương ${form.milestones.length + 1}` }] })}>Thêm mốc</button>
              <button className="button" type="button" disabled={busy || uploading} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
            </div>
          </section>
        ) : null}

        {activePanel === 'players' && detail ? (
          <section className="panel" aria-label="Người chơi">
            {detail.profilesAvailable ? null : <div className="notice" role="alert">Chưa tải được tên từ Profiles; hiển thị mã người dùng.</div>}
            {detail.topPlayers.length === 0 ? <Empty title="Chưa có ai tham gia" description="Tuần này chưa có lượt đánh nào." /> : (
              <div className="admin-table-scroll admin-boss-table" tabIndex={0} role="region" aria-label="Bảng người chơi Boss, cuộn để xem thêm">
                <table className="admin-leaderboard-table">
                  <thead><tr><th className="num">Hạng</th><th>Người chơi</th><th className="num">Kỷ lục</th><th className="num">Đóng góp</th><th className="num">Combo</th><th className="num">Lượt</th><th>Thưởng</th><th>Chơi gần nhất</th></tr></thead>
                  <tbody>{detail.topPlayers.map((row) => <tr key={row.userId}>
                    <td className="num">#{row.rank}</td>
                    <th scope="row">{row.name === 'Người dùng' ? <code className="admin-id" title={row.userId}>{row.userId}</code> : row.name}</th>
                    <td className="num">{row.highestScore}</td><td className="num">{row.contribution}</td><td className="num">{row.bestCombo}</td><td className="num">{row.totalAttempts}</td>
                    <td>{row.rewardEligible ? 'Đủ ĐK' : 'Cần ≥5 ST'}</td><td>{when(row.lastPlayedAt)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {activePanel === 'rewards' && detail ? (
          <section className="panel" aria-label="Giao dịch thưởng">
            {detail.rewards.byStatus.length === 0 ? <p className="muted">Chưa có giao dịch (thưởng được phát sau khi chốt tuần).</p> : (
              <ul className="admin-boss-chests">{detail.rewards.byStatus.map((g) => <li key={g.status}><b>{g.status}</b><span>{g.count} giao dịch · {g.coins.toLocaleString('vi-VN')} Coin</span></li>)}</ul>
            )}
            {problems > 0 ? (
              <div className="admin-table-scroll admin-boss-table" tabIndex={0} role="region" aria-label="Giao dịch lỗi hoặc chưa rõ">
                <table className="admin-leaderboard-table">
                  <thead><tr><th>Người nhận</th><th className="num">Rương</th><th className="num">Coin</th><th>Trạng thái</th><th className="num">Thử lại</th><th>Lỗi</th></tr></thead>
                  <tbody>{detail.rewards.problems.map((tx) => <tr key={tx.id}>
                    <th scope="row">{tx.name}</th><td className="num">{tx.milestoneIndex}</td><td className="num">{tx.rewardCoins}</td><td>{tx.status}</td><td className="num">{tx.retryCount}</td><td>{tx.errorMessage ?? '—'}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <ConfirmDialog open={confirmSettle} title="Chốt thưởng tuần?" message={`Phát Coin cho mọi người đủ điều kiện của tuần ${weekKey}. Mỗi người/mỗi rương chỉ phát một lần, nhưng không hoàn tác được.`} confirmLabel="Chốt thưởng" cancelPrimary busy={busy} onConfirm={() => void settle()} onCancel={() => setConfirmSettle(false)} />
    </div>
  );
}
