'use client';

import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  Coins,
  MagnifyingGlass,
  PaperPlaneTilt,
  Warning,
  X,
} from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { User } from '@/lib/types';
import {
  formatCoinAmount,
  walletApi,
  type WalletTransferResult,
  type WalletUser,
} from '@/lib/wallet';

export interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  currentBalance: number;
  currentUser: User;
  onSuccess: (result: WalletTransferResult) => void;
}

export function TransferModal({
  open,
  onClose,
  currentBalance,
  currentUser,
  onSuccess,
}: TransferModalProps) {
  const [step, setStep] = useState<'FORM' | 'REVIEW' | 'SUCCESS'>('FORM');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WalletUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<WalletUser | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transferResult, setTransferResult] = useState<WalletTransferResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const componentInstanceId = useId();

  // Reset state when modal opens or closes
  useEffect(() => {
    if (open) {
      setStep('FORM');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedRecipient(null);
      setAmountStr('');
      setNote('');
      setError(null);
      setIsSubmitting(false);
      setTransferResult(null);
      // Generate unique idempotency key
      setIdempotencyKey(`tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    }
  }, [open]);

  // Debounced user search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setError(null);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const users = await walletApi.searchUsers(value);
        // Exclude current user from search results
        const filtered = users.filter(
          (u) => u.id !== currentUser.id && u.email?.toLowerCase() !== currentUser.email?.toLowerCase(),
        );
        setSearchResults(filtered);
      } catch (err) {
        console.error('Failed to search users:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const parsedAmount = parseInt(amountStr, 10);
  const isValidInteger = !Number.isNaN(parsedAmount) && Number.isInteger(parsedAmount) && String(parsedAmount) === amountStr.trim();
  const isPositive = isValidInteger && parsedAmount > 0;
  const hasSufficientBalance = isPositive && parsedAmount <= currentBalance;

  const handleMaxAmount = () => {
    setAmountStr(String(Math.max(0, currentBalance)));
    setError(null);
  };

  const handleProceedToReview = () => {
    setError(null);
    if (!selectedRecipient) {
      setError('Vui lòng chọn người nhận Coin.');
      return;
    }
    if (selectedRecipient.discordLinked === false) {
      setError('Người nhận chưa liên kết Discord nên chưa thể nhận Coin.');
      return;
    }
    if (selectedRecipient.id === currentUser.id || selectedRecipient.email === currentUser.email) {
      setError('Bạn không thể tự chuyển Coin cho chính mình.');
      return;
    }
    if (!isValidInteger || !isPositive) {
      setError('Số Coin chuyển phải là một số nguyên dương (> 0).');
      return;
    }
    if (parsedAmount > currentBalance) {
      setError(`Số dư không đủ. Bạn chỉ có ${currentBalance.toLocaleString('vi-VN')} Coin.`);
      return;
    }
    setStep('REVIEW');
  };

  const handleConfirmTransfer = async () => {
    if (!selectedRecipient || !isPositive || parsedAmount > currentBalance || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await walletApi.transfer({
        recipientId: selectedRecipient.id,
        amount: parsedAmount,
        note: note.trim() || undefined,
        idempotencyKey,
      });

      setTransferResult(result);
      setStep('SUCCESS');
      onSuccess(result);
    } catch (err: unknown) {
      console.error('Transfer failed:', err);
      const message = err instanceof Error ? err.message : 'Chuyển Coin thất bại. Vui lòng thử lại sau.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="wallet-transfer-title">
      <div className="dialog dialog-wide wallet-transfer-modal">
        {/* Header */}
        <div className="dialog-header">
          <div className="wallet-modal-header-title">
            <Coins size={22} weight="fill" className="wallet-coin-icon-gold" aria-hidden="true" />
            <h2 id="wallet-transfer-title">
              {step === 'SUCCESS' ? 'Giao dịch thành công' : 'Chuyển BCN Coin'}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button dialog-close-btn"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            disabled={isSubmitting}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="dialog-body wallet-modal-body">
          {error ? (
            <div className="wallet-error-banner" role="alert">
              <Warning size={18} weight="fill" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {step === 'FORM' && (
            <div className="wallet-transfer-form">
              {/* Step 1: Chọn người nhận */}
              <div className="wallet-form-field">
                <label className="wallet-form-label" htmlFor={`recipient-search-${componentInstanceId}`}>
                  Người nhận Coin <span className="wallet-required">*</span>
                </label>

                {selectedRecipient ? (
                  <div className="wallet-selected-recipient-card">
                    <div className="wallet-recipient-avatar">
                      {(selectedRecipient.fullName || selectedRecipient.email || 'U').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="wallet-recipient-details">
                      <strong>{selectedRecipient.fullName || selectedRecipient.username || selectedRecipient.email}</strong>
                      <small>{selectedRecipient.email}</small>
                      {selectedRecipient.username ? (
                        <span className="wallet-recipient-handle">@{selectedRecipient.username}</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="button secondary sm wallet-change-recipient-btn"
                      onClick={() => {
                        setSelectedRecipient(null);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      Thay đổi
                    </button>
                  </div>
                ) : (
                  <div className="wallet-search-wrapper">
                    <div className="wallet-search-input-wrap">
                      <MagnifyingGlass size={16} className="wallet-search-icon" aria-hidden="true" />
                      <input
                        id={`recipient-search-${componentInstanceId}`}
                        type="text"
                        className="wallet-input wallet-search-input"
                        placeholder="Tìm theo username hoặc email học viên..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        autoFocus
                      />
                      {isSearching ? (
                        <ArrowsClockwise size={16} className="wallet-spinner wallet-search-spinner" aria-hidden="true" />
                      ) : null}
                    </div>

                    {searchQuery.trim() && !isSearching && searchResults.length > 0 ? (
                      <ul className="wallet-user-search-dropdown" role="listbox" aria-label="Kết quả tìm kiếm người dùng">
                        {searchResults.map((user) => {
                          const unlinked = user.discordLinked === false;
                          return (
                          <li
                            key={user.id}
                            className={`wallet-user-search-item${unlinked ? ' is-disabled' : ''}`}
                            role="option"
                            aria-selected={false}
                            aria-disabled={unlinked}
                            style={unlinked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                            onClick={() => {
                              if (unlinked) {
                                setError('Người nhận chưa liên kết Discord nên chưa thể nhận Coin.');
                                return;
                              }
                              setSelectedRecipient(user);
                              setSearchQuery('');
                              setSearchResults([]);
                              setError(null);
                            }}
                          >
                            <div className="wallet-user-search-avatar">
                              {(user.fullName || user.email || 'U').slice(0, 1).toUpperCase()}
                            </div>
                            <div className="wallet-user-search-info">
                              <strong>
                                {user.fullName || user.username || user.email}{' '}
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: 999,
                                    marginLeft: 6,
                                    background: unlinked ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                                    color: unlinked ? '#dc2626' : '#16a34a',
                                  }}
                                >
                                  {unlinked ? 'Chưa liên kết Discord' : 'Đã liên kết Discord'}
                                </span>
                              </strong>
                              <small>{user.email}</small>
                            </div>
                            {user.username ? <span className="wallet-badge-pill">@{user.username}</span> : null}
                          </li>
                          );
                        })}
                      </ul>
                    ) : searchQuery.trim() && !isSearching && searchResults.length === 0 ? (
                      <div className="wallet-search-empty-hint">
                        <span>Không tìm thấy người dùng phù hợp với &quot;{searchQuery}&quot;</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Step 2: Nhập số Coin */}
              <div className="wallet-form-field">
                <div className="wallet-field-header-row">
                  <label className="wallet-form-label" htmlFor={`amount-input-${componentInstanceId}`}>
                    Số Coin chuyển <span className="wallet-required">*</span>
                  </label>
                  <span className="wallet-available-balance-hint">
                    Khả dụng: <strong>{currentBalance.toLocaleString('vi-VN')} Coin</strong>
                  </span>
                </div>

                <div className="wallet-amount-input-group">
                  <div className="wallet-amount-coin-prefix">
                    <Coins size={18} weight="fill" className="wallet-coin-icon-gold" aria-hidden="true" />
                  </div>
                  <input
                    id={`amount-input-${componentInstanceId}`}
                    type="number"
                    min="1"
                    max={currentBalance}
                    step="1"
                    className="wallet-input wallet-amount-input"
                    placeholder="Nhập số Coin (ví dụ: 100)"
                    value={amountStr}
                    onChange={(e) => {
                      setAmountStr(e.target.value);
                      setError(null);
                    }}
                  />
                  <button
                    type="button"
                    className="button secondary sm wallet-max-btn"
                    onClick={handleMaxAmount}
                    title="Chuyển toàn bộ số dư"
                  >
                    Tối đa
                  </button>
                </div>

                {amountStr && !isValidInteger ? (
                  <span className="wallet-field-validation-err">Số Coin phải là số nguyên dương.</span>
                ) : amountStr && parsedAmount > currentBalance ? (
                  <span className="wallet-field-validation-err">
                    Vượt quá số dư khả dụng ({currentBalance.toLocaleString('vi-VN')} Coin).
                  </span>
                ) : null}
              </div>

              {/* Step 3: Lời nhắn */}
              <div className="wallet-form-field">
                <label className="wallet-form-label" htmlFor={`note-input-${componentInstanceId}`}>
                  Lời nhắn giao dịch <span className="wallet-optional">(tùy chọn)</span>
                </label>
                <textarea
                  id={`note-input-${componentInstanceId}`}
                  className="wallet-textarea"
                  placeholder="Nhập lời nhắn gửi kèm (ví dụ: Tặng bạn học bài chăm chỉ)..."
                  rows={2}
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 'REVIEW' && selectedRecipient && (
            <div className="wallet-transfer-review">
              <div className="wallet-review-summary-card">
                <div className="wallet-review-row">
                  <span className="wallet-review-label">Người gửi</span>
                  <div className="wallet-review-val">
                    <strong>{currentUser.fullName || currentUser.email}</strong>
                    <small>{currentUser.email}</small>
                  </div>
                </div>

                <div className="wallet-review-divider" />

                <div className="wallet-review-row">
                  <span className="wallet-review-label">Người nhận</span>
                  <div className="wallet-review-val">
                    <strong>{selectedRecipient.fullName || selectedRecipient.username || selectedRecipient.email}</strong>
                    <small>{selectedRecipient.email}</small>
                  </div>
                </div>

                <div className="wallet-review-divider" />

                <div className="wallet-review-row highlight-amount">
                  <span className="wallet-review-label">Số Coin chuyển</span>
                  <div className="wallet-review-val wallet-amount-tag">
                    <Coins size={20} weight="fill" className="wallet-coin-icon-gold" aria-hidden="true" />
                    <strong>{formatCoinAmount(parsedAmount)} Coin</strong>
                  </div>
                </div>

                {note.trim() ? (
                  <>
                    <div className="wallet-review-divider" />
                    <div className="wallet-review-row">
                      <span className="wallet-review-label">Lời nhắn</span>
                      <div className="wallet-review-val">
                        <em>&quot;{note.trim()}&quot;</em>
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="wallet-review-divider" />

                <div className="wallet-review-row">
                  <span className="wallet-review-label">Số dư sau chuyển</span>
                  <div className="wallet-review-val">
                    <strong className="wallet-balance-after">
                      {(currentBalance - parsedAmount).toLocaleString('vi-VN')} Coin
                    </strong>
                  </div>
                </div>
              </div>

              <div className="wallet-review-alert">
                <Warning size={16} weight="fill" aria-hidden="true" />
                <span>Vui lòng kiểm tra kỹ người nhận và số Coin. Giao dịch sẽ được trừ ngay lập tức.</span>
              </div>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div className="wallet-transfer-success">
              <div className="wallet-success-icon-wrap">
                <CheckCircle size={56} weight="fill" className="wallet-success-icon" aria-hidden="true" />
              </div>
              <h3 className="wallet-success-title">Chuyển Coin thành công!</h3>
              <p className="wallet-success-desc">
                Bạn đã chuyển thành công{' '}
                <strong>{formatCoinAmount(parsedAmount)} Coin</strong> tới{' '}
                <strong>{selectedRecipient?.fullName || selectedRecipient?.email}</strong>.
              </p>

              {transferResult?.referenceCode ? (
                <div className="wallet-success-ref-box">
                  <span>Mã tham chiếu giao dịch:</span>
                  <code className="wallet-ref-code">{transferResult.referenceCode}</code>
                </div>
              ) : null}

              <div className="wallet-success-balance-box">
                <span>Số dư mới của bạn:</span>
                <strong className="wallet-balance-highlight">
                  {typeof transferResult?.balance === 'number'
                    ? transferResult.balance.toLocaleString('vi-VN')
                    : (currentBalance - parsedAmount).toLocaleString('vi-VN')}{' '}
                  Coin
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="dialog-footer wallet-modal-footer">
          {step === 'FORM' && (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={onClose}
              >
                Hủy
              </button>
              <button
                type="button"
                className="button primary"
                onClick={handleProceedToReview}
                disabled={!selectedRecipient || !isPositive || !hasSufficientBalance}
              >
                Tiếp tục <ArrowRight size={16} aria-hidden="true" />
              </button>
            </>
          )}

          {step === 'REVIEW' && (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep('FORM')}
                disabled={isSubmitting}
              >
                <ArrowLeft size={16} aria-hidden="true" /> Quay lại
              </button>
              <button
                type="button"
                className="button primary"
                onClick={handleConfirmTransfer}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <ArrowsClockwise size={16} className="wallet-spinner" aria-hidden="true" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <PaperPlaneTilt size={16} weight="fill" aria-hidden="true" />
                    <span>Xác nhận chuyển</span>
                  </>
                )}
              </button>
            </>
          )}

          {step === 'SUCCESS' && (
            <button
              type="button"
              className="button primary"
              onClick={onClose}
            >
              Đã hiểu & Hoàn tất
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
