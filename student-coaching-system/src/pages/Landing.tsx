// Türkçe: Ana giriş sayfası — dersonlinevipkocluk.com kök sayfası (oturumsuz ziyaretçi)
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/brand/BrandLogo';
import { PRIVACY_POLICY_PATH } from '../lib/playStoreLinks';
import {
  ArrowRight,
  BarChart3,
  BookMarked,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  LogIn,
  Menu,
  MessageSquare,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X
} from 'lucide-react';

/**
 * Sınıf seviyeleri — öğrenci kendi kademesini seçip ne aldığını görür.
 * Kademe adları kurumun kullandığı adlandırmayla birebir.
 */
const SEVIYELER = [
  {
    id: '4',
    label: '4. Sınıf',
    grup: 'İlkokul',
    baslik: 'Temeli sağlam atıyoruz',
    aciklama:
      'Türkçe ve matematikte kazanım odaklı çalışma, haftalık küçük hedefler ve veliye düzenli bilgilendirme.',
    dersler: ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler']
  },
  {
    id: '5',
    label: '5. Sınıf',
    grup: 'Ortaokul',
    baslik: 'Düzenli çalışma alışkanlığı',
    aciklama:
      'Haftalık planla takip, konu bitiminde ödev ve deneme; eksik kalan kazanım aynı hafta telafi edilir.',
    dersler: ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce']
  },
  {
    id: '6',
    label: '6. Sınıf',
    grup: 'Ortaokul',
    baslik: 'Soru çözme kası',
    aciklama:
      'Konu anlatımının ardından soru pratiği, deneme analizi ve koçla birebir haftalık değerlendirme.',
    dersler: ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce']
  },
  {
    id: '7',
    label: '7. Sınıf',
    grup: 'Ortaokul',
    baslik: 'LGS provası',
    aciklama:
      'LGS formatına alışma, deneme takvimi ve kayıp puan analizi; hangi kazanımda kaybediyorsa oraya dönülür.',
    dersler: ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Din Kültürü']
  },
  {
    id: 'lgs',
    label: 'LGS (8)',
    grup: 'Ortaokul',
    baslik: 'Sınav yılı — tam program',
    aciklama:
      'Canlı grup dersleri, özel ders seçeneği, deneme takvimi, optik analiz ve koçla haftalık birebir görüşme.',
    dersler: [
      'Türkçe',
      'Matematik',
      'Fen Bilimleri',
      'T.C. İnkılap Tarihi',
      'İngilizce',
      'Din Kültürü'
    ]
  },
  {
    id: '9',
    label: '9. Sınıf',
    grup: 'Lise',
    baslik: 'Liseye güçlü başlangıç',
    aciklama:
      'Okul derslerine paralel ilerleme, yazılıya hazırlık ve TYT temelinin erkenden kurulması.',
    dersler: ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya']
  },
  {
    id: '10',
    label: '10. Sınıf',
    grup: 'Lise',
    baslik: 'Alan seçimine hazırlık',
    aciklama:
      'Yazılı takibi, konu ilerlemesi ve alan tercihine göre yönlendirme; koçla dönemsel hedef belirleme.',
    dersler: ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya']
  },
  {
    id: '11',
    label: '11. Sınıf',
    grup: 'Lise',
    baslik: 'AYT başlıyor',
    aciklama:
      'TYT–AYT dengeli program, deneme analizi ve net takibi; eksik konular haftalık planda önceliklenir.',
    dersler: ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Edebiyat', 'Tarih', 'Coğrafya', 'Felsefe']
  },
  {
    id: 'yks',
    label: 'YKS (12 / Mezun)',
    grup: 'Lise',
    baslik: 'Sınav yılı — tam program',
    aciklama:
      'Canlı dersler, özel ders, deneme takvimi, kayıp puan ve net analizi; koçla haftalık birebir görüşme ve tercih desteği.',
    dersler: [
      'Matematik',
      'Geometri',
      'Fizik',
      'Kimya',
      'Biyoloji',
      'Edebiyat',
      'Tarih',
      'Coğrafya',
      'Felsefe'
    ]
  }
] as const;

const OZELLIKLER = [
  {
    icon: Video,
    title: 'Canlı dersler',
    desc: 'Canlı grup dersleri ve özel ders; ders bağlantısı panelde, katılım otomatik işlenir.'
  },
  {
    icon: Users,
    title: 'Birebir koçluk',
    desc: 'Her öğrenciye tanımlı koç, haftalık görüşme ve kişiye özel çalışma planı.'
  },
  {
    icon: CalendarDays,
    title: 'Haftalık plan',
    desc: 'Hedef–gerçekleşen tablosu; öğrenci ne yapacağını, veli ne yapıldığını görür.'
  },
  {
    icon: ClipboardList,
    title: 'Deneme ve optik analiz',
    desc: 'Deneme sonuçları, net ve kayıp puan analizi; hangi kazanımda kaybettiği satır satır.'
  },
  {
    icon: BookMarked,
    title: 'Ödev ve konu takibi',
    desc: 'Konu ilerlemesi, ödev kontrolü ve kitap okuma kayıtları tek akışta.'
  },
  {
    icon: BarChart3,
    title: 'Raporlar',
    desc: 'Öğrenci ve veli raporları; PDF çıktı ve veliyle paylaşıma uygun düzen.'
  },
  {
    icon: MessageSquare,
    title: 'Veli bilgilendirme',
    desc: 'Ders hatırlatma ve bilgilendirme mesajları kurumsal WhatsApp hattından gider.'
  },
  {
    icon: Sparkles,
    title: 'Akademik Merkez',
    desc: 'Etüt, deneme ve soru havuzu adreslerine tek ekrandan erişim.'
  }
] as const;

/**
 * Kurumsal paketler — kurumun kendi öğrencileri için aldığı yıllık kontenjan.
 * Fiyatlar kurum tarafından verildi; tek yerde durur ki iki ekranda ayrışmasın.
 */
const PAKETLER = [
  {
    id: '10',
    ogrenci: 10,
    ad: '10 Kişilik Paket',
    fiyat: 14990,
    ozet: 'Küçük kurumlar ve yeni başlayanlar için',
    oneCikan: false
  },
  {
    id: '20',
    ogrenci: 20,
    ad: '20 Kişilik Paket',
    fiyat: 24990,
    ozet: 'En çok tercih edilen kontenjan',
    oneCikan: true
  },
  {
    id: '50',
    ogrenci: 50,
    ad: '50 Kişilik Paket',
    fiyat: 34990,
    ozet: 'Öğrenci başına en avantajlı',
    oneCikan: false
  }
] as const;

const PAKET_ICERIK = [
  'Tüm kademeler: 4, 5, 6, 7, LGS, 9, 10, 11, YKS',
  'Koç, öğretmen ve yönetici panelleri',
  'Canlı ders ve özel ders takvimi',
  'Deneme, optik ve kayıp puan analizi',
  'Haftalık plan ve ödev takibi',
  'Veli raporları ve WhatsApp bilgilendirme',
  'Sınırsız kullanıcı girişi (kontenjan öğrenci sayısıdır)'
] as const;

const SSS = [
  {
    q: 'Öğrencim nasıl giriş yapıyor?',
    a: 'Kurum öğrenciyi sisteme kaydeder, öğrenci kendi e-postası ve şifresiyle bu sayfadaki “Giriş Yap” düğmesinden panele girer. Şifresini unutursa “Şifremi unuttum” ile kendisi yenileyebilir.'
  },
  {
    q: 'Paket fiyatı neyi kapsıyor?',
    a: 'Fiyatlar yıllıktır ve kontenjan kadar öğrencinin tüm modülleri kullanmasını kapsar. Koç, öğretmen ve yönetici girişleri kontenjana dahil değildir; kontenjan öğrenci sayısıdır.'
  },
  {
    q: 'Hangi sınıf seviyeleri var?',
    a: '4, 5, 6, 7 ve LGS (8) kademeleri ile 9, 10, 11 ve YKS (12 / mezun) kademeleri. Her kademenin ders listesi ve programı ayrı tanımlıdır.'
  },
  {
    q: 'Veli öğrencinin durumunu görebiliyor mu?',
    a: 'Evet. Haftalık plan, ödev ve deneme sonuçları veli raporlarına yansır; ders hatırlatmaları ve bilgilendirmeler kurumsal WhatsApp hattından gönderilir.'
  },
  {
    q: 'Kontenjanı sonradan büyütebilir miyiz?',
    a: 'Evet. Dönem içinde üst pakete geçebilirsiniz; aradaki fark kalan süreye göre hesaplanır.'
  }
] as const;

function tl(n: number) {
  return n.toLocaleString('tr-TR');
}

function SSSMaddesi({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[56px] w-full touch-manipulation items-center justify-between gap-3 py-4 text-left"
      >
        <span className="font-semibold text-slate-900">{q}</span>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-red-500" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
        )}
      </button>
      {open ? <p className="pb-4 text-sm leading-relaxed text-slate-600">{a}</p> : null}
    </div>
  );
}

/**
 * Ana giriş sayfası.
 *
 * Ziyaretçi doğrudan giriş formuyla karşılaşmak yerine kurumu, kademeleri ve
 * paketleri görüyor; girişe buradan "Giriş Yap" ile geçiyor. Giriş akışına
 * dokunulmadı — öğrenci yine e-posta ve şifresiyle /login üzerinden giriyor.
 */
export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [seviyeId, setSeviyeId] = useState<string>('lgs');

  const seviye = useMemo(
    () => SEVIYELER.find((s) => s.id === seviyeId) || SEVIYELER[0],
    [seviyeId]
  );

  const menu = [
    { href: '#seviyeler', label: 'Sınıf seviyeleri' },
    { href: '#neler-var', label: 'Neler var' },
    { href: '#paketler', label: 'Paketler' },
    { href: '#videolar', label: 'Tanıtım' },
    { href: '#sss', label: 'S.S.S.' }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Üst menü */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <BrandLogo variant="mark" className="h-9 w-9 ring-1 ring-white/20" />
            <span className="hidden text-sm font-bold text-white sm:block">
              Online VIP Ders ve Koçluk
            </span>
          </Link>

          <nav className="hidden items-center gap-5 lg:flex">
            {menu.map((m) => (
              <a
                key={m.href}
                href={m.href}
                className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
              >
                {m.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-red-500 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 sm:px-4"
            >
              <LogIn className="h-4 w-4" />
              Giriş Yap
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menü"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-200 lg:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav className="border-t border-white/10 bg-slate-900 px-4 py-2 lg:hidden">
            {menu.map((m) => (
              <a
                key={m.href}
                href={m.href}
                onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm font-medium text-slate-300"
              >
                {m.label}
              </a>
            ))}
          </nav>
        ) : null}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-16 pt-24 md:pb-24 md:pt-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-red-500/15 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/15">
                <ShieldCheck className="h-3.5 w-3.5" />
                4. sınıftan YKS’ye kadar tek panel
              </span>

              <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl">
                Canlı ders, birebir koçluk ve
                <span className="text-red-400"> gerçek takip</span> bir arada
              </h1>

              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
                Öğrenci haftalık planını, ödevini ve deneme analizini aynı yerden görür; koçu her
                hafta birebir görüşür; veli ne yapıldığını rapordan takip eder.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/login"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-red-500 px-6 text-base font-semibold text-white transition-colors hover:bg-red-600"
                >
                  <LogIn className="h-5 w-5" />
                  Öğrenci Girişi
                </Link>
                <a
                  href="#videolar"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 text-base font-semibold text-white transition-colors hover:bg-white/10"
                >
                  <PlayCircle className="h-5 w-5" />
                  Tanıtımı İzle
                </a>
              </div>

              <p className="mt-4 text-xs text-slate-400">
                Hesabınız kurumunuz tarafından açılır. Şifrenizi unuttuysanız giriş sayfasındaki{' '}
                <span className="font-semibold text-slate-300">“Şifremi unuttum”</span> ile
                yenileyebilirsiniz.
              </p>
            </div>

            {/* Kademe seçici — öğrenci kendi sınıfını seçer */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Sınıfını seç
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SEVIYELER.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeviyeId(s.id)}
                    className={`min-h-[40px] rounded-xl px-3 text-sm font-semibold transition-colors ${
                      s.id === seviye.id
                        ? 'bg-red-500 text-white'
                        : 'bg-white/10 text-slate-200 hover:bg-white/20'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-xl bg-slate-900/60 p-4 ring-1 ring-white/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-400">
                  {seviye.grup}
                </p>
                <p className="mt-0.5 text-lg font-bold text-white">{seviye.baslik}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{seviye.aciklama}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {seviye.dersler.map((d) => (
                    <span
                      key={d}
                      className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-medium text-slate-200"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sınıf seviyeleri */}
      <section id="seviyeler" className="scroll-mt-20 bg-slate-50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Her kademenin kendi programı var
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-600 sm:text-base">
            4. sınıftan mezun gruba kadar dokuz kademe; ders listesi, deneme takvimi ve koçluk akışı
            kademeye göre ayrı tanımlanır.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SEVIYELER.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSeviyeId(s.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-bold text-slate-900">{s.label}</span>
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {s.grup}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-red-600">{s.baslik}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{s.aciklama}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                  Ayrıntı <ArrowRight className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Neler var */}
      <section id="neler-var" className="scroll-mt-20 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Panelde neler var?
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-600 sm:text-base">
            Öğrenci, koç, öğretmen ve yönetici aynı sistemde çalışır; veri tek yerde durur.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {OZELLIKLER.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Kurumsal paketler */}
      <section id="paketler" className="scroll-mt-20 bg-slate-50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <span className="mx-auto block w-fit rounded-full bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
            Kurumunuz için
          </span>
          <h2 className="mt-3 text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Koçluk paketleri
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-600 sm:text-base">
            Paketler kurumun kendi öğrencileri için aldığı{' '}
            <span className="font-semibold text-slate-800">yıllık öğrenci kontenjanıdır</span>. Koç,
            öğretmen ve yönetici girişleri kontenjana dahil değildir.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {PAKETLER.map((p) => (
              <div
                key={p.id}
                className={`relative rounded-2xl border bg-white p-6 ${
                  p.oneCikan
                    ? 'border-red-300 shadow-lg ring-2 ring-red-200'
                    : 'border-slate-200'
                }`}
              >
                {p.oneCikan ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-500 px-3 py-1 text-[11px] font-bold text-white">
                    En çok tercih edilen
                  </span>
                ) : null}

                <h3 className="text-lg font-bold text-slate-900">{p.ad}</h3>
                <p className="mt-0.5 text-sm text-slate-500">{p.ozet}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">{tl(p.fiyat)} ₺</span>
                  <span className="text-sm font-medium text-slate-500">/ yıl</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {p.ogrenci} öğrenci kontenjanı · öğrenci başına yıllık{' '}
                  {tl(Math.round(p.fiyat / p.ogrenci))} ₺
                </p>

                <Link
                  to="/marketing#demo"
                  className={`mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
                    p.oneCikan
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  Teklif İste
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-bold text-slate-900">Her pakette olanlar</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PAKET_ICERIK.map((k) => (
                <p key={k} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {k}
                </p>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Fiyatlar yıllıktır. Dönem içinde üst pakete geçişte fark kalan süreye göre hesaplanır.
            </p>
          </div>
        </div>
      </section>

      {/* Kurumsal tanıtım videoları */}
      <section id="videolar" className="scroll-mt-20 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Kurumsal tanıtım videoları
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-600 sm:text-base">
            Kurumumuzu, çalışma düzenimizi ve panelin kullanımını anlatan videolar.
          </p>

          {/*
            Yer tutucu: video bağlantıları geldiğinde her kartın içine gömülecek.
            Kart düzeni 16:9 olduğu için gömme sonrası taşma olmaz.
          */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { ad: 'Kurum tanıtımı', not: 'Online VIP Ders ve Koçluk nasıl çalışır?' },
              { ad: 'Koçluk sistemi', not: 'Haftalık görüşme ve plan akışı' },
              { ad: 'Panel kullanımı', not: 'Öğrenci ve veli ekranları' }
            ].map((v) => (
              <div
                key={v.ad}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                <div className="flex aspect-video items-center justify-center bg-slate-100">
                  <div className="text-center">
                    <PlayCircle className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-1.5 text-xs font-semibold text-slate-400">Yakında</p>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm font-bold text-slate-900">{v.ad}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{v.not}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S.S.S. */}
      <section id="sss" className="scroll-mt-20 bg-slate-50 py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Sıkça sorulan sorular
          </h2>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5">
            {SSS.map((s) => (
              <SSSMaddesi key={s.q} q={s.q} a={s.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Giriş çağrısı */}
      <section className="bg-gradient-to-r from-red-500 to-red-600 py-14">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Panelinize girin</h2>
          <p className="mt-2 text-sm text-red-50 sm:text-base">
            Öğrenci, veli, koç, öğretmen ve yönetici girişleri aynı kapıdan.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-white px-7 text-base font-bold text-red-600 transition-colors hover:bg-red-50"
          >
            <LogIn className="h-5 w-5" />
            Giriş Yap
          </Link>
        </div>
      </section>

      {/* Alt bilgi */}
      <footer className="bg-slate-900 py-10">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-2">
              <BrandLogo variant="mark" className="h-9 w-9 ring-1 ring-white/20" />
              <span className="text-sm font-bold text-white">Online VIP Ders ve Koçluk</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              <Link to="/marketing" className="text-slate-300 hover:text-white">
                Kurumsal
              </Link>
              <Link to={PRIVACY_POLICY_PATH} className="text-slate-300 hover:text-white">
                Gizlilik
              </Link>
              <Link to="/kullanim-kosullari" className="text-slate-300 hover:text-white">
                Kullanım Koşulları
              </Link>
              <Link to="/login" className="font-semibold text-red-400 hover:text-red-300">
                Giriş Yap
              </Link>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} Online VIP Ders ve Koçluk
          </p>
        </div>
      </footer>
    </div>
  );
}
