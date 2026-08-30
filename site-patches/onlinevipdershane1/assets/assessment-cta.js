(function () {
  var path = location.pathname.replace(/\\/g, '/');
  if (/ucretsiz-ogrenci-analizi|analiz-sonucu|seviye-testi/.test(path)) return;
  var href = path.indexOf('/programlar/') !== -1 ? '../ucretsiz-ogrenci-analizi.html' : '/ucretsiz-ogrenci-analizi.html';
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('utm_source')) {
      sessionStorage.setItem('ovd_utm', JSON.stringify({
        source: q.get('utm_source') || '',
        medium: q.get('utm_medium') || '',
        campaign: q.get('utm_campaign') || '',
        content: q.get('utm_content') || '',
      }));
    }
  } catch (e) {}
  var POP_KEY = 'ovd_assess_popup_at';
  var started = Date.now();
  var shown = false;

  function cssHref() {
    return path.indexOf('/programlar/') !== -1 ? '../assets/assessment.css' : '/assets/assessment.css';
  }

  function loadCss() {
    if (document.getElementById('ovd-assess-css')) return;
    var l = document.createElement('link');
    l.id = 'ovd-assess-css';
    l.rel = 'stylesheet';
    l.href = cssHref();
    document.head.appendChild(l);
  }

  function track(event) {
    if (window.OVD_ASSESS && OVD_ASSESS.track) return OVD_ASSESS.track(event);
    if (typeof gtag === 'function') gtag('event', event, { event_category: 'assessment' });
    fetch('/api/assessment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'event', event: event, page: location.pathname, device: innerWidth < 720 ? 'mobile' : 'desktop' }),
      keepalive: true,
    }).catch(function () {});
  }

  function canPopup() {
    try {
      var prev = Number(localStorage.getItem(POP_KEY) || 0);
      return Date.now() - prev > 7 * 24 * 60 * 60 * 1000;
    } catch (e) {
      return true;
    }
  }

  function markPopup() {
    try { localStorage.setItem(POP_KEY, String(Date.now())); } catch (e) {}
  }

  function sticky() {
    if (innerWidth >= 720) return;
    loadCss();
    document.body.classList.add('has-assess-sticky');
    var bar = document.createElement('div');
    bar.className = 'assess-sticky show';
    bar.innerHTML = '<a href="' + href + '">Ücretsiz Analizi Başlat</a>';
    document.body.appendChild(bar);
  }

  function popup() {
    if (shown) return;
    if (!canPopup()) return;
    if (document.getElementById('welcomeModal')) return;
    shown = true;
    loadCss();
    var wrap = document.createElement('div');
    wrap.className = 'assess-popup';
    wrap.setAttribute('role', 'dialog');
    wrap.innerHTML =
      '<div class="assess-popup-card">' +
      '<h3>Eksikleri Tahmin Etmeyin, Birlikte Belirleyelim</h3>' +
      '<p class="assess-lead">Öğrencinizin sınıfını ve mevcut durumunu öğrenelim; size özel akademik yol haritasını ücretsiz hazırlayalım.</p>' +
      '<a class="assess-cta" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px" href="' + href + '">Ücretsiz Analizi Başlat</a>' +
      '<button type="button" class="assess-back" style="width:100%">Şimdi değil</button>' +
      '</div>';
    document.body.appendChild(wrap);
    function close() {
      wrap.classList.remove('open');
    }
    wrap.querySelector('.assess-back').addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.classList.add('open');
    markPopup();
    track('assessment_popup_view');
  }

  function onScrollMid() {
    if (window.__ovdAssessMid) return;
    var y = window.scrollY || document.documentElement.scrollTop;
    var h = document.documentElement.scrollHeight - innerHeight;
    // Masaüstünde daha erken: sayfanın ~%40’ına inince
    if (h > 0 && y / h >= 0.4) {
      window.__ovdAssessMid = true;
      popup();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    track('assessment_offer_view');
    sticky();
    // Masaüstü popup: 45sn → 18sn (daha erken teklif)
    var POPUP_DELAY_MS = 18000;
    setTimeout(function () {
      if (Date.now() - started >= POPUP_DELAY_MS) popup();
    }, POPUP_DELAY_MS);
    document.addEventListener('scroll', onScrollMid, { passive: true });
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget && e.clientY < 8 && innerWidth >= 720) popup();
    });
  });
})();
