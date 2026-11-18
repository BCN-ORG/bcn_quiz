'use client';

import {
  ArrowClockwise,
  ArrowsIn,
  ArrowsOut,
  ImageBroken,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  X,
} from '@phosphor-icons/react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';

export interface QuizImageProps {
  /** Source URL of the image */
  src?: string | null;
  /** High-resolution image URL for the lightbox, defaults to src */
  previewSrc?: string | null;
  /** Accessible description of the image */
  alt?: string;
  /** Optional caption rendered beneath the image */
  caption?: string | null;
  /** Maximum display height in inline mode (default: 420) */
  maxHeight?: number | string;
  /** Whether the image can be clicked to open lightbox (default: true) */
  zoomable?: boolean;
  /** Custom container class */
  className?: string;
  /** Custom inline style */
  style?: CSSProperties;
  /** Optional callback fired when image finishes loading */
  onLoad?: () => void;
  /** Optional callback fired when image fails to load */
  onError?: () => void;
}

export function QuizImage({
  src,
  previewSrc,
  alt = 'Minh họa câu hỏi',
  caption,
  maxHeight = 420,
  zoomable = true,
  className = '',
  style,
  onLoad,
  onError,
}: QuizImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  // References for drag calculations without unnecessary re-renders
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const lightboxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset status if src or reloadKey changes
  useEffect(() => {
    if (!src) {
      setStatus('error');
      return;
    }
    setStatus('loading');
  }, [src, reloadKey]);

  // Handle escape and keyboard controls in lightbox
  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomIn();
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomOut();
      } else if (event.key === '0') {
        event.preventDefault();
        resetZoom();
      } else if (zoom > 1) {
        const step = 40;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setPan((prev) => ({ ...prev, x: prev.x + step }));
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          setPan((prev) => ({ ...prev, x: prev.x - step }));
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setPan((prev) => ({ ...prev, y: prev.y + step }));
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          setPan((prev) => ({ ...prev, y: prev.y - step }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [lightboxOpen, zoom]);

  const handleImageLoad = () => {
    setStatus('loaded');
    onLoad?.();
  };

  const handleImageError = () => {
    setStatus('error');
    onError?.();
  };

  const handleRetry = () => {
    setStatus('loading');
    setReloadKey((prev) => prev + 1);
  };

  const openLightbox = () => {
    if (!zoomable || status !== 'loaded') return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    triggerButtonRef.current?.focus();
  };

  const zoomIn = () => {
    setZoom((prev) => Math.min(Number((prev + 0.5).toFixed(1)), 4));
  };

  const zoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(Number((prev - 0.5).toFixed(1)), 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const toggleZoom = () => {
    if (zoom === 1) {
      setZoom(2);
    } else {
      resetZoom();
    }
  };

  // Pointer drag for panning when zoomed in
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || zoom <= 1) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      hasDraggedRef.current = true;
    }
    setPan({
      x: panStartRef.current.x + deltaX,
      y: panStartRef.current.y + deltaY,
    });
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if already released
    }
  };

  const handleImageClickInLightbox = () => {
    // If the user performed a drag movement, do not toggle zoom
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    toggleZoom();
  };

  const resolvedMaxHeight = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;
  const effectiveSrc = src ? (reloadKey > 0 ? `${src}${src.includes('?') ? '&' : '?'}retry=${reloadKey}` : src) : '';
  const highResSrc = previewSrc || effectiveSrc;

  if (!src) {
    return null;
  }

  return (
    <figure
      className={`quiz-image-frame ${className}`.trim()}
      style={{
        ...style,
      }}
    >
      <div
        className={`quiz-image-container ${status === 'loaded' && zoomable ? 'is-zoomable' : ''}`}
        style={{ maxHeight: resolvedMaxHeight }}
      >
        {status === 'loading' && (
          <div className="quiz-image-skeleton" aria-label="Đang tải hình ảnh" role="status">
            <div className="quiz-image-skeleton-shimmer" />
            <div className="quiz-image-skeleton-content">
              <span className="quiz-image-spinner" />
              <span className="quiz-image-skeleton-text">Đang tải hình ảnh…</span>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="quiz-image-error" role="alert">
            <ImageBroken size={36} weight="duotone" className="quiz-image-error-icon" aria-hidden="true" />
            <div className="quiz-image-error-details">
              <strong>Không thể tải hình ảnh</strong>
              <p>Liên kết hình ảnh bị lỗi hoặc không còn khả dụng.</p>
            </div>
            <button
              type="button"
              className="quiz-image-retry-btn"
              onClick={handleRetry}
              aria-label="Thử tải lại hình ảnh"
            >
              <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* Real image element */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={effectiveSrc}
          alt={alt}
          onLoad={handleImageLoad}
          onError={handleImageError}
          className={`quiz-image-element ${status === 'loaded' ? 'is-visible' : 'is-hidden'}`}
          style={{
            maxHeight: resolvedMaxHeight,
          }}
          loading="lazy"
        />

        {/* Hover / tap zoom button trigger */}
        {status === 'loaded' && zoomable && (
          <button
            ref={triggerButtonRef}
            type="button"
            className="quiz-image-zoom-trigger"
            onClick={openLightbox}
            aria-label="Phóng to ảnh (Xem kích thước lớn)"
            title="Nhấn để phóng to ảnh"
          >
            <MagnifyingGlassPlus size={18} weight="bold" aria-hidden="true" />
            <span className="quiz-image-zoom-text">Phóng to</span>
          </button>
        )}
      </div>

      {caption && <figcaption className="quiz-image-caption">{caption}</figcaption>}

      {/* Lightbox Dialog via React Portal */}
      {mounted && lightboxOpen && createPortal(
        <div
          ref={lightboxRef}
          className="quiz-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={alt || 'Xem chi tiết hình ảnh'}
          onClick={(e) => {
            // Close when clicking directly on overlay backdrop
            if (e.target === e.currentTarget) {
              closeLightbox();
            }
          }}
        >
          {/* Top Bar with title & close button */}
          <div className="quiz-lightbox-topbar">
            <div className="quiz-lightbox-title">
              <span className="quiz-lightbox-alt">{alt}</span>
              {caption && <span className="quiz-lightbox-subcaption">{caption}</span>}
            </div>

            <button
              type="button"
              className="quiz-lightbox-close-btn"
              onClick={closeLightbox}
              aria-label="Đóng (Esc)"
              title="Đóng (Esc)"
            >
              <X size={22} weight="bold" aria-hidden="true" />
            </button>
          </div>

          {/* Interactive Zoom Stage / Canvas */}
          <div
            className={`quiz-lightbox-stage ${isDragging ? 'is-dragging' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                closeLightbox();
              }
            }}
          >
            <div
              className="quiz-lightbox-canvas"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
              }}
              onClick={handleImageClickInLightbox}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={highResSrc}
                alt={alt}
                className="quiz-lightbox-image"
                draggable={false}
              />
            </div>
          </div>

          {/* Floating Bottom Controls Toolbar */}
          <div className="quiz-lightbox-toolbar-container" onClick={(e) => e.stopPropagation()}>
            <div className="quiz-lightbox-toolbar" role="toolbar" aria-label="Công cụ xem ảnh">
              <button
                type="button"
                className="quiz-lightbox-tool-btn"
                onClick={zoomOut}
                disabled={zoom <= 1}
                aria-label="Thu nhỏ (-)"
                title="Thu nhỏ (-)"
              >
                <MagnifyingGlassMinus size={18} weight="bold" aria-hidden="true" />
              </button>

              <span className="quiz-lightbox-zoom-level" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>

              <button
                type="button"
                className="quiz-lightbox-tool-btn"
                onClick={zoomIn}
                disabled={zoom >= 4}
                aria-label="Phóng to (+)"
                title="Phóng to (+)"
              >
                <MagnifyingGlassPlus size={18} weight="bold" aria-hidden="true" />
              </button>

              <div className="quiz-lightbox-tool-divider" aria-hidden="true" />

              <button
                type="button"
                className="quiz-lightbox-tool-btn"
                onClick={resetZoom}
                aria-label="Vừa màn hình (0)"
                title="Vừa màn hình (0)"
              >
                {zoom > 1 ? (
                  <ArrowsIn size={18} weight="bold" aria-hidden="true" />
                ) : (
                  <ArrowsOut size={18} weight="bold" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </figure>
  );
}

export default QuizImage;
