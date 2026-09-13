/**
 * onlinevipdershane.com formlarını CRM’ye (Kayıt Takibi + Gelen Kutusu) yazar.
 * Tek satır: <script src="https://www.dersonlinevipkocluk.com/crm-site-lead.js" defer></script>
 * Mevcut /api/iletisim ve /api/assessment gönderimlerini bozmaz; yanına kopyalar.
 */
(function () {
  if (window.__OVD_CRM_LEAD__) return;
  window.__OVD_CRM_LEAD__ = true;

  var CRM = 'https://www.dersonlinevipkocluk.com/api/site-leads';

  function utmBag() {
    var extra = {};
    try {
      var q = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
        if (q.get(k)) extra[k] = q.get(k);
      });
      extra.page = location.href;
      extra.referrer = document.referrer || '';
      var stored = sessionStorage.getItem('ovd_utm');
      if (stored) {
        var u = JSON.parse(stored);
        if (u.source && !extra.utm_source) extra.utm_source = u.source;
        if (u.medium && !extra.utm_medium) extra.utm_medium = u.medium;
        if (u.campaign && !extra.utm_campaign) extra.utm_campaign = u.campaign;
        if (u.content && !extra.utm_content) extra.utm_content = u.content;
      }
    } catch (e) {}
    return extra;
  }

  function send(payload) {
    var body = {};
    if (payload && typeof payload === 'object') {
      for (var k in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, k)) body[k] = payload[k];
      }
    }
    var extra = utmBag();
    for (var e in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, e) && (body[e] == null || body[e] === '')) {
        body[e] = extra[e];
      }
    }
    if (!body.form_kind) {
      if (body.program === 'Sizi Arayalım') body.form_kind = 'callback';
      else if (body.op === 'submit') body.form_kind = 'assessment';
      else if (body.ad_soyad || body.telefon) body.form_kind = 'iletisim';
    }
    try {
      fetch(CRM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        mode: 'cors'
      }).catch(function () {});
    } catch (err) {}
  }

  window.OVD_CRM_LEAD = { send: send, endpoint: CRM };

  var orig = window.fetch;
  if (typeof orig === 'function') {
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET')
          .toString()
          .toUpperCase();
        if (method === 'POST' && /\/api\/(iletisim|assessment)\b/i.test(url)) {
          var raw = init && init.body;
          var parsed = null;
          if (typeof raw === 'string') {
            try {
              parsed = JSON.parse(raw);
            } catch (e) {
              parsed = null;
            }
          }
          if (parsed && typeof parsed === 'object') {
            if (!parsed.op || parsed.op === 'submit') send(parsed);
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  }
})();
