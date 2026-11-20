'use client';

import {
  getCharacterProgression,
  getCharacterTierById,
} from '@/lib/character-progression';

export interface AvatarFrameProps {
  name: string;
  avatarUrl?: string | null;
  level?: number;
  tierIdOverride?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLevelBadge?: boolean;
  className?: string;
}

/**
 * Discord-style animated RPG Avatar Frame synchronized with the 7 BCN Arena progression tiers.
 */
export function AvatarFrame({
  name,
  avatarUrl,
  level = 1,
  tierIdOverride,
  size = 'md',
  showLevelBadge = false,
  className = '',
}: AvatarFrameProps) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const tier =
    getCharacterTierById(tierIdOverride) ?? getCharacterProgression(safeLevel);
  const SHOP_VISUAL_LEVEL: Record<string, number> = {
    'shop-blood-moon': 40,
    'shop-cyber-neon': 20,
    'shop-frost-ice': 6,
    'shop-royal-gold': 70,
  };
  const visualLevel = SHOP_VISUAL_LEVEL[tier.tierId] ?? tier.minLevel;
  const initial = (name.trim().charAt(0) || 'B').toUpperCase();

  return (
    <span
      className={`rpg-avatar-frame rpg-avatar-frame--${size} ${className}`.trim()}
      data-tier={tier.tierId}
      title={`${name} · Lv.${safeLevel} (${tier.frameName})`}
    >
      {/* Animated Outer Frame Decoration (Discord-style SVG overlay) */}
      <span className="rpg-avatar-frame-aura" aria-hidden="true" />
      <svg
        className="rpg-avatar-frame-svg"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        {/* Base Outer Ring */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          className="rpg-frame-ring-outer"
        />
        {/* Rotating Dashed Rune Ring (Tier 2+) */}
        {visualLevel >= 3 ? (
          <circle
            cx="50"
            cy="50"
            r="41.5"
            fill="none"
            className="rpg-frame-ring-runes"
          />
        ) : null}

        {/* Tier 4+: Top Crown / Gem Crest */}
        {visualLevel >= 10 ? (
          <g className="rpg-frame-crest">
            <path
              d="M50 0.5 L55.5 7.5 L50 13.5 L44.5 7.5 Z"
              className="rpg-frame-gem"
            />
            <path
              d="M34 5.5 C37 4, 41 6.5, 42 10.5 C38 11, 35 8.5, 34 5.5 Z"
              className="rpg-frame-wing"
            />
            <path
              d="M66 5.5 C63 4, 59 6.5, 58 10.5 C62 11, 65 8.5, 66 5.5 Z"
              className="rpg-frame-wing"
            />
          </g>
        ) : null}

        {/* Tier 5+: Orbiting Astral Star Nodes */}
        {visualLevel >= 20 ? (
          <g className="rpg-frame-orbit">
            <circle cx="6.5" cy="50" r="3" className="rpg-frame-node" />
            <circle cx="93.5" cy="50" r="3" className="rpg-frame-node" />
          </g>
        ) : null}

        {/* Tier 6+: Void Archon Side Fins */}
        {visualLevel >= 40 ? (
          <g className="rpg-frame-blades">
            <path
              d="M2.5 34 C7 36, 10 40, 9 46 C5.5 44, 3 40, 2.5 34 Z"
              className="rpg-frame-blade"
            />
            <path
              d="M97.5 34 C93 36, 90 40, 91 46 C94.5 44, 97 40, 97.5 34 Z"
              className="rpg-frame-blade"
            />
            <path
              d="M3.5 66 C7.5 64, 10.5 60, 9.5 54 C6 56, 4 60, 3.5 66 Z"
              className="rpg-frame-blade"
            />
            <path
              d="M96.5 66 C92.5 64, 89.5 60, 90.5 54 C94 56, 96 60, 96.5 66 Z"
              className="rpg-frame-blade"
            />
          </g>
        ) : null}

        {/* Tier 7+: Celestial Seraphic Wings */}
        {visualLevel >= 70 ? (
          <g className="rpg-frame-seraph-wings">
            <path
              d="M3 29 C11 20, 19 25, 21 37 C14 35, 8 33, 3 29 Z"
              className="rpg-frame-seraph-wing"
            />
            <path
              d="M97 29 C89 20, 81 25, 79 37 C86 35, 92 33, 97 29 Z"
              className="rpg-frame-seraph-wing"
            />
          </g>
        ) : null}
      </svg>

      {/* Core Avatar Circle */}
      <span className="rpg-avatar-frame-inner">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="rpg-avatar-frame-img" />
        ) : (
          <span className="rpg-avatar-frame-initial">{initial}</span>
        )}
      </span>

      {showLevelBadge ? (
        <span className="rpg-avatar-level-pill" aria-label={`Cấp ${safeLevel}`}>
          Lv.{safeLevel}
        </span>
      ) : null}
    </span>
  );
}
