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
  priceCoins?: number;
  isShop?: boolean;
  accentColor: string;
  description: string;
  assetUrl: string;
  bannerBgUrl: string;
};

export type PinBadgeMeta = {
  id: string;
  label: string;
  icon: string;
  color: string;
  desc: string;
};

export const PIN_BADGES: PinBadgeMeta[] = [
  {
    id: 'arena-veteran',
    label: 'Chiến Binh',
    icon: '⚔️',
    color: '#10b981',
    desc: 'Đạt từ Cấp 3 trở lên tại BCN Arena',
  },
  {
    id: 'tower-conqueror',
    label: 'Chinh Phục Tháp',
    icon: '🏰',
    color: '#38bdf8',
    desc: 'Vượt qua ít nhất Tầng 10 Tháp Kiến Thức',
  },
  {
    id: 'boss-slayer',
    label: 'Sát Thủ Boss',
    icon: '🔥',
    color: '#f43f5e',
    desc: 'Đạt tối thiểu 5 sát thương trong 1 trận Boss',
  },
  {
    id: 'streak-7',
    label: 'Bất Diệt',
    icon: '⚡',
    color: '#f59e0b',
    desc: 'Đạt Combo Boss x5+ hoặc Cấp 6+',
  },
  {
    id: 'quiz-master',
    label: 'Học Bá Quiz',
    icon: '📘',
    color: '#818cf8',
    desc: 'Hoàn thành từ 10 lượt Quiz trở lên hoặc có Chứng nhận',
  },
  {
    id: 'top-weekly',
    label: 'Tinh Anh',
    icon: '👑',
    color: '#facc15',
    desc: 'Đạt Cấp 10+ hoặc sở hữu Chứng nhận chính thức',
  },
];

export function getPinBadgeById(id: string): PinBadgeMeta | null {
  return PIN_BADGES.find((b) => b.id === id) ?? null;
}

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

export const SHOP_COSMETICS: CharacterTier[] = [
  {
    tierId: 'shop-blood-moon',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Huyết Nguyệt Ma Tôn',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Vòng Huyết Nguyệt',
    nameplateName: 'Bảng Tên Huyết Nguyệt',
    lore: 'Ánh trăng đỏ thẫm nhuộm rực chiến bào, toát lên uy áp của kẻ thống trị màn đêm.',
    milestoneCoins: 0,
    priceCoins: 150,
    isShop: true,
    accentColor: '#e11d48',
    description: 'Trang bị Huyết Nguyệt rực cháy — mở khóa bằng Coin 🩸',
    assetUrl: '/images/characters/shop-blood-moon.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-blood-moon.jpg',
  },
  {
    tierId: 'shop-crimson-dragon',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Long Hồn Xích Hỏa',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Vòng Long Hồn',
    nameplateName: 'Bảng Tên Long Hồn',
    lore: 'Giáp vảy rồng dung nham cùng đôi cánh hỏa diễm bùng cháy giữa miệng núi lửa.',
    milestoneCoins: 0,
    priceCoins: 250,
    isShop: true,
    accentColor: '#f97316',
    description: 'Chiến binh Long Hồn rực lửa — mở khóa bằng Coin 🔥',
    assetUrl: '/images/characters/shop-crimson-dragon.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-crimson-dragon.jpg',
  },
  {
    tierId: 'shop-cyber-neon',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Cyber Neon Đấu Sĩ',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Khung Cyber Neon',
    nameplateName: 'Bảng Tên Cyber Neon',
    lore: 'Mạch năng lượng neon xanh tím chạy dọc không gian số, bứt tốc mọi giới hạn.',
    milestoneCoins: 0,
    priceCoins: 300,
    isShop: true,
    accentColor: '#06b6d4',
    description: 'Trang bị Cyber Neon tương lai — mở khóa bằng Coin ⚡',
    assetUrl: '/images/characters/shop-cyber-neon.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-cyber-neon.jpg',
  },
  {
    tierId: 'shop-astral-spirit',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Tinh Linh Ngân Hà',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Vòng Chòm Sao',
    nameplateName: 'Bảng Tên Tinh Linh',
    lore: 'Hiền giả tinh linh kết nối vòng sao ngọc lục bảo giữa khu rừng linh khí.',
    milestoneCoins: 0,
    priceCoins: 400,
    isShop: true,
    accentColor: '#10b981',
    description: 'Tinh Linh Ngân Hà huyền bí — mở khóa bằng Coin ✨',
    assetUrl: '/images/characters/shop-astral-spirit.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-astral-spirit.jpg',
  },
  {
    tierId: 'shop-frost-ice',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Băng Giá Vĩnh Cửu',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Khung Băng Tinh Thể',
    nameplateName: 'Bảng Tên Băng Giá',
    lore: 'Tinh thể băng lam bất diệt bao bọc hào quang lạnh lẽo mà sắc bén tuyệt đối.',
    milestoneCoins: 0,
    priceCoins: 500,
    isShop: true,
    accentColor: '#38bdf8',
    description: 'Trang bị Băng Giá vĩnh cửu — mở khóa bằng Coin ❄️',
    assetUrl: '/images/characters/shop-frost-ice.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-frost-ice.jpg',
  },
  {
    tierId: 'shop-shadow-assassin',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Ảnh Sát Bóng Đêm',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Ấn Ký Ảnh Sát',
    nameplateName: 'Bảng Tên Ảnh Sát',
    lore: 'Thích khách bóng đêm ẩn mình trong màn sương tím, tung song đao hư ảnh.',
    milestoneCoins: 0,
    priceCoins: 650,
    isShop: true,
    accentColor: '#8b5cf6',
    description: 'Ảnh Sát Bóng Đêm thoắt ẩn thoắt hiện — mở khóa bằng Coin 🗡️',
    assetUrl: '/images/characters/shop-shadow-assassin.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-shadow-assassin.jpg',
  },
  {
    tierId: 'shop-mecha-titan',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Cơ Khí Thiết Giáp',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Khung Lõi Năng Lượng',
    nameplateName: 'Bảng Tên Thiết Giáp',
    lore: 'Bộ giáp cơ khí hạng nặng với lõi phản ứng hổ phách và khiên năng lượng bất khả xâm phạm.',
    milestoneCoins: 0,
    priceCoins: 800,
    isShop: true,
    accentColor: '#f59e0b',
    description: 'Cơ Khí Thiết Giáp tối tân — mở khóa bằng Coin 🛡️',
    assetUrl: '/images/characters/shop-mecha-titan.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-mecha-titan.jpg',
  },
  {
    tierId: 'shop-royal-gold',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Hoàng Kim Độc Quyền',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Thánh Quang Hoàng Kim',
    nameplateName: 'Bảng Tên Hoàng Kim',
    lore: 'Phiên bản giáp hoàng kim tối thượng chỉ dành cho những nhà vô địch sở hữu kho báu Coin.',
    milestoneCoins: 0,
    priceCoins: 1000,
    isShop: true,
    accentColor: '#facc15',
    description: 'Trang bị Hoàng Kim Độc Quyền — mở khóa bằng Coin 👑',
    assetUrl: '/images/characters/shop-royal-gold.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-royal-gold.jpg',
  },
  {
    tierId: 'shop-obsidian-reaper',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Tử Thần Hắc Diện',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Lưỡi Hái Hắc Diện',
    nameplateName: 'Bảng Tên Tử Thần',
    lore: 'Vung lưỡi hái hắc diện giữa màn đêm đỏ thẫm, thu phục mọi thử thách bằng uy áp tuyệt đối.',
    milestoneCoins: 0,
    priceCoins: 200,
    isShop: true,
    accentColor: '#f43f5e',
    description: 'Tử Thần Hắc Diện cực ngầu — mở khóa bằng Coin 💀',
    assetUrl: '/images/characters/shop-obsidian-reaper.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-obsidian-reaper.jpg',
  },
  {
    tierId: 'shop-sakura-ronin',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Lãng Khách Hoa Anh Đào',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Vòng Cánh Anh Đào',
    nameplateName: 'Bảng Tên Lãng Khách',
    lore: 'Kiếm sĩ lãng du dưới cơn mưa hoa anh đào ánh trăng, mỗi đường kiếm là một nét nghệ thuật.',
    milestoneCoins: 0,
    priceCoins: 250,
    isShop: true,
    accentColor: '#f472b6',
    description: 'Lãng Khách Hoa Anh Đào thanh tao — mở khóa bằng Coin 🌸',
    assetUrl: '/images/characters/shop-sakura-ronin.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-sakura-ronin.jpg',
  },
  {
    tierId: 'shop-storm-valkyrie',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Nữ Thần Sấm Sét',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Đôi Cánh Lôi Điện',
    nameplateName: 'Bảng Tên Lôi Thần',
    lore: 'Triệu hồi tia sét lam rực sáng bầu trời bão tố, bứt phá tốc độ trong mọi đấu trường.',
    milestoneCoins: 0,
    priceCoins: 350,
    isShop: true,
    accentColor: '#38bdf8',
    description: 'Nữ Thần Sấm Sét uy lực — mở khóa bằng Coin ⚡',
    assetUrl: '/images/characters/shop-storm-valkyrie.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-storm-valkyrie.jpg',
  },
  {
    tierId: 'shop-abyssal-leviathan',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Thủy Thần Biển Sâu',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Đinh Ba Đại Dương',
    nameplateName: 'Bảng Tên Biển Sâu',
    lore: 'Chủ nhân vực thẳm phát quang với cây đinh ba thủy tinh xanh ngọc và sóng dữ vĩnh cửu.',
    milestoneCoins: 0,
    priceCoins: 450,
    isShop: true,
    accentColor: '#2dd4bf',
    description: 'Thủy Thần Biển Sâu huyền bí — mở khóa bằng Coin 🔱',
    assetUrl: '/images/characters/shop-abyssal-leviathan.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-abyssal-leviathan.jpg',
  },
  {
    tierId: 'shop-phoenix-sovereign',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Phượng Hoàng Bất Tử',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Hào Quang Phượng Hoàng',
    nameplateName: 'Bảng Tên Phượng Hoàng',
    lore: 'Đôi cánh lửa thiêng tái sinh từ tro tàn, rực sáng ánh dương cam đỏ bất diệt.',
    milestoneCoins: 0,
    priceCoins: 550,
    isShop: true,
    accentColor: '#fb923c',
    description: 'Phượng Hoàng Bất Tử rực cháy — mở khóa bằng Coin 🔥',
    assetUrl: '/images/characters/shop-crimson-dragon.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-phoenix-sovereign.jpg',
  },
  {
    tierId: 'shop-phantom-samurai',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Võ Sĩ Đạo U Linh',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Mặt Nạ Quỷ U Linh',
    nameplateName: 'Bảng Tên U Linh',
    lore: 'Chiến binh mặt nạ quỷ kết hợp linh khí ngọc lục bảo và màn sương tím hư ảo.',
    milestoneCoins: 0,
    priceCoins: 600,
    isShop: true,
    accentColor: '#34d399',
    description: 'Võ Sĩ Đạo U Linh ma mị — mở khóa bằng Coin 👹',
    assetUrl: '/images/characters/character-level-40.png',
    bannerBgUrl: '/images/dashboard/tower-challenge.jpg',
  },
  {
    tierId: 'shop-celestial-archon',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Chấp Chính Thiên Tinh',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Tinh Bàn Thiên Thể',
    nameplateName: 'Bảng Tên Thiên Tinh',
    lore: 'Xoay chuyển vòng tinh bàn vàng tím giữa ngân hà cổ đại, nắm giữ tri thức các vì sao.',
    milestoneCoins: 0,
    priceCoins: 750,
    isShop: true,
    accentColor: '#a78bfa',
    description: 'Chấp Chính Thiên Tinh tối thượng — mở khóa bằng Coin 🪐',
    assetUrl: '/images/characters/shop-astral-spirit.jpg',
    bannerBgUrl: '/images/dashboard/shop-banner-celestial-archon.jpg',
  },
  {
    tierId: 'shop-infernal-warlord',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Ma Vương Địa Ngục',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Sừng Hỏa Ngục',
    nameplateName: 'Bảng Tên Ma Vương',
    lore: 'Giáp dung nham rực đỏ cùng cặp sừng hắc ám thống trị chiến trường rực lửa.',
    milestoneCoins: 0,
    priceCoins: 850,
    isShop: true,
    accentColor: '#ef4444',
    description: 'Ma Vương Địa Ngục bá đạo — mở khóa bằng Coin 😈',
    assetUrl: '/images/characters/shop-blood-moon.jpg',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-6.jpg',
  },
  {
    tierId: 'shop-quantum-hacker',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Học Giả Lượng Tử',
    tierBadge: 'Cửa Hàng · Độc Bản',
    frameName: 'Lăng Kính Lượng Tử',
    nameplateName: 'Bảng Tên Lượng Tử',
    lore: 'Giải mã ma trận đa chiều bằng lăng kính lục bảo và luồng dữ liệu siêu tốc.',
    milestoneCoins: 0,
    priceCoins: 950,
    isShop: true,
    accentColor: '#10b981',
    description: 'Học Giả Lượng Tử công nghệ cao — mở khóa bằng Coin 💠',
    assetUrl: '/images/characters/shop-cyber-neon.jpg',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-4.jpg',
  },
  {
    tierId: 'shop-eternal-emperor',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Thiên Đế Vĩnh Hằng',
    tierBadge: 'Cửa Hàng · Thần Thoại',
    frameName: 'Vương Miện Vĩnh Hằng',
    nameplateName: 'Bảng Tên Thiên Đế',
    lore: 'Đỉnh cao tối thượng với vương miện vàng tím phát sáng, biểu tượng của bậc đế vương BCN Arena.',
    milestoneCoins: 0,
    priceCoins: 1200,
    isShop: true,
    accentColor: '#fde047',
    description: 'Thiên Đế Vĩnh Hằng thần thoại — mở khóa bằng Coin 👑✨',
    assetUrl: '/images/characters/shop-eternal-emperor.jpg',
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

export type CosmeticSlot = 'bundle' | 'character' | 'banner' | 'frame' | 'nameplate';

export interface ShopCosmeticItem {
  id: string;
  slot: CosmeticSlot;
  baseTierId: string;
  name: string;
  description: string;
  priceCoins: number;
  accentColor: string;
  assetUrl: string;
  bannerBgUrl: string;
}

export const STANDALONE_FRAME_TIERS: CharacterTier[] = [
  {
    tierId: 'frame:neon-pulse',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Khung Xung Nhịp Neon',
    tierBadge: 'Khung Độc Lập',
    frameName: 'Xung Nhịp Neon',
    nameplateName: 'Mặc định',
    lore: 'Vòng sáng điện tử xanh tím xoay chuyển liên tục quanh ảnh đại diện.',
    milestoneCoins: 0,
    priceCoins: 50,
    isShop: true,
    accentColor: '#22d3ee',
    description: 'Khung Avatar lẻ hiệu ứng Neon Pulse',
    assetUrl: '/images/characters/character-level-1.png',
    bannerBgUrl: '/images/dashboard/hero-banner-unified.png',
  },
  {
    tierId: 'frame:sakura-petal',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Khung Hoa Anh Đào',
    tierBadge: 'Khung Độc Lập',
    frameName: 'Cánh Hoa Anh Đào',
    nameplateName: 'Mặc định',
    lore: 'Sắc hồng phấn thanh tao tô điểm cho hồ sơ đấu sĩ.',
    milestoneCoins: 0,
    priceCoins: 75,
    isShop: true,
    accentColor: '#f472b6',
    description: 'Khung Avatar lẻ sắc hồng Sakura',
    assetUrl: '/images/characters/character-level-1.png',
    bannerBgUrl: '/images/dashboard/hero-banner-unified.png',
  },
  {
    tierId: 'frame:emerald-circuit',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Khung Mạch Ngọc Lục',
    tierBadge: 'Khung Độc Lập',
    frameName: 'Mạch Ngọc Lục Bảo',
    nameplateName: 'Mặc định',
    lore: 'Đường mạch năng lượng xanh ngọc lục bảo sắc sảo.',
    milestoneCoins: 0,
    priceCoins: 90,
    isShop: true,
    accentColor: '#10b981',
    description: 'Khung Avatar lẻ mạch năng lượng xanh ngọc',
    assetUrl: '/images/characters/character-level-1.png',
    bannerBgUrl: '/images/dashboard/hero-banner-unified.png',
  },
  {
    tierId: 'frame:eclipse-ring',
    minLevel: 1,
    maxLevel: 999,
    tierTitle: 'Khung Nhật Thực Tối Thượng',
    tierBadge: 'Khung Độc Lập',
    frameName: 'Vòng Nhật Thực',
    nameplateName: 'Mặc định',
    lore: 'Vầng hào quang nhật thực cam đỏ rực cháy quanh avatar.',
    milestoneCoins: 0,
    priceCoins: 120,
    isShop: true,
    accentColor: '#f97316',
    description: 'Khung Avatar lẻ Nhật Thực rực lửa',
    assetUrl: '/images/characters/character-level-1.png',
    bannerBgUrl: '/images/dashboard/hero-banner-unified.png',
  },
];

export const SHOP_INDIVIDUAL_ITEMS: ShopCosmeticItem[] = [
  ...SHOP_COSMETICS.flatMap((t): ShopCosmeticItem[] => {
    const bundlePrice = t.priceCoins ?? 150;
    return [
      {
        id: `char:${t.tierId}`,
        slot: 'character',
        baseTierId: t.tierId,
        name: `Nhân vật · ${t.tierTitle}`,
        description: t.description,
        priceCoins: Math.round(bundlePrice * 0.4),
        accentColor: t.accentColor,
        assetUrl: t.assetUrl,
        bannerBgUrl: t.bannerBgUrl,
      },
      {
        id: `banner:${t.tierId}`,
        slot: 'banner',
        baseTierId: t.tierId,
        name: `Banner · ${t.tierTitle}`,
        description: `Hình nền hồ sơ ${t.tierTitle}`,
        priceCoins: Math.round(bundlePrice * 0.3),
        accentColor: t.accentColor,
        assetUrl: t.assetUrl,
        bannerBgUrl: t.bannerBgUrl,
      },
      {
        id: `frame:${t.tierId}`,
        slot: 'frame',
        baseTierId: t.tierId,
        name: `Khung · ${t.frameName}`,
        description: `Khung Avatar ${t.frameName}`,
        priceCoins: Math.round(bundlePrice * 0.2),
        accentColor: t.accentColor,
        assetUrl: t.assetUrl,
        bannerBgUrl: t.bannerBgUrl,
      },
      {
        id: `nameplate:${t.tierId}`,
        slot: 'nameplate',
        baseTierId: t.tierId,
        name: `Bảng tên · ${t.nameplateName}`,
        description: `Bảng tên hiệu ứng ${t.nameplateName}`,
        priceCoins: Math.round(bundlePrice * 0.2),
        accentColor: t.accentColor,
        assetUrl: t.assetUrl,
        bannerBgUrl: t.bannerBgUrl,
      },
    ];
  }),
  ...STANDALONE_FRAME_TIERS.map((f): ShopCosmeticItem => ({
    id: f.tierId,
    slot: 'frame',
    baseTierId: f.tierId,
    name: f.tierTitle,
    description: f.description,
    priceCoins: f.priceCoins ?? 50,
    accentColor: f.accentColor,
    assetUrl: f.assetUrl,
    bannerBgUrl: f.bannerBgUrl,
  })),
];

export function isShopItemUnlocked(
  unlockedCosmetics: string[],
  itemId: string,
): boolean {
  if (unlockedCosmetics.includes(itemId)) return true;
  const colonIdx = itemId.indexOf(':');
  if (colonIdx > 0) {
    const baseId = itemId.slice(colonIdx + 1);
    if (unlockedCosmetics.includes(baseId)) return true;
  }
  return false;
}

export function getCharacterTierById(tierId: string | null | undefined): CharacterTier | null {
  if (!tierId) return null;
  const standalone = STANDALONE_FRAME_TIERS.find((t) => t.tierId === tierId);
  if (standalone) return standalone;
  const colonIdx = tierId.indexOf(':');
  const normalizedId = colonIdx > 0 ? tierId.slice(colonIdx + 1) : tierId;
  return (
    CHARACTER_TIERS.find((t) => t.tierId === normalizedId) ??
    SHOP_COSMETICS.find((t) => t.tierId === normalizedId) ??
    null
  );
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
