export type CharacterTier = {
  tierId: string;
  minLevel: number;
  maxLevel: number;
  tierTitle: string;
  tierBadge: string;
  description: string;
  assetUrl: string;
  bannerBgUrl: string;
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
    bannerBgUrl: '/images/dashboard/hero-bg.jpg',
  },
  {
    tierId: 'tier-2-skilled',
    minLevel: 3,
    maxLevel: 5,
    tierTitle: 'Chiến Binh Code',
    tierBadge: 'Giai đoạn II · Chiến Binh',
    description: 'Học tập hôm nay, chinh phục đỉnh cao ngày mai ✨',
    assetUrl: '/images/characters/character-level-3.png',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-2.jpg',
  },
  {
    tierId: 'tier-3-elite',
    minLevel: 6,
    maxLevel: 9,
    tierTitle: 'Hiệp Sĩ Tinh Anh',
    tierBadge: 'Giai đoạn III · Tinh Anh',
    description: 'Kỹ năng vững vàng, rạng danh bảng vàng Đấu Trường ⚔️',
    assetUrl: '/images/characters/character-level-6.png',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-3.jpg',
  },
  {
    tierId: 'tier-4-legendary',
    minLevel: 10,
    maxLevel: 19,
    tierTitle: 'Đại Sư Huyền Thoại',
    tierBadge: 'Giai đoạn IV · Huyền Thoại',
    description: 'Bậc thầy tri thức tối thượng, chinh phục mọi giới hạn 👑',
    assetUrl: '/images/characters/character-level-10.png',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-4.jpg',
  },
  {
    tierId: 'tier-5-astral',
    minLevel: 20,
    maxLevel: 39,
    tierTitle: 'Thống Soái Tinh Vân',
    tierBadge: 'Giai đoạn V · Tinh Vân',
    description: 'Chỉ huy ánh sao, dẫn lối tri thức vượt mọi tinh cầu 🌌',
    assetUrl: '/images/characters/character-level-20.png',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-5.jpg',
  },
  {
    tierId: 'tier-6-void',
    minLevel: 40,
    maxLevel: 69,
    tierTitle: 'Hiền Triết Hư Không',
    tierBadge: 'Giai đoạn VI · Hư Không',
    description: 'Làm chủ chân lý, phá vỡ ranh giới không gian và thời gian ⚡',
    assetUrl: '/images/characters/character-level-40.png',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-6.jpg',
  },
  {
    tierId: 'tier-7-seraph',
    minLevel: 70,
    maxLevel: 999,
    tierTitle: 'Thần Sứ Thiên Giới',
    tierBadge: 'Giai đoạn VII · Tối Thượng Lv.70–100+',
    description: 'Đỉnh cao vĩnh hằng của BCN Arena — tỏa sáng giữa thánh điện tri thức 🌠',
    assetUrl: '/images/characters/character-level-65.png',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-7.jpg',
  },
];

export function getCharacterProgression(level: number): CharacterTier {
  const safeLevel = Math.max(1, Number(level) || 1);
  const found = CHARACTER_TIERS.find(
    (tier) => safeLevel >= tier.minLevel && safeLevel <= tier.maxLevel,
  );
  return found || CHARACTER_TIERS[CHARACTER_TIERS.length - 1];
}
