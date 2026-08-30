(function () {
  function isTrMobile(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.indexOf('90') === 0 && d.length >= 12) d = d.slice(2);
    if (d.charAt(0) === '0') d = d.slice(1);
    if (d.length === 11 && d.indexOf('95') === 0) d = d.slice(1);
    return /^5\d{9}$/.test(d);
  }
  function openModal() {
    var m = document.getElementById('ovdCallback');
    if (!m) return;
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
    var first = m.querySelector('input');
    if (first) first.focus();
  }
  function closeModal() {
    var m = document.getElementById('ovdCallback');
    if (!m) return;
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-open-callback]');
    if (btn) {
      e.preventDefault();
      openModal();
    }
    if (e.target.id === 'ovdCallback') closeModal();
    if (e.target.closest('[data-close-callback]')) {
      e.preventDefault();
      closeModal();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('#ovdCallbackForm');
    if (!form) return;
    e.preventDefault();
    var err = form.querySelector('[data-cb-err]');
    var btn = form.querySelector('[type=submit]');
    err.style.display = 'none';
    var payload = {
      ad_soyad: (form.querySelector('[name=ad_soyad]').value || '').trim(),
      telefon: (form.querySelector('[name=telefon]').value || '').trim(),
      sinif: form.querySelector('[name=sinif]').value || '',
      program: 'Sizi Arayalım',
      not: 'Ana sayfa — sizi arayalım',
    };
    if (!payload.ad_soyad) {
      err.textContent = 'Ad soyad yazın.';
      err.style.display = 'block';
      return;
    }
    if (!isTrMobile(payload.telefon)) {
      err.textContent = 'Geçerli cep telefonu girin.';
      err.style.display = 'block';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Gönderiliyor…';
    fetch('/api/iletisim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok) throw new Error(x.j.error || 'Gönderilemedi');
        if (typeof gtag === 'function') gtag('event', 'callback_submit', { event_category: 'lead' });
        form.innerHTML =
          '<p style="margin:0;font-weight:800;color:#1a3fad;">Talebiniz alındı.</p><p style="margin:8px 0 0;color:#6e6e73;">Kısa süre içinde sizi arayacağız. Dilerseniz hemen 0850 303 40 14’ü de arayabilirsiniz.</p>';
      })
      .catch(function (ex) {
        err.textContent = ex.message || 'Bir hata oluştu.';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Beni arayın';
      });
  });
})();
