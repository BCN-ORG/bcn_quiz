'use client';

import {
  ArrowClockwise,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowsClockwise,
  CheckCircle,
  Clock,
  Coins,
  Copy,
  Flask,
  Gift,
  MagnifyingGlass,
  PaperPlaneTilt,
  Receipt,
  Warning,
  XCircle,
} from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Empty, Loading, PaginationNav } from '@/components/ui';
import { TransferModal } from '@/components/wallet/transfer-modal';
import {
  formatCoinAmount,
  formatVNDateTime,
  walletApi,
  type WalletBalance,
  type WalletTransaction,
  type WalletTransactionsResult,
  type WalletTransferResult,
} from '@/lib/wallet';

const DEFAULT_MOCK_BALANCE: WalletBalance = {
  balance: 0,
  lastSyncedAt: new Date().toISOString(),
  syncStatus: 'FAILED',
  isMock: false,
};

export default function WalletPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  // Balance & Sync State
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [syncCooldown, setSyncCooldown] = useState(0);

  // Transfer Modal State
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  // Transaction History State
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txPage, setTxPage] = useState(1);
  const [txLoading, setTxLoading] = useState(true);
  const [copiedRefId, setCopiedRefId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Transaction Detail Modal
  const [detailTx, setDetailTx] = useState<WalletTransaction | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const openTxDetail = async (tx: WalletTransaction) => {
    if (!tx.id) return;
    setDetailTx(tx);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const full = await walletApi.getTransaction(tx.id);
      setDetailTx({ ...tx, ...full });
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : 'Không thể tải chi tiết giao dịch.',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  // Check URL query param for action=transfer
  useEffect(() => {
    if (searchParams?.get('action') === 'transfer') {
      setIsTransferOpen(true);
    }
  }, [searchParams]);

  // Cooldown countdown timer
  useEffect(() => {
    if (syncCooldown <= 0) return;
    const timer = setInterval(() => {
      setSyncCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [syncCooldown]);

  // Load Balance
  const loadBalance = useCallback(async () => {
    try {
      setBalanceLoading(true);
      const data = await walletApi.getBalance();
      setBalance(data);
    } catch (err) {
      console.warn('Failed to load wallet balance from server, using fallback:', err);
      // Fallback preserves or sets mock balance
      setBalance((prev) => prev || DEFAULT_MOCK_BALANCE);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  // Sync Balance
  const handleSyncBalance = async () => {
    if (isSyncing || syncCooldown > 0) return;

    setIsSyncing(true);
    setSyncFeedback(null);

    try {
      const data = await walletApi.syncBalance();
      setBalance(data);
      setSyncFeedback({
        type: 'success',
        message: 'Đã làm mới và đồng bộ số dư thành công!',
      });
      setSyncCooldown(5); // 5s cooldown
      // Also reload transactions
      void loadTransactions();
    } catch (err: unknown) {
      console.warn('Sync balance failed:', err);
      // In accordance with scenario: "Sync failure preserves previous balance"
      setBalance((prev) => {
        if (!prev) return DEFAULT_MOCK_BALANCE;
        return {
          ...prev,
          syncStatus: 'FAILED',
        };
      });
      setSyncFeedback({
        type: 'error',
        message: 'Đồng bộ thất bại, đã giữ nguyên số dư trước đó.',
      });
      setSyncCooldown(3);
    } finally {
      setIsSyncing(false);
    }
  };

  // Load Transactions
  const loadTransactions = useCallback(async () => {
    try {
      setTxLoading(true);
      const res: WalletTransactionsResult = await walletApi.getTransactions({
        page: txPage,
        limit: 10,
        type: typeFilter,
        status: statusFilter,
        search,
        from: fromDate || undefined,
        to: toDate || undefined,
      });

      setTransactions(res.items || []);
      setTxTotal(res.pagination?.total ?? 0);
      setTxTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      console.error('Failed to load wallet transactions:', err);
      setTransactions([]);
      setTxTotal(0);
      setTxTotalPages(1);
    } finally {
      setTxLoading(false);
    }
  }, [txPage, typeFilter, statusFilter, search, fromDate, toDate]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const handleTransferSuccess = (result: WalletTransferResult) => {
    // Update balance
    if (typeof result.balance === 'number') {
      setBalance((prev) =>
        prev
          ? { ...prev, balance: result.balance! }
          : { ...DEFAULT_MOCK_BALANCE, balance: result.balance! },
      );
    } else {
      void loadBalance();
    }
    // Reload transactions from page 1
    setTxPage(1);
    void loadTransactions();
  };

  const copyReferenceCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedRefId(code);
    setTimeout(() => setCopiedRefId(null), 2000);
  };

  const handleResetFilters = () => {
    setSearch('');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
    setFromDate('');
    setToDate('');
    setTxPage(1);
  };

  const isMockMode = balance?.isMock === true;
  const hasActiveFilters = isMockMode
    ? Boolean(search || typeFilter !== 'ALL' || statusFilter !== 'ALL' || fromDate || toDate)
    : typeFilter !== 'ALL';

  const currentBalanceNum = balance?.balance ?? 0;
  const isSyncStatusPending = balance?.syncStatus === 'SYNCING' || isSyncing;
  const isSyncStatusFailed = balance?.syncStatus === 'FAILED';

  return (
    <div className="wallet-page-wrapper">
      {/* 1. Page Header */}
      <header className="page-heading wallet-page-header">
        <div className="page-heading-left">
          <div className="wallet-header-title-row">
            <h1>Ví Coin của tôi</h1>
            {isMockMode ? (
              <span className="wallet-mock-badge" title="Giao dịch trong môi trường mô phỏng học tập">
                <Flask size={14} weight="fill" aria-hidden="true" />
                <span>Môi trường thử nghiệm Mock</span>
              </span>
            ) : null}
          </div>
          <p className="page-heading-desc">
            Quản lý số dư BCN Coin liên kết Discord, chuyển Coin P2P và theo dõi toàn bộ lịch sử biến động số dư.
          </p>
        </div>
      </header>

      {/* Sync Feedback Toast / Banner */}
      {syncFeedback && (
        <div
          className={`wallet-feedback-banner ${syncFeedback.type === 'success' ? 'is-success' : 'is-error'}`}
          role="status"
        >
          {syncFeedback.type === 'success' ? (
            <CheckCircle size={18} weight="fill" aria-hidden="true" />
          ) : (
            <Warning size={18} weight="fill" aria-hidden="true" />
          )}
          <span>{syncFeedback.message}</span>
          <button
            type="button"
            className="icon-button sm"
            onClick={() => setSyncFeedback(null)}
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}

      {/* 2. Balance & Sync Card */}
      <section className="wallet-balance-card" aria-label="Thông tin số dư ví">
        <div className="wallet-balance-card-inner">
          <div className="wallet-balance-left">
            <span className="wallet-balance-label">Số dư khả dụng</span>
            <div className="wallet-balance-value-wrap">
              <div className="wallet-coin-icon-wrapper" aria-hidden="true">
                <Coins size={36} weight="fill" className="wallet-coin-icon-large" />
              </div>
              <strong className="wallet-balance-amount">
                {balanceLoading ? (
                  <span className="wallet-balance-placeholder">...</span>
                ) : (
                  currentBalanceNum.toLocaleString('vi-VN')
                )}
              </strong>
              <span className="wallet-currency-unit">Coin</span>
            </div>

            <div className="wallet-sync-meta-strip">
              <span className="wallet-sync-status-indicator">
                {isSyncStatusPending ? (
                  <span className="wallet-sync-badge is-pending">
                    <ArrowsClockwise size={13} className="wallet-spinner" aria-hidden="true" />
                    <span>Đang đồng bộ</span>
                  </span>
                ) : isSyncStatusFailed ? (
                  <span className="wallet-sync-badge is-failed">
                    <XCircle size={13} weight="fill" aria-hidden="true" />
                    <span>Thất bại</span>
                  </span>
                ) : (
                  <span className="wallet-sync-badge is-synced">
                    <CheckCircle size={13} weight="fill" aria-hidden="true" />
                    <span>Đã đồng bộ</span>
                  </span>
                )}
              </span>

              <span className="wallet-sync-time-text">
                <Clock size={14} aria-hidden="true" />
                <span>
                  Đồng bộ lần cuối:{' '}
                  <strong>{formatVNDateTime(balance?.lastSyncedAt)}</strong>
                </span>
              </span>
            </div>
          </div>

          <div className="wallet-balance-actions">
            <button
              type="button"
              className="button secondary wallet-sync-btn"
              onClick={handleSyncBalance}
              disabled={isSyncing || syncCooldown > 0}
              title={syncCooldown > 0 ? `Vui lòng đợi ${syncCooldown}s trước khi làm mới lại` : 'Làm mới và đồng bộ số dư'}
            >
              <ArrowClockwise
                size={16}
                className={isSyncing ? 'wallet-spinner' : ''}
                aria-hidden="true"
              />
              <span>
                {isSyncing
                  ? 'Đang đồng bộ...'
                  : syncCooldown > 0
                    ? `Làm mới (${syncCooldown}s)`
                    : 'Làm mới số dư'}
              </span>
            </button>

            <button
              type="button"
              className="button primary wallet-transfer-cta-btn"
              disabled={balance?.discordLinked === false || balance?.syncStatus === 'UNLINKED'}
              title={
                balance?.discordLinked === false || balance?.syncStatus === 'UNLINKED'
                  ? 'Vui lòng liên kết Discord trên Profiles để chuyển Coin'
                  : 'Chuyển Coin P2P'
              }
              onClick={() => setIsTransferOpen(true)}
            >
              <PaperPlaneTilt size={16} weight="fill" aria-hidden="true" />
              <span>Chuyển Coin</span>
            </button>
          </div>
        </div>
        {(balance?.discordLinked === false || balance?.syncStatus === 'UNLINKED') && (
          <div className="notice form-error" role="alert" style={{ marginTop: 12 }}>
            <Warning size={18} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} />
            <span>
              Tài khoản của bạn chưa liên kết Discord. Vui lòng liên kết Discord trên hệ thống Profiles để nhận thưởng và chuyển Coin.
            </span>
          </div>
        )}
      </section>

      {/* 3. Transaction History Section */}
      <section className="wallet-transactions-section" aria-label="Lịch sử giao dịch ví Coin">
        <div className="wallet-section-header">
          <div className="wallet-section-title-wrap">
            <Receipt size={22} weight="fill" className="wallet-section-icon" aria-hidden="true" />
            <h2>Lịch sử giao dịch</h2>
            <span className="wallet-count-badge">{txTotal} giao dịch</span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="wallet-filters-toolbar">
          {isMockMode ? (
            <div className="wallet-filter-search-box">
              <MagnifyingGlass size={16} className="wallet-filter-search-icon" aria-hidden="true" />
              <input
                type="text"
                className="wallet-filter-input"
                placeholder="Tìm theo mã GD, đối tác, nội dung..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setTxPage(1);
                }}
              />
              {search ? (
                <button
                  type="button"
                  className="icon-button sm"
                  onClick={() => {
                    setSearch('');
                    setTxPage(1);
                  }}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  ×
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Type Filter */}
          <div className="wallet-filter-group">
            <label htmlFor="filter-type-select" className="wallet-filter-label">Loại:</label>
            <select
              id="filter-type-select"
              className="wallet-select"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setTxPage(1);
              }}
            >
              <option value="ALL">Tất cả loại GD</option>
              <option value="REWARD">Phần thưởng</option>
              <option value="TRANSFER_IN">Nhận chuyển khoản (+)</option>
              <option value="TRANSFER_OUT">Chuyển đi (-)</option>
              {!isMockMode ? (
                <>
                  <option value="SALARY">Lương Discord</option>
                  <option value="MINT">Admin cộng Coin</option>
                  <option value="DEDUCT">Phạt / Trừ Coin</option>
                </>
              ) : (
                <>
                  <option value="RECEIVED">Đã nhận (+)</option>
                  <option value="SENT">Đã chuyển (-)</option>
                </>
              )}
            </select>
          </div>

          {isMockMode ? (
            <>
              <div className="wallet-filter-group">
                <label htmlFor="filter-status-select" className="wallet-filter-label">Trạng thái:</label>
                <select
                  id="filter-status-select"
                  className="wallet-select"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setTxPage(1);
                  }}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="SUCCESS">Thành công</option>
                  <option value="PENDING">Đang xử lý</option>
                  <option value="FAILED">Thất bại</option>
                </select>
              </div>

              <div className="wallet-filter-group">
                <label htmlFor="filter-from-date" className="wallet-filter-label">Từ ngày:</label>
                <input
                  id="filter-from-date"
                  type="date"
                  className="wallet-filter-date-input"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setTxPage(1);
                  }}
                />
              </div>

              <div className="wallet-filter-group">
                <label htmlFor="filter-to-date" className="wallet-filter-label">Đến ngày:</label>
                <input
                  id="filter-to-date"
                  type="date"
                  className="wallet-filter-date-input"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setTxPage(1);
                  }}
                />
              </div>
            </>
          ) : null}

          {/* Reset Filters CTA */}
          {hasActiveFilters ? (
            <button
              type="button"
              className="button secondary sm wallet-reset-filters-btn"
              onClick={handleResetFilters}
            >
              Đặt lại bộ lọc
            </button>
          ) : null}
        </div>

        {/* Transactions Table */}
        <div className="wallet-table-container">
          {txLoading ? (
            <div className="wallet-table-loading">
              <Loading label="Đang tải lịch sử giao dịch" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="wallet-table-empty">
              <Empty
                title={hasActiveFilters ? 'Không tìm thấy giao dịch nào' : 'Chưa có giao dịch'}
                description={
                  hasActiveFilters
                    ? 'Hãy thử thay đổi điều kiện lọc hoặc xóa từ khóa tìm kiếm.'
                    : 'Bạn chưa phát sinh giao dịch nào. Nhận thưởng từ thử thách hoặc thử tính năng Chuyển Coin ngay!'
                }
              />
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="button secondary sm"
                  style={{ marginTop: 12 }}
                  onClick={handleResetFilters}
                >
                  Xóa bộ lọc
                </button>
              ) : null}
            </div>
          ) : (
            <div className="wallet-table-scroll">
              <table className="wallet-table" aria-label="Bảng danh sách giao dịch">
                <thead>
                  <tr>
                    <th scope="col" className="col-time">Thời gian</th>
                    <th scope="col" className="col-ref">ID giao dịch</th>
                    <th scope="col" className="col-type">Loại giao dịch</th>
                    <th scope="col" className="col-counterpart">Đối tác</th>
                    <th scope="col" className="col-amount text-right">Số Coin</th>
                    <th scope="col" className="col-status text-center">Trạng thái</th>
                    <th scope="col" className="col-note">Nội dung</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, idx) => {
                    const isReceived =
                      tx.type === 'RECEIVED' ||
                      tx.type === 'REWARD' ||
                      tx.type === 'TRANSFER_IN' ||
                      tx.type === 'SALARY' ||
                      tx.type === 'MINT' ||
                      (tx.amount > 0 && tx.type !== 'SENT' && tx.type !== 'TRANSFER_OUT' && tx.type !== 'DEDUCT');
                    const isSent =
                      tx.type === 'SENT' ||
                      tx.type === 'TRANSFER_OUT' ||
                      tx.type === 'DEDUCT' ||
                      tx.amount < 0;

                    return (
                      <tr key={tx.id ?? `${tx.createdAt}-${idx}`} className="wallet-table-row">
                        {/* 1. Time */}
                        <td className="col-time">
                          <div className="wallet-tx-time">
                            <span className="wallet-tx-time-full">{formatVNDateTime(tx.createdAt)}</span>
                          </div>
                        </td>

                        {/* 2. Reference Code / Transaction ID */}
                        <td className="col-ref">
                          {tx.id || tx.referenceCode ? (
                            <div className="wallet-ref-cell">
                              <code className="wallet-ref-code-inline" title={tx.id || tx.referenceCode}>
                                {tx.id || tx.referenceCode}
                              </code>
                              <button
                                type="button"
                                className="wallet-copy-btn"
                                onClick={() => copyReferenceCode(tx.id || tx.referenceCode)}
                                title="Sao chép ID giao dịch"
                                aria-label={`Sao chép ID ${tx.id || tx.referenceCode}`}
                              >
                                {copiedRefId === (tx.id || tx.referenceCode) ? (
                                  <CheckCircle size={14} weight="fill" className="text-green" />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>
                              {tx.id ? (
                                <button
                                  type="button"
                                  className="button secondary sm"
                                  style={{ padding: '2px 8px', fontSize: 11 }}
                                  onClick={() => void openTxDetail(tx)}
                                >
                                  Chi tiết
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <span className="wallet-system-actor" title="Giao dịch thực hiện trực tiếp trên Discord (không có ID API)">
                              Discord
                            </span>
                          )}
                        </td>

                        {/* 3. Type */}
                        <td className="col-type">
                          {tx.type === 'RECEIVED' || tx.type === 'TRANSFER_IN' ? (
                            <span className="wallet-type-pill pill-received">
                              <ArrowDownLeft size={13} weight="bold" aria-hidden="true" />
                              <span>Nhận Coin</span>
                            </span>
                          ) : tx.type === 'SENT' || tx.type === 'TRANSFER_OUT' ? (
                            <span className="wallet-type-pill pill-sent">
                              <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
                              <span>Chuyển Coin</span>
                            </span>
                          ) : tx.type === 'SALARY' || tx.type === 'MINT' ? (
                            <span className="wallet-type-pill pill-received">
                              <Gift size={13} weight="fill" aria-hidden="true" />
                              <span>{tx.type === 'SALARY' ? 'Lương Discord' : 'Admin cộng'}</span>
                            </span>
                          ) : tx.type === 'DEDUCT' ? (
                            <span className="wallet-type-pill pill-sent">
                              <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
                              <span>Trừ Coin</span>
                            </span>
                          ) : (
                            <span className="wallet-type-pill pill-reward">
                              <Gift size={13} weight="fill" aria-hidden="true" />
                              <span>Phần thưởng</span>
                            </span>
                          )}
                        </td>

                        {/* 4. Counterpart */}
                        <td className="col-counterpart">
                          {tx.counterpartFullName || tx.counterpartUsername || tx.counterpartEmail ? (
                            <div className="wallet-counterpart-cell">
                              <div className="wallet-counterpart-avatar" aria-hidden="true">
                                {(tx.counterpartFullName || tx.counterpartEmail || 'U').slice(0, 1).toUpperCase()}
                              </div>
                              <div className="wallet-counterpart-info">
                                <strong>{tx.counterpartFullName || tx.counterpartUsername || tx.counterpartEmail}</strong>
                                {tx.counterpartUsername ? (
                                  <small className="wallet-counterpart-handle">@{tx.counterpartUsername}</small>
                                ) : (
                                  <small className="wallet-counterpart-email">{tx.counterpartEmail}</small>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="wallet-system-actor">Hệ thống BCN</span>
                          )}
                        </td>

                        {/* 5. Amount & Balance After */}
                        <td className="col-amount text-right">
                          <span
                            className={`wallet-amount-display ${
                              isReceived ? 'amount-positive' : isSent ? 'amount-negative' : ''
                            }`}
                          >
                            {isReceived ? `+${formatCoinAmount(tx.amount)}` : `-${formatCoinAmount(tx.amount)}`}
                          </span>
                          {typeof tx.balanceAfter === 'number' ? (
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              Số dư: {tx.balanceAfter.toLocaleString('vi-VN')}
                            </div>
                          ) : null}
                        </td>

                        {/* 6. Status */}
                        <td className="col-status text-center">
                          {tx.status === 'SUCCESS' ? (
                            <span className="wallet-status-tag status-success">Thành công</span>
                          ) : tx.status === 'PENDING' ? (
                            <span className="wallet-status-tag status-pending">Đang xử lý</span>
                          ) : (
                            <span className="wallet-status-tag status-failed">Thất bại</span>
                          )}
                        </td>

                        {/* 7. Note / Title */}
                        <td className="col-note">
                          <span className="wallet-tx-note-text" title={tx.note || tx.title || undefined}>
                            {tx.title ? <strong>{tx.title}</strong> : null}
                            {tx.title && tx.note ? ' — ' : null}
                            {tx.note || (!tx.title ? <em className="wallet-muted-empty">—</em> : null)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!txLoading && txTotalPages > 1 ? (
            <div className="wallet-pagination-wrap">
              <PaginationNav
                page={txPage}
                totalPages={txTotalPages}
                total={txTotal}
                disabled={txLoading}
                onChange={(nextPage) => setTxPage(nextPage)}
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* Transfer Modal */}
      {user ? (
        <TransferModal
          open={isTransferOpen}
          onClose={() => setIsTransferOpen(false)}
          currentBalance={currentBalanceNum}
          currentUser={user}
          onSuccess={handleTransferSuccess}
        />
      ) : null}

      {/* Transaction Detail Modal */}
      {detailTx ? (
        <div
          className="dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết giao dịch Coin"
          onClick={() => setDetailTx(null)}
        >
          <div className="dialog-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>Chi tiết giao dịch</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setDetailTx(null)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className="dialog-body" style={{ display: 'grid', gap: 10, fontSize: 14 }}>
              {detailLoading ? <Loading label="Đang tải chi tiết..." /> : null}
              {detailError ? (
                <div className="notice form-error">{detailError}</div>
              ) : null}
              <div><strong>ID giao dịch:</strong> <code>{detailTx.id}</code></div>
              <div><strong>Loại:</strong> {detailTx.type}</div>
              <div><strong>Số Coin:</strong> {formatCoinAmount(detailTx.amount)} Coin</div>
              {typeof detailTx.fee === 'number' ? (
                <div><strong>Phí:</strong> {detailTx.fee} Coin</div>
              ) : null}
              <div><strong>Trạng thái:</strong> {detailTx.status}</div>
              {detailTx.source ? (
                <div><strong>Nguồn:</strong> {detailTx.source}</div>
              ) : null}
              {detailTx.idempotencyKey ? (
                <div><strong>Idempotency Key:</strong> <code>{detailTx.idempotencyKey}</code></div>
              ) : null}
              {detailTx.errorCode ? (
                <div><strong>Mã lỗi:</strong> <code>{detailTx.errorCode}</code></div>
              ) : null}
              <div><strong>Nội dung:</strong> {detailTx.note || detailTx.title || '—'}</div>
              <div><strong>Thời gian:</strong> {formatVNDateTime(detailTx.createdAt)}</div>
            </div>
            <div className="dialog-footer">
              <button type="button" className="button primary" onClick={() => setDetailTx(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
