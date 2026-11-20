export type CharacterTier = {
  tierId: string;
  minLevel: number;
  maxLevel: number;
  tierTitle: string;
  tierBadge: string;
  frameName: string;
  nameplateName: string;
  lore: string;
  milestoneCoins: number;
  accentColor: string;
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
    frameName: 'Vòng Lá Khởi Nguyên',
    nameplateName: 'Bảng Tên Tân Thủ',
    lore: 'Mang theo tấm bản đồ đầu tiên và gậy gỗ, bước chân vào vương quốc tri thức BCN Arena.',
    milestoneCoins: 0,
    accentColor: '#84cc16',
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
    frameName: 'Khung Ngọc Lục Bảo',
    nameplateName: 'Bảng Tên Ngọc Lục Bảo',
    lore: 'Khoác lên giáp thép lục bảo, tay nắm kiếm rune và ma pháp thư để chinh phục các thử thách.',
    milestoneCoins: 5,
    accentColor: '#10b981',
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
    frameName: 'Huy Hiệu Lam Tinh Tú',
    nameplateName: 'Bảng Tên Lam Tinh Tú',
    lore: 'Chiến giáp sư tử lam-bạc cùng đại kiếm tinh thể, bảo vệ pháo đài giữa đêm cực quang.',
    milestoneCoins: 10,
    accentColor: '#38bdf8',
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
    frameName: 'Vương Miện Hoàng Kim Long',
    nameplateName: 'Bảng Tên Hoàng Kim Long',
    lore: 'Giáp rồng hoàng kim-hắc diện thạch và vòng tròn cổ ngữ, thống lĩnh Thánh Điện Thiên Giới.',
    milestoneCoins: 15,
    accentColor: '#facc15',
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
    frameName: 'Quỹ Đạo Tinh Vân',
    nameplateName: 'Bảng Tên Tinh Vân',
    lore: 'Chỉ huy hạm đội tinh tú với đôi cánh pha lê và trường thương ngân hà giữa vũ trụ bao la.',
    milestoneCoins: 25,
    accentColor: '#c084fc',
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
    frameName: 'Ấn Ký Hư Không',
    nameplateName: 'Bảng Tên Hư Không',
    lore: 'Triệu hồi tám thanh rune kiếm lơ lửng giữa nhật thực đỏ thẫm, làm chủ quy luật không-thời gian.',
    milestoneCoins: 40,
    accentColor: '#f43f5e',
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
    frameName: 'Thánh Quang Thiên Sứ',
    nameplateName: 'Bảng Tên Thiên Giới',
    lore: 'Đôi cánh pha lê ngũ sắc và vầng hào quang vĩnh hằng tại đỉnh cao tối thượng của BCN Arena.',
    milestoneCoins: 70,
    accentColor: '#fde047',
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

export function getNextCharacterTier(level: number): CharacterTier | null {
  const current = getCharacterProgression(level);
  const idx = CHARACTER_TIERS.findIndex((t) => t.tierId === current.tierId);
  if (idx < 0 || idx >= CHARACTER_TIERS.length - 1) return null;
  return CHARACTER_TIERS[idx + 1];
}

export function getCharacterTierById(tierId: string | null | undefined): CharacterTier | null {
  if (!tierId) return null;
  return CHARACTER_TIERS.find((t) => t.tierId === tierId) ?? null;
}

export const TRANSMOG_STORAGE_KEY = 'bcn_arena_transmog_tier';
export const TRANSMOG_EVENT = 'bcn-transmog-change';

export function getEquippedTransmogTier(actualLevel: number): CharacterTier | null {
  if (typeof window === 'undefined') return null;
  const savedId = window.localStorage.getItem(TRANSMOG_STORAGE_KEY);
  const tier = getCharacterTierById(savedId);
  if (!tier) return null;
  return actualLevel >= tier.minLevel ? tier : null;
}

export function setEquippedTransmogTier(tierId: string | null): void {
  if (typeof window === 'undefined') return;
  if (tierId) {
    window.localStorage.setItem(TRANSMOG_STORAGE_KEY, tierId);
  } else {
    window.localStorage.removeItem(TRANSMOG_STORAGE_KEY);
  }
  window.dispatchEvent(new Event(TRANSMOG_EVENT));
}
