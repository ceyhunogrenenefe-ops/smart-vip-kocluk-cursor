import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { AppModal } from '../ui/AppModal';

export type LoginCredentialsData = {
  title?: string;
  subtitle?: string;
  loginUrl?: string;
  email: string;
  password: string;
  roleLabel?: string;
  institutionName?: string;
  extraNote?: string;
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyableRow({
  label,
  value,
  mono = true,
  highlight
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p
          className={`mt-0.5 break-all text-sm ${mono ? 'font-mono' : ''} ${
            highlight ? 'font-semibold text-emerald-800' : 'font-medium text-slate-900'
          }`}
          data-copy-value={value}
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void onCopy()}
        className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        title={`${label} kopyala`}
        aria-label={`${label} kopyala`}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function formatLoginCredentialsText(data: LoginCredentialsData): string {
  const loginUrl =
    data.loginUrl?.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://www.dersonlinevipkocluk.com');
  const lines = [
    data.title ? `${data.title}` : 'Giriş bilgileri',
    data.institutionName ? `Kurum: ${data.institutionName}` : null,
    data.roleLabel ? `Rol: ${data.roleLabel}` : null,
    `Giriş adresi: ${loginUrl}`,
    `E-posta: ${data.email}`,
    `Şifre: ${data.password}`,
    data.extraNote || null
  ].filter(Boolean);
  return lines.join('\n');
}

export function CopyableLoginCredentialsPanel({
  data,
  onDismiss,
  dismissLabel = 'Tamam',
  autoCopyAll = false
}: {
  data: LoginCredentialsData;
  onDismiss?: () => void;
  dismissLabel?: string;
  autoCopyAll?: boolean;
}) {
  const loginUrl =
    data.loginUrl?.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://www.dersonlinevipkocluk.com');

  const allText = useMemo(() => formatLoginCredentialsText({ ...data, loginUrl }), [data, loginUrl]);

  const [allCopied, setAllCopied] = useState(false);

  const copyAll = useCallback(async () => {
    const ok = await copyText(allText);
    if (ok) {
      setAllCopied(true);
      window.setTimeout(() => setAllCopied(false), 2000);
    }
    return ok;
  }, [allText]);

  useEffect(() => {
    if (!autoCopyAll) return;
    void copyAll();
  }, [autoCopyAll, copyAll]);

  return (
    <div className="space-y-4 p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">{data.title || 'Giriş bilgileri'}</h3>
        {data.subtitle ? <p className="mt-1 text-sm text-slate-600">{data.subtitle}</p> : null}
        {autoCopyAll && allCopied ? (
          <p className="mt-2 text-xs font-medium text-emerald-700">Giriş bilgileri panoya kopyalandı.</p>
        ) : null}
      </div>

      {(data.institutionName || data.roleLabel) && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950">
          {data.institutionName ? (
            <p>
              <span className="text-emerald-800">Kurum:</span> {data.institutionName}
            </p>
          ) : null}
          {data.roleLabel ? (
            <p>
              <span className="text-emerald-800">Rol:</span> {data.roleLabel}
            </p>
          ) : null}
        </div>
      )}

      <div className="space-y-2">
        <CopyableRow label="Giriş adresi" value={loginUrl} />
        <CopyableRow label="E-posta" value={data.email} />
        <CopyableRow label="Şifre" value={data.password} highlight />
      </div>

      <button
        type="button"
        onClick={() => void copyAll()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
      >
        {allCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {allCopied ? 'Panoya kopyalandı' : 'Tümünü kopyala'}
      </button>

      {data.extraNote ? <p className="text-xs text-slate-500">{data.extraNote}</p> : null}

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {dismissLabel}
        </button>
      ) : null}
    </div>
  );
}

export function CopyableLoginCredentialsModal({
  open,
  onClose,
  data,
  autoCopyAll = false
}: {
  open: boolean;
  onClose: () => void;
  data: LoginCredentialsData | null;
  autoCopyAll?: boolean;
}) {
  if (!data) return null;
  return (
    <AppModal open={open} onClose={onClose} panelClassName="max-w-md">
      <CopyableLoginCredentialsPanel data={data} onDismiss={onClose} autoCopyAll={autoCopyAll} />
    </AppModal>
  );
}
