// Türkçe: Abonelik ve Ödeme Sayfası
import React, { useState, useEffect } from 'react';
import { useAuth, SystemUser } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Check,
  X,
  Sparkles,
  Zap,
  Crown,
  Building2,
  Calendar,
  Download,
  Lock,
  Shield,
  AlertCircle,
  Star,
  TrendingUp,
  Users,
  BookOpen
} from 'lucide-react';

// Paket bilgileri
const PACKAGES = [
  {
    id: 'trial',
    name: 'Deneme',
    price: 0,
    period: '14 gün',
    color: 'bg-purple-500',
    borderColor: 'border-purple-500',
    features: [
      '14 gün ücretsiz deneme',
      '10 öğrenci ekleme',
      'Temel analizler',
      'PDF rapor oluşturma',
      'WhatsApp rapor gönderme'
    ],
    limitations: [
      'Konu havuzu sınırlı',
      'Gelişmiş analiz yok'
    ],
    icon: Sparkles,
    badge: 'ÜCRETSIZ'
  },
  {
    id: 'starter',
    name: 'Başlangıç',
    price: 149,
    period: 'aylık',
    color: 'bg-blue-500',
    borderColor: 'border-blue-500',
    features: [
      '50 öğrenci ekleme',
      'Tam konu havuzu',
      'Haftalık analizler',
      'PDF rapor oluşturma',
      'WhatsApp rapor gönderme',
      'Kitap takibi',
      'Yazılı sınav takibi'
    ],
    limitations: [
      'AI Koç yok'
    ],
    icon: Zap,
    badge: 'POPÜLER'
  },
  {
    id: 'professional',
    name: 'Profesyonel',
    price: 299,
    period: 'aylık',
    color: 'bg-green-500',
    borderColor: 'border-green-500',
    features: [
      'Sınırsız öğrenci',
      'Tam konu havuzu',
      'Gelişmiş analizler',
      'PDF rapor oluşturma',
      'WhatsApp rapor gönderme',
      'Kitap takibi',
      'Yazılı sınav takibi',
      'AI Koç asistanı',
      'Webhook entegrasyonu',
      'Öncelikli destek'
    ],
    limitations: [],
    icon: Star,
    badge: 'EN ÇOK TERCİH EDİLEN',
    recommended: true
  },
  {
    id: 'enterprise',
    name: 'Kurumsal',
    price: 599,
    period: 'aylık',
    color: 'bg-amber-500',
    borderColor: 'border-amber-500',
    features: [
      'Sınırsız her şey',
      'Çoklu kurum desteği',
      'Gelişmiş analizler',
      'PDF rapor oluşturma',
      'WhatsApp rapor gönderme',
      'Kitap takibi',
      'Yazılı sınav takibi',
      'AI Koç asistanı',
      'Webhook entegrasyonu',
      'API erişimi',
      'Özel eğitim',
      '7/24 öncelikli destek',
      'Özelleştirilmiş raporlar'
    ],
    limitations: [],
    icon: Building2,
    badge: 'TAM KURUMSAL'
  }
];

// Ödeme formu bileşeni
function PaymentForm({ selectedPackage, onSuccess, onCancel }: {
  selectedPackage: typeof PACKAGES[0];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    cardNumber: '',
    cardName: '',
    expiry: '',
    cvv: '',
    agreeTerms: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : value;
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (formData.cardNumber.replace(/\s/g, '').length < 16) {
      newErrors.cardNumber = 'Geçerli kart numarası girin';
    }
    if (!formData.cardName.trim()) {
      newErrors.cardName = 'Kart üzerindeki isim gerekli';
    }
    if (!formData.expiry.match(/^\d{2}\/\d{2}$/)) {
      newErrors.expiry = 'GG/AA formatında girin';
    }
    if (formData.cvv.length < 3) {
      newErrors.cvv = '3 veya 4 haneli CVV girin';
    }
    if (!formData.agreeTerms) {
      newErrors.agreeTerms = 'Şartları kabul etmeniz gerekli';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsProcessing(true);

    // Simüle edilmiş ödeme işlemi
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Demo modunda ödeme başarılı kabul edilir
    localStorage.setItem('subscription_active', JSON.stringify({
      package: selectedPackage.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      paymentId: 'demo_' + Date.now()
    }));

    setIsProcessing(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`${selectedPackage.color} text-white p-6 rounded-t-2xl`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Ödeme</h3>
            <button onClick={onCancel} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">Seçili Paket</p>
              <p className="text-2xl font-bold">{selectedPackage.name}</p>
            </div>
            <div className="text-right">
              <p className="text-white/80 text-sm">{selectedPackage.period}</p>
              <p className="text-3xl font-bold">
                {selectedPackage.price === 0 ? 'ÜCRETSIZ' : `${selectedPackage.price} ₺`}
              </p>
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Card Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kart Numarası
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.cardNumber}
                onChange={(e) => setFormData({
                  ...formData,
                  cardNumber: formatCardNumber(e.target.value)
                })}
                maxLength={19}
                placeholder="0000 0000 0000 0000"
                className={`w-full px-4 py-3 pl-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.cardNumber ? 'border-red-500' : 'border-gray-200'
                }`}
              />
              <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
            {errors.cardNumber && (
              <p className="text-red-500 text-sm mt-1">{errors.cardNumber}</p>
            )}
          </div>

          {/* Card Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kart Üzerindeki İsim
            </label>
            <input
              type="text"
              value={formData.cardName}
              onChange={(e) => setFormData({ ...formData, cardName: e.target.value.toUpperCase() })}
              placeholder="AD SOYAD"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                errors.cardName ? 'border-red-500' : 'border-gray-200'
              }`}
            />
            {errors.cardName && (
              <p className="text-red-500 text-sm mt-1">{errors.cardName}</p>
            )}
          </div>

          {/* Expiry and CVV */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Son Kullanma
              </label>
              <input
                type="text"
                value={formData.expiry}
                onChange={(e) => setFormData({
                  ...formData,
                  expiry: formatExpiry(e.target.value)
                })}
                maxLength={5}
                placeholder="AA/YY"
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.expiry ? 'border-red-500' : 'border-gray-200'
                }`}
              />
              {errors.expiry && (
                <p className="text-red-500 text-sm mt-1">{errors.expiry}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CVV
              </label>
              <input
                type="text"
                value={formData.cvv}
                onChange={(e) => setFormData({
                  ...formData,
                  cvv: e.target.value.replace(/\D/g, '').substring(0, 4)
                })}
                maxLength={4}
                placeholder="000"
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.cvv ? 'border-red-500' : 'border-gray-200'
                }`}
              />
              {errors.cvv && (
                <p className="text-red-500 text-sm mt-1">{errors.cvv}</p>
              )}
            </div>
          </div>

          {/* Terms */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="terms"
              checked={formData.agreeTerms}
              onChange={(e) => setFormData({ ...formData, agreeTerms: e.target.checked })}
              className="mt-1 w-4 h-4 text-green-500 border-gray-300 rounded focus:ring-green-500"
            />
            <label htmlFor="terms" className="text-sm text-gray-600">
              <span className="font-medium">Kullanım şartlarını</span> ve{' '}
              <span className="font-medium">gizlilik politikasını</span> kabul ediyorum.
            </label>
          </div>
          {errors.agreeTerms && (
            <p className="text-red-500 text-sm">{errors.agreeTerms}</p>
          )}

          {/* Security Notice */}
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
            <Lock className="w-4 h-4" />
            <span>Ödemeleriniz 256-bit SSL şifreleme ile güvende</span>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className={`flex-1 px-4 py-3 text-white rounded-lg transition-colors flex items-center justify-center gap-2 ${
                isProcessing ? 'bg-gray-400 cursor-not-allowed' : selectedPackage.color + ' hover:opacity-90'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  İşleniyor...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Ödemeyi Tamamla
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Subscription() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<typeof PACKAGES[0] | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Demo modunda oturum açmış kullanıcıyı super_admin yap
  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      // Demo için kullanıcı rolünü güncelle
      const updatedUser = { ...user, role: 'super_admin' as const };
      localStorage.setItem('coaching_user', JSON.stringify(updatedUser));
      window.location.reload();
    }
  }, [user]);

  const handleSelectPackage = (pkg: typeof PACKAGES[0]) => {
    if (pkg.price === 0) {
      // Ücretsiz paket - direkt aktif et
      setSelectedPackage(pkg);
      setShowPayment(true);
    } else {
      setSelectedPackage(pkg);
      setShowPayment(true);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    setPaymentSuccess(true);
  };

  const currentPackage = PACKAGES.find(p => p.id === user?.package) || PACKAGES[0];
  const Icon = currentPackage.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-white/5 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Akıllı Koçluk Sistemi</h1>
                <p className="text-slate-400 text-sm">Eğitimde yeni nesil takip platformu</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-4 py-2 rounded-lg ${currentPackage.color} text-white`}>
                <span className="text-sm font-medium">{currentPackage.name} Paketi</span>
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                Panele Dön
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Success Message */}
        {paymentSuccess && (
          <div className="mb-8 bg-green-500/20 border border-green-500/30 rounded-xl p-6 text-center">
            <Check className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Ödeme Başarılı!</h2>
            <p className="text-slate-300">
              {selectedPackage?.name} paketiniz aktifleştirildi. Tüm özelliklere erişebilirsiniz.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              Panele Git
            </button>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Eğitimde Fark Yaratın
          </h2>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Öğrencilerinizin başarısını artıran, velilere profesyonel raporlar sunan
            ve WhatsApp ile anında paylaşım sağlayan kapsamlı koçluk platformu.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 text-center border border-white/10">
            <Users className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">5,000+</p>
            <p className="text-slate-400 text-sm">Aktif Öğrenci</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 text-center border border-white/10">
            <BookOpen className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">50+</p>
            <p className="text-slate-400 text-sm">Eğitim Kurumu</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 text-center border border-white/10">
            <TrendingUp className="w-8 h-8 text-purple-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">%87</p>
            <p className="text-slate-400 text-sm">Başarı Artışı</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 text-center border border-white/10">
            <Star className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">4.9/5</p>
            <p className="text-slate-400 text-sm">Müşteri Memnuniyeti</p>
          </div>
        </div>

        {/* Pricing Cards */}
        <h3 className="text-2xl font-bold text-white text-center mb-8">
          Size Özel Paketler
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PACKAGES.map((pkg) => {
            const PkgIcon = pkg.icon;
            const isCurrent = user?.package === pkg.id;

            return (
              <div
                key={pkg.id}
                className={`relative bg-white rounded-2xl overflow-hidden transition-transform hover:scale-105 ${
                  pkg.recommended ? 'ring-2 ring-green-500' : ''
                }`}
              >
                {/* Badge */}
                {pkg.badge && (
                  <div className={`absolute top-4 right-4 ${pkg.color} text-white text-xs font-bold px-3 py-1 rounded-full`}>
                    {pkg.badge}
                  </div>
                )}

                {/* Header */}
                <div className={`${pkg.color} p-6 text-white`}>
                  <PkgIcon className="w-10 h-10 mb-4" />
                  <h4 className="text-xl font-bold">{pkg.name}</h4>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">
                      {pkg.price === 0 ? 'Ücretsiz' : `${pkg.price} ₺`}
                    </span>
                    {pkg.price > 0 && (
                      <span className="text-white/80">/{pkg.period}</span>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div className="p-6">
                  <ul className="space-y-3 mb-6">
                    {pkg.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600 text-sm">{feature}</span>
                      </li>
                    ))}
                    {pkg.limitations.map((limitation, idx) => (
                      <li key={idx} className="flex items-start gap-2 opacity-50">
                        <X className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-500 text-sm">{limitation}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSelectPackage(pkg)}
                    disabled={isCurrent}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                      isCurrent
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : pkg.color + ' text-white hover:opacity-90'
                    }`}
                  >
                    {isCurrent ? 'Mevcut Paket' : pkg.price === 0 ? 'Hemen Başla' : 'Seç'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="mt-16">
          <h3 className="text-2xl font-bold text-white text-center mb-8">
            Sıkça Sorulan Sorular
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <h4 className="text-white font-semibold mb-2">Deneme süresi var mı?</h4>
              <p className="text-slate-400 text-sm">
                Evet, tüm paketlerimiz 14 gün ücretsiz deneme ile başlar. Kredi kartı gerekmez.
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <h4 className="text-white font-semibold mb-2">Aboneliği iptal edebilir miyim?</h4>
              <p className="text-slate-400 text-sm">
                Evet, istediğiniz zaman aboneliğinizi iptal edebilirsiniz. Gizli ücret yok.
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <h4 className="text-white font-semibold mb-2">Ödeme güvenli mi?</h4>
              <p className="text-slate-400 text-sm">
                Tüm ödemeler 256-bit SSL şifreleme ile korunur ve PCI DSS uyumludur.
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <h4 className="text-white font-semibold mb-2">Fatura alabilir miyim?</h4>
              <p className="text-slate-400 text-sm">
                Evet, tüm ödemeler için e-fatura veya fatura talep edebilirsiniz.
              </p>
            </div>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-slate-400">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <span className="text-sm">SSL Güvenli Ödeme</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            <span className="text-sm">PCI DSS Uyumlu</span>
          </div>
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5" />
            <span className="text-sm">7/24 Destek</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            <span className="text-sm">Kolay İptal</span>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && selectedPackage && (
        <PaymentForm
          selectedPackage={selectedPackage}
          onSuccess={handlePaymentSuccess}
          onCancel={() => setShowPayment(false)}
        />
      )}
    </div>
  );
}
