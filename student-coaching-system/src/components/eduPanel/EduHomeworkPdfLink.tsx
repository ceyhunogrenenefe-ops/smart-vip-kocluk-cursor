import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { EduHomework } from '../../types/eduPanel.types';
import { fetchHomeworkAttachmentUrl } from '../../lib/eduPanel/eduPanelApi';

type Props = {
  homework: Pick<EduHomework, 'id' | 'attachment_pdf_path' | 'attachment_pdf_name' | 'attachment_pdf_url'>;
  className?: string;
  label?: string;
  fullWidth?: boolean;
};

export default function EduHomeworkPdfLink({ homework, className, label, fullWidth }: Props) {
  const [busy, setBusy] = useState(false);
  const hasPdf = Boolean(
    homework.attachment_pdf_url || homework.attachment_pdf_path || homework.attachment_pdf_name
  );
  if (!hasPdf) return null;

  const openPdf = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (homework.attachment_pdf_url) {
      window.open(homework.attachment_pdf_url, '_blank', 'noopener,noreferrer');
      return;
    }
    setBusy(true);
    try {
      const url = await fetchHomeworkAttachmentUrl(homework.id);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else toast.error('PDF dosyası bulunamadı');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF açılamadı');
    } finally {
      setBusy(false);
    }
  };

  const text = label || homework.attachment_pdf_name || 'PDF ödevi aç';

  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => void openPdf(e)}
      className={
        className ||
        `inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50${
          fullWidth ? ' w-full justify-center px-4 py-3 text-sm' : ''
        }`
      }
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
      {text}
    </button>
  );
}
