/**
 * Siparişte öğrencinin sınıfı — satıcıya doğru sınıfın denemesi/kitabı gitsin.
 * «5-6-7. sınıf deneme» gibi çok sınıflı üründe sınıf seçilmeden ödeme açılmaz
 * (sunucu da aynı kuralı uygular: api/_lib/commerce-order-sinif.js).
 */
import React from 'react';

export const ORDER_SINIF_OPTIONS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'LGS', 'TYT', 'AYT', 'YKS', 'Mezun'];

const LAST_CLASS_KEY = 'ovd_store_last_class';

export function sinifOptionLabel(v: string) {
  return /^\d+$/.test(v) ? `${v}. Sınıf` : v;
}

/** Kitabın sınıf listesinde birden fazla okul sınıfı var mı (5-6-7, 9-10 gibi). */
export function isMultiClassLevels(levels: readonly string[] | null | undefined) {
  const nums = new Set((levels ?? []).map((c) => String(c).trim()).filter((c) => /^\d+$/.test(c)));
  return nums.size > 1;
}

/** Çok sınıflı üründe yalnız o ürünün sınıfları seçilsin. */
export function numericClassChoices(levels: readonly string[] | null | undefined) {
  return [...new Set((levels ?? []).map((c) => String(c).trim()).filter((c) => /^\d+$/.test(c)))].sort(
    (a, b) => Number(a) - Number(b)
  );
}

/** Mağazada en son seçilen sınıf sekmesi (ön seçim için). */
export function rememberStoreClass(level: string | null | undefined) {
  try {
    if (level) sessionStorage.setItem(LAST_CLASS_KEY, String(level));
  } catch {
    /* tarayıcı depolaması kapalı olabilir */
  }
}

export function lastStoreClass(): string {
  try {
    return sessionStorage.getItem(LAST_CLASS_KEY) || '';
  } catch {
    return '';
  }
}

/** «8» / «LGS» gibi mağaza anahtarını seçenek değerine çevirir; tanınmazsa ''. */
export function toSinifOption(raw: string | null | undefined, allowed: readonly string[] = ORDER_SINIF_OPTIONS) {
  const s = String(raw ?? '')
    .replace(/\s*\.?\s*s[iı]n[iı]f\s*$/i, '')
    .trim();
  return allowed.includes(s) ? s : '';
}

type SelectProps = {
  value: string;
  onChange: (v: string) => void;
  options?: readonly string[];
  required?: boolean;
  hint?: string;
  className?: string;
};

export function OrderSinifSelect({ value, onChange, options = ORDER_SINIF_OPTIONS, required, hint, className }: SelectProps) {
  const missing = Boolean(required && !value);
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="text-xs font-semibold text-slate-700">
        Öğrencinin sınıfı {required ? <span className="text-red-500">*</span> : null}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white ${
          missing ? 'border-amber-400 ring-1 ring-amber-200' : 'border-slate-200'
        }`}
      >
        <option value="">Sınıf seçin</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {sinifOptionLabel(o)}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-[11px] text-amber-700">{hint}</span> : null}
    </label>
  );
}
