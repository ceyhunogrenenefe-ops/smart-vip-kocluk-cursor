/**
 * Premium öğretmen filtresi + kart grid (ozel-ders.html)
 * Kaynak: panel yayınlı + panelde kaydı olmayan statik katalog. Panel pasifi statikten bile düşer.
 */
(function (global) {
  function upgradeRemotePhotoUrl(url, opts) {
    opts = opts || {};
    var minSize = opts.minSize || 640;
    var width = opts.width || 640;
    var u = String(url || '').trim();
    if (!u) return u;

    // Supabase Storage: sunucu tarafı resize (transform açıksa)
    if (/supabase\.co\/storage\/v1\/object\/public\//i.test(u)) {
      var base = u.split('?')[0].replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      );
      return base + '?width=' + width + '&quality=70&resize=contain';
    }

    // YouTube / Google CDN thumbnails
    if (/ggpht\.com|googleusercontent\.com/i.test(u)) {
      return u.replace(/=s(\d+)/i, function (match, n) {
        var size = parseInt(n, 10);
        if (!Number.isFinite(size) || size === 0 || size >= minSize) return match;
        return '=s' + minSize;
      });
    }
    return u;
  }

  /** Transform URL bozulursa orijinal object URL'ye dön. */
  function originalPhotoUrl(url) {
    var u = String(url || '').trim();
    if (!u) return u;
    if (/supabase\.co\/storage\/v1\/render\/image\/public\//i.test(u)) {
      return u.split('?')[0].replace(
        '/storage/v1/render/image/public/',
        '/storage/v1/object/public/'
      );
    }
    return u;
  }

  /** Panel bazen dosya adı yazar; yalnızca URL / assets yolu kabul. */
  function isUsablePhoto(url) {
    var u = String(url || '').trim();
    if (!u) return false;
    if (/^https?:\/\//i.test(u)) return true;
    if (/^\/?assets\//i.test(u)) return true;
    if (u.charAt(0) === '/' && u.indexOf(' ') === -1) return true;
    return false;
  }

  function titleCaseTr(s) {
    return String(s == null ? '' : s)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(function (w) {
        if (/^(LGS|TYT|AYT|YKS|KPSS|VIP)$/i.test(w)) return w.toUpperCase();
        var lower = w.toLocaleLowerCase('tr-TR');
        return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
      })
      .join(' ');
  }

  function youtubeIdFromUrl(url) {
    return (global.OVD_TEACHER_VIDEO && global.OVD_TEACHER_VIDEO.youtubeIdFromUrl(url)) || '';
  }

  function isPlayableVideoUrl(url) {
    return !!(global.OVD_TEACHER_VIDEO && global.OVD_TEACHER_VIDEO.isPlayableVideoUrl(url));
  }

  /** İlk oynatılabilir video = hover tanıtımı */
  function primaryVideoUrl(t) {
    if (global.OVD_TEACHER_VIDEO) return global.OVD_TEACHER_VIDEO.primaryVideoUrl(t);
    return String((t && (t.video_url || t.video)) || '').trim();
  }

  function mapApiTeacher(t) {
    var exams = Array.isArray(t.exam_areas) ? t.exam_areas.join(' / ') : '';
    var rawPhoto = upgradeRemotePhotoUrl(t.photo_url, { width: 640 });
    var roleRaw = t.title || [t.branch, exams].filter(Boolean).join(' · ');
    var avg = t.average_rating != null ? Number(t.average_rating) : null;
    if (avg != null && !isFinite(avg)) avg = null;
    return {
      slug: t.slug,
      name: titleCaseTr(t.name) || 'Öğretmen',
      branch: titleCaseTr(t.branch) || '',
      university: t.university || '',
      experience: Number(t.experience_years) || 0,
      rating: avg,
      total_reviews: Number(t.total_reviews) || 0,
      lessons: null,
      live: t.online_lessons !== false,
      available: t.accepting_students !== false,
      price: null,
      grades: Array.isArray(t.grade_levels) ? t.grade_levels.slice() : [],
      photo: isUsablePhoto(rawPhoto) ? rawPhoto : '',
      photoPos: 'center 20%',
      role: titleCaseTr(roleRaw),
      video: primaryVideoUrl(t),
      fromApi: true,
      short_bio: t.short_bio || ''
    };
  }

  function initPremiumTeachersUi(opts) {
    opts = opts || {};
    var PAGE_SIZE = opts.pageSize || 6;
    var state = { page: 1, filtered: [] };
    var grid = document.getElementById('teacherGrid');
    if (!grid) return;

    var empty = document.getElementById('emptyState');
    var meta = document.getElementById('resultMeta');
    var pager = document.getElementById('pagination');
    var teachers = (global.OVD_PREMIUM_TEACHERS || []).slice();
    var sourceLabel = 'katalog';

    var els = {
      q: document.getElementById('q'),
      branch: document.getElementById('f-branch'),
      grade: document.getElementById('f-grade'),
      price: document.getElementById('f-price'),
      avail: document.getElementById('f-avail'),
      exp: document.getElementById('f-exp'),
      reset: document.getElementById('btnReset'),
    };

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function uniqueBranches() {
      var set = {};
      teachers.forEach(function (t) {
        if (t.branch) set[t.branch] = true;
      });
      return Object.keys(set).sort(function (a, b) {
        return a.localeCompare(b, 'tr');
      });
    }

    function fillBranches() {
      if (!els.branch) return;
      var html = '<option value="">Tümü</option>';
      uniqueBranches().forEach(function (b) {
        html += '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>';
      });
      els.branch.innerHTML = html;
    }

    function priceMatch(t, key) {
      if (!key) return true;
      if (t.price == null) return true;
      if (key === '0-650') return t.price <= 650;
      if (key === '651-800') return t.price >= 651 && t.price <= 800;
      if (key === '801+') return t.price >= 801;
      return true;
    }

    function expMatch(t, key) {
      if (!key) return true;
      if (key === '0-9') return t.experience <= 9;
      if (key === '10-15') return t.experience >= 10 && t.experience <= 15;
      if (key === '16+') return t.experience >= 16;
      return true;
    }

    function availMatch(t, key) {
      if (!key) return true;
      if (key === '1') return t.available === true;
      if (key === '0') return t.available === false;
      if (key === 'live') return t.live === true;
      return true;
    }

    function profileHref(slug) {
      return '/ozel-ders/ogretmen/' + encodeURIComponent(slug);
    }

    /** /ozel-ders rewrite altında relative assets/... 404 olmasın */
    function absoluteAssetUrl(url) {
      var u = String(url || '').trim();
      if (!u) return '/assets/img/ovd-logo.png';
      if (/^(https?:)?\/\//i.test(u) || /^data:/i.test(u) || /^blob:/i.test(u)) return u;
      if (u.charAt(0) === '/') return u;
      return '/' + u.replace(/^\.\//, '');
    }

    function photoUrl(url, width) {
      return upgradeRemotePhotoUrl(absoluteAssetUrl(url), { width: width || 640 });
    }

    var AVATAR_COLORS = [
      ['#ff7a45', '#ff9f43'],
      ['#6c5ce7', '#a29bfe'],
      ['#0984e3', '#74b9ff'],
      ['#00b894', '#55efc4'],
      ['#2d3436', '#636e72'],
      ['#e84393', '#fd79a8'],
      ['#e8232a', '#ff7675'],
      ['#f5c542', '#ffeaa7'],
      ['#1a3fad', '#4c6fff'],
      ['#00cec9', '#81ecec']
    ];

    function avatarStripHtml(t, idx) {
      var colors = AVATAR_COLORS[idx % AVATAR_COLORS.length];
      var photo = photoUrl(t.photo, 160);
      var pos = t.photoPos || 'center 20%';
      var branch = t.branch || t.role || '';
      return (
        '<a class="teacher-avatar-item" href="' +
        profileHref(t.slug) +
        '" title="' +
        escapeHtml(t.name) +
        '">' +
        '<div class="teacher-avatar-ring" style="--avatar-a:' +
        colors[0] +
        ';--avatar-b:' +
        colors[1] +
        '">' +
        '<img class="teacher-avatar-img" src="' +
        escapeHtml(photo) +
        '" alt="' +
        escapeHtml(t.name) +
        '" width="76" height="76" loading="lazy" decoding="async" style="object-position:' +
        escapeHtml(pos) +
        '" onerror="window.__ovdPhotoErr&&window.__ovdPhotoErr(this)">' +
        '</div>' +
        '<div class="teacher-avatar-name">' +
        escapeHtml(t.name) +
        '</div>' +
        (branch
          ? '<div class="teacher-avatar-branch">' + escapeHtml(branch) + '</div>'
          : '') +
        '</a>'
      );
    }

    function renderAvatarStrip(list) {
      var strip = document.getElementById('teacherAvatarStrip');
      if (!strip) return;
      var rows = Array.isArray(list) ? list : [];
      if (!rows.length) {
        strip.innerHTML = '';
        return;
      }
      strip.innerHTML = rows.map(avatarStripHtml).join('');
    }

    function cardHtml(t) {
      var liveBadge = t.live
        ? '<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>Canlı</span>'
        : '<span class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">Çevrimdışı</span>';
      var availBadge = t.available
        ? '<span class="inline-flex rounded-full bg-navy/10 px-2.5 py-1 text-[11px] font-bold text-navy">Müsait</span>'
        : '<span class="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Dolu</span>';
      var pos = t.photoPos || 'center 20%';
      var ratingTxt = t.rating != null ? ('★ ' + Number(t.rating).toFixed(1) + (t.total_reviews ? ' (' + t.total_reviews + ')' : '')) : '—';
      var lessonsTxt = t.lessons != null ? Number(t.lessons).toLocaleString('tr-TR') : '—';
      var videoUrl = String(t.video || '').trim();
      var canHoverVideo = isPlayableVideoUrl(videoUrl);
      var videoBadge = canHoverVideo
        ? '<span class="teacher-video-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Tanıtım</span>' +
          '<button type="button" class="teacher-unmute-btn" aria-label="Sesi aç">🔊 Sesi aç</button>'
        : '';

      return (
        '<article class="card-enter flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">' +
          '<div class="teacher-photo-box relative' +
          (canHoverVideo ? ' has-video' : '') +
          '"' +
          (canHoverVideo ? ' data-video="' + escapeHtml(videoUrl) + '"' : '') +
          '>' +
            '<img data-src="' + escapeHtml(photoUrl(t.photo, 640)) + '" alt="' + escapeHtml(t.name) + ' — ' + escapeHtml(t.branch) + '" width="480" height="600" class="lazy-img teacher-photo" style="object-position:' + escapeHtml(pos) + '" decoding="async" loading="lazy" onerror="window.__ovdPhotoErr&&window.__ovdPhotoErr(this)">' +
            (canHoverVideo ? '<div class="teacher-video-layer" aria-hidden="true"></div>' + videoBadge : '') +
            '<div class="absolute left-3 top-3 z-[2] flex flex-wrap gap-1.5">' + liveBadge + availBadge + '</div>' +
          '</div>' +
          '<div class="flex flex-1 flex-col p-4 sm:p-5">' +
            '<h2 class="font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">' + escapeHtml(t.name) + '</h2>' +
            '<p class="mt-1 text-base font-bold text-navy sm:text-lg">' + escapeHtml(t.role || t.branch) + '</p>' +
            '<dl class="mt-4 grid grid-cols-3 gap-2 text-center">' +
              '<div class="rounded-xl bg-soft px-2 py-2"><dt class="text-[10px] font-bold uppercase tracking-wide text-mute">Deneyim</dt><dd class="mt-0.5 text-sm font-extrabold text-ink">' + (t.experience || '—') + (t.experience ? ' yıl' : '') + '</dd></div>' +
              '<div class="rounded-xl bg-soft px-2 py-2"><dt class="text-[10px] font-bold uppercase tracking-wide text-mute">Puan</dt><dd class="mt-0.5 text-sm font-extrabold text-ink">' + ratingTxt + '</dd></div>' +
              '<div class="rounded-xl bg-soft px-2 py-2"><dt class="text-[10px] font-bold uppercase tracking-wide text-mute">Ders</dt><dd class="mt-0.5 text-sm font-extrabold text-ink">' + lessonsTxt + '</dd></div>' +
            '</dl>' +
            '<div class="mt-auto flex flex-col gap-2 pt-4">' +
              '<div class="flex gap-2">' +
                '<a href="' + profileHref(t.slug) + '" class="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-navy hover:border-navy hover:bg-soft">Profili İncele</a>' +
                '<a href="premium-paketler.html?ogretmen=' + encodeURIComponent(t.slug) + '" class="inline-flex flex-1 items-center justify-center rounded-xl bg-accent px-3 py-2.5 text-sm font-bold text-white hover:bg-accent-2">Özel Ders Al</a>' +
              '</div>' +
              '<a href="' + profileHref(t.slug) + '#availSection" class="inline-flex w-full items-center justify-center rounded-xl border border-navy/30 px-3 py-2 text-xs font-bold text-navy hover:bg-soft">Müsait Saatleri Gör</a>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }

    function stopHoverVideo(box) {
      if (!box) return;
      if (box._videoInjectTimer) {
        clearTimeout(box._videoInjectTimer);
        box._videoInjectTimer = null;
      }
      box.classList.remove('is-playing', 'is-muted', 'has-sound', 'is-touch-playing');
      var layer = box.querySelector('.teacher-video-layer');
      if (global.OVD_TEACHER_VIDEO) global.OVD_TEACHER_VIDEO.pauseMedia(layer);
    }

    function ytEmbedSrc(id, muted) {
      var origin = '';
      try {
        origin = '&origin=' + encodeURIComponent(window.location.origin);
      } catch (e) {
        /* ignore */
      }
      return (
        'https://www.youtube.com/embed/' +
        encodeURIComponent(id) +
        '?autoplay=1&mute=' +
        (muted ? '1' : '0') +
        '&controls=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&loop=1&playlist=' +
        encodeURIComponent(id) +
        origin
      );
    }

    function markSoundOn(box) {
      if (!box) return;
      box.classList.remove('is-muted');
      box.classList.add('has-sound');
    }

    function forceUnmute(box) {
      if (!box) return;
      var iframe = box.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
            '*'
          );
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
            '*'
          );
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
            '*'
          );
        } catch (e) {
          /* ignore */
        }
      }
      var video = box.querySelector('video');
      if (video) {
        video.muted = false;
        video.volume = 1;
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      }
      markSoundOn(box);
    }

    function enableSound(box) {
      if (!box) return;
      // Kullanıcı jesti ile sesli yeniden yükle (en güvenilir yol)
      startHoverVideo(box, { restart: true, muted: false, fromUnmute: true });
    }

    function injectVideoMedia(box, layer, url, muted) {
      var ok = false;
      if (global.OVD_TEACHER_VIDEO && global.OVD_TEACHER_VIDEO.injectHoverMedia) {
        ok = !!global.OVD_TEACHER_VIDEO.injectHoverMedia(layer, url, muted);
      } else {
        var yt = youtubeIdFromUrl(url);
        if (!yt) return false;
        layer.innerHTML =
          '<iframe src="' +
          ytEmbedSrc(yt, muted) +
          '" title="Tanıtım videosu" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="eager"></iframe>';
        ok = true;
      }
      if (!ok) return false;
      if (muted) {
        box.classList.add('is-muted');
        box.classList.remove('has-sound');
      } else {
        markSoundOn(box);
        forceUnmute(box);
      }
      return true;
    }

    function startHoverVideo(box, opts) {
      opts = opts || {};
      var restart = !!opts.restart;
      var muted = opts.muted !== false;
      if (!box) return;
      if (box.classList.contains('is-playing') && !restart) {
        if (!muted) enableSound(box);
        return;
      }
      var url = box.getAttribute('data-video') || '';
      var layer = box.querySelector('.teacher-video-layer');
      if (!layer || !url) return;
      if (!isPlayableVideoUrl(url)) return;

      if (restart && global.OVD_TEACHER_VIDEO) layer.innerHTML = '';
      if (global.OVD_TEACHER_VIDEO) {
        if (!global.OVD_TEACHER_VIDEO.hasMedia(layer) || restart) {
          global.OVD_TEACHER_VIDEO.injectHoverMedia(layer, url, muted);
        } else {
          global.OVD_TEACHER_VIDEO.resumeMedia(layer, muted);
        }
      } else {
        injectVideoMedia(box, layer, url, muted);
      }

      box.classList.add('is-playing');
      if (muted) {
        box.classList.add('is-muted');
        box.classList.remove('has-sound');
      } else {
        markSoundOn(box);
        forceUnmute(box);
      }
    }

    function stopOtherVideos(exceptBox) {
      grid.querySelectorAll('.teacher-photo-box.has-video.is-playing').forEach(function (other) {
        if (other !== exceptBox) stopHoverVideo(other);
      });
    }

    function bindHoverVideos() {
      if (grid._videoIO) {
        grid._videoIO.disconnect();
        grid._videoIO = null;
      }
      grid.querySelectorAll('.teacher-photo-box.has-video').forEach(function (box) {
        if (box._dwellTimer) {
          clearTimeout(box._dwellTimer);
          box._dwellTimer = null;
        }
        if (box.dataset.videoBound === '1') return;
        box.dataset.videoBound = '1';
        var layer = box.querySelector('.teacher-video-layer');
        var url = box.getAttribute('data-video') || '';
        if (global.OVD_TEACHER_VIDEO) global.OVD_TEACHER_VIDEO.preloadHoverMedia(layer, url);

        var unmuteBtn = box.querySelector('.teacher-unmute-btn');
        if (unmuteBtn) {
          unmuteBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            stopOtherVideos(box);
            enableSound(box);
          });
        }

        var hoverCapable =
          window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (hoverCapable) {
          box.addEventListener('mouseenter', function () {
            stopOtherVideos(box);
            // Hover'da sessiz başlat (tarayıcı sesli autoplay'i engeller)
            startHoverVideo(box, { muted: true });
          });
          box.addEventListener('mouseleave', function (e) {
            // iframe/iç elemana geçişte kapanmasın
            if (e.relatedTarget && box.contains(e.relatedTarget)) return;
            var layer = box.querySelector('.teacher-video-layer');
            if (!e.relatedTarget && layer && layer.getAttribute('data-platform') === 'instagram') return;
            stopHoverVideo(box);
          });
        } else {
          // Mobil: bekleyince otomatik (sessiz başlar) — ses için Sesi aç / dokun
          box.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('.teacher-unmute-btn')) return;
            e.preventDefault();
            e.stopPropagation();
            if (box._dwellTimer) {
              clearTimeout(box._dwellTimer);
              box._dwellTimer = null;
            }
            stopOtherVideos(box);
            box.classList.add('is-touch-playing');
            enableSound(box);
          });
        }
      });

      var touchMode =
        !(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
      if (touchMode && 'IntersectionObserver' in window) {
        grid._videoIO = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              var box = entry.target;
              if (box._dwellTimer) {
                clearTimeout(box._dwellTimer);
                box._dwellTimer = null;
              }
              if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                box._dwellTimer = setTimeout(function () {
                  box._dwellTimer = null;
                  if (!box.isConnected) return;
                  stopOtherVideos(box);
                  box.classList.add('is-touch-playing');
                  // Tarayıcı izinsiz sesi engeller → sessiz otomatik + Sesi aç
                  startHoverVideo(box, { muted: true });
                }, 1200);
              } else if (box.classList.contains('is-playing')) {
                stopHoverVideo(box);
              }
            });
          },
          { threshold: [0.6, 0.75], rootMargin: '0px 0px -8% 0px' }
        );
        grid.querySelectorAll('.teacher-photo-box.has-video').forEach(function (box) {
          grid._videoIO.observe(box);
        });
      }
    }

    function observeLazy() {
      var imgs = grid.querySelectorAll('img.lazy-img[data-src]');
      if (!('IntersectionObserver' in window)) {
        imgs.forEach(function (img) {
          img.src = img.getAttribute('data-src');
          img.removeAttribute('data-src');
          img.classList.add('in');
        });
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var img = e.target;
          var src = img.getAttribute('data-src');
          if (src) {
            img.src = src;
            img.removeAttribute('data-src');
            img.onload = function () {
              var card = img.closest('.card-enter');
              if (card) card.classList.add('in');
            };
          }
          io.unobserve(img);
        });
      }, { rootMargin: '120px 0px', threshold: 0.01 });
      imgs.forEach(function (img) {
        io.observe(img);
      });

      var cards = grid.querySelectorAll('.card-enter');
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            cio.unobserve(e.target);
          }
        });
      }, { threshold: 0.08 });
      cards.forEach(function (c) {
        cio.observe(c);
      });
    }

    function pageSlice() {
      var start = (state.page - 1) * PAGE_SIZE;
      return state.filtered.slice(start, start + PAGE_SIZE);
    }

    function totalPages() {
      return Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    }

    function renderPager() {
      if (!pager) return;
      var pages = totalPages();
      if (state.filtered.length === 0) {
        pager.innerHTML = '';
        return;
      }
      var html = '';
      html +=
        '<button type="button" data-page="prev" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-navy disabled:opacity-40" ' +
        (state.page <= 1 ? 'disabled' : '') +
        '>‹ Önceki</button>';
      for (var i = 1; i <= pages; i++) {
        var active = i === state.page;
        html +=
          '<button type="button" data-page="' +
          i +
          '" class="min-w-[40px] rounded-xl px-3 py-2 text-sm font-bold ' +
          (active ? 'bg-navy text-white' : 'border border-slate-200 bg-white text-navy hover:bg-soft') +
          '">' +
          i +
          '</button>';
      }
      html +=
        '<button type="button" data-page="next" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-navy disabled:opacity-40" ' +
        (state.page >= pages ? 'disabled' : '') +
        '>Sonraki ›</button>';
      pager.innerHTML = html;
    }

    function render() {
      var list = pageSlice();
      var total = state.filtered.length;
      var pages = totalPages();
      if (meta) {
        meta.textContent = total
          ? total + ' öğretmen · Sayfa ' + state.page + ' / ' + pages + (sourceLabel === 'panel' ? ' · canlı kadro' : '')
          : '0 öğretmen';
      }

      if (!total) {
        grid.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        renderPager();
        return;
      }
      if (empty) empty.classList.add('hidden');
      grid.innerHTML = list.map(cardHtml).join('');
      renderPager();
      observeLazy();
      bindHoverVideos();
    }

    function applyFilters() {
      var q = ((els.q && els.q.value) || '').trim().toLocaleLowerCase('tr-TR');
      var branch = els.branch ? els.branch.value : '';
      var grade = els.grade ? els.grade.value : '';
      var price = els.price ? els.price.value : '';
      var avail = els.avail ? els.avail.value : '';
      var exp = els.exp ? els.exp.value : '';

      state.filtered = teachers.filter(function (t) {
        if (branch && t.branch !== branch) return false;
        if (grade && (t.grades || []).indexOf(grade) === -1) return false;
        if (!priceMatch(t, price)) return false;
        if (!availMatch(t, avail)) return false;
        if (!expMatch(t, exp)) return false;
        if (q) {
          var hay = (t.name + ' ' + t.branch + ' ' + t.university + ' ' + (t.role || '') + ' ' + (t.short_bio || ''))
            .toLocaleLowerCase('tr-TR');
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });

      state.filtered.sort(function (a, b) {
        if (a.live !== b.live) return a.live ? -1 : 1;
        if (a.available !== b.available) return a.available ? -1 : 1;
        return (b.rating || 0) - (a.rating || 0);
      });

      state.page = 1;
      render();
    }

    function bindUi() {
      var searchTimer;
      if (els.q) {
        els.q.addEventListener('input', function () {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(applyFilters, 180);
        });
      }
      ['branch', 'grade', 'price', 'avail', 'exp'].forEach(function (k) {
        if (els[k]) els[k].addEventListener('change', applyFilters);
      });
      if (els.reset) {
        els.reset.addEventListener('click', function () {
          if (els.q) els.q.value = '';
          if (els.branch) els.branch.value = '';
          if (els.grade) els.grade.value = '';
          if (els.price) els.price.value = '';
          if (els.avail) els.avail.value = '';
          if (els.exp) els.exp.value = '';
          applyFilters();
        });
      }

      if (pager) {
        pager.addEventListener('click', function (e) {
          var btn = e.target.closest('button[data-page]');
          if (!btn || btn.disabled) return;
          var v = btn.getAttribute('data-page');
          var pages = totalPages();
          if (v === 'prev') state.page = Math.max(1, state.page - 1);
          else if (v === 'next') state.page = Math.min(pages, state.page + 1);
          else state.page = parseInt(v, 10) || 1;
          render();
          window.scrollTo({ top: grid.offsetTop - 80, behavior: 'smooth' });
        });
      }
    }

    function boot(list, label) {
      teachers = list;
      sourceLabel = label || 'katalog';
      fillBranches();
      renderAvatarStrip(teachers);
      applyFilters();
    }

    function mergeCatalog(staticList, liveList, managedSlugs) {
      var managed = {};
      (managedSlugs || []).forEach(function (slug) {
        if (slug) managed[String(slug)] = true;
      });
      var staticBySlug = {};
      (staticList || []).forEach(function (t) {
        if (t && t.slug) staticBySlug[t.slug] = t;
      });
      var bySlug = {};
      // Statik kadro: panelde hic kaydi olmayanlar kalsin
      (staticList || []).forEach(function (t) {
        if (!t || !t.slug) return;
        if (managed[t.slug]) return; // panel yonetiyor (pasif dahil) -> statikten gosterme
        bySlug[t.slug] = t;
      });
      // Panel yayinlari ezsin / eklesin; bozuk foto / eksik metin icin statik yedek
      (liveList || []).forEach(function (t) {
        if (!t || !t.slug) return;
        var base = staticBySlug[t.slug] || {};
        var photo = isUsablePhoto(t.photo) ? t.photo : base.photo || 'assets/img/ovd-logo.png';
        bySlug[t.slug] = Object.assign({}, base, t, {
          photo: photo,
          photoPos: t.photoPos || base.photoPos || 'center 20%',
          name: t.name || base.name || 'Öğretmen',
          role: t.role || base.role || t.branch || base.branch || '',
          university: t.university || base.university || '',
          branch: t.branch || base.branch || '',
          video: t.video || base.video || '',
          rating: t.rating != null ? t.rating : base.rating,
          total_reviews: t.total_reviews != null ? t.total_reviews : base.total_reviews
        });
      });
      return Object.keys(bySlug).map(function (k) { return bySlug[k]; });
    }

    bindUi();
    boot(teachers, 'katalog');

    fetch('/api/public-teachers')
      .then(function (r) {
        if (!r.ok) throw new Error('public_teachers_' + r.status);
        return r.json();
      })
      .then(function (data) {
        var live = Array.isArray(data.teachers) ? data.teachers.map(mapApiTeacher) : [];
        var managed = Array.isArray(data.managed_slugs) ? data.managed_slugs : [];
        // API basariliysa her zaman birlestir (bos liste = yalnizca panel disi statikler)
        boot(mergeCatalog(teachers, live, managed), managed.length || live.length ? 'panel+katalog' : 'katalog');
      })
      .catch(function () {
        /* ag hatasi: statik katalog kalir */
      });
  }

  global.__ovdPhotoErr = function (img) {
    if (!img) return;
    var cur = String(img.getAttribute('src') || '');
    var orig = originalPhotoUrl(cur);
    if (orig && orig !== cur && img.getAttribute('data-fb') !== '1') {
      img.setAttribute('data-fb', '1');
      img.src = orig;
      return;
    }
    img.onerror = null;
    img.src = '/assets/img/ovd-logo.png';
  };

  global.OVD_PREMIUM_TEACHERS_UI = { init: initPremiumTeachersUi };
})(typeof window !== 'undefined' ? window : global);
