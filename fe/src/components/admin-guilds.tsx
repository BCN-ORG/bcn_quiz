'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Crown,
  FloppyDisk,
  ShieldStar,
  Trash,
  UserMinus,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';
import { request } from '@/lib/api';
import { ConfirmDialog, Loading } from '@/components/ui';

interface AdminGuildRow {
  id: string;
  name: string;
  tag: string;
  description: string;
  leaderId: string;
  leaderName: string;
  memberCount: number;
  maxMembers: number;
  latestBossDamage: number;
  createdAt: string;
}

interface AdminGuildDetail {
  id: string;
  name: string;
  tag: string;
  description: string;
  leaderId: string;
  maxMembers: number;
  latestBossDamage: number;
  members: Array<{
    userId: string;
    role: string;
    fullName: string | null;
    email: string | null;
    joinedAt: string;
  }>;
}

export function AdminGuilds({ canDelete }: { canDelete: boolean }) {
  const [guilds, setGuilds] = useState<AdminGuildRow[]>([]);
  const [detail, setDetail] = useState<AdminGuildDetail | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminGuildDetail | null>(null);

  // Edit form
  const [editName, setEditName] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editMax, setEditMax] = useState('10');

  const loadList = useCallback(async () => {
    try {
      const list = await request.get<AdminGuildRow[]>('/guilds/admin/list');
      setGuilds(list ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách Bang hội.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await request.get<AdminGuildDetail>(`/guilds/admin/${id}`);
      setDetail(d);
      setEditName(d.name);
      setEditTag(d.tag);
      setEditDesc(d.description);
      setEditMax(String(d.maxMembers));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được chi tiết Bang hội.');
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !detail) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request.patch(`/guilds/admin/${detail.id}`, {
        name: editName,
        tag: editTag,
        description: editDesc,
        maxMembers: Number(editMax) || 10,
      });
      setNotice('Đã cập nhật thông tin Bang hội.');
      await Promise.all([loadList(), loadDetail(detail.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu Bang hội.');
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async (guildId: string, userId: string, name: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await request.delete<{ guildDeleted: boolean }>(
        `/guilds/admin/${guildId}/members/${userId}`,
      );
      setNotice(`Đã mời ${name} rời khỏi Bang hội.`);
      if (res.guildDeleted) {
        setDetail(null);
      } else {
        await loadDetail(guildId);
      }
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa thành viên.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGuild = async () => {
    if (!confirmDelete || busy) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request.delete(`/guilds/admin/${target.id}`);
      setNotice(`Đã giải tán Bang hội [${target.tag}] ${target.name}.`);
      setDetail(null);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể giải tán Bang hội.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Đang tải quản trị Bang hội..." />;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? guilds.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.tag.toLowerCase().includes(q) ||
          g.leaderName.toLowerCase().includes(q),
      )
    : guilds;

  return (
    <div className="arena-stack">
      {error ? (
        <div role="alert" className="arena-notice arena-notice--error">
          <WarningCircle size={18} weight="fill" />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="arena-notice arena-notice--success">
          <CheckCircle size={18} weight="fill" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="arena-two-col">
        <section className="arena-card">
          <div className="arena-section-head">
            <h3 className="arena-section-title">
              <ShieldStar size={19} weight="fill" color="var(--accent)" />
              Tất cả Bang hội ({filtered.length})
            </h3>
            <input
              type="search"
              className="arena-input"
              style={{ maxWidth: 260, minHeight: 36 }}
              placeholder="Tìm theo tên, tag, bang chủ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
              Chưa có Bang hội nào.
            </p>
          ) : (
            <div className="arena-lb-list">
              {filtered.map((g) => (
                <div key={g.id} className="arena-lb-row" style={{ flexWrap: 'wrap' }}>
                  <div className="arena-lb-left">
                    <span className="gd-tag-badge">{g.tag}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="arena-lb-name">{g.name}</div>
                      <div className="arena-lb-sub">
                        Bang chủ: {g.leaderName} · {g.memberCount}/{g.maxMembers} thành viên ·{' '}
                        {g.latestBossDamage.toLocaleString('vi-VN')} DMG
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ minHeight: 32, padding: '0 11px', fontSize: 12 }}
                    onClick={() => void loadDetail(g.id)}
                  >
                    Quản lý
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="arena-card">
          {detail ? (
            <>
              <div className="arena-section-head">
                <h3 className="arena-section-title">
                  <UsersThree size={19} weight="fill" color="var(--accent)" />
                  [{detail.tag}] {detail.name}
                </h3>
                {canDelete ? (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ minHeight: 32, padding: '0 10px', fontSize: 12, color: 'var(--danger)' }}
                    disabled={busy}
                    onClick={() => setConfirmDelete(detail)}
                  >
                    <Trash size={14} /> Giải tán Bang
                  </button>
                ) : null}
              </div>

              <form onSubmit={(e) => void handleSave(e)} style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                  <div className="arena-field">
                    <label htmlFor="ag-name">Tên Bang hội</label>
                    <input
                      id="ag-name"
                      required
                      className="arena-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="arena-field">
                    <label htmlFor="ag-tag">Tag</label>
                    <input
                      id="ag-tag"
                      required
                      maxLength={6}
                      className="arena-input arena-input--code"
                      value={editTag}
                      onChange={(e) => setEditTag(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>

                <div className="arena-field">
                  <label htmlFor="ag-desc">Mô tả</label>
                  <input
                    id="ag-desc"
                    className="arena-input"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                </div>

                <div className="arena-field">
                  <label htmlFor="ag-max">Sức chứa tối đa (tối đa 50)</label>
                  <input
                    id="ag-max"
                    type="number"
                    min={detail.members.length}
                    max={50}
                    className="arena-input"
                    value={editMax}
                    onChange={(e) => setEditMax(e.target.value)}
                  />
                </div>

                <div>
                  <button type="submit" className="button" disabled={busy}>
                    <FloppyDisk size={16} /> Lưu thông tin
                  </button>
                </div>
              </form>

              <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                <strong style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                  Thành viên ({detail.members.length}/{detail.maxMembers})
                </strong>
                {detail.members.map((m) => (
                  <div key={m.userId} className="arena-lb-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="arena-lb-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m.role === 'LEADER' ? <Crown size={14} weight="fill" color="#f59e0b" /> : null}
                        {m.fullName || m.userId}
                      </div>
                      <div className="arena-lb-sub">{m.email || m.userId} · {m.role}</div>
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        className="button secondary"
                        style={{ minHeight: 28, padding: '0 9px', fontSize: 11.5 }}
                        disabled={busy}
                        onClick={() =>
                          void handleKick(detail.id, m.userId, m.fullName || m.userId)
                        }
                      >
                        <UserMinus size={13} /> Kick
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
              Chọn một Bang hội ở danh sách bên trái để xem thành viên, chỉnh sửa hoặc giải tán.
            </p>
          )}
        </section>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          open
          title={`Giải tán Bang hội [${confirmDelete.tag}] ${confirmDelete.name}?`}
          message="Toàn bộ thành viên và lịch sử đóng góp Boss của Bang hội này sẽ bị xóa vĩnh viễn."
          confirmLabel="Giải tán Bang hội"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDeleteGuild()}
        />
      ) : null}
    </div>
  );
}
