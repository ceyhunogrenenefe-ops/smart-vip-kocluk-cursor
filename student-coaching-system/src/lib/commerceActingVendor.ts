/** Süper admin bir satıcının paneline geçince seçilen vendor (localStorage). */
export const COMMERCE_ACTING_VENDOR_KEY = 'commerce_acting_vendor';

export type ActingVendor = { id: string; name: string };

export function getActingVendor(): ActingVendor | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(COMMERCE_ACTING_VENDOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActingVendor;
    if (!parsed?.id) return null;
    return { id: String(parsed.id), name: String(parsed.name || '') };
  } catch {
    return null;
  }
}

export function getActingVendorId(): string | undefined {
  const v = getActingVendor();
  return v?.id || undefined;
}

export function setActingVendor(vendor: ActingVendor | null): void {
  if (typeof window === 'undefined') return;
  if (!vendor?.id) {
    localStorage.removeItem(COMMERCE_ACTING_VENDOR_KEY);
    window.dispatchEvent(new Event('commerce-acting-vendor'));
    return;
  }
  localStorage.setItem(COMMERCE_ACTING_VENDOR_KEY, JSON.stringify({ id: vendor.id, name: vendor.name || '' }));
  window.dispatchEvent(new Event('commerce-acting-vendor'));
}

export function clearActingVendor(): void {
  setActingVendor(null);
}
