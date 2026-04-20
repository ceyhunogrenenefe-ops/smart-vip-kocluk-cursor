// Türkçe: Super Admin Paneli - Tüm Kurumları Yönetme
import React, { useState } from 'react';
import { useOrganization, PLAN_LIMITS } from '../context/OrganizationContext';
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
  Phone
} from 'lucide-react';

// Plan renkleri
const planColors: Record<OrganizationPlan, string> = {
  starter: 'bg-gray-100 text-gray-700',
  professional: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700'
};

export default function AdminPanel() {
  const { organizations, updateOrganization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState<OrganizationPlan | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-purple-500 mb-2">
            <Building2 className="w-4 h-4" />
            <span className="text-sm">Toplam Kurum</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.totalOrgs}</p>
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
    </div>
  );
}
