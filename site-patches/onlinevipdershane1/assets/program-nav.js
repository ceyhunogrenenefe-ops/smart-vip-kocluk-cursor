(function () {
  var nav = document.querySelector('nav');
  if (!nav || nav.classList.contains('prog-nav-ready')) return;
  nav.classList.add('prog-nav-ready', 'prog-site-nav');

  document.body.classList.add('prog-lander-page');

  var footer = document.querySelector('body > footer');
  if (footer) footer.classList.add('prog-site-footer');

  var inner = nav.querySelector(':scope > div');
  var navLinks = document.getElementById('navLinks');
  var pdMenu = document.getElementById('pdMenu');
  var pdBtn = document.getElementById('pdBtn');
  if (!inner || !navLinks) return;

  if (pdBtn) pdBtn.removeAttribute('onmouseenter');
  if (pdMenu) pdMenu.removeAttribute('onmouseleave');

  if (pdBtn) {
    pdBtn.addEventListener('mouseenter', function () {
      if (!isMobile()) window.openPD();
    });
  }
  if (pdMenu) {
    pdMenu.addEventListener('mouseleave', function () {
      if (!isMobile()) window.closePD();
    });
  }

  var actions = inner.querySelector(':scope > div:last-child');
  if (actions && !actions.classList.contains('prog-nav-actions')) {
    actions.classList.add('prog-nav-actions');
  }

  // Mobilde menü kapalıyken Başarılarımız görünmüyordu — sticky chip ile her zaman göster
  if (actions && !document.getElementById('progBasariBtn')) {
    var inProgramlar = (location.pathname || '').indexOf('/programlar/') !== -1;
    var basari = document.createElement('a');
    basari.id = 'progBasariBtn';
    basari.className = 'prog-basari-chip';
    basari.href = inProgramlar ? '../basarilarimiz.html' : '/basarilarimiz.html';
    basari.textContent = '🏆 Başarılarımız';
    basari.setAttribute('aria-label', 'Başarılarımız');
    actions.insertBefore(basari, actions.firstChild);
  }

  if (!document.getElementById('progNavToggle')) {
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'progNavToggle';
    toggle.className = 'prog-nav-toggle';
    toggle.setAttribute('aria-label', 'Menü');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '☰';
    inner.insertBefore(toggle, navLinks);

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = navLinks.classList.toggle('prog-nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? '✕' : '☰';
      if (!open && pdMenu) pdMenu.style.display = 'none';
    });
  }

  function closeNav() {
    navLinks.classList.remove('prog-nav-open');
    var t = document.getElementById('progNavToggle');
    if (t) {
      t.setAttribute('aria-expanded', 'false');
      t.textContent = '☰';
    }
    if (pdMenu) pdMenu.style.display = 'none';
    var arrow = document.getElementById('pdArrow');
    if (arrow) arrow.style.transform = '';
  }

  function isMobile() {
    return window.matchMedia('(max-width: 960px)').matches;
  }

  window.openPD = function () {
    if (!isMobile()) {
      if (pdMenu) pdMenu.style.display = 'block';
      var arrow = document.getElementById('pdArrow');
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    }
  };

  window.closePD = function () {
    if (!isMobile()) {
      setTimeout(function () {
        if (pdMenu) pdMenu.style.display = 'none';
        var arrow = document.getElementById('pdArrow');
        if (arrow) arrow.style.transform = '';
      }, 150);
    }
  };

  window.togglePD = function () {
    if (!pdMenu) return;
    if (isMobile()) {
      var show = pdMenu.style.display !== 'block';
      pdMenu.style.display = show ? 'block' : 'none';
      var arrow = document.getElementById('pdArrow');
      if (arrow) arrow.style.transform = show ? 'rotate(180deg)' : '';
      return;
    }
    if (pdMenu.style.display === 'block') window.closePD();
    else window.openPD();
  };

  navLinks.querySelectorAll('a').forEach(function (a) {
    if (a.id === 'pdBtn' || a.closest('#pdWrap')) return;
    a.addEventListener('click', closeNav);
  });

  if (pdMenu) {
    pdMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#pdWrap') && pdMenu && !isMobile()) {
      pdMenu.style.display = 'none';
      var arrow = document.getElementById('pdArrow');
      if (arrow) arrow.style.transform = '';
    }
    if (!e.target.closest('.prog-site-nav') && isMobile()) {
      closeNav();
    }
  });

  window.addEventListener('resize', function () {
    if (!isMobile()) closeNav();
  });

  closeNav();
})();
