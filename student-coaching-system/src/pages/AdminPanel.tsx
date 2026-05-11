// Türkçe: Super Admin Paneli - Tüm Kurumları Yönetme
import React, { useState, useCallback, useEffect } from 'react';
import { useOrganization, PLAN_LIMITS } from '../context/OrganizationContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { apiFetch, getAuthToken } from '../lib/session';
import { Organization, OrganizationPlan } from '../types';
import {
  Building2,
  Users,
  GraduationCap,
  TrendingUp,
  Shield,
  Settings,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Crown,
  Plus,
  Search,
  MoreVertical,
  Calendar,
  Mail,
  Phone,
  MessageCircle,
  Send,
  Loader2,
  Sparkles
} from 'lucide-react';
import {
  defaultAcademicCenterLinks,
  fetchAcademicCenterLinksFromServer,
  saveAcademicCenterLinksToServer,
  type AcademicCenterLinks
} from '../lib/academicCenterLinks';

interface MetaWhatsAppServerStatus {
  configured: boolean;
  provider?: string;
  graph_api_version?: string;
  phone_number_id_suffix?: string | null;
  waba_id_suffix?: string | null;
  has_token?: boolean;
  hint?: string | null;
}

// Plan renkleri
const planColors: Record<OrganizationPlan, string> = {
  starter: 'bg-gray-100 text-gray-700',
  professional: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700'
};

export default function AdminPanel() {
  const { user, getAllUsers, impersonate, canImpersonate } = useAuth();
  const { organizations, updateOrganization } = useOrganization();
  const navigate = useNavigate();
  const canWhatsAppTest = user?.role === 'super_admin' || user?.role === 'admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState<OrganizationPlan | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('Yönetim paneli: Meta WhatsApp test.');
  const [waSending, setWaSending] = useState(false);
  const [waResult, setWaResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [tplOptions, setTplOptions] = useState<{ type: string; name: string }[]>([]);
  const [ttType, setTtType] = useState('');
  const [ttPhone, setTtPhone] = useState('');
  const [ttVars, setTtVars] = useState('{}');
  const [ttBusy, setTtBusy] = useState(false);
  const [ttMsg, setTtMsg] = useState<string | null>(null);
  const [metaWaStatus, setMetaWaStatus] = useState<MetaWhatsAppServerStatus | null>(null);
  const [globalCounts, setGlobalCounts] = useState({
    students: 0,
    teachers: 0,
    coaches: 0,
    classes: 0
  });

  const [academicLinks, setAcademicLinks] = useState<AcademicCenterLinks>(() => ({
    ...defaultAcademicCenterLinks
  }));
  const [academicLinksMsg, setAcademicLinksMsg] = useState<string | null>(null);
  const [academicLinksBusy, setAcademicLinksBusy] = useState(false);

  const refreshMetaWa = useCallback(async () => {
    if (!canWhatsAppTest || !getAuthToken()) return;
    try {
      const res = await apiFetch('/api/meta/whatsapp');
      const payload = (await res.json().catch(() => ({}))) as { data?: MetaWhatsAppServerStatus };
      if (res.ok && payload?.data) setMetaWaStatus(payload.data);
      else setMetaWaStatus(null);
    } catch {
      setMetaWaStatus(null);
    }
  }, [canWhatsAppTest]);

  useEffect(() => {
    void refreshMetaWa();
  }, [refreshMetaWa]);

  useEffect(() => {
    if (!canWhatsAppTest || !getAuthToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch('/api/message-templates');
        const j = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const list = (j.templates || []) as { type: string; name: string }[];
        const opts = list.map((x) => ({ type: x.type, name: x.name }));
        setTplOptions(opts);
        setTtType((prev) => prev || opts[0]?.type || '');
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canWhatsAppTest]);

  useEffect(() => {
    if (!getAuthToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchAcademicCenterLinksFromServer();
        if (!cancelled) setAcademicLinks(data);
      } catch {
        if (!cancelled) setAcademicLinks({ ...defaultAcademicCenterLinks });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!getAuthToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const [uRes, cRes] = await Promise.all([
          apiFetch('/api/users'),
          apiFetch('/api/class-live-lessons?scope=classes')
        ]);
        const [uJson, cJson] = await Promise.all([uRes.json().catch(() => ({})), cRes.json().catch(() => ({}))]);
        const users = Array.isArray(uJson.data) ? uJson.data : [];
        const classes = Array.isArray(cJson.data) ? cJson.data : [];
        const next = {
          students: users.filter((u: { role?: string }) => u.role === 'student').length,
          teachers: users.filter((u: { role?: string }) => u.role === 'teacher').length,
          coaches: users.filter((u: { role?: string }) => u.role === 'coach').length,
          classes: classes.length
        };
        if (!cancelled) setGlobalCounts(next);
      } catch {
        if (!cancelled) {
          setGlobalCounts({ students: 0, teachers: 0, coaches: 0, classes: 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendWhatsAppTest = async () => {
    const p = waPhone.trim();
    if (!p || p.replace(/\D/g, '').length < 10) {
      setWaResult({ ok: false, text: 'Geçerli bir telefon girin (05… veya +90…).' });
      return;
    }
    const m = waMessage.trim();
    if (!m) {
      setWaResult({ ok: false, text: 'Mesaj boş olamaz.' });
      return;
    }
    setWaSending(true);
    setWaResult(null);
    try {
      const res = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: p, message: m })
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; sid?: string; error?: string };
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      setWaResult({ ok: true, text: payload.sid ? `Gönderildi. SID: ${payload.sid}` : 'Gönderildi.' });
      void refreshMetaWa();
    } catch (e) {
      setWaResult({ ok: false, text: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setWaSending(false);
    }
  };

  const saveAcademicLinks = async () => {
    setAcademicLinksBusy(true);
    setAcademicLinksMsg(null);
    try {
      const saved = await saveAcademicCenterLinksToServer(academicLinks);
      setAcademicLinks(saved);
      setAcademicLinksMsg('Akademik Merkez linkleri kaydedildi.');
    } catch (e) {
      setAcademicLinksMsg(
        e instanceof Error && e.message
          ? e.message
          : 'Kaydetme başarısız. SQL migration veya SUPABASE_SERVICE_ROLE_KEY ortamını kontrol edin.'
      );
    } finally {
      setAcademicLinksBusy(false);
    }
  };

  const sendTemplateTest = async () => {
    const p = ttPhone.trim();
    if (!p || p.replace(/\D/g, '').length < 10) {
      setTtMsg('Şablon testi: geçerli telefon girin.');
      return;
    }
    if (!ttType) {
      setTtMsg('Şablon tipi seçin.');
      return;
    }
    let variables: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(ttVars || '{}') as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('shape');
      variables = parsed as Record<string, unknown>;
    } catch {
      setTtMsg('Değişkenler geçerli JSON nesne olmalı.');
      return;
    }
    setTtBusy(true);
    setTtMsg(null);
    try {
      const res = await apiFetch('/api/whatsapp/template-test', {
        method: 'POST',
        body: JSON.stringify({
          template_type: ttType,
          phone: p,
          variables: Object.fromEntries(
            Object.entries(variables).map(([k, v]) => [k, v == null ? '' : String(v)])
          )
        })
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sid?: string;
        meta_template_name?: string | null;
        channel?: string;
      };
      if (!res.ok || !payload.ok) {
        setTtMsg(payload.error || `HTTP ${res.status}`);
        return;
      }
      const tn = payload.meta_template_name ? ` şablon:${payload.meta_template_name}` : '';
      setTtMsg(
        `Şablon gönderildi (${payload.channel || '?'})${tn}${payload.sid ? ` · id …${payload.sid.slice(-8)}` : ''}`
      );
      void refreshMetaWa();
    } catch (e) {
      setTtMsg(e instanceof Error ? e.message : 'Hata');
    } finally {
      setTtBusy(false);
    }
  };

  // Filtreleme
  const filteredOrgs = organizations.filter(org => {
    const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         org.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan = filterPlan === 'all' || org.plan === filterPlan;
    const matchesStatus = filterStatus === 'all' ||
                         (filterStatus === 'active' && org.isActive) ||
                         (filterStatus === 'inactive' && !org.isActive);
    return matchesSearch && matchesPlan && matchesStatus;
  });

  // İstatistikler
  const stats = {
    totalOrgs: organizations.length,
    activeOrgs: organizations.filter(o => o.isActive).length,
    totalStudents: organizations.reduce((sum, o) => sum + o.stats.totalStudents, 0),
    totalCoaches: organizations.reduce((sum, o) => sum + o.stats.totalCoaches, 0),
    enterpriseCount: organizations.filter(o => o.plan === 'enterprise').length,
    professionalCount: organizations.filter(o => o.plan === 'professional').length,
    starterCount: organizations.filter(o => o.plan === 'starter').length
  };

  // Plan değiştir
  const handlePlanChange = (orgId: string, newPlan: OrganizationPlan) => {
    updateOrganization(orgId, { plan: newPlan });
  };

  // Aktif/Pasif değiştir
  const toggleActive = (org: Organization) => {
    updateOrganization(org.id, { isActive: !org.isActive });
  };

  const quickUsers = getAllUsers().slice(0, 12);

  const handleViewPanel = async (userId: string, role: string) => {
    const result = await impersonate(userId);
    if (!result.success) return;
    if (role === 'coach') navigate('/coach-dashboard');
    else if (role === 'student') navigate('/student-dashboard');
    else navigate('/dashboard');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <Crown className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Super Admin Paneli</h2>
            <p className="text-purple-100">Tüm kurumları yönetin ve izleyin</p>
          </div>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-purple-500 mb-2">
            <Building2 className="w-4 h-4" />
            <span className="text-sm">Toplam Kurum</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.totalOrgs}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-indigo-500 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Toplam Öğretmen</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{globalCounts.teachers}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-sky-500 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Toplam Koç</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{globalCounts.coaches}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-emerald-500 mb-2">
            <Building2 className="w-4 h-4" />
            <span className="text-sm">Toplam Sınıf</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{globalCounts.classes}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-green-500 mb-2">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Aktif</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.activeOrgs}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-blue-500 mb-2">
            <GraduationCap className="w-4 h-4" />
            <span className="text-sm">Toplam Öğrenci</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.totalStudents}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-orange-500 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Toplam Koç</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.totalCoaches}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-purple-500 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Enterprise</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{stats.enterpriseCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-blue-500 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Professional</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{stats.professionalCount}</p>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-indigo-900">Canlı özel ders entegrasyonu</p>
          <p className="text-sm text-indigo-700">
            Tüm öğretmenlere ait canlı özel dersleri görüntüleyin; öğretmen ve platform filtresi kullanın
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/live-lessons')}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          Panele git
        </button>
      </div>

      {canWhatsAppTest && (
        <div className="bg-white rounded-xl shadow-sm border border-violet-200 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-800">Akademik Merkez linkleri</h3>
              <p className="text-sm text-slate-600 mt-1">
                Etüt sınıfları, deneme / sanal optik ve soru havuzu adresleri. Kayıt için{' '}
                <code className="text-xs bg-slate-100 px-1 rounded">platform_academic_center_links</code> tablosu ve
                sunucuda service role anahtarı gerekir (
                <code className="text-xs">sql/2026-05-07-academic-center-links.sql</code>).
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Etüt sınıfları</p>
              {(
                [
                  ['class56', '5–6. sınıf'],
                  ['class78', '7–8. sınıf'],
                  ['class911', '9–10–11'],
                  ['yks', 'YKS']
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs text-slate-600">{label}</span>
                  <input
                    type="url"
                    value={academicLinks.studyClasses[key]}
                    onChange={(e) =>
                      setAcademicLinks((prev) => ({
                        ...prev,
                        studyClasses: { ...prev.studyClasses, [key]: e.target.value }
                      }))
                    }
                    className="mt-0.5 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                  />
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Deneme / optik</p>
              <label className="block">
                <span className="text-xs text-slate-600">Deneme giriş</span>
                <input
                  type="url"
                  value={academicLinks.exams.exam}
                  onChange={(e) =>
                    setAcademicLinks((prev) => ({
                      ...prev,
                      exams: { ...prev.exams, exam: e.target.value }
                    }))
                  }
                  className="mt-0.5 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">Sanal optik</span>
                <input
                  type="url"
                  value={academicLinks.exams.optic}
                  onChange={(e) =>
                    setAcademicLinks((prev) => ({
                      ...prev,
                      exams: { ...prev.exams, optic: e.target.value }
                    }))
                  }
                  className="mt-0.5 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
              </label>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Soru havuzları</p>
              <label className="block">
                <span className="text-xs text-slate-600">Havuz 1</span>
                <input
                  type="url"
                  value={academicLinks.questionPools.pool1}
                  onChange={(e) =>
                    setAcademicLinks((prev) => ({
                      ...prev,
                      questionPools: { ...prev.questionPools, pool1: e.target.value }
                    }))
                  }
                  className="mt-0.5 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">Havuz 2</span>
                <input
                  type="url"
                  value={academicLinks.questionPools.pool2}
                  onChange={(e) =>
                    setAcademicLinks((prev) => ({
                      ...prev,
                      questionPools: { ...prev.questionPools, pool2: e.target.value }
                    }))
                  }
                  className="mt-0.5 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
              </label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveAcademicLinks()}
              disabled={academicLinksBusy}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {academicLinksBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Linkleri kaydet
            </button>
            {academicLinksMsg && (
              <p
                className={`text-sm ${academicLinksMsg.includes('kaydedildi') ? 'text-green-700' : 'text-red-700'}`}
              >
                {academicLinksMsg}
              </p>
            )}
          </div>
        </div>
      )}

      {canWhatsAppTest && (
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">WhatsApp test (Meta Cloud API)</h3>
              <p className="text-sm text-slate-600 mt-1">
                Serbest metin gönderir (çoğu durumda alıcıyla son 24 saatte oturum gerekir); kayıt{' '}
                <code className="text-xs bg-slate-100 px-1 rounded">message_logs</code> içine yazılır. Sunucuda{' '}
                <code className="text-xs">META_WHATSAPP_TOKEN</code>, <code className="text-xs">META_PHONE_NUMBER_ID</code>{' '}
                gerekir.
              </p>
              {metaWaStatus && (
                <p className="mt-2 text-xs text-slate-600">
                  Graph: <strong>{metaWaStatus.graph_api_version || '—'}</strong>
                  {metaWaStatus.phone_number_id_suffix && (
                    <>
                      {' '}
                      · Telefon kimliği (sonu): …{metaWaStatus.phone_number_id_suffix}
                    </>
                  )}
                  {metaWaStatus.waba_id_suffix && (
                    <>
                      {' '}
                      · WABA (sonu): …{metaWaStatus.waba_id_suffix}
                    </>
                  )}
                </p>
              )}
              {metaWaStatus?.hint && (
                <p className="mt-2 text-xs text-slate-600">{metaWaStatus.hint}</p>
              )}
              {metaWaStatus && !metaWaStatus.configured && (
                <p className="mt-2 text-sm text-red-700">META_* WhatsApp ortam değişkenleri eksik veya okunamadı.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Telefon</label>
              <input
                type="tel"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="+905551112233 veya 05551112233"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void sendWhatsAppTest()}
                disabled={waSending || !metaWaStatus?.configured}
                className="w-full md:w-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {waSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Gönder
              </button>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Mesaj</label>
            <textarea
              value={waMessage}
              onChange={(e) => setWaMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          {waResult && (
            <div
              className={`mt-3 p-3 rounded-lg text-sm ${waResult.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}
            >
              {waResult.text}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-green-100 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/message-templates')}
              className="px-4 py-2 rounded-lg border border-green-300 text-green-900 text-sm font-medium hover:bg-green-50"
            >
              WhatsApp şablonları &amp; Meta şablon adları
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
            >
              Meta ortam özeti (Ayarlar)
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-green-100 space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">Template Test Gönder</h4>
            <p className="text-xs text-slate-600">
              Her <code className="text-xs bg-slate-100 px-1 rounded">type</code> için{' '}
              <code className="text-xs bg-slate-100 px-1">message_templates.meta_template_name</code> ve bağlı gövde
              parametreleri kullanılır; eksik değişkenlerde API hata döner.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Şablon (type)</label>
                <select
                  value={ttType}
                  onChange={(e) => setTtType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  {tplOptions.map((o) => (
                    <option key={o.type} value={o.type}>
                      {o.name} ({o.type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Alıcı telefon</label>
                <input
                  type="tel"
                  value={ttPhone}
                  onChange={(e) => setTtPhone(e.target.value)}
                  placeholder="+90555…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Değişkenler (JSON)</label>
              <textarea
                value={ttVars}
                onChange={(e) => setTtVars(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              onClick={() => void sendTemplateTest()}
              disabled={ttBusy || !metaWaStatus?.configured}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2"
            >
              {ttBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Template test gönder
            </button>
            {ttMsg && (
              <p className={`text-sm ${ttMsg.includes('gönderildi') || ttMsg.includes('Şablon') ? 'text-green-800' : 'text-red-700'}`}>
                {ttMsg}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filtreler */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Arama */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Kurum ara..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Plan Filtresi */}
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value as OrganizationPlan | 'all')}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">Tüm Planlar</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>

          {/* Durum Filtresi */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
        </div>
      </div>

      {/* Kurum Listesi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-slate-800">
            Kurumlar ({filteredOrgs.length})
          </h3>
        </div>

        {filteredOrgs.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Henüz kurum bulunamadı</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kurum
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Öğrenci/Koç
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    İletişim
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Durum
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Son Deneme
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{org.name}</div>
                          <div className="text-sm text-gray-500">{org.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${planColors[org.plan]}`}>
                        {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="flex items-center gap-1 text-slate-700">
                          <GraduationCap className="w-4 h-4 text-blue-500" />
                          {org.stats.totalStudents}
                        </div>
                        <div className="flex items-center gap-1 text-gray-500">
                          <Users className="w-4 h-4" />
                          {org.stats.totalCoaches}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm space-y-1">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Mail className="w-3 h-3" />
                          {org.email}
                        </div>
                        <div className="flex items-center gap-1 text-gray-500">
                          <Phone className="w-3 h-3" />
                          {org.phone}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {org.isActive ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          Aktif
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircle className="w-4 h-4" />
                          Pasif
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(org.createdAt).toLocaleDateString('tr-TR')}
                        </div>
                        {org.expiresAt && (
                          <div className="text-xs text-orange-500 mt-1">
                            Bitiyor: {new Date(org.expiresAt).toLocaleDateString('tr-TR')}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* Plan Değiştir */}
                        <select
                          value={org.plan}
                          onChange={(e) => handlePlanChange(org.id, e.target.value as OrganizationPlan)}
                          className="px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="starter">Starter</option>
                          <option value="professional">Professional</option>
                          <option value="enterprise">Enterprise</option>
                        </select>

                        {/* Aktif/Pasif */}
                        <button
                          onClick={() => toggleActive(org)}
                          className={`p-2 rounded-lg ${
                            org.isActive
                              ? 'text-red-500 hover:bg-red-50'
                              : 'text-green-500 hover:bg-green-50'
                          }`}
                          title={org.isActive ? 'Pasif yap' : 'Aktif yap'}
                        >
                          {org.isActive ? (
                            <XCircle className="w-4 h-4" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plan Bilgileri */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(['starter', 'professional', 'enterprise'] as OrganizationPlan[]).map((plan) => (
          <div key={plan} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 capitalize">{plan}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${planColors[plan]}`}>
                {organizations.filter(o => o.plan === plan).length} kurum
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Öğrenci Limiti</span>
                <span className="font-medium text-slate-800">
                  {PLAN_LIMITS[plan].students === 999999 ? 'Sınırsız' : PLAN_LIMITS[plan].students}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Koç Limiti</span>
                <span className="font-medium text-slate-800">
                  {PLAN_LIMITS[plan].coaches === 999999 ? 'Sınırsız' : PLAN_LIMITS[plan].coaches}
                </span>
              </div>

              <div className="border-t pt-3 mt-3">
                <p className="text-xs text-gray-500 mb-2">Özellikler:</p>
                <ul className="space-y-1">
                  {PLAN_LIMITS[plan].features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Quick Access Panel</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {quickUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-800">{u.name}</p>
                <p className="text-xs text-gray-500">{u.email} • {u.role}</p>
              </div>
              <button
                onClick={() => handleViewPanel(u.id, u.role)}
                disabled={!canImpersonate(u)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                View Panel
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
