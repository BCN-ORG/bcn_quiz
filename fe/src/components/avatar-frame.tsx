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
  const visualLevel = tier.minLevel;
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
            <polygon points="50,1 55,9 50,14 45,9" className="rpg-frame-gem" />
            <polygon points="36,4 40,10 35,12" className="rpg-frame-wing" />
            <polygon points="64,4 60,10 65,12" className="rpg-frame-wing" />
          </g>
        ) : null}

        {/* Tier 5+: Orbiting Astral Star Nodes */}
        {visualLevel >= 20 ? (
          <g className="rpg-frame-orbit">
            <circle cx="8" cy="50" r="3.2" className="rpg-frame-node" />
            <circle cx="92" cy="50" r="3.2" className="rpg-frame-node" />
          </g>
        ) : null}

        {/* Tier 6+: Void Archon Side Blades */}
        {visualLevel >= 40 ? (
          <g className="rpg-frame-blades">
            <polygon points="2,34 11,40 8,47 2,42" className="rpg-frame-blade" />
            <polygon points="98,34 89,40 92,47 98,42" className="rpg-frame-blade" />
            <polygon points="4,66 12,60 10,53 3,58" className="rpg-frame-blade" />
            <polygon points="96,66 88,60 90,53 97,58" className="rpg-frame-blade" />
          </g>
        ) : null}

        {/* Tier 7+: Celestial Seraphic Wings */}
        {visualLevel >= 70 ? (
          <g className="rpg-frame-seraph-wings">
            <path d="M4,28 Q16,22 20,38 Q12,35 4,28 Z" className="rpg-frame-seraph-wing" />
            <path d="M96,28 Q84,22 80,38 Q88,35 96,28 Z" className="rpg-frame-seraph-wing" />
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
