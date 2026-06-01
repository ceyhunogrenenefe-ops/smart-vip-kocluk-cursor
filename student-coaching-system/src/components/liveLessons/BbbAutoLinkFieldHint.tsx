import React from 'react';
import { useBbbAutoLinkStatus } from '../../lib/useBbbAutoLinkStatus';

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
};

/** Online Görüşmeler ile aynı: link boş + BBB API → otomatik oda. */
export default function BbbAutoLinkFieldHint({ value, onChange, placeholder, id }: Props) {
  const bbbReady = useBbbAutoLinkStatus();

  return (
    <div className="space-y-1.5">
      <label className="block text-sm" htmlFor={id}>
        <span className="text-slate-600">
          Toplantı bağlantısı <span className="font-normal text-slate-400">(isteğe bağlı)</span>
        </span>
        <span className="block text-xs text-slate-500 mt-0.5 font-normal">
          Zoom/Meet/BBB linki yazabilirsiniz. Boş bırakırsanız — tıpkı Online Görüşmelerde olduğu gibi — BBB
          API tanımlıysa otomatik oda oluşturulur.
        </span>
        <input
          id={id}
          type="text"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            placeholder ||
            (bbbReady ? 'Boş bırakın → BBB otomatik oluşturulur' : 'https://… veya BBB API bekleniyor')
          }
          className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />
      </label>
      {bbbReady === true && !value.trim() ? (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
          BBB API bağlı — link alanını boş bırakıp kaydedebilirsiniz; sistem otomatik toplantı linki üretir.
        </p>
      ) : null}
      {bbbReady === false ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          BBB API sunucuda tanımlı değil. Otomatik oda için Vercel’de BBB_API_ENDPOINT ve BBB_API_SECRET
          ekleyin (Online Görüşmelerde çalışıyorsa aynı değerler geçerlidir).
        </p>
      ) : null}
    </div>
  );
}
