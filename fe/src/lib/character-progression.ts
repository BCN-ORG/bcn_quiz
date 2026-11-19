export type CharacterTier = {
  tierId: string;
  minLevel: number;
  maxLevel: number;
  tierTitle: string;
  tierBadge: string;
  description: string;
  assetUrl: string;
};

export const CHARACTER_TIERS: CharacterTier[] = [
  {
    tierId: 'tier-1-beginner',
    minLevel: 1,
    maxLevel: 2,
    tierTitle: 'Tân Thủ Tập Sự',
    tierBadge: 'Giai đoạn I · Khởi đầu',
    description: 'Học tập hôm nay, khai mở tiềm năng phiêu lưu tri thức ✨',
    assetUrl: '/images/characters/character-level-1.png',
  },
  {
    tierId: 'tier-2-skilled',
    minLevel: 3,
    maxLevel: 5,
    tierTitle: 'Chiến Binh Code',
    tierBadge: 'Giai đoạn II · Chiến Binh',
    description: 'Học tập hôm nay, chinh phục đỉnh cao ngày mai ✨',
    assetUrl: '/images/dashboard/hero-character-clean.png',
  },
  {
    tierId: 'tier-3-elite',
    minLevel: 6,
    maxLevel: 9,
    tierTitle: 'Hiệp Sĩ Tinh Anh',
    tierBadge: 'Giai đoạn III · Tinh Anh',
    description: 'Kỹ năng vững vàng, rạng danh bảng vàng Đấu Trường ⚔️',
    assetUrl: '/images/characters/character-level-6.png',
  },
  {
    tierId: 'tier-4-legendary',
    minLevel: 10,
    maxLevel: 999,
    tierTitle: 'Đại Sư Huyền Thoại',
    tierBadge: 'Giai đoạn IV · Huyền Thoại',
    description: 'Bậc thầy tri thức tối thượng, chinh phục mọi giới hạn 👑',
    assetUrl: '/images/characters/character-level-10.png',
  },
];

export function getCharacterProgression(level: number): CharacterTier {
  const safeLevel = Math.max(1, Number(level) || 1);
  const found = CHARACTER_TIERS.find(
    (tier) => safeLevel >= tier.minLevel && safeLevel <= tier.maxLevel,
  );
  return found || CHARACTER_TIERS[CHARACTER_TIERS.length - 1];
}
