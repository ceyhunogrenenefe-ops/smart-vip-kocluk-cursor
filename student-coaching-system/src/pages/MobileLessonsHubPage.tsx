import React, { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import MobileNavHub from '../components/layout/MobileNavHub';
import {
  getStructuredNavForRoles,
  STUDENT_LESSON_NAV_ITEMS
} from '../components/layout/sidebar/navModel';

/** Mobil — Ders & Görüşmeler (öğrenci panelindeki gibi hub) */
export default function MobileLessonsHubPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);

  const items = useMemo(() => {
    const isStudentOnly =
      tags.includes('student') &&
      !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
    if (isStudentOnly) {
      return STUDENT_LESSON_NAV_ITEMS.map((it) => ({
        path: it.path,
        label: it.label,
        icon: it.icon
      }));
    }
    const nav = getStructuredNavForRoles(tags);
    return nav.lessons.map((it) => ({
      path: it.path,
      label: it.label,
      icon: it.icon
    }));
  }, [tags]);

  return (
    <MobileNavHub
      title="Ders & Görüşmeler"
      subtitle="Canlı dersler, görüşmeler ve içerik panelleri"
      items={items}
    />
  );
}
