'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Briefcase,
  CalendarBlank,
  Check,
  CheckCircle,
  Clock,
  Coins,
  Copy,
  DownloadSimple,
  Eye,
  Lightning,
  MagnifyingGlass,
  Receipt,
  Sword,
  Trophy,
  User,
  WarningCircle,
  WarningOctagon,
  X,
  XCircle,
} from '@phosphor-icons/react';
import { downloadFile, request } from '@/lib/api';
import { Empty, Loading, PaginationNav } from '@/components/ui';

export type CoinRewardSource = 'TOWER' | 'BOSS' | 'BOUNTY' | 'LEADERBOARD' | 'OTHER';
export type CoinTransactionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';

export interface CoinTransaction {
  id: string;
  userId: string;
  username?: string | null;
  amount: number;
  source: CoinRewardSource;
  reason: string;
  referenceId?: string | null;
  seasonId?: string | null;
  idempotencyKey: string;
  externalTxId?: string | null;
  status: CoinTransactionStatus;
  requestPayload?: unknown;
  responsePayload?: unknown;
  retryCount: number;
  errorMessage?: string | null;
  reconciliationHistory?: unknown;
  createdAt: string;
  updatedAt: string;
  processedAt?: string | null;
}

export interface CoinOverviewKpi {
  totalCoinsDistributed: number;
  totalTransactions: number;
  uniqueRecipients: number;
  statusBreakdown: Record<string, { count: number; totalCoins: number } | number>;
  sourceBreakdown?: Record<string, { count: number; totalCoins: number }>;
}

export interface UserRewardHistory {
  userId: string;
  username?: string | null;
  totalCoins?: number;
  totalCoinsEarned?: number;
  pendingCoins?: number;
  transactionsCount?: number;
  totalTransactions?: number;
  transactions: CoinTransaction[];
}

interface TransactionsApiResponse {
  items: CoinTransaction[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  total?: number;
  totalPages?: number;
  page?: number;
  limit?: number;
}

const SOURCE_CONFIG: Record<
  CoinRewardSource,
  { label: string; icon: typeof Lightning; badgeClass: string }
> = {
  TOWER: { label: 'Leo Tháp', icon: Lightning, badgeClass: 'source-tower' },
  BOSS: { label: 'Săn Boss', icon: Sword, badgeClass: 'source-boss' },
  BOUNTY: { label: 'Nhiệm vụ', icon: Briefcase, badgeClass: 'source-bounty' },
  LEADERBOARD: { label: 'Xếp hạng', icon: Trophy, badgeClass: 'source-leaderboard' },
  OTHER: { label: 'Khác', icon: Coins, badgeClass: 'source-other' },
};

const STATUS_CONFIG: Record<
  CoinTransactionStatus,
  { label: string; icon: typeof CheckCircle; pillClass: string }
> = {
  SUCCESS: { label: 'Thành công', icon: CheckCircle, pillClass: 'status-success' },
  PENDING: { label: 'Đang xử lý', icon: Clock, pillClass: 'status-pending' },
  FAILED: { label: 'Thất bại', icon: XCircle, pillClass: 'status-failed' },
  UNKNOWN: { label: 'Nghi ngờ / Cần đối soát', icon: WarningCircle, pillClass: 'status-unknown' },
};

function formatDateTime(val?: string | null): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
    });
  } catch {
    return val;
  }
}

export function AdminCoins() {
  // KPI / Overview state
  const [overview, setOverview] = useState<CoinOverviewKpi | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Transactions list state
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | CoinRewardSource>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CoinTransactionStatus>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modals state
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [detailTx, setDetailTx] = useState<CoinTransaction | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // User History Modal
  const [userModalId, setUserModalId] = useState<string | null>(null);
  const [userHistory, setUserHistory] = useState<UserRewardHistory | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  // CSV Export loading
  const [exporting, setExporting] = useState(false);

  // Load Overview KPIs
  const loadOverview = useCallback(async () => {
    try {
      setOverviewLoading(true);
      const data = await request.get<CoinOverviewKpi>('/admin/coins/overview');
      setOverview(data);
    } catch {
      // Fallback calculation from current transactions if overview endpoint hasn't responded yet
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  // Load Transactions List
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (sourceFilter !== 'ALL') params.set('source', sourceFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (fromDate) {
        params.set('fromDate', fromDate);
        params.set('startDate', fromDate);
      }
      if (toDate) {
        params.set('toDate', toDate);
        params.set('endDate', toDate);
      }

      const res = await request.get<TransactionsApiResponse>(`/admin/coins/transactions?${params.toString()}`);

      const items = Array.isArray(res) ? (res as CoinTransaction[]) : res?.items || [];
      const totalCount = res?.pagination?.total ?? res?.total ?? items.length;
      const totalP = res?.pagination?.totalPages ?? res?.totalPages ?? Math.max(1, Math.ceil(totalCount / limit));

      setTransactions(items);
      setTotal(totalCount);
      setTotalPages(totalP);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách giao dịch coin');
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchTerm, sourceFilter, statusFilter, fromDate, toDate]);

  // Initial load
  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Load single transaction details
  const openDetail = async (id: string) => {
    setSelectedTxId(id);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const tx = await request.get<CoinTransaction>(`/admin/coins/transactions/${encodeURIComponent(id)}`);
      setDetailTx(tx);
    } catch {
      // If single GET endpoint not implemented, fallback to item from list
      const fallback = transactions.find((t) => t.id === id) || null;
      setDetailTx(fallback);
      if (!fallback) {
        setDetailError('Không tìm thấy thông tin giao dịch.');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  // Manual reconciliation
  const handleReconcile = async (id: string) => {
    setReconciling(true);
    setDetailError(null);
    try {
      const res = await request.post<{ success: boolean; message?: string; transaction?: CoinTransaction }>(
        `/admin/coins/transactions/${encodeURIComponent(id)}/reconcile`
      );
      setNotice(res?.message || 'Đã thực hiện đối soát giao dịch thành công!');
      if (res?.transaction) {
        setDetailTx(res.transaction);
      } else {
        await openDetail(id);
      }
      // Reload parent list and overview
      loadTransactions();
      loadOverview();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Thao tác đối soát thất bại.');
    } finally {
      setReconciling(false);
    }
  };

  // Open User Reward History
  const openUserHistory = async (userId: string, defaultUsername?: string | null) => {
    setUserModalId(userId);
    setUserLoading(true);
    setUserError(null);
    setUserHistory(null);
    try {
      const res = await request.get<UserRewardHistory | CoinTransaction[]>(
        `/admin/coins/users/${encodeURIComponent(userId)}/rewards`
      );

      if (Array.isArray(res)) {
        const totalCoins = res
          .filter((t) => t.status === 'SUCCESS')
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        setUserHistory({
          userId,
          username: defaultUsername || res[0]?.username || userId,
          totalCoins,
          totalCoinsEarned: totalCoins,
          transactionsCount: res.length,
          totalTransactions: res.length,
          transactions: res,
        });
      } else if (res && typeof res === 'object') {
        const historyObj = res as UserRewardHistory;
        setUserHistory({
          ...historyObj,
          username: historyObj.username || defaultUsername || userId,
          totalCoins: historyObj.totalCoinsEarned ?? historyObj.totalCoins ?? 0,
          transactionsCount:
            historyObj.totalTransactions ??
            historyObj.transactionsCount ??
            historyObj.transactions?.length ??
            0,
        });
      }
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Không thể tải lịch sử nhận thưởng của người dùng.');
    } finally {
      setUserLoading(false);
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (sourceFilter !== 'ALL') params.set('source', sourceFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (fromDate) {
        params.set('fromDate', fromDate);
        params.set('startDate', fromDate);
      }
      if (toDate) {
        params.set('toDate', toDate);
        params.set('endDate', toDate);
      }

      const filename = `coin-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      await downloadFile(`/admin/coins/export?${params.toString()}`, filename);
      setNotice('Đã tải xuống danh sách giao dịch CSV thành công!');
    } catch (err) {
      // Fallback: client-side CSV export if backend export stream is unavailable
      if (transactions.length > 0) {
        const headers = ['ID', 'User ID', 'Username', 'Amount', 'Source', 'Reason', 'Status', 'IdempotencyKey', 'ExternalTxId', 'Created At'];
        const csvRows = [headers.join(',')];
        for (const tx of transactions) {
          csvRows.push([
            `"${tx.id}"`,
            `"${tx.userId}"`,
            `"${tx.username || ''}"`,
            tx.amount,
            `"${tx.source}"`,
            `"${(tx.reason || '').replace(/"/g, '""')}"`,
            `"${tx.status}"`,
            `"${tx.idempotencyKey || ''}"`,
            `"${tx.externalTxId || ''}"`,
            `"${tx.createdAt}"`,
          ].join(','));
        }
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `coin-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setNotice('Đã xuất danh sách giao dịch CSV.');
      } else {
        setError(err instanceof Error ? err.message : 'Không thể xuất file CSV.');
      }
    } finally {
      setExporting(false);
    }
  };

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setSourceFilter('ALL');
    setStatusFilter('ALL');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    searchTerm.trim() || sourceFilter !== 'ALL' || statusFilter !== 'ALL' || fromDate || toDate
  );

  // Derived KPI metrics (use overview or fallback to current items)
  const computedKpi = useMemo(() => {
    const getStatusCount = (statusVal: unknown): number => {
      if (typeof statusVal === 'number') return statusVal;
      if (statusVal && typeof statusVal === 'object' && 'count' in statusVal) {
        return Number((statusVal as { count: number }).count) || 0;
      }
      return 0;
    };

    const successCount =
      overview?.statusBreakdown?.SUCCESS != null
        ? getStatusCount(overview.statusBreakdown.SUCCESS)
        : transactions.filter((t) => t.status === 'SUCCESS').length;

    const pendingCount =
      overview?.statusBreakdown?.PENDING != null
        ? getStatusCount(overview.statusBreakdown.PENDING)
        : transactions.filter((t) => t.status === 'PENDING').length;

    const failedCount =
      overview?.statusBreakdown?.FAILED != null
        ? getStatusCount(overview.statusBreakdown.FAILED)
        : transactions.filter((t) => t.status === 'FAILED').length;

    const unknownCount =
      overview?.statusBreakdown?.UNKNOWN != null
        ? getStatusCount(overview.statusBreakdown.UNKNOWN)
        : transactions.filter((t) => t.status === 'UNKNOWN').length;

    const totalDistributed =
      overview?.totalCoinsDistributed ??
      transactions
        .filter((t) => t.status === 'SUCCESS')
        .reduce((acc, t) => acc + (t.amount || 0), 0);

    const totalTxs = overview?.totalTransactions ?? total ?? transactions.length;
    const uniqueUsers =
      overview?.uniqueRecipients ?? new Set(transactions.map((t) => t.userId)).size;

    return {
      totalCoinsDistributed: totalDistributed,
      totalTransactions: totalTxs,
      uniqueRecipients: uniqueUsers,
      statusBreakdown: {
        SUCCESS: successCount,
        PENDING: pendingCount,
        FAILED: failedCount,
        UNKNOWN: unknownCount,
      },
    };
  }, [overview, transactions, total]);

  return (
    <div className="admin-coins-container">
      {/* Top Header & Global Actions */}
      <div className="admin-coins-header">
        <div className="admin-coins-header-left">
          <div className="admin-coins-title-badge">
            <Receipt size={24} className="accent-icon" />
            <div>
              <h2>Quản Trị Giao Dịch BCN Coin</h2>
              <p className="muted">
                Theo dõi phát thưởng, đối soát các giao dịch treo/lỗi và bảo đảm tính toàn vẹn hệ thống ví.
              </p>
            </div>
          </div>
        </div>

        <div className="list-actions">
          <button
            type="button"
            className="button secondary"
            disabled={loading || overviewLoading}
            onClick={() => {
              loadOverview();
              loadTransactions();
            }}
            title="Làm mới dữ liệu"
          >
            <ArrowsClockwise className={loading ? 'spin' : ''} size={16} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            className="button"
            disabled={exporting}
            onClick={handleExportCsv}
            title="Xuất dữ liệu theo bộ lọc ra file CSV"
          >
            <DownloadSimple size={16} />
            <span>{exporting ? 'Đang xuất…' : 'Xuất CSV'}</span>
          </button>
        </div>
      </div>

      {/* Notice & Error Alerts */}
      {notice && (
        <div className="notice form-success" role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={18} />
            <span>{notice}</span>
          </div>
          <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="notice form-error" role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WarningOctagon size={18} />
            <span>{error}</span>
          </div>
          <button type="button" className="icon-button" onClick={() => setError(null)} aria-label="Đóng lỗi">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <section className="admin-coins-kpis" aria-label="Chỉ số tổng quan giao dịch Coin">
        <div className="admin-coins-kpi-card">
          <span className="admin-coins-kpi-title">Tổng Coin Đã Phát</span>
          <div className="admin-coins-kpi-value-wrap">
            <Coins size={28} className="gold-icon" />
            <b className="admin-coins-kpi-val" style={{ color: 'var(--accent)' }}>
              {computedKpi.totalCoinsDistributed.toLocaleString('vi-VN')}
            </b>
          </div>
          <span className="admin-coins-kpi-sub">Số coin thành công đến học viên</span>
        </div>

        <div className="admin-coins-kpi-card">
          <span className="admin-coins-kpi-title">Tổng Giao Dịch</span>
          <div className="admin-coins-kpi-value-wrap">
            <Receipt size={28} className="muted" />
            <b className="admin-coins-kpi-val">
              {computedKpi.totalTransactions.toLocaleString('vi-VN')}
            </b>
          </div>
          <span className="admin-coins-kpi-sub">Ghi nhận từ tất cả các tính năng</span>
        </div>

        <div className="admin-coins-kpi-card">
          <span className="admin-coins-kpi-title">Số Người Nhận Duy Nhất</span>
          <div className="admin-coins-kpi-value-wrap">
            <User size={28} className="muted" />
            <b className="admin-coins-kpi-val">
              {computedKpi.uniqueRecipients.toLocaleString('vi-VN')}
            </b>
          </div>
          <span className="admin-coins-kpi-sub">Học viên đã nhận coin thành công</span>
        </div>

        <div className="admin-coins-kpi-card status-breakdown-card">
          <span className="admin-coins-kpi-title">Phân Rã Trạng Thái</span>
          <div className="admin-coins-status-grid">
            <div className="status-chip success" title="Giao dịch thành công">
              <CheckCircle size={14} />
              <span>Thành công:</span>
              <b>{computedKpi.statusBreakdown.SUCCESS.toLocaleString('vi-VN')}</b>
            </div>
            <div className="status-chip pending" title="Đang xử lý / Chưa hoàn tất">
              <Clock size={14} />
              <span>Đang xử lý:</span>
              <b>{computedKpi.statusBreakdown.PENDING.toLocaleString('vi-VN')}</b>
            </div>
            <div className="status-chip failed" title="Giao dịch thất bại">
              <XCircle size={14} />
              <span>Thất bại:</span>
              <b>{computedKpi.statusBreakdown.FAILED.toLocaleString('vi-VN')}</b>
            </div>
            <div
              className={`status-chip unknown ${computedKpi.statusBreakdown.UNKNOWN > 0 ? 'highlight-alert' : ''}`}
              title="Giao dịch nghi ngờ / Không rõ trạng thái (cần đối soát)"
            >
              <WarningCircle size={14} />
              <span>Nghi ngờ:</span>
              <b>{computedKpi.statusBreakdown.UNKNOWN.toLocaleString('vi-VN')}</b>
            </div>
          </div>
        </div>
      </section>

      {/* Filter & Search Panel */}
      <section className="panel admin-coins-filters" aria-label="Bộ lọc tìm kiếm giao dịch">
        <div className="admin-coins-filter-row">
          {/* Search Box */}
          <div className="admin-coins-search-box">
            <MagnifyingGlass size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm theo Username hoặc User ID…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="search-input"
              aria-label="Tìm kiếm người nhận"
            />
            {searchTerm && (
              <button
                type="button"
                className="icon-button clear-btn"
                onClick={() => {
                  setSearchTerm('');
                  setPage(1);
                }}
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Reward Source Select */}
          <label className="filter-select-label">
            <span>Nguồn:</span>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value as 'ALL' | CoinRewardSource);
                setPage(1);
              }}
            >
              <option value="ALL">Tất cả nguồn</option>
              <option value="TOWER">Leo Tháp (Tower)</option>
              <option value="BOSS">Săn Boss</option>
              <option value="BOUNTY">Nhiệm vụ Freelancer</option>
              <option value="LEADERBOARD">Bảng xếp hạng</option>
              <option value="OTHER">Khác</option>
            </select>
          </label>

          {/* Status Select */}
          <label className="filter-select-label">
            <span>Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | CoinTransactionStatus);
                setPage(1);
              }}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="SUCCESS">Thành công (SUCCESS)</option>
              <option value="PENDING">Đang chờ (PENDING)</option>
              <option value="FAILED">Thất bại (FAILED)</option>
              <option value="UNKNOWN">Nghi ngờ / Cần đối soát (UNKNOWN)</option>
            </select>
          </label>

          {/* Date range inputs */}
          <label className="filter-select-label date-label">
            <CalendarBlank size={16} />
            <span>Từ:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="filter-select-label date-label">
            <CalendarBlank size={16} />
            <span>Đến:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </label>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              className="button secondary reset-filter-btn"
              onClick={resetFilters}
              title="Đặt lại bộ lọc về mặc định"
            >
              <X size={14} />
              <span>Đặt lại</span>
            </button>
          )}
        </div>
      </section>

      {/* Transaction History Table */}
      <section className="panel admin-coins-table-panel" aria-label="Lịch sử giao dịch Coin">
        <div className="section-title">
          <div className="section-title-left">
            <h3>Danh Sách Giao Dịch Coin</h3>
            <span className="badge-count">{total.toLocaleString('vi-VN')}</span>
          </div>
        </div>

        {loading ? (
          <Loading label="Đang tải danh sách giao dịch Coin" />
        ) : transactions.length === 0 ? (
          <Empty
            title="Không tìm thấy giao dịch nào"
            description={
              hasActiveFilters
                ? 'Không có giao dịch phù hợp với tiêu chí lọc hiện tại. Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.'
                : 'Chưa có bản ghi giao dịch coin nào được lưu trong hệ thống.'
            }
          />
        ) : (
          <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Bảng giao dịch coin, cuộn ngang để xem hết">
            <table className="admin-coins-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 170 }}>Mã GD & Thời Gian</th>
                  <th scope="col" style={{ width: 180 }}>Người Nhận</th>
                  <th scope="col" style={{ width: 140 }}>Nguồn Thưởng</th>
                  <th scope="col" className="num" style={{ width: 110 }}>Số Coin</th>
                  <th scope="col">Lý Do / Chi Tiết</th>
                  <th scope="col" style={{ width: 150 }}>Trạng Thái</th>
                  <th scope="col" className="actions-col" style={{ width: 140 }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const sourceMeta = SOURCE_CONFIG[tx.source] || SOURCE_CONFIG.OTHER;
                  const statusMeta = STATUS_CONFIG[tx.status] || STATUS_CONFIG.UNKNOWN;
                  const SourceIcon = sourceMeta.icon;
                  const StatusIcon = statusMeta.icon;

                  return (
                    <tr key={tx.id} className={tx.status === 'UNKNOWN' ? 'row-unknown' : ''}>
                      {/* ID & Time */}
                      <td>
                        <div className="tx-id-cell">
                          <code className="tx-id-mono" title={tx.id}>
                            #{tx.id.slice(-8)}
                          </code>
                          <small className="tx-time-sub">{formatDateTime(tx.createdAt)}</small>
                        </div>
                      </td>

                      {/* User */}
                      <td>
                        <div className="tx-user-cell">
                          <button
                            type="button"
                            className="tx-user-link"
                            onClick={() => openUserHistory(tx.userId, tx.username)}
                            title="Bấm để xem toàn bộ lịch sử nhận thưởng của học viên này"
                          >
                            <span className="username-text">{tx.username || 'Học viên'}</span>
                            <code className="user-id-mono">{tx.userId.slice(0, 10)}…</code>
                          </button>
                        </div>
                      </td>

                      {/* Source */}
                      <td>
                        <span className={`admin-coins-badge ${sourceMeta.badgeClass}`}>
                          <SourceIcon size={14} />
                          <span>{sourceMeta.label}</span>
                        </span>
                      </td>

                      {/* Coin Amount */}
                      <td className="num">
                        <span className="admin-coins-amount-chip">
                          <Coins size={14} className="gold-icon" />
                          <b>+{tx.amount}</b>
                        </span>
                      </td>

                      {/* Reason & Reference */}
                      <td>
                        <div className="tx-reason-cell">
                          <span className="reason-text">{tx.reason || '—'}</span>
                          {tx.referenceId && (
                            <small className="reference-text" title={`Ref: ${tx.referenceId}`}>
                              Ref: {tx.referenceId}
                            </small>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`admin-coins-status-pill ${statusMeta.pillClass}`}>
                          <StatusIcon size={14} />
                          <span>{statusMeta.label}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="actions-col">
                        <div className="list-actions inline-actions">
                          <button
                            type="button"
                            className="button secondary btn-compact"
                            onClick={() => openDetail(tx.id)}
                            title="Xem chi tiết giao dịch"
                          >
                            <Eye size={14} />
                            <span>Chi tiết</span>
                          </button>

                          {(tx.status === 'UNKNOWN' || tx.status === 'PENDING') && (
                            <button
                              type="button"
                              className="button btn-compact btn-reconcile"
                              onClick={() => handleReconcile(tx.id)}
                              disabled={reconciling}
                              title="Đối soát trạng thái ngay với Profiles Coin Service"
                            >
                              <ArrowsClockwise size={13} className={reconciling ? 'spin' : ''} />
                              <span>Đối soát</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Nav */}
        <PaginationNav
          page={page}
          totalPages={totalPages}
          total={total}
          disabled={loading}
          onChange={(newPage) => setPage(newPage)}
        />
      </section>

      {/* MODAL 1: TRANSACTION DETAIL VIEW */}
      {selectedTxId && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => {
            if (!reconciling) setSelectedTxId(null);
          }}
        >
          <div
            className="dialog admin-coins-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tx-detail-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '44rem', width: '92vw' }}
          >
            {/* Modal Header */}
            <div className="modal-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Receipt size={22} className="accent-icon" />
                <h3 id="tx-detail-modal-title" style={{ margin: 0 }}>Chi Tiết Giao Dịch Coin</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedTxId(null)}
                aria-label="Đóng cửa sổ"
                disabled={reconciling}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            {detailLoading ? (
              <Loading label="Đang tải chi tiết giao dịch" />
            ) : detailError ? (
              <div className="notice form-error" role="alert" style={{ marginTop: 16 }}>
                <WarningOctagon size={18} />
                <span>{detailError}</span>
              </div>
            ) : detailTx ? (
              <div className="tx-detail-body">
                {/* Status & Amount banner */}
                <div className="tx-summary-banner">
                  <div className="summary-left">
                    <span className="summary-amount">
                      <Coins size={22} className="gold-icon" />
                      <b>+{detailTx.amount} BCN Coin</b>
                    </span>
                    <span className={`admin-coins-badge ${SOURCE_CONFIG[detailTx.source]?.badgeClass || ''}`}>
                      {SOURCE_CONFIG[detailTx.source]?.label || detailTx.source}
                    </span>
                  </div>
                  <div className="summary-right">
                    <span className={`admin-coins-status-pill ${STATUS_CONFIG[detailTx.status]?.pillClass || ''}`}>
                      {STATUS_CONFIG[detailTx.status]?.label || detailTx.status}
                    </span>
                  </div>
                </div>

                {/* Error Banner if any */}
                {detailTx.errorMessage && (
                  <div className="tx-error-box" role="alert">
                    <WarningOctagon size={20} className="error-icon" />
                    <div>
                      <strong>Lỗi giao dịch ghi nhận:</strong>
                      <p>{detailTx.errorMessage}</p>
                    </div>
                  </div>
                )}

                {/* Properties Grid */}
                <div className="tx-props-grid">
                  <div className="tx-prop-item">
                    <span className="prop-label">Mã Giao Dịch (ID):</span>
                    <div className="prop-val-row">
                      <code className="prop-code">{detailTx.id}</code>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => copyToClipboard(detailTx.id, 'id')}
                        title="Sao chép ID"
                      >
                        {copiedKey === 'id' ? <Check size={14} color="var(--accent)" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="tx-prop-item">
                    <span className="prop-label">Người Nhận:</span>
                    <div className="prop-val-row">
                      <span>{detailTx.username || 'Học viên'} (<code>{detailTx.userId}</code>)</span>
                      <button
                        type="button"
                        className="button secondary btn-compact"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => {
                          setSelectedTxId(null);
                          openUserHistory(detailTx.userId, detailTx.username);
                        }}
                      >
                        <User size={13} />
                        <span>Xem ví</span>
                      </button>
                    </div>
                  </div>

                  <div className="tx-prop-item">
                    <span className="prop-label">Idempotency Key (Chống lặp):</span>
                    <div className="prop-val-row">
                      <code className="prop-code wrap-code">{detailTx.idempotencyKey}</code>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => copyToClipboard(detailTx.idempotencyKey, 'idemp')}
                        title="Sao chép Idempotency Key"
                      >
                        {copiedKey === 'idemp' ? <Check size={14} color="var(--accent)" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="tx-prop-item">
                    <span className="prop-label">External Tx ID (Profiles):</span>
                    <div className="prop-val-row">
                      {detailTx.externalTxId ? (
                        <>
                          <code className="prop-code">{detailTx.externalTxId}</code>
                          <button
                            type="button"
                            className="copy-btn"
                            onClick={() => copyToClipboard(detailTx.externalTxId!, 'ext')}
                            title="Sao chép External Tx ID"
                          >
                            {copiedKey === 'ext' ? <Check size={14} color="var(--accent)" /> : <Copy size={14} />}
                          </button>
                        </>
                      ) : (
                        <span className="muted">Chưa có mã từ Profiles</span>
                      )}
                    </div>
                  </div>

                  <div className="tx-prop-item">
                    <span className="prop-label">Lý do phát thưởng:</span>
                    <span className="prop-val">{detailTx.reason || '—'}</span>
                  </div>

                  <div className="tx-prop-item">
                    <span className="prop-label">Số lần thử lại (Retry Count):</span>
                    <span className="prop-val">{detailTx.retryCount ?? 0}</span>
                  </div>

                  <div className="tx-prop-item">
                    <span className="prop-label">Thời gian tạo:</span>
                    <span className="prop-val">{formatDateTime(detailTx.createdAt)}</span>
                  </div>

                  <div className="tx-prop-item">
                    <span className="prop-label">Thời gian hoàn tất:</span>
                    <span className="prop-val">{formatDateTime(detailTx.processedAt)}</span>
                  </div>
                </div>

                {/* Request / Response Payload Inspector */}
                <div className="payload-inspectors">
                  {detailTx.requestPayload ? (
                    <details className="payload-accordion">
                      <summary>
                        <span>Request Payload (Dữ liệu gửi)</span>
                      </summary>
                      <pre className="payload-code">
                        {JSON.stringify(detailTx.requestPayload, null, 2)}
                      </pre>
                    </details>
                  ) : null}

                  {detailTx.responsePayload ? (
                    <details className="payload-accordion">
                      <summary>
                        <span>Response Payload (Phản hồi từ Profiles)</span>
                      </summary>
                      <pre className="payload-code">
                        {JSON.stringify(detailTx.responsePayload, null, 2)}
                      </pre>
                    </details>
                  ) : null}

                  {detailTx.reconciliationHistory ? (
                    <details className="payload-accordion" open>
                      <summary>
                        <span>Nhật ký đối soát (Reconciliation Log)</span>
                      </summary>
                      <pre className="payload-code">
                        {typeof detailTx.reconciliationHistory === 'string'
                          ? detailTx.reconciliationHistory
                          : JSON.stringify(detailTx.reconciliationHistory, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>

                {/* Modal Actions */}
                <div className="modal-actions-bar">
                  {(detailTx.status === 'UNKNOWN' || detailTx.status === 'PENDING') && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => handleReconcile(detailTx.id)}
                      disabled={reconciling}
                    >
                      <ArrowsClockwise size={16} className={reconciling ? 'spin' : ''} />
                      <span>{reconciling ? 'Đang đối soát…' : 'Đối soát ngay'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setSelectedTxId(null)}
                    disabled={reconciling}
                    style={{ marginLeft: 'auto' }}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL 2: USER REWARD HISTORY VIEW */}
      {userModalId && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setUserModalId(null)}
        >
          <div
            className="dialog admin-coins-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-history-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '48rem', width: '92vw' }}
          >
            {/* Modal Header */}
            <div className="modal-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <User size={22} className="accent-icon" />
                <h3 id="user-history-modal-title" style={{ margin: 0 }}>
                  Lịch Sử Nhận Coin Của Học Viên
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setUserModalId(null)}
                aria-label="Đóng cửa sổ"
              >
                <X size={18} />
              </button>
            </div>

            {userLoading ? (
              <Loading label="Đang tải lịch sử ví học viên" />
            ) : userError ? (
              <div className="notice form-error" role="alert" style={{ marginTop: 16 }}>
                <WarningOctagon size={18} />
                <span>{userError}</span>
              </div>
            ) : userHistory ? (
              <div className="user-history-body">
                {/* User Summary Card */}
                <div className="user-summary-card">
                  <div>
                    <strong style={{ fontSize: '1.1rem' }}>{userHistory.username || 'Học viên'}</strong>
                    <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '0.8125rem' }}>
                      User ID: <code>{userHistory.userId}</code>
                    </p>
                  </div>
                  <div className="user-summary-stats">
                    <div className="user-stat-badge">
                      <span>Tổng Coin:</span>
                      <Coins size={16} className="gold-icon" />
                      <b>{(userHistory.totalCoins ?? 0).toLocaleString('vi-VN')}</b>
                    </div>
                    <div className="user-stat-badge">
                      <span>Số lần nhận:</span>
                      <b>{userHistory.transactionsCount ?? userHistory.transactions.length}</b>
                    </div>
                  </div>
                </div>

                {/* User Transactions Table */}
                <div className="admin-table-scroll" style={{ maxHeight: '50vh', marginTop: 16 }}>
                  <table className="admin-coins-table">
                    <thead>
                      <tr>
                        <th>Thời Gian</th>
                        <th>Nguồn</th>
                        <th className="num">Số Coin</th>
                        <th>Lý Do</th>
                        <th>Trạng Thái</th>
                        <th className="actions-col">Xem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userHistory.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)' }}>
                            Chưa có giao dịch coin nào cho học viên này.
                          </td>
                        </tr>
                      ) : (
                        userHistory.transactions.map((tx) => {
                          const src = SOURCE_CONFIG[tx.source] || SOURCE_CONFIG.OTHER;
                          const st = STATUS_CONFIG[tx.status] || STATUS_CONFIG.UNKNOWN;
                          const SrcIcon = src.icon;
                          const StIcon = st.icon;

                          return (
                            <tr key={tx.id}>
                              <td>{formatDateTime(tx.createdAt)}</td>
                              <td>
                                <span className={`admin-coins-badge ${src.badgeClass}`}>
                                  <SrcIcon size={12} />
                                  <span>{src.label}</span>
                                </span>
                              </td>
                              <td className="num">
                                <b style={{ color: 'var(--accent)' }}>+{tx.amount}</b>
                              </td>
                              <td>
                                <span className="reason-text">{tx.reason || '—'}</span>
                              </td>
                              <td>
                                <span className={`admin-coins-status-pill ${st.pillClass}`}>
                                  <StIcon size={12} />
                                  <span>{st.label}</span>
                                </span>
                              </td>
                              <td className="actions-col">
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() => {
                                    setUserModalId(null);
                                    openDetail(tx.id);
                                  }}
                                  title="Xem chi tiết giao dịch này"
                                >
                                  <ArrowSquareOut size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="modal-actions-bar">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setUserModalId(null)}
                    style={{ marginLeft: 'auto' }}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
