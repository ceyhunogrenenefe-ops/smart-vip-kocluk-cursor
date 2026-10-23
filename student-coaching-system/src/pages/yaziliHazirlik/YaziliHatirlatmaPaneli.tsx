import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, ChevronDown, ChevronUp, Loader2, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

type Eksik = { class_id: string; class_name: string; ders: string; ilk_ders: string | null };
type Ogretmen = {
  teacher_id: string;
  teacher_name: string;
  phone_ok: boolean;
  eksikler: Eksik[];
  last_sent: string | null;
};
type Sonuc = { teacher_id: string; teacher_name?: string; ok: boolean; error?: string };

const METIN_ANAHTARI = 'yazili_hatirlatma_metni_v1';
const GRUP = 10;

function gun(t: string | null) {
  if (!t) return '';
  try {
    return new Date(`${t.slice(0, 10)}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  } catch {
    return t;
  }
}
function zaman(t: string | null) {
  if (!t) return '';
  try {
    return new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
function adBicimle(ad: string) {
  return ad
    .trim()
    .split(/\s+/)
    .map((k) => {
      const kucuk = k.toLocaleLowerCase('tr');
      return kucuk.charAt(0).toLocaleUpperCase('tr') + kucuk.slice(1);
    })
    .join(' ');
}

/** Yazılıya hazırlık dersi planlı olup PDF yüklemeyen öğretmenlere WhatsApp hatırlatması. */
export default function YaziliHatirlatmaPaneli() {
  const [liste, setListe] = useState<Ogretmen[] | null>(null);
  const [varsayilan, setVarsayilan] = useState('');
  const [metin, setMetin] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState(false);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [sonuclar, setSonuclar] = useState<Sonuc[] | null>(null);
  const [ilerleme, setIlerleme] = useState<{ bitti: number; toplam: number } | null>(null);
  const [sinif, setSinif] = useState('all');

  const sinifSecenek = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of liste || []) for (const e of t.eksikler) if (!m.has(e.class_id)) m.set(e.class_id, e.class_name);
    return [...m.entries()]
      .map(([id, ad]) => ({ id, ad }))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr', { numeric: true }));
  }, [liste]);

  // Sınıf seçiliyse yalnız o sınıfta PDF'i eksik öğretmenler ve o sınıfın satırları
  const gorunen = useMemo(
    () =>
      (liste || [])
        .map((t) => (sinif === 'all' ? t : { ...t, eksikler: t.eksikler.filter((e) => e.class_id === sinif) }))
        .filter((t) => t.eksikler.length),
    [liste, sinif]
  );
  const gorunenId = useMemo(() => new Set(gorunen.map((t) => t.teacher_id)), [gorunen]);
  const seciliGorunen = useMemo(() => [...secili].filter((id) => gorunenId.has(id)), [secili, gorunenId]);

  const sinifDegistir = (v: string) => {
    setSinif(v);
    const yeni = (liste || []).filter(
      (t) => t.phone_ok && (v === 'all' || t.eksikler.some((e) => e.class_id === v))
    );
    setSecili(new Set(yeni.map((t) => t.teacher_id)));
    setSonuclar(null);
  };

  const getir = async () => {
    setHata(null);
    try {
      const res = await apiFetch('/api/yazili-hazirlik?op=reminder-list');
      const j = (await res.json().catch(() => ({}))) as { teachers?: Ogretmen[]; template?: string; hint?: string; error?: string };
      if (!res.ok) throw new Error(j.hint || j.error || 'Liste alınamadı');
      const teachers = j.teachers || [];
      setListe(teachers);
      setVarsayilan(j.template || '');
      setMetin((m) => {
        if (m) return m;
        let kayitli = '';
        try {
          kayitli = localStorage.getItem(METIN_ANAHTARI) || '';
        } catch {
          kayitli = '';
        }
        return kayitli || j.template || '';
      });
      setSecili(new Set(teachers.filter((t) => t.phone_ok).map((t) => t.teacher_id)));
      setSinif((v) => (v === 'all' || teachers.some((t) => t.eksikler.some((e) => e.class_id === v)) ? v : 'all'));
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Liste alınamadı');
    }
  };

  useEffect(() => {
    void getir();
  }, []);

  const ornek = useMemo(() => {
    const ilk = gorunen.find((t) => secili.has(t.teacher_id)) || gorunen[0];
    return metin.replace(/\{\{\s*ogretmen_adi\s*\}\}/g, ilk ? adBicimle(ilk.teacher_name) : 'Öğretmen Adı');
  }, [metin, gorunen, secili]);

  const degistir = (id: string) =>
    setSecili((s) => {
      const y = new Set(s);
      if (y.has(id)) y.delete(id);
      else y.add(id);
      return y;
    });

  const metniKaydet = (v: string) => {
    setMetin(v);
    try {
      if (v.trim() && v !== varsayilan) localStorage.setItem(METIN_ANAHTARI, v);
      else localStorage.removeItem(METIN_ANAHTARI);
    } catch {
      /* tarayıcı depolaması kapalı olabilir */
    }
  };

  const gonder = async () => {
    const ids = seciliGorunen;
    if (!ids.length) return;
    if (!metin.includes('{{ogretmen_adi}}') && !window.confirm('Metinde {{ogretmen_adi}} yok; mesajda öğretmenin adı geçmeyecek. Devam edilsin mi?')) return;
    if (!window.confirm(`${ids.length} öğretmene WhatsApp hatırlatması gönderilecek. Onaylıyor musunuz?`)) return;
    setGonderiliyor(true);
    setSonuclar(null);
    setIlerleme({ bitti: 0, toplam: ids.length });
    const tumu: Sonuc[] = [];
    try {
      // Sunucu süresini aşmamak için 10'arlı gruplar hâlinde gönderilir
      for (let i = 0; i < ids.length; i += GRUP) {
        const grup = ids.slice(i, i + GRUP);
        const res = await apiFetch('/api/yazili-hazirlik?op=reminder-send', {
          method: 'POST',
          body: JSON.stringify({ teacher_ids: grup, message: metin })
        });
        const j = (await res.json().catch(() => ({}))) as { sonuclar?: Sonuc[]; hint?: string; error?: string };
        if (!res.ok) {
          const neden = j.hint || j.error || 'Gönderilemedi';
          if (!tumu.length) throw new Error(neden);
          tumu.push(...grup.map((id) => ({ teacher_id: id, ok: false, error: neden })));
        } else {
          tumu.push(...(j.sonuclar || []));
        }
        setIlerleme({ bitti: Math.min(ids.length, i + grup.length), toplam: ids.length });
        setSonuclar([...tumu]);
      }
      const ok = tumu.filter((s) => s.ok).length;
      const hatali = tumu.length - ok;
      if (ok) toast.success(`${ok} öğretmene hatırlatma gönderildi.`);
      if (hatali) toast.error(`${hatali} öğretmene gönderilemedi; ayrıntı panelde.`);
      await getir();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setGonderiliyor(false);
      setIlerleme(null);
    }
  };

  if (hata) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">Hatırlatma listesi: {hata}</p>;
  if (!liste) return null;

  const adIle = new Map(liste.map((t) => [t.teacher_id, t.teacher_name]));

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <BellRing className="h-5 w-5 shrink-0 text-amber-700" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">PDF hatırlatması</span>
          <span className="block text-sm text-slate-600">
            {liste.length
              ? `Ders programındaki sınıflarından en az birine PDF yüklememiş ${liste.length} öğretmen var.`
              : 'Ders programındaki tüm öğretmenler PDF yüklemiş.'}
          </span>
        </span>
        {liste.length ? (acik ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />) : null}
      </button>

      {acik && liste.length ? (
        <div className="space-y-4 border-t border-amber-200 px-4 pb-4 pt-3">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block text-sm text-slate-700">
              Mesaj
              <textarea
                value={metin}
                onChange={(e) => metniKaydet(e.target.value)}
                rows={6}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {'{{ogretmen_adi}}'} her öğretmenin adıyla değişir.
                {metin !== varsayilan ? (
                  <button type="button" className="font-semibold text-[#173b70] underline" onClick={() => metniKaydet(varsayilan)}>
                    Varsayılan metne dön
                  </button>
                ) : null}
              </span>
            </label>
            <div className="text-sm text-slate-700">
              Önizleme
              <div className="mt-1 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-slate-800">
                {ornek}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-700">
              Sınıf
              <select
                value={sinif}
                onChange={(e) => sinifDegistir(e.target.value)}
                className="mt-1 block w-full min-w-56 rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="all">Tüm sınıflar ({liste.length} öğretmen)</option>
                {sinifSecenek.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ad} ({(liste || []).filter((t) => t.eksikler.some((e) => e.class_id === c.id)).length} öğretmen)
                  </option>
                ))}
              </select>
            </label>
            <span className="pb-2 text-sm text-slate-600">
              {gorunen.length} öğretmen gösteriliyor · {seciliGorunen.length} seçili
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Tümünü seç"
                      checked={gorunen.filter((t) => t.phone_ok).every((t) => secili.has(t.teacher_id))}
                      onChange={(e) =>
                        setSecili(e.target.checked ? new Set(gorunen.filter((t) => t.phone_ok).map((t) => t.teacher_id)) : new Set())
                      }
                    />
                  </th>
                  <th className="px-3 py-2">Öğretmen</th>
                  <th className="px-3 py-2">PDF yüklenmeyen sınıflar</th>
                  <th className="px-3 py-2">Son hatırlatma</th>
                </tr>
              </thead>
              <tbody>
                {gorunen.map((t) => (
                  <tr key={t.teacher_id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={!t.phone_ok}
                        checked={secili.has(t.teacher_id)}
                        onChange={() => degistir(t.teacher_id)}
                        aria-label={`${t.teacher_name} seç`}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {adBicimle(t.teacher_name)}
                      {!t.phone_ok ? <span className="block text-xs font-normal text-red-600">Telefon kayıtlı değil</span> : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {t.eksikler.map((e) => (
                        <span key={`${e.class_id}-${e.ders}`} className="block">
                          {e.class_name} · {e.ders}
                          {e.ilk_ders ? <span className="text-xs text-slate-500"> · ilk ders {gun(e.ilk_ders)}</span> : null}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{t.last_sent ? zaman(t.last_sent) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={gonderiliyor || !seciliGorunen.length || !metin.trim()}
              onClick={() => void gonder()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#173b70] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {gonderiliyor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {gonderiliyor
                ? `Gönderiliyor… ${ilerleme ? `${ilerleme.bitti}/${ilerleme.toplam}` : ''}`
                : `${seciliGorunen.length} öğretmene WhatsApp gönder`}
            </button>
            <span className="text-xs text-slate-500">
              Mesaj, öğretmen ders hatırlatmalarının gittiği WhatsApp hattından gönderilir. Etüt, deneme, rehberlik ve ödev
              saati gibi yazılısı olmayan dersler listeye alınmaz.
            </span>
          </div>

          {sonuclar ? (
            <ul className="space-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              {sonuclar.map((s) => (
                <li key={s.teacher_id} className="flex items-start gap-2">
                  {s.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <span>
                    {adBicimle(s.teacher_name || adIle.get(s.teacher_id) || 'Öğretmen')}
                    {s.ok ? ' — gönderildi' : ` — ${s.error || 'gönderilemedi'}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
