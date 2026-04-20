// Türkçe: Pazarlama Sayfası - SaaS Landing Page
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  Users,
  BarChart3,
  MessageSquare,
  FileText,
  CheckCircle,
  Star,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
  Clock,
  Award,
  Target,
  TrendingUp,
  Shield,
  Zap,
  Heart,
  ChevronDown,
  ChevronUp,
  Play,
  Quote,
  Send,
  Menu,
  X,
  Globe
} from 'lucide-react';

// Accordion Item Component
function AccordionItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-5 flex items-center justify-between text-left hover:text-red-600 transition-colors"
      >
        <span className="font-semibold text-gray-900">{question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-red-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="pb-5 text-gray-600 leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

// Testimonial Card Component
function TestimonialCard({ name, role, institution, content, rating }: { name: string; role: string; institution: string; content: string; rating: number }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
      <div className="flex items-center gap-1 mb-4">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className={`w-5 h-5 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
        ))}
      </div>
      <Quote className="w-10 h-10 text-red-100 mb-4" />
      <p className="text-gray-600 mb-6 leading-relaxed">"{content}"</p>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
          {name.charAt(0)}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{name}</p>
          <p className="text-sm text-gray-500">{role} - {institution}</p>
        </div>
      </div>
    </div>
  );
}

// Pricing Card Component
function PricingCard({ title, price, period, features, isPopular, buttonText }: {
  title: string;
  price: string;
  period: string;
  features: string[];
  isPopular: boolean;
  buttonText: string;
}) {
  return (
    <div className={`relative rounded-2xl p-8 ${isPopular ? 'bg-gradient-to-br from-slate-800 to-slate-900 text-white scale-105 shadow-2xl' : 'bg-white border border-gray-200'}`}>
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
          En Popüler
        </div>
      )}
      <div className="text-center mb-8">
        <h3 className={`text-xl font-bold mb-2 ${isPopular ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
        <div className="flex items-baseline justify-center gap-1">
          <span className={`text-4xl font-bold ${isPopular ? 'text-white' : 'text-gray-900'}`}>{price}</span>
          <span className={`${isPopular ? 'text-slate-300' : 'text-gray-500'}`}>/{period}</span>
        </div>
      </div>
      <ul className="space-y-4 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <CheckCircle className={`w-5 h-5 flex-shrink-0 ${isPopular ? 'text-red-400' : 'text-green-500'}`} />
            <span className={isPopular ? 'text-slate-200' : 'text-gray-600'}>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/register"
        className={`block w-full py-3 rounded-xl font-semibold text-center transition-all ${
          isPopular
            ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-lg shadow-red-500/30'
            : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
        }`}
      >
        {buttonText}
      </Link>
    </div>
  );
}

// Feature Card Component
function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 border border-gray-100">
      <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-red-500/20">
        <Icon className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

// Stats Counter Component
function StatCounter({ value, label, suffix = '' }: { value: string; label: string; suffix?: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent">
        {value}{suffix}
      </div>
      <p className="text-gray-600 mt-2">{label}</p>
    </div>
  );
}

export default function Marketing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoForm, setDemoForm] = useState({
    name: '',
    email: '',
    phone: '',
    institution: '',
    studentCount: ''
  });
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDemoSubmitted(true);
    setTimeout(() => setDemoSubmitted(false), 3000);
  };

  const features = [
    {
      icon: Users,
      title: 'Öğrenci Takip Sistemi',
      description: 'Her öğrenci için detaylı haftalık takip tabloları, hedef ve gerçekleşen karşılaştırmaları.'
    },
    {
      icon: BarChart3,
      title: 'Gelişmiş Analitik',
      description: 'Ders bazlı başarı grafikleri, günlük performans takibi ve kapsamlı raporlama.'
    },
    {
      icon: FileText,
      title: 'PDF Rapor Sistemi',
      description: 'Profesyonel PDF raporları oluşturun ve velilere anında gönderin.'
    },
    {
      icon: MessageSquare,
      title: 'WhatsApp Entegrasyonu',
      description: 'Raporları tek tıkla WhatsApp üzerinden velilere gönderin.'
    },
    {
      icon: GraduationCap,
      title: 'Konu Havuzu',
      description: '9-12. sınıf tüm ders konuları, dinamik dropdown sistemi ile.'
    },
    {
      icon: Target,
      title: 'Akıllı Uyarı Sistemi',
      description: '%70 altı kırmızı, %70-90 sarı, %90+ yeşil. Otomatik renkli uyarılar.'
    },
    {
      icon: TrendingUp,
      title: 'Haftalık Analiz',
      description: 'Toplam hedef, çözülen, gerçekleşme oranı ve başarı yüzdesi.'
    },
    {
      icon: Shield,
      title: 'Çoklu Rol Desteği',
      description: 'Admin, Koç ve Öğrenci rolleri ile tam kontrol ve takip.'
    },
    {
      icon: Zap,
      title: 'Hızlı ve Modern UI',
      description: 'React tabanlı, mobil uyumlu modern dashboard deneyimi.'
    }
  ];

  const testimonials = [
    {
      name: 'Mehmet Yılmaz',
      role: 'Kurucu',
      institution: 'Ankara VIP Dershanesi',
      content: 'Smart Koçluk Sistemi ile öğrenci takibini %80 daha verimli hale getirdik. Veliler artık öğrencilerinin gelişimini günü gününe takip edebiliyor.',
      rating: 5
    },
    {
      name: 'Ayşe Kaya',
      role: 'Koordinatör',
      institution: 'İstanbul Başarı Eğitim',
      content: 'PDF rapor sistemi veli toplantılarını çok kolaylaştırdı. Profesyonel raporlar hazır, WhatsApp ile anında gönderim.',
      rating: 5
    },
    {
      name: 'Dr. Ali Demir',
      role: 'Müdür',
      institution: 'Bursa Öğrenci Koçluğu',
      content: 'Akıllı uyarı sistemi sayesinde risk altındaki öğrencileri anında tespit ediyoruz. Müdahale çok hızlı oldu.',
      rating: 5
    }
  ];

  const faqs = [
    {
      question: 'Sistemi deneyebilir miyim?',
      answer: 'Evet! 30 gün ücretsiz deneme süresi sunuyoruz. Kayıt olduktan sonra tüm özellikleri sınırsız kullanabilirsiniz.'
    },
    {
      question: 'Kaç öğrenci ekleyebilirim?',
      answer: 'Paketinize göre değişir. Starter pakette 50, Professional\'da 200, Enterprise\'da sınırsız öğrenci ekleyebilirsiniz.'
    },
    {
      question: 'WhatsApp entegrasyonu nasıl çalışır?',
      answer: 'PDF raporlar oluşturulduktan sonra tek tıkla WhatsApp üzerinden veliye gönderebilirsiniz. Twilio API entegrasyonu mevcut.'
    },
    {
      question: 'Veriler güvende mi?',
      answer: 'Evet! Tüm veriler şifreli olarak saklanır. Enterprise paketlerde özel veritabanı ve yedekleme seçenekleri sunuyoruz.'
    },
    {
      question: 'Eğitim desteği veriyor musunuz?',
      answer: 'Evet! Tüm paketlerde video eğitimler ve dokümantasyon sunuyoruz. Professional ve Enterprise\'da canlı eğitim desteği de dahil.'
    },
    {
      question: 'Paket değişikliği yapabilir miyim?',
      answer: 'Evet, istediğiniz zaman paketinizi yükseltebilir veya düşürebilirsiniz. Fiyat farkı otomatik hesaplanır.'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">Smart Koçluk</span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-red-600 transition-colors">Özellikler</a>
              <a href="#pricing" className="text-gray-600 hover:text-red-600 transition-colors">Fiyatlandırma</a>
              <a href="#testimonials" className="text-gray-600 hover:text-red-600 transition-colors">Referanslar</a>
              <a href="#faq" className="text-gray-600 hover:text-red-600 transition-colors">SSS</a>
              <Link to="/login" className="text-gray-600 hover:text-red-600 transition-colors font-medium">
                Giriş Yap
              </Link>
              <Link
                to="/register"
                className="bg-gradient-to-r from-red-500 to-red-600 text-white px-5 py-2 rounded-xl font-semibold hover:from-red-600 hover:to-red-700 transition-all shadow-lg shadow-red-500/20"
              >
                Ücretsiz Dene
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 py-4 px-4 space-y-4">
            <a href="#features" className="block text-gray-600 hover:text-red-600">Özellikler</a>
            <a href="#pricing" className="block text-gray-600 hover:text-red-600">Fiyatlandırma</a>
            <a href="#testimonials" className="block text-gray-600 hover:text-red-600">Referanslar</a>
            <a href="#faq" className="block text-gray-600 hover:text-red-600">SSS</a>
            <Link to="/login" className="block text-gray-600 font-medium">Giriş Yap</Link>
            <Link to="/register" className="block bg-gradient-to-r from-red-500 to-red-600 text-white px-5 py-2 rounded-xl font-semibold text-center">
              Ücretsiz Dene
            </Link>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16 md:pt-32 md:pb-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-red-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 px-4 py-2 rounded-full text-sm font-medium mb-6">
                <Zap className="w-4 h-4" />
                Yeni Nesil Eğitim Teknolojisi
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                Dershane Koçluğunu
                <span className="bg-gradient-to-r from-red-400 to-red-500 bg-clip-text text-transparent"> Dijitalleştirin</span>
              </h1>
              <p className="text-xl text-slate-300 mb-8 leading-relaxed">
                Smart Koçluk Sistemi ile öğrenci takibini %80 daha verimli hale getirin.
                Profesyonel PDF raporları, WhatsApp entegrasyonu ve kapsamlı analitiklerle
                veli memnuniyetini artırın.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link
                  to="/register"
                  className="bg-gradient-to-r from-red-500 to-red-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-red-600 hover:to-red-700 transition-all shadow-lg shadow-red-500/30 flex items-center justify-center gap-2"
                >
                  30 Gün Ücretsiz Deneyin
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href="#demo"
                  className="bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white/20 transition-all border border-white/20 flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Demo İzle
                </a>
              </div>

              {/* Trust Badges */}
              <div className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-8">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-slate-400" />
                  <span className="text-slate-300 text-sm">500+ Aktif Kurum</span>
                </div>
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-slate-400" />
                  <span className="text-slate-300 text-sm">10.000+ Öğrenci</span>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  <span className="text-slate-300 text-sm">4.9/5 Memnuniyet</span>
                </div>
              </div>
            </div>

            {/* Hero Image/Dashboard Preview */}
            <div className="relative hidden lg:block">
              <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl p-4 shadow-2xl">
                <div className="bg-slate-900 rounded-xl overflow-hidden">
                  {/* Dashboard Preview Header */}
                  <div className="bg-slate-800 px-4 py-3 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    </div>
                    <div className="flex-1 bg-slate-700 rounded-lg px-3 py-1 text-xs text-slate-400">
                      smartkocluk.com/dashboard
                    </div>
                  </div>
                  {/* Dashboard Preview Content */}
                  <div className="p-6">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-slate-800 rounded-xl p-4">
                        <div className="text-red-400 text-2xl font-bold">87%</div>
                        <div className="text-slate-400 text-sm">Başarı</div>
                      </div>
                      <div className="bg-slate-800 rounded-xl p-4">
                        <div className="text-green-400 text-2xl font-bold">156</div>
                        <div className="text-slate-400 text-sm">Toplam Soru</div>
                      </div>
                      <div className="bg-slate-800 rounded-xl p-4">
                        <div className="text-blue-400 text-2xl font-bold">92%</div>
                        <div className="text-slate-400 text-sm">Gerçekleşme</div>
                      </div>
                    </div>
                    <div className="bg-slate-800 rounded-xl p-4 h-32 flex items-center justify-center">
                      <div className="w-full h-full bg-gradient-to-t from-red-500/20 to-transparent rounded-lg flex items-end justify-around px-4 pb-4">
                        <div className="w-4 bg-red-500 rounded-t" style={{ height: '60%' }}></div>
                        <div className="w-4 bg-red-500 rounded-t" style={{ height: '80%' }}></div>
                        <div className="w-4 bg-red-500 rounded-t" style={{ height: '45%' }}></div>
                        <div className="w-4 bg-red-500 rounded-t" style={{ height: '90%' }}></div>
                        <div className="w-4 bg-red-500 rounded-t" style={{ height: '70%' }}></div>
                        <div className="w-4 bg-red-500 rounded-t" style={{ height: '55%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Floating Elements */}
              <div className="absolute -top-4 -right-4 bg-white rounded-xl p-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Rapor Hazır!</div>
                    <div className="text-sm text-gray-500">PDF gönderildi</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCounter value="500" suffix="+" label="Aktif Kurum" />
            <StatCounter value="10.000" suffix="+" label="Takip Edilen Öğrenci" />
            <StatCounter value="50.000" suffix="+" label="Oluşturulan Rapor" />
            <StatCounter value="98" suffix="%" label="Müşteri Memnuniyeti" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block bg-red-100 text-red-600 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              ÖZELLİKLER
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              İşletmenizi Büyütmek İçin Tasarlanmış
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Smart Koçluk Sistemi, dershane ve koçluk merkezleri için özel olarak geliştirilmiş
              kapsamlı bir dijital çözümdür.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block bg-red-500/20 text-red-400 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              NASIL ÇALIŞIR
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              3 Basit Adımda Başlayın
            </h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Kurulum dakikalar alır, hemen kullanmaya başlayabilirsiniz.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl font-bold text-white shadow-lg shadow-red-500/30">
                1
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Kayıt Olun</h3>
              <p className="text-slate-300">
                30 gün ücretsiz deneme için hemen kayıt olun. Kredi kartı gerekmez.
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl font-bold text-white shadow-lg shadow-red-500/30">
                2
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Öğrencilerinizi Ekleyin</h3>
              <p className="text-slate-300">
                Tek tek veya toplu olarak öğrenci ekleyin. Konu havuzundan dersleri seçin.
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl font-bold text-white shadow-lg shadow-red-500/30">
                3
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Takip ve Raporlayın</h3>
              <p className="text-slate-300">
                Haftalık takip yapın, PDF raporlar oluşturun, WhatsApp ile gönderin.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block bg-red-100 text-red-600 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              FİYATLANDIRMA
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              İhtiyacınıza Uygun Paketi Seçin
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Tüm paketlerde 30 gün ücretsiz deneme süresi. Kredi kartı gerekmez.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard
              title="Starter"
              price="₺999"
              period="ay"
              features={[
                '50 öğrenci kapasitesi',
                'Temel analitikler',
                'PDF rapor oluşturma',
                'WhatsApp entegrasyonu',
                'Konu havuzu erişimi',
                'E-posta desteği'
              ]}
              isPopular={false}
              buttonText="Hemen Başla"
            />
            <PricingCard
              title="Professional"
              price="₺1.999"
              period="ay"
              features={[
                '200 öğrenci kapasitesi',
                'Gelişmiş analitikler',
                'Sınırsız PDF rapor',
                'WhatsApp + SMS entegrasyonu',
                'Öncelikli destek',
                'Canlı eğitim desteği',
                'Özel rapor şablonları'
              ]}
              isPopular={true}
              buttonText="En Popüler Seçim"
            />
            <PricingCard
              title="Enterprise"
              price="₺3.999"
              period="ay"
              features={[
                'Sınırsız öğrenci',
                'Tüm gelişmiş özellikler',
                'Özel veritabanı',
                'API erişimi',
                '7/24 öncelikli destek',
                'Özel eğitim',
                'Marka entegrasyonu',
                'Dedicated account manager'
              ]}
              isPopular={false}
              buttonText="Kurumsal Çözüm"
            />
          </div>

          <p className="text-center text-gray-500 mt-8">
            * Tüm fiyatlar KDV dahil değildir. Yıllık ödemede %20 indirim uygulanır.
          </p>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block bg-red-100 text-red-600 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              MÜŞTERİ YORUMLARI
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Kurumlar Bizimle Büyüyor
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Smart Koçluk Sistemi'ni kullanan onlarca kurumun deneyimlerini okuyun.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <TestimonialCard key={index} {...testimonial} />
            ))}
          </div>
        </div>
      </section>

      {/* Demo Request Section */}
      <section id="demo" className="py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl p-8 md:p-12 shadow-2xl">
            <div className="text-center mb-10">
              <Heart className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Ücretsiz Demo Talep Edin
              </h2>
              <p className="text-gray-600">
                Sistemi uzmanlarımız eşliğinde keşfedin. Size özel demo için bilgilerinizi bırakın.
              </p>
            </div>

            {demoSubmitted ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Talebiniz Alındı!</h3>
                <p className="text-gray-600">
                  En kısa sürede sizinle iletişime geçeceğiz.
                </p>
              </div>
            ) : (
              <form onSubmit={handleDemoSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Adınız Soyadınız *
                    </label>
                    <input
                      type="text"
                      required
                      value={demoForm.name}
                      onChange={(e) => setDemoForm({ ...demoForm, name: e.target.value })}
                      placeholder="Adınızı girin"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      E-posta *
                    </label>
                    <input
                      type="email"
                      required
                      value={demoForm.email}
                      onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })}
                      placeholder="ornek@kurum.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Telefon *
                    </label>
                    <input
                      type="tel"
                      required
                      value={demoForm.phone}
                      onChange={(e) => setDemoForm({ ...demoForm, phone: e.target.value })}
                      placeholder="0532 XXX XX XX"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kurum Adı
                    </label>
                    <input
                      type="text"
                      value={demoForm.institution}
                      onChange={(e) => setDemoForm({ ...demoForm, institution: e.target.value })}
                      placeholder="Kurum adınız"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Öğrenci Sayısı
                  </label>
                  <select
                    value={demoForm.studentCount}
                    onChange={(e) => setDemoForm({ ...demoForm, studentCount: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    <option value="">Seçiniz</option>
                    <option value="0-50">0-50 öğrenci</option>
                    <option value="51-200">51-200 öğrenci</option>
                    <option value="201-500">201-500 öğrenci</option>
                    <option value="500+">500+ öğrenci</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-4 rounded-xl font-semibold text-lg hover:from-red-600 hover:to-red-700 transition-all shadow-lg shadow-red-500/30 flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  Demo Talep Et
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block bg-red-100 text-red-600 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              SIKÇA SORULAN SORULAR
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Merak Edilenler
            </h2>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} {...faq} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-red-500 to-red-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Award className="w-16 h-16 text-white/80 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Dershane Koçluğunuzu Dönüştürmeye Hazır mısınız?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            30 gün ücretsiz deneyin. Kredi kartı gerekmez. Dakikalar içinde başlayın.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="bg-white text-red-600 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-100 transition-all shadow-lg flex items-center justify-center gap-2"
            >
              Ücretsiz Başla
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#demo"
              className="bg-red-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-red-700 transition-all border-2 border-white/30 flex items-center justify-center gap-2"
            >
              <Phone className="w-5 h-5" />
              Bizi Arayın
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Smart Koçluk</span>
              </div>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Dershane ve koçluk merkezleri için geliştirilmiş, modern ve kullanımı kolay
                öğrenci takip sistemi. PDF raporlar, WhatsApp entegrasyonu ve kapsamlı analitiklerle
                işletmenizi büyütün.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-red-500 transition-colors">
                  <Facebook className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-red-500 transition-colors">
                  <Twitter className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-red-500 transition-colors">
                  <Instagram className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-red-500 transition-colors">
                  <Linkedin className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-red-500 transition-colors">
                  <Youtube className="w-5 h-5" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">Ürün</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="hover:text-red-400 transition-colors">Özellikler</a></li>
                <li><a href="#pricing" className="hover:text-red-400 transition-colors">Fiyatlandırma</a></li>
                <li><a href="#" className="hover:text-red-400 transition-colors">Güncellemeler</a></li>
                <li><a href="#" className="hover:text-red-400 transition-colors">API Dökümantasyonu</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">İletişim</h4>
              <ul className="space-y-3">
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-red-400" />
                  <span>0850 XXX XX XX</span>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-red-400" />
                  <span>destek@smartkocluk.com</span>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-red-400 mt-1" />
                  <span>İstanbul, Türkiye</span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-400" />
                  <span>09:00 - 18:00 (Hafta içi)</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-500 text-sm">
              © 2024 Smart Koçluk Sistemi. Tüm hakları saklıdır.
            </p>
            <div className="flex gap-6 text-sm">
              <a href="#" className="text-slate-500 hover:text-red-400 transition-colors">Gizlilik Politikası</a>
              <a href="#" className="text-slate-500 hover:text-red-400 transition-colors">Kullanım Koşulları</a>
              <a href="#" className="text-slate-500 hover:text-red-400 transition-colors">KVKK Aydınlatma</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
