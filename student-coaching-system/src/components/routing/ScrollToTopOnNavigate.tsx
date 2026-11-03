import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Yeni sayfaya geçince en üstten başla (ör. mağazada ürün kartına tıklayınca detay
 * sayfası aşağıda kalmasın). Geri/ileri tuşunda (POP) tarayıcının konumuna dokunmaz.
 * Masaüstü kabukta kaydırma <main> içinde olduğu için onu da sıfırlar.
 */
export default function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (navType === 'POP') return;
    window.scrollTo(0, 0);
    document.querySelectorAll('main').forEach((el) => {
      el.scrollTop = 0;
    });
  }, [pathname, navType]);

  return null;
}
