'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Crown,
  PlusCircle,
  ShieldStar,
  SignOut,
  Sword,
  Trophy,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';
import { request } from '@/lib/api';
import { Loading } from '@/components/ui';

interface GuildSummary {
  id: string;
  name: string;
  tag: string;
  description: string;
  memberCount: number;
  maxMembers: number;
  latestBossDamage: number;
}

interface MyGuildDetail {
  id: string;
  name: string;
  tag: string;
  description: string;
  myRole: string;
  maxMembers: number;
  weeklyBossTitle: string | null;
  totalWeeklyDamage: number;
  members: Array<{
    userId: string;
    role: string;
    fullName: string | null;
    weeklyDamage: number;
  }>;
}

interface GuildBossRank {
  rank: number;
  guildId: string;
  name: string;
  tag: string;
  totalDamage: number;
  participantCount: number;
}

export default function GuildsPage() {
  const [myGuild, setMyGuild] = useState<MyGuildDetail | null>(null);
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [bossLb, setBossLb] = useState<{
    seasonTitle: string | null;
    leaderboard: GuildBossRank[];
  }>({ seasonTitle: null, leaderboard: [] });
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [me, all, lb] = await Promise.all([
        request.get<{ guild: MyGuildDetail | null }>('/guilds/me'),
        request.get<GuildSummary[]>('/guilds'),
        request.get<{ seasonTitle: string | null; leaderboard: GuildBossRank[] }>(
          '/guilds/leaderboard',
        ),
      ]);
      setMyGuild(me.guild);
      setGuilds(all ?? []);
      setBossLb(lb ?? { seasonTitle: null, leaderboard: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu Bang hội.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await request.post('/guilds', { name, tag, description });
      setName('');
      setTag('');
      setDescription('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo Bang hội.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await request.post(`/guilds/${id}/join`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gia nhập.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await request.post('/guilds/leave', {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể rời Bang hội.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Đang tải Bang hội học tập..." />;

  const maxMemberDmg = myGuild
    ? Math.max(1, ...myGuild.members.map((m) => m.weeklyDamage))
    : 1;

  return (
    <div className="arena-page">
      <section className="arena-hero arena-hero--guild">
        <div className="arena-hero__main">
          <span className="arena-hero__eyebrow">
            <ShieldStar size={13} weight="fill" /> Tổ đội học tập · Đua Boss Tuần
          </span>
          <h1 className="arena-hero__title">Bang Hội Học Tập & Đua Boss Tuần</h1>
          <p className="arena-hero__sub">
            Lập tổ đội tối đa 10 học viên, cùng đánh Boss Tuần để cộng dồn sát thương tranh Top Bang hội.
          </p>
        </div>

        {myGuild ? (
          <div className="arena-hero__aside">
            <div className="pvp-rating-strip">
              <div className="pvp-rating-stat">
                <small>Bang của bạn</small>
                <strong>[{myGuild.tag}] {myGuild.name}</strong>
              </div>
              <div className="pvp-rating-divider" />
              <div className="pvp-rating-stat">
                <small>Sát thương tuần</small>
                <strong style={{ color: '#fde047' }}>
                  {myGuild.totalWeeklyDamage.toLocaleString('vi-VN')}
                </strong>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <div role="alert" className="arena-notice arena-notice--error">
          <WarningCircle size={18} weight="fill" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="arena-two-col">
        <div className="arena-stack">
      {myGuild ? (
        <section className="arena-card">
          <div className="arena-section-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="gd-tag-badge">{myGuild.tag}</span>
              <div>
                <h2 className="arena-section-title" style={{ fontSize: 19 }}>
                  {myGuild.name}
                </h2>
                <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                  {myGuild.description || 'Bang hội học tập BCN Arena'}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void handleLeave()}
            >
              <SignOut size={15} /> Rời Bang hội
            </button>
          </div>

          <div className="arena-kpi-grid">
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon">
                <UsersThree size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Quân số hiện tại</span>
                <span className="arena-kpi-value">
                  {myGuild.members.length}/{myGuild.maxMembers}
                </span>
              </div>
            </div>

            <div className="arena-kpi-card">
              <div className="arena-kpi-icon arena-kpi-icon--crimson">
                <Sword size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">
                  Tổng sát thương {myGuild.weeklyBossTitle || 'Boss tuần'}
                </span>
                <span className="arena-kpi-value">
                  {myGuild.totalWeeklyDamage.toLocaleString('vi-VN')}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <strong style={{ fontSize: 13.5, color: 'var(--muted)' }}>
              Đóng góp của thành viên tuần này
            </strong>
            {myGuild.members.map((m) => {
              const barPct =
                m.weeklyDamage > 0
                  ? Math.max(6, Math.round((m.weeklyDamage / maxMemberDmg) * 100))
                  : 0;
              return (
                <div key={m.userId} className="gd-member-row">
                  <div className="gd-member-top">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      {m.role === 'LEADER' ? (
                        <Crown size={15} weight="fill" color="#f59e0b" />
                      ) : null}
                      <strong>{m.fullName || m.userId}</strong>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 999,
                          background: 'var(--surface)',
                          color: 'var(--muted)',
                          border: '1px solid var(--line)',
                        }}
                      >
                        {m.role === 'LEADER' ? 'Bang chủ' : 'Thành viên'}
                      </span>
                    </span>
                    <span className="arena-lb-score" style={{ fontSize: 13 }}>
                      {m.weeklyDamage.toLocaleString('vi-VN')} DMG
                    </span>
                  </div>
                  <div className="arena-progress" style={{ height: 6 }}>
                    <div
                      className="arena-progress__fill"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <form className="arena-card" onSubmit={(e) => void handleCreate(e)}>
          <div className="arena-section-head">
            <h2 className="arena-section-title">
              <PlusCircle size={20} weight="fill" color="var(--accent)" />
              Thành lập Bang hội mới
            </h2>
            {tag.trim() ? (
              <span className="gd-tag-badge">{tag.trim().toUpperCase()}</span>
            ) : null}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <div className="arena-field">
              <label htmlFor="guild-name">Tên Bang hội (3–32 ký tự)</label>
              <input
                id="guild-name"
                type="text"
                required
                className="arena-input"
                placeholder="VD: Chiến Binh Thuật Toán"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="arena-field">
              <label htmlFor="guild-tag">Tag Bang hội (2–6 ký tự)</label>
              <input
                id="guild-tag"
                type="text"
                required
                maxLength={6}
                className="arena-input arena-input--code"
                placeholder="VD: BCN"
                value={tag}
                onChange={(e) => setTag(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="arena-field">
            <label htmlFor="guild-desc">Mô tả mục tiêu học tập</label>
            <input
              id="guild-desc"
              type="text"
              className="arena-input"
              placeholder="VD: Cùng nhau cày 500 câu hỏi mỗi tuần và phá đảo Boss!"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <button type="submit" className="button" disabled={busy}>
              <PlusCircle size={17} weight="fill" />
              {busy ? 'Đang khởi tạo…' : 'Tạo Bang hội'}
            </button>
          </div>
        </form>
      )}

      {/* Browse Guilds */}
      {!myGuild ? (
        <section className="arena-card">
          <div className="arena-section-head">
            <h2 className="arena-section-title">
              <UsersThree size={20} weight="fill" color="var(--accent)" />
              Danh sách Bang hội đang mở ({guilds.length})
            </h2>
          </div>

          {guilds.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
              Chưa có Bang hội nào — hãy là người đầu tiên thành lập!
            </p>
          ) : (
            <div className="gd-browse-grid">
              {guilds.map((g) => {
                const full = g.memberCount >= g.maxMembers;
                const fillPct = Math.min(
                  100,
                  Math.round((g.memberCount / Math.max(1, g.maxMembers)) * 100),
                );
                return (
                  <article key={g.id} className="gd-browse-card">
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span className="gd-tag-badge">{g.tag}</span>
                        <strong style={{ fontSize: 15 }}>{g.name}</strong>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                        {g.description || 'Bang hội học tập BCN Arena'}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                            color: 'var(--muted)',
                            fontWeight: 600,
                          }}
                        >
                          <span>Thành viên</span>
                          <span>
                            {g.memberCount}/{g.maxMembers}
                          </span>
                        </div>
                        <div className="arena-progress" style={{ height: 6 }}>
                          <div
                            className="arena-progress__fill"
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy || full}
                        onClick={() => void handleJoin(g.id)}
                      >
                        {full ? 'Đã đủ thành viên' : 'Gia nhập Bang hội'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
        </div>

      {/* Guild Boss Leaderboard */}
      <section className="arena-card">
        <div className="arena-section-head">
          <h2 className="arena-section-title">
            <Trophy size={20} weight="fill" color="#f59e0b" />
            Bảng Xếp Hạng Guild Boss Tuần
            {bossLb.seasonTitle ? ` · ${bossLb.seasonTitle}` : ''}
          </h2>
        </div>

        {bossLb.leaderboard.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
            Chưa có Bang hội nào ghi nhận sát thương Boss trong tuần này.
          </p>
        ) : (
          <div className="arena-lb-list">
            {bossLb.leaderboard.map((g) => (
              <div
                key={g.guildId}
                className={`arena-lb-row ${g.rank <= 3 ? `is-top-${g.rank}` : ''}`}
              >
                <div className="arena-lb-left">
                  <span className="arena-rank-pill">#{g.rank}</span>
                  <span className="gd-tag-badge">{g.tag}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="arena-lb-name">{g.name}</div>
                    <div className="arena-lb-sub">
                      {g.participantCount} thành viên tham gia đánh Boss
                    </div>
                  </div>
                </div>
                <span className="arena-lb-score">
                  {g.totalDamage.toLocaleString('vi-VN')} DMG
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
