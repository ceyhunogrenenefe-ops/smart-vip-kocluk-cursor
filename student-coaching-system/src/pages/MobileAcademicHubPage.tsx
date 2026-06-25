import React, { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import MobileNavHub from '../components/layout/MobileNavHub';
import {
  getStructuredNavForRoles,
  STUDENT_PANEL_SUBMENU_ITEMS,
  STUDENT_NAV_ACADEMIC_CENTER
} from '../components/layout/sidebar/navModel';

/** Mobil — Akademik takip (plan, konu, deneme, merkez vb.) */
export default function MobileAcademicHubPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);

  const { featured, items } = useMemo(() => {
    const isStudentOnly =
      tags.includes('student') &&
      !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));

    if (isStudentOnly) {
      return {
        featured: {
          path: STUDENT_NAV_ACADEMIC_CENTER.path,
          label: STUDENT_NAV_ACADEMIC_CENTER.label,
          icon: STUDENT_NAV_ACADEMIC_CENTER.icon,
          description: 'Tüm akademik araçlar tek merkezde'
        },
        items: STUDENT_PANEL_SUBMENU_ITEMS.map((it) => ({
          path: it.path,
          label: it.label,
          icon: it.icon
        }))
      };
    }

    const nav = getStructuredNavForRoles(tags);
    const featuredItem = nav.academicCenter
      ? {
          path: nav.academicCenter.path,
          label: nav.academicCenter.label,
          icon: nav.academicCenter.icon,
          description: 'Tüm akademik araçlar tek merkezde'
        }
      : null;

    return {
      featured: featuredItem,
      items: nav.academic.map((it) => ({
        path: it.path,
        label: it.label,
        icon: it.icon
      }))
    };
  }, [tags]);

  return (
    <MobileNavHub
      title="Akademik Takip"
      subtitle="Plan, konu, kitap ve sınav takibi"
      featured={featured}
      items={items}
    />
  );
}
