import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { AppModal, AppModalBody, AppModalFooter, AppModalHeader } from '../ui/AppModal';
import {
  createPaymentAccount,
  listPaymentAccounts,
  patchPaymentAccount,
  type PaymentAccount
} from '../../lib/studentPaymentTrackerApi';

function normalizeIbanInput(raw: string) {
  return String(raw || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function formatIbanDisplay(iban?: string | null) {
  const s = normalizeIbanInput(iban || '');
  if (!s) return '';
  return s.replace(/(.{4})/g, '$1 ').trim();
}

type Props = {
  open: boolean;
  onClose: () => void;
  institutionId: string;
  onSaved?: () => void;
};

type Form = {
  label: string;
  bank_name: string;
  account_holder: string;
  iban: string;
  notes: string;
};

const emptyForm = (): Form => ({
  label: '',
  bank_name: '',
  account_holder: '',
  iban: '',
  notes: ''
});

/**
 * Banka hesapları — IBAN burada bir kez kaydedilir; özel ders WhatsApp mesajlarında otomatik kullanılır.
 */
export default function PaymentBankAccountsModal({ open, onClose, institutionId, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listPaymentAccounts(institutionId || undefined, 'bank', { includeInactive: true });
      setAccounts(r.data.filter((a) => (a.account_type || 'bank') === 'bank'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hesaplar yüklenemedi');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setEditOpen(true);
  };

  const openEdit = (a: PaymentAccount) => {
    setEditingId(a.id);
    setForm({
      label: a.label || '',
      bank_name: a.bank_name || '',
      account_holder: a.account_holder || '',
      iban: formatIbanDisplay(a.iban),
      notes: a.notes || ''
    });
    setEditOpen(true);
  };

  const save = async () => {
    if (!form.label.trim()) {
      toast.error('Hesap adı gerekli');
      return;
    }
    const iban = normalizeIbanInput(form.iban) || null;
    setSaving(true);
    try {
      if (editingId) {
        await patchPaymentAccount({
          id: editingId,
          label: form.label.trim(),
          bank_name: form.bank_name.trim() || null,
          account_holder: form.account_holder.trim() || null,
          account_type: 'bank',
          iban,
          notes: form.notes.trim() || null
        });
        toast.success('IBAN / hesap güncellendi — mesajlarda otomatik kullanılır');
      } else {
        await createPaymentAccount({
          label: form.label.trim(),
          bank_name: form.bank_name.trim() || null,
          account_holder: form.account_holder.trim() || null,
          account_type: 'bank',
          iban,
          notes: form.notes.trim() || null,
          institution_id: institutionId || null
        });
        toast.success('Banka hesabı eklendi');
      }
      setEditOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      await load();
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AppModal open={open} onClose={onClose} panelClassName="max-w-lg">
        <AppModalHeader>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Banka hesapları (IBAN)</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              IBAN&apos;ı bir kez buraya girin; özel ders veli mesajında seçtiğiniz hesabın bilgileri otomatik gelir.
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>
            Kapat
          </button>
        </AppModalHeader>
        <AppModalBody>
          {loading && !accounts.length ? (
            <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
            </p>
          ) : accounts.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              Henüz banka hesabı yok. IBAN ile birlikte ekleyin.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {accounts.map((a) => {
                const aktif = a.active !== false;
                const iban = formatIbanDisplay(a.iban);
                return (
                  <li
                    key={a.id}
                    className={`flex flex-wrap items-start gap-3 py-3 ${aktif ? '' : 'opacity-60'}`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                      <Building2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{a.label}</span>
                        {!aktif ? (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            Pasif
                          </span>
                        ) : null}
                        {!iban ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                            IBAN eksik
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[a.bank_name, a.account_holder].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {iban || 'IBAN girilmedi'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600"
                    >
                      <Pencil className="h-3.5 w-3.5" /> IBAN düzenle
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </AppModalBody>
        <AppModalFooter>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-slate-600"
          >
            <Plus className="h-4 w-4" /> Yeni banka hesabı
          </button>
        </AppModalFooter>
      </AppModal>

      <AppModal open={editOpen} onClose={() => setEditOpen(false)} panelClassName="max-w-md">
        <AppModalHeader>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {editingId ? 'Banka hesabını düzenle' : 'Banka hesabı ekle'}
          </h3>
          <button type="button" className="text-sm text-slate-500" onClick={() => setEditOpen(false)}>
            Kapat
          </button>
        </AppModalHeader>
        <AppModalBody>
          <div className="grid gap-3">
            <label className="text-xs text-slate-600 dark:text-slate-400">
              Hesap adı *
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Örn. Ziraat — Songül Öğrenenefe"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-400">
              Banka adı
              <input
                value={form.bank_name}
                onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                placeholder="Ziraat / Enpara…"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-400">
              Hesap sahibi
              <input
                value={form.account_holder}
                onChange={(e) => setForm((f) => ({ ...f, account_holder: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-400">
              IBAN (veli mesajında otomatik)
              <input
                value={form.iban}
                onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
          </div>
        </AppModalBody>
        <AppModalFooter>
          <button
            type="button"
            onClick={() => setEditOpen(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-600"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kaydet
          </button>
        </AppModalFooter>
      </AppModal>
    </>
  );
}
