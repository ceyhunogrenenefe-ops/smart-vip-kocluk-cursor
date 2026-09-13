import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatRelativeTr(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'şimdi';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  });
}

export function contactDisplayName(contact?: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
} | null): string {
  if (!contact) return 'Bilinmeyen';
  if (contact.displayName?.trim()) return contact.displayName.trim();
  const full = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  if (full) return full;
  return contact.primaryPhone || contact.primaryEmail || 'Bilinmeyen';
}
