import { Link } from 'react-router-dom';
import VideoSolutionPublicShell from './VideoSolutionPublicShell';

/** cozum.onlinevipdershane.com kökü — QR ile gelenler doğrudan /c/{slug} kullanır */
export default function VideoSolutionPublicHome() {
  return (
    <VideoSolutionPublicShell brand={null}>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-[#173b70]">Video Çözüm Merkezi</h1>
        <p className="mt-3 text-sm text-slate-600">
          Öğretmeninizin verdiği karekod veya bağlantıyı açın. Çalışma listesi ve soru videoları oturum
          gerektirmez.
        </p>
        <p className="mt-6 text-xs text-slate-400">
          Örnek adres: <span className="font-mono">/c/calisma-slug</span>
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block text-sm text-[#173b70] underline"
        >
          Personel girişi (koçluk paneli)
        </Link>
      </div>
    </VideoSolutionPublicShell>
  );
}
