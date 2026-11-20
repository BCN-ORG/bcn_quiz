'use client';

import type { ReactNode } from 'react';
import {
  getCharacterProgression,
  getCharacterTierById,
} from '@/lib/character-progression';

export interface NameplateProps {
  name: string;
  level?: number;
  tierIdOverride?: string | null;
  showTitleBadge?: boolean;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Discord-style Animated Nameplate matching the 7 BCN Arena character/banner tiers.
 */
export function Nameplate({
  name,
  level = 1,
  tierIdOverride,
  showTitleBadge = false,
  compact = false,
  className = '',
  children,
}: NameplateProps) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const tier =
    getCharacterTierById(tierIdOverride) ?? getCharacterProgression(safeLevel);

  return (
    <span
      className={`rpg-nameplate ${compact ? 'rpg-nameplate--compact' : ''} ${className}`.trim()}
      data-tier={tier.tierId}
      style={{ backgroundImage: `url('${tier.bannerBgUrl}')` }}
      title={`${name} · ${tier.tierTitle} (${tier.nameplateName})`}
    >
      <span className="rpg-nameplate-scrim" aria-hidden="true" />
      <span className="rpg-nameplate-glint" aria-hidden="true" />
      <span className="rpg-nameplate-content">
        {children ?? <span className="rpg-nameplate-text">{name}</span>}
        {showTitleBadge ? (
          <span className="rpg-nameplate-tier-tag">{tier.tierTitle}</span>
        ) : null}
      </span>
    </span>
  );
}
