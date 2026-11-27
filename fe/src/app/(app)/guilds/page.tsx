'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Crown,
  Plus,
  SignOut,
  Sword,
  Trophy,
  UsersThree,
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

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1020, margin: '0 auto' }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
          Bang Hội Học Tập & Đua Boss Tuần
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13.5 }}>
          Lập tổ đội tối đa 10 học viên, cùng đánh Boss Tuần để cộng dồn sát thương tranh Top Bang hội.
        </p>
      </header>

      {error ? <div className="notice form-error">{error}</div> : null}

      {myGuild ? (
        <section className="panel" style={{ padding: 20, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>
                [{myGuild.tag}] {myGuild.name}
              </h2>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                {myGuild.description || 'Bang hội học tập BCN Arena'}
              </p>
            </div>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void handleLeave()}>
              <SignOut size={15} /> Rời Bang hội
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13.5 }}>
            <span>
              <UsersThree size={16} weight="fill" /> Thành viên:{' '}
              <strong>{myGuild.members.length}/{myGuild.maxMembers}</strong>
            </span>
            <span>
              <Sword size={16} weight="fill" color="#f43f5e" /> Tổng sát thương Boss tuần:{' '}
              <strong>{myGuild.totalWeeklyDamage.toLocaleString('vi-VN')}</strong>
            </span>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {myGuild.members.map((m) => (
              <div
                key={m.userId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  fontSize: 13,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {m.role === 'LEADER' ? <Crown size={14} weight="fill" color="#f59e0b" /> : null}
                  <strong>{m.fullName || m.userId}</strong>
                  <small style={{ color: 'var(--muted)' }}>({m.role})</small>
                </span>
                <span>
                  Sát thương tuần: <strong>{m.weeklyDamage.toLocaleString('vi-VN')}</strong>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <form
          className="panel"
          onSubmit={(e) => void handleCreate(e)}
          style={{ padding: 20, display: 'grid', gap: 12 }}
        >
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={18} /> Thành lập Bang hội mới
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <input
              type="text"
              required
              placeholder="Tên Bang hội (3–32 ký tự)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--text)',
              }}
            />
            <input
              type="text"
              required
              placeholder="Tag (VD: BCN)"
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--text)',
              }}
            />
          </div>
          <input
            type="text"
            placeholder="Mô tả ngắn về mục tiêu học tập của nhóm..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
          />
          <button type="submit" className="button" disabled={busy} style={{ justifySelf: 'start' }}>
            Tạo Bang hội
          </button>
        </form>
      )}

      {/* Guild Boss Leaderboard */}
      <section className="panel" style={{ padding: 18, display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={18} weight="fill" color="#f59e0b" /> Bảng Xếp Hạng Guild Boss Tuần
          {bossLb.seasonTitle ? ` · ${bossLb.seasonTitle}` : ''}
        </h3>
        {bossLb.leaderboard.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            Chưa có Bang hội nào ghi nhận sát thương Boss trong tuần này.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {bossLb.leaderboard.map((g) => (
              <div
                key={g.guildId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  fontSize: 13,
                }}
              >
                <span>
                  <strong>#{g.rank}</strong> · [{g.tag}] {g.name} ({g.participantCount} thành viên tham gia)
                </span>
                <strong>{g.totalDamage.toLocaleString('vi-VN')} sát thương</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Browse Guilds */}
      {!myGuild ? (
        <section className="panel" style={{ padding: 18, display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Danh sách Bang hội đang mở</h3>
          {guilds.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
              Chưa có Bang hội nào — hãy là người đầu tiên thành lập!
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {guilds.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--surface-2)',
                    gap: 10,
                  }}
                >
                  <div>
                    <strong>[{g.tag}] {g.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {g.memberCount}/{g.maxMembers} thành viên · {g.description || 'Bang hội BCN'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || g.memberCount >= g.maxMembers}
                    onClick={() => void handleJoin(g.id)}
                  >
                    Gia nhập
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
