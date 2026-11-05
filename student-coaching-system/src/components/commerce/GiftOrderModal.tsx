/**
 * Kitap mağazası — öğrenciye HEDİYE gönder (yalnız admin / süper admin).
 * Ödeme alınmaz; sipariş «ödendi» olarak açılır ve satıcı paneline + WhatsApp'a düşer.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Gift, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { csStaffGiftOrder, csStaffRoster, type StaffRosterStudent } from '../../lib/commerceStoreApi';
import { formatCommerceTry } from '../../types/commerce.types';
import {
  isMultiClassLevels,
  numericClassChoices,
  ORDER_SINIF_OPTIONS,
  OrderSinifSelect,
  toSinifOption,
} from '../../lib/commerce/orderSinif';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  vendorOfferId?: string | null;
  packageId?: string | null;
  priceKurus?: number | null;
  classLevels?: string[] | null;
};

const EMPTY_SHIP = { name: '', phone: '', line1: '', district: '', city: '', note: '' };

export default function GiftOrderModal({ open, onClose, title, vendorOfferId, packageId, priceKurus, classLevels }: Props) {
  const [students, setStudents] = useState<StaffRosterStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [query, setQuery] = useState('');
  const [student, setStudent] = useState<StaffRosterStudent | null>(null);
  const [studentClass, setStudentClass] = useState('');
  const [ship, setShip] = useState(EMPTY_SHIP);
  const [sending, setSending] = useState(false);

  const multiClass = isMultiClassLevels(classLevels);
  const classOptions = multiClass ? numericClassChoices(classLevels) : ORDER_SINIF_OPTIONS;

  useEffect(() => {
    if (!open) return;
    setLoadingRoster(true);
    csStaffRoster()
      .then((r) => setStudents(r.students || []))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoadingRoster(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setStudent(null);
      setStudentClass('');
      setShip(EMPTY_SHIP);
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return [];
    return students
      .filter((s) => String(s.name || '').toLocaleLowerCase('tr-TR').includes(q))
      .slice(0, 8);
  }, [students, query]);

  const chooseStudent = (s: StaffRosterStudent) => {
    setStudent(s);
    setQuery(s.name || '');
    setStudentClass(toSinifOption(s.class_level, classOptions));
  };

  const send = async () => {
    if (!student) return toast.error('Hediye gönderilecek öğrenciyi seçin');
    if (multiClass && !studentClass) return toast.error('Bu ürün birden fazla sınıf için — sınıfı seçin');
    if (ship.name.trim().length < 3) return toast.error('Teslim alacak kişinin adını girin');
    if (ship.phone.replace(/\D/g, '').length < 10) return toast.error('Geçerli telefon girin');
    if (!ship.line1.trim() || !ship.city.trim()) return toast.error('Teslimat adresi ve il girin');
    setSending(true);
    try {
      const r = await csStaffGiftOrder({
        student_id: student.id,
        ...(packageId ? { package_id: packageId } : { vendor_offer_id: vendorOfferId || undefined }),
        quantity: 1,
        ...(studentClass ? { student_class: studentClass } : {}),
        customer_name: ship.name.trim(),
        customer_phone: ship.phone.trim(),
        note: ship.note.trim() || undefined,
        address: {
          full_name: ship.name.trim(),
          phone: ship.phone.trim(),
          address_line1: ship.line1.trim(),
          district: ship.district.trim() || undefined,
          city: ship.city.trim(),
        },
      });
      const wa = r.vendor_whatsapp?.ok ? ' · satıcıya WhatsApp gitti' : '';
      toast.success(`Hediye gönderildi · ${r.order_number}${wa}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hediye gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-6 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Gift className="h-5 w-5 text-rose-600" /> Hediye olarak gönder
          </h3>
          <button type="button" onClick={onClose} aria-label="Kapat">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            <div className="font-semibold">{title}</div>
            <div className="mt-0.5 text-xs">
              Veliden ödeme alınmaz{priceKurus ? ` · değeri ${formatCommerceTry(priceKurus)} (kurum öder)` : ''}. Sipariş
              hemen satıcıya düşer.
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              Öğrenci <span className="text-red-500">*</span>
            </span>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setStudent(null);
                }}
                placeholder={loadingRoster ? 'Öğrenciler yükleniyor…' : 'Öğrenci adı yazın'}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            {!student && matches.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                {matches.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => chooseStudent(s)}
                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-indigo-50"
                  >
                    <span>{s.name}</span>
                    {s.class_level ? <span className="text-xs text-slate-400">{s.class_level}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </label>

          <OrderSinifSelect
            value={studentClass}
            onChange={setStudentClass}
            options={classOptions}
            required={multiClass}
            hint={multiClass ? 'Bu ürün birden fazla sınıf için; satıcıya seçtiğiniz sınıf iletilir.' : undefined}
          />

          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700">Teslimat (kargo) bilgisi *</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Teslim alacak kişi (veli adı soyadı)"
              value={ship.name}
              onChange={(e) => setShip({ ...ship, name: e.target.value })}
            />
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Telefon"
              value={ship.phone}
              onChange={(e) => setShip({ ...ship, phone: e.target.value })}
            />
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              placeholder="Açık adres"
              value={ship.line1}
              onChange={(e) => setShip({ ...ship, line1: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="İlçe"
                value={ship.district}
                onChange={(e) => setShip({ ...ship, district: e.target.value })}
              />
              <input
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="İl"
                value={ship.city}
                onChange={(e) => setShip({ ...ship, city: e.target.value })}
              />
            </div>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Satıcıya not (isteğe bağlı, ör. derece ödülü)"
              value={ship.note}
              onChange={(e) => setShip({ ...ship, note: e.target.value })}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
            Hediye gönder
          </button>
        </div>
      </div>
    </div>
  );
}
