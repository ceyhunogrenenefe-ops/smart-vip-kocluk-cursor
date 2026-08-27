/**
 * onlinevipdershane.com /odeme/kitap kupon kutusu.
 * Sayfa HTML'i vitrin reposunda; bu script resolve yanıtıyla yüklenir.
 * Yönlendirme (token + /odeme/kitap) değişmez. PayTR pay aynı sitede kalır.
 */
(function () {
  if (window.__ovdCouponReady) return;
  window.__ovdCouponReady = true;

  var SCRIPT_MARK = 'commerce-odeme-kitap-coupon-2026-08-27';
  var API =
    /dersonlinevipkocluk\.com$/i.test(location.hostname)
      ? '/api/commerce-checkout'
      : 'https://www.dersonlinevipkocluk.com/api/commerce-checkout';

  function token() {
    return (new URLSearchParams(location.search).get('token') || '').trim();
  }

  function fmt(kurus) {
    return (Number(kurus || 0) / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
  }

  function esc(s) {
    return String(s || '')
      .split('<')[0]
      .replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
  }

  function renderSummary(o) {
    var box = document.getElementById('order-summary');
    if (!box || !o) return;
    var html = '<p class="order-meta">Sipariş no: <strong>' + esc(o.order_number) + '</strong></p>';
    (o.items || []).forEach(function (it) {
      html +=
        '<div class="order-line"><span>' +
        esc(it.title_snapshot || 'Kitap') +
        ' × ' +
        esc(it.quantity) +
        '</span><strong>' +
        fmt(it.line_total_kurus) +
        '</strong></div>';
    });
    if (o.shipping_kurus > 0) {
      html += '<div class="order-line"><span>Kargo</span><strong>' + fmt(o.shipping_kurus) + '</strong></div>';
    } else {
      html += '<div class="order-line"><span>Kargo</span><strong>Ücretsiz</strong></div>';
    }
    if (o.discount_kurus > 0) {
      html +=
        '<div class="order-line"><span>İndirim' +
        (o.coupon_code ? ' (' + esc(o.coupon_code) + ')' : '') +
        '</span><strong>-' +
        fmt(o.discount_kurus) +
        '</strong></div>';
    }
    html += '<div class="order-total"><span>Toplam</span><strong>' + fmt(o.total_kurus) + '</strong></div>';
    box.innerHTML = html;
  }

  function showMsg(text, ok) {
    var el = document.getElementById('ovd-coupon-msg');
    if (!el) return;
    el.style.display = 'block';
    el.style.color = ok ? '#15803d' : '#b91c1c';
    el.textContent = text;
  }

  async function applyCoupon() {
    var cin = document.getElementById('ovd-coupon-code');
    var code = String((cin && cin.value) || '').trim();
    if (!code) {
      showMsg('Kupon kodu girin', false);
      return;
    }
    var t = token();
    if (!t) {
      showMsg('Ödeme oturumu yok — sepetten tekrar deneyin', false);
      return;
    }
    var btn = document.getElementById('ovd-coupon-apply');
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ op: 'apply_coupon', token: t, coupon_code: code }),
      });
      var data = await res.json();
      if (!res.ok || !data.ok || !data.order) throw new Error(data.error || 'Kupon uygulanamadı');
      if (cin) cin.value = data.order.coupon_code || code;
      renderSummary(data.order);
      showMsg('Kupon uygulandı — yeni toplam ' + fmt(data.order.total_kurus), true);
    } catch (e) {
      showMsg(e.message || 'Kupon uygulanamadı', false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function mount() {
    if (document.getElementById('coupon-box') || document.getElementById('ovd-coupon-box')) return true;
    var summary = document.getElementById('order-summary');
    if (!summary || !summary.parentNode) return false;
    var wrap = document.createElement('div');
    wrap.id = 'ovd-coupon-box';
    wrap.setAttribute('data-marker', SCRIPT_MARK);
    wrap.style.marginTop = '16px';
    wrap.style.paddingTop = '14px';
    wrap.style.borderTop = '1px solid var(--border,#e5e5e7)';
    wrap.innerHTML =
      '<label for="ovd-coupon-code" style="display:block;font-size:13px;font-weight:700;margin-bottom:6px;">Kupon kodu</label>' +
      '<div style="display:flex;gap:8px;">' +
      '<input id="ovd-coupon-code" type="text" placeholder="VIP10" autocomplete="off" ' +
      'style="flex:1;padding:10px 12px;border:1px solid var(--border,#e5e5e7);border-radius:10px;font:inherit;font-size:14px;text-transform:uppercase;">' +
      '<button type="button" id="ovd-coupon-apply" ' +
      'style="padding:10px 14px;border:none;border-radius:10px;background:var(--navy,#1a3fad);color:#fff;font-weight:700;cursor:pointer;">Uygula</button>' +
      '</div>' +
      '<p id="ovd-coupon-msg" style="display:none;margin-top:8px;font-size:13px;"></p>';
    summary.parentNode.insertBefore(wrap, summary.nextSibling);
    var btn = document.getElementById('ovd-coupon-apply');
    if (btn) btn.addEventListener('click', applyCoupon);
    var cin = document.getElementById('ovd-coupon-code');
    if (cin) {
      cin.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          applyCoupon();
        }
      });
    }
    return true;
  }

  function tryMount(attempt) {
    if (mount()) return;
    if (attempt < 25) setTimeout(function () { tryMount(attempt + 1); }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { tryMount(0); });
  } else {
    tryMount(0);
  }
})();
