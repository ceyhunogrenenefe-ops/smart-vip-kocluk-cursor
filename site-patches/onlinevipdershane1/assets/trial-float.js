(function () {
  if (document.getElementById('ovd-trial-float')) return;
  var path = (location.pathname || '').replace(/\\/g, '/');
  // Kayıt / ödeme / analiz formlarında sticky deneme gösterme
  if (/kayit|odeme|ucretsiz-ogrenci-analizi|analiz-sonucu|seviye-testi/.test(path)) return;

  var waText =
    'Merhaba, Online VIP Dershane ücretsiz deneme dersine katılmak istiyorum. 3 gün ücretsiz deneme hakkında bilgi alabilir miyim?';
  var href = 'https://wa.me/908503034014?text=' + encodeURIComponent(waText);

  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = (function () {
    var scripts = document.getElementsByTagName('script');
    var src = '';
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && /trial-float\.js/.test(scripts[i].src)) {
        src = scripts[i].src;
        break;
      }
    }
    return src ? src.replace(/trial-float\.js.*$/, 'trial-float.css') : '/assets/trial-float.css';
  })();
  document.head.appendChild(css);

  var a = document.createElement('a');
  a.id = 'ovd-trial-float';
  a.className = 'ovd-trial-float';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', 'Ücretsiz deneme dersine katılın');
  a.innerHTML =
    '<span class="ovd-trial-float-label"><strong>ÜCRETSİZ DENEME</strong><span>3 gün ücretsiz deneyin</span></span>' +
    '<span class="ovd-trial-float-btn" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5.1L12 14.8 7.5 16.9l.9-5.1L4.8 8.3l5-.7L12 3z" fill="#fff"/>' +
    '</svg></span>';
  document.body.appendChild(a);
})();
