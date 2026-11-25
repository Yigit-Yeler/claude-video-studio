import { IconFolder, IconHistory, IconMovie, IconShare, IconSparkles, IconWand, type Icon } from "@tabler/icons-react";

export type NavLinkItem = { href: string; label: string; description: string; icon: Icon };

export const NAV_LINKS: NavLinkItem[] = [
  { href: "/", label: "Video Stüdyosu", description: "Üretim paneli", icon: IconMovie },
  { href: "/history", label: "Geçmiş", description: "Üretilen videolar ve ayarları", icon: IconHistory },
  { href: "/social", label: "Paylaşım Metinleri", description: "TikTok, Instagram, YouTube", icon: IconShare },
  { href: "/media", label: "Medya Kütüphanesi", description: "Kaynak ve referanslar", icon: IconFolder },
  { href: "/skills", label: "Skiller", description: "Efekt katmanları", icon: IconSparkles },
  { href: "/skills/create", label: "Skill Oluştur", description: "Referanslardan tarz çıkar", icon: IconWand },
];
