import React, { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import MobileNavHub from '../components/layout/MobileNavHub';
import { getStructuredNavForRoles } from '../components/layout/sidebar/navModel';

/** Mobil — Kurum, muhasebe, bildirim ve sistem yönetimi */
export default function MobileAdminHubPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);

  const items = useMemo(() => {
    const nav = getStructuredNavForRoles(tags);
    const seen = new Set<string>();
    const merged = [
      ...nav.orgSystem.filter((it) => it.path !== '/user-management'),
      ...nav.team,
      ...nav.whatsapp,
      ...nav.rest,
      ...nav.settings.filter((it) => it.path !== '/my-profile')
    ];
    return merged
      .filter((it) => {
        if (seen.has(it.path)) return false;
        seen.add(it.path);
        return true;
      })
      .map((it) => ({
        path: it.path,
        label: it.label,
        icon: it.icon
      }));
  }, [tags]);

  return (
    <MobileNavHub
      title="Yönetim"
      subtitle="Kurum, muhasebe, bildirimler ve sistem"
      items={items}
    />
  );
}
