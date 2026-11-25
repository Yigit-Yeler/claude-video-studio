import type { ReactNode } from "react";

export type PageGuide = { title: string; steps: ReactNode[]; tip?: ReactNode };

/** Her sayfanın başındaki "Nasıl kullanılır?" kartlarının metinleri. */
export const PAGE_GUIDES = {
  studio: {
    title: "Nasıl video üretilir?",
    steps: [
      <>Kaynak videolarını seç ya da <b>Bilgisayardan kaynak video seç</b> ile yükle. Birden fazla seçersen sırayla arka arkaya kurgulanır.</>,
      <>İstersen bir <b>stil skill&apos;i</b> seç (Skill Oluştur sayfasında kendi tarzını çıkarabilirsin) ya da kutuya ne istediğini yaz. Mikrofon butonuyla sesli de yazdırabilirsin.</>,
      <>Model ve efor seç. Opus en iyi sonucu verir; Haiku daha hızlı ve aboneliğinden daha az harcar.</>,
      <>İsteğe bağlı: referans video, arka plan müziği, ses efektleri, çözünürlük ve kaliteyi ayarla.</>,
      <><b>Ajanı başlat</b> butonuna bas. Ajan kurguyu, altyazıyı, animasyonları ve render&apos;ı kendisi yapar; bitince video burada ve Geçmiş sayfasında görünür.</>,
    ],
    tip: "Müzik ve ses efekti listeleri boşsa public/media/music ve public/media/sfx klasörlerine kendi telifsiz seslerini koy.",
  },
  history: {
    title: "Geçmişi nasıl kullanırım?",
    steps: [
      <>Bir videoya tıklayıp hangi prompt, skill ve modelle üretildiğini gör.</>,
      <><b>Videoyu düzelt</b> ile neyi değiştirmek istediğini yaz (ör. &quot;14. saniyedeki başlık daha büyük olsun&quot;); ajan videoyu baştan yapmadan düzeltir.</>,
      <>Aynı ayarları stüdyoya yükleyip benzer yeni bir video üretebilirsin.</>,
    ],
  },
  social: {
    title: "Paylaşım metni nasıl yazdırılır?",
    steps: [
      <>Bu sistemle ürettiğin bir videoyu seç ya da dışarıdan bir video yükle.</>,
      <>İstersen not ekle: &quot;linki bio&apos;ya koydum de&quot;, &quot;daha kısa olsun&quot; gibi.</>,
      <><b>Metinleri üret</b> butonuna bas; TikTok, Instagram ve YouTube için açıklama, başlık ve etiketler hazırlanır. Kopyala butonuyla al.</>,
    ],
  },
  media: {
    title: "Medya kütüphanesi",
    steps: [
      <><b>Kaynak</b>: videoya dönüşecek ham çekimlerin. Stüdyodan yüklediğin videolar buraya kaydedilir.</>,
      <><b>Referans</b>: tarzını taklit etmek istediğin örnek videolar. Ajan bunları inceler ama çıktıya koymaz.</>,
      <>Dosyaları doğrudan klasöre de kopyalayabilirsin; sonra <b>Yenile</b>&apos;ye bas.</>,
    ],
    tip: "Müzikler public/media/music, ses efektleri public/media/sfx altında. Bu klasörler GitHub'a yüklenmez.",
  },
  skills: {
    title: "Skiller ne işe yarar?",
    steps: [
      <>Skill, videonun tarzını (altyazı, renk, geçiş, animasyon, ses efekti) tarif eden hazır bir kalıptır.</>,
      <><b>Stüdyoda kullan</b> anahtarı açık olan skiller Video Stüdyosu sayfasında seçilebilir.</>,
      <>Kendi skill&apos;ini oluşturmak için <b>Skill Oluştur</b> sayfasına git: tarzını beğendiğin videoları yükle, sistem tarzı çıkarsın.</>,
    ],
    tip: "Üretilen skiller data/generated-skills klasörüne kaydedilir ve yalnızca senin bilgisayarında durur.",
  },
  skillCreate: {
    title: "Başkasının tarzını nasıl kopyalarım?",
    steps: [
      <>Tarzını beğendiğin videoları indir (2–3 video en iyi sonucu verir; aynı tarzda olmaları önemli).</>,
      <><b>Videoları seç</b> ile yükle ve skill&apos;e bir isim ver.</>,
      <>İstersen <b>Prompt</b> kutusuna ekstra kurallar yaz: &quot;altyazı hep altta olsun&quot;, &quot;geçişler sert olsun&quot; gibi.</>,
      <><b>Tarzı çıkar ve skill yaz</b> butonuna bas. Claude kareleri inceler ve tarzı tarif eden bir skill yazar (birkaç dakika sürebilir).</>,
      <>Bitince skill Video Stüdyosu&apos;nda seçilebilir olur. Artık kendi videolarını o tarzda üretebilirsin.</>,
    ],
    tip: "Skill satın almana gerek yok: herhangi bir videonun tarzını birkaç dakikada kendi skill'ine çevirebilirsin.",
  },
} satisfies Record<string, PageGuide>;

export type PageGuideId = keyof typeof PAGE_GUIDES;
