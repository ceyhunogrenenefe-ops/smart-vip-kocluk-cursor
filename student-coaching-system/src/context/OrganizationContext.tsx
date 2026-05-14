// Türkçe: Kurum/Organizasyon Context'i - Çoklu Kiracı Destekli
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Organization, OrganizationPlan } from '../types';

export type CreateOrganizationOptions = {
  /** Supabase institutions.id ile aynı olmalı (Kullanıcı Yönetimi institution_id eşlemesi için) */
  reuseInstitutionId?: string;
  /** Yeni kayıttan sonra bu kurumu aktif seçili yapma (süper admin toplu eklemede false) */
  setAsActive?: boolean;
};

interface OrganizationContextType {
  organization: Organization | null;
  setOrganization: (org: Organization | null) => void;
  organizations: Organization[];
  createOrganization: (data: CreateOrgData, options?: CreateOrganizationOptions) => Promise<Organization>;
  updateOrganization: (id: string, data: Partial<Organization>) => void;
  getOrganizationBySlug: (slug: string) => Organization | null;
  isLoading: boolean;
}

interface CreateOrgData {
  name: string;
  email: string;
  phone: string;
  address?: string;
  slug?: string;
  plan?: OrganizationPlan;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

// Plan fiyatlandırması
export const PLAN_LIMITS: Record<OrganizationPlan, { students: number; coaches: number; features: string[] }> = {
  starter: {
    students: 50,
    coaches: 5,
    features: ['Temel raporlar', 'WhatsApp entegrasyonu', 'E-posta desteği']
  },
  professional: {
    students: 200,
    coaches: 20,
    features: ['Gelişmiş raporlar', 'PDF export', 'AI öneriler', 'Öncelikli destek']
  },
  enterprise: {
    students: 999999,
    coaches: 999999,
    features: ['Sınırsız', 'Özel logo', 'API erişimi', '7/24 destek', 'Özel eğitim']
  }
};

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Sayfa yüklendiğinde kurumları getir
  useEffect(() => {
    loadOrganizations();
  }, []);

  // Kurumları localStorage'dan yükle
  const loadOrganizations = () => {
    const saved = localStorage.getItem('coaching_organizations');
    if (saved) {
      try {
        setOrganizations(JSON.parse(saved));
      } catch {
        setOrganizations([]);
      }
    }
    setIsLoading(false);
  };

  // Kurumları localStorage'a kaydet
  const saveOrganizations = (orgs: Organization[]) => {
    setOrganizations(orgs);
    localStorage.setItem('coaching_organizations', JSON.stringify(orgs));
  };

  // Benzersiz slug oluştur
  const generateSlug = (name: string): string => {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);
    const suffix = Math.random().toString(36).substring(2, 6);
    return `${base}-${suffix}`;
  };

  // Yeni kurum oluştur
  const createOrganization = async (
    data: CreateOrgData,
    options?: CreateOrganizationOptions
  ): Promise<Organization> => {
    const reuseId = options?.reuseInstitutionId?.trim();
    const setAsActive = options?.setAsActive !== false;
    const newOrg: Organization = {
      id: reuseId || `org-${Date.now()}`,
      name: data.name,
      slug: data.slug || generateSlug(data.name),
      email: data.email,
      phone: data.phone,
      address: data.address || '',
      website: '',
      logo: '',
      plan: data.plan || 'starter',
      settings: {
        primaryColor: '#dc2626', // Kırmızı
        secondaryColor: '#1e40af', // Mavi
        customLogo: false,
        emailNotifications: true,
        whatsappEnabled: true
      },
      stats: {
        totalStudents: 0,
        totalCoaches: 0,
        totalExams: 0,
        activeStudents: 0
      },
      isActive: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 gün deneme
    };

    const updated =
      reuseId && organizations.some((o) => o.id === reuseId)
        ? organizations.map((o) => (o.id === reuseId ? { ...newOrg, slug: o.slug } : o))
        : [...organizations, newOrg];
    saveOrganizations(updated);
    if (setAsActive) {
      setOrganization(newOrg);
      localStorage.setItem('coaching_active_organization', JSON.stringify(newOrg));
    }

    return newOrg;
  };

  // Kurum güncelle
  const updateOrganization = (id: string, data: Partial<Organization>) => {
    const updated = organizations.map(org =>
      org.id === id ? { ...org, ...data } : org
    );
    saveOrganizations(updated);

    // Eğer güncellenen kurum aktif kurum ise onu da güncelle
    if (organization?.id === id) {
      const updatedOrg = { ...organization, ...data };
      setOrganization(updatedOrg);
      localStorage.setItem('coaching_active_organization', JSON.stringify(updatedOrg));
    }
  };

  // Slug ile kurum bul
  const getOrganizationBySlug = (slug: string): Organization | null => {
    return organizations.find(org => org.slug === slug) || null;
  };

  // Sayfa yüklendiğinde aktif kurumu kontrol et
  useEffect(() => {
    const savedOrg = localStorage.getItem('coaching_active_organization');
    if (savedOrg) {
      try {
        const org = JSON.parse(savedOrg);
        // Kurumun hala mevcut olduğunu kontrol et
        const exists = organizations.some(o => o.id === org.id);
        if (exists) {
          setOrganization(org);
        } else {
          localStorage.removeItem('coaching_active_organization');
        }
      } catch {
        localStorage.removeItem('coaching_active_organization');
      }
    }
  }, [organizations]);

  return (
    <OrganizationContext.Provider value={{
      organization,
      setOrganization,
      organizations,
      createOrganization,
      updateOrganization,
      getOrganizationBySlug,
      isLoading
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
