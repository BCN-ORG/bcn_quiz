'use client';

import type { ReactNode } from 'react';
import {
  getCharacterProgression,
  getCharacterTierById,
  getPinBadgeById,
} from '@/lib/character-progression';

export interface NameplateProps {
  name: string;
  level?: number;
  tierIdOverride?: string | null;
  pinnedBadges?: string[];
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
  pinnedBadges,
  showTitleBadge = false,
  compact = false,
  className = '',
  children,
}: NameplateProps) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const tier =
    getCharacterTierById(tierIdOverride) ?? getCharacterProgression(safeLevel);
  const visiblePins = (pinnedBadges ?? [])
    .slice(0, 3)
    .map((id) => getPinBadgeById(id))
    .filter((b): b is NonNullable<typeof b> => b !== null);

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
        {visiblePins.length > 0 ? (
          <span className="rpg-nameplate-pins" aria-label="Huy hiệu ghim">
            {visiblePins.map((pin) => (
              <span
                key={pin.id}
                className="rpg-nameplate-pin-dot"
                title={pin.label}
                aria-label={pin.label}
              >
                {pin.icon}
              </span>
            ))}
          </span>
        ) : null}
        {showTitleBadge ? (
          <span className="rpg-nameplate-tier-tag">{tier.tierTitle}</span>
        ) : null}
      </span>
    </span>
  );
}
