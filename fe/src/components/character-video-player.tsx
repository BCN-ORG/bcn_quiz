'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  resolveCharacterVideo,
  type CharacterVideoState,
  type ResolvedCharacterVideo,
} from '@/lib/character-video';

export interface CharacterVideoPlayerProps {
  /**
   * Character avatar level (1-999)
   */
  level: number;
  /**
   * Character video animation state
   */
  state: CharacterVideoState;
  /**
   * Optional callback invoked when a non-looping video finishes playing
   */
  onStateComplete?: (completedState: CharacterVideoState) => void;
  /**
   * Optional CSS class name for container styling
   */
  className?: string;
  /**
   * Optional accessible alt text / title for the character image/video
   */
  alt?: string;
  /**
   * Optional inline styles for the container element
   */
  style?: CSSProperties;
}

/**
 * Resolves source URLs for WebM (VP9/VP8 with alpha transparency) and MP4 fallbacks.
 */
function getVideoSources(videoUrl: string): { webmUrl: string; mp4Url: string } {
  if (videoUrl.endsWith('.mp4')) {
    return {
      webmUrl: videoUrl.replace(/\.mp4$/i, '.webm'),
      mp4Url: videoUrl,
    };
  }
  if (videoUrl.endsWith('.webm')) {
    return {
      webmUrl: videoUrl,
      mp4Url: videoUrl.replace(/\.webm$/i, '.mp4'),
    };
  }
  return {
    webmUrl: `${videoUrl}.webm`,
    mp4Url: `${videoUrl}.mp4`,
  };
}

/**
 * CharacterVideoPlayer
 *
 * An interactive, transparent HTML5 video player and state manager for BCN Arena AI avatars.
 * Supports WebM with alpha channel transparency, MP4 fallback, smooth cross-fading,
 * graceful poster fallback during buffering or on load errors, and automatic state completion hooks.
 */
export function CharacterVideoPlayer({
  level,
  state,
  onStateComplete,
  className = '',
  alt,
  style,
}: CharacterVideoPlayerProps) {
  const asset: ResolvedCharacterVideo = resolveCharacterVideo(level, state);
  const { webmUrl, mp4Url } = getVideoSources(asset.videoUrl);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const failedSourcesCountRef = useRef(0);
  const hasCompletedRef = useRef(false);

  // Browser support detection for HTMLMediaElement
  const [isSupported, setIsSupported] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Check HTML5 video support on client mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const canPlay =
        typeof HTMLMediaElement !== 'undefined' &&
        Boolean(document.createElement('video').canPlayType);
      setIsSupported(canPlay);
    }
  }, []);

  // Reset status flags and completion ref when active video URL or state changes
  useEffect(() => {
    setHasError(false);
    setIsReady(false);
    setIsBuffering(false);
    failedSourcesCountRef.current = 0;
    hasCompletedRef.current = false;
  }, [asset.videoUrl, state]);

  // Ensure video element is properly muted for uninhibited autoplay across modern browsers
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isSupported || hasError) return;

    video.defaultMuted = true;
    video.muted = true;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay policy or interrupted playback handled gracefully via poster fallback
      });
    }
  }, [asset.videoUrl, isSupported, hasError]);

  // Video event handlers
  const handleCanPlay = useCallback(() => {
    setIsBuffering(false);
  }, []);

  const handlePlaying = useCallback(() => {
    setIsReady(true);
    setIsBuffering(false);
    setHasError(false);
  }, []);

  const handleWaiting = useCallback(() => {
    setIsBuffering(true);
  }, []);

  const handleVideoError = useCallback(() => {
    setHasError(true);
    setIsReady(false);
    setIsBuffering(false);
  }, []);

  const handleSourceError = useCallback(() => {
    failedSourcesCountRef.current += 1;
    // If all configured sources (WebM and MP4) fail to load, fall back gracefully to poster
    if (failedSourcesCountRef.current >= 2) {
      setHasError(true);
      setIsReady(false);
      setIsBuffering(false);
    }
  }, []);

  const handleEnded = useCallback(() => {
    if (!asset.loop && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onStateComplete?.(state);
    }
  }, [asset.loop, onStateComplete, state]);

  // Fallback timer for non-looping animations when video fails or is unsupported
  useEffect(() => {
    if (!asset.loop) {
      const duration = asset.durationMs ?? 3500;
      const timer = setTimeout(() => {
        if (!hasCompletedRef.current && (hasError || !isReady || !isSupported)) {
          hasCompletedRef.current = true;
          onStateComplete?.(state);
        }
      }, duration);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [asset.loop, asset.durationMs, hasError, isReady, isSupported, onStateComplete, state]);

  const showVideo = isSupported && !hasError;
  const isVideoVisible = showVideo && isReady && !isBuffering;
  const showPoster = !isVideoVisible;
  const displayTitle = alt || asset.title || `Nhân vật cấp ${level}`;

  return (
    <div
      className={`character-video-player rpg-character-video-container ${className}`.trim()}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'transparent',
        ...style,
      }}
      data-character-level={level}
      data-character-state={state}
      role="img"
      aria-label={displayTitle}
    >
      {/*
        Graceful Poster Image:
        Always remains in document flow to define intrinsic proportions and prevent layout shifts.
        Smoothly visible while buffering, on video load error, or when HTML5 video is unsupported.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.posterUrl}
        alt={displayTitle}
        className="character-video-poster rpg-character-poster"
        style={{
          display: 'block',
          width: 'auto',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          objectPosition: 'bottom center',
          background: 'transparent',
          opacity: showPoster ? 1 : 0,
          transition: 'opacity 0.25s ease-in-out',
          pointerEvents: 'none',
        }}
      />

      {/*
        HTML5 Video Layer:
        Positioned absolute over the poster with object-fit: contain for transparent alpha blending.
        Fades in smoothly once frames are active and playing without flashing.
      */}
      {showVideo && (
        <video
          ref={videoRef}
          key={asset.videoUrl}
          playsInline
          autoPlay
          muted
          loop={asset.loop}
          onCanPlay={handleCanPlay}
          onPlaying={handlePlaying}
          onWaiting={handleWaiting}
          onEnded={handleEnded}
          onError={handleVideoError}
          className="character-video-media rpg-character-video"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            objectPosition: 'bottom center',
            background: 'transparent',
            opacity: isVideoVisible ? 1 : 0,
            transition: 'opacity 0.25s ease-in-out',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
          tabIndex={-1}
        >
          {/* Transparent WebM with VP9 alpha channel */}
          <source src={webmUrl} type='video/webm; codecs="vp9, opus"' onError={handleSourceError} />
          <source src={webmUrl} type="video/webm" onError={handleSourceError} />
          {/* Universal MP4 Fallback */}
          <source src={mp4Url} type="video/mp4" onError={handleSourceError} />
        </video>
      )}
    </div>
  );
}

export default CharacterVideoPlayer;
