/**
 * Öğretmen detay — /ozel-ders/ogretmen/{slug}
 * Müsaitlik: panel availability_slots (yeşil/gri/kırmızı)
 */
(function (global) {
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function upgradeRemotePhotoUrl(url, minSize) {
    minSize = minSize || 800;
    var u = String(url || '').trim();
    if (!u) return u;
    if (!/ggpht\.com|googleusercontent\.com/i.test(u)) return u;
    return u.replace(/=s(\d+)/i, function (match, n) {
      var size = parseInt(n, 10);
      if (!Number.isFinite(size) || size === 0 || size >= minSize) return match;
      return '=s' + minSize;
    });
  }

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

  var PHOTO_OVERRIDES = {
    'yasin-kandemir': '/assets/img/kadro/yasin-kandemir.jpg',
    'ali-aktas': '/assets/img/kadro/ali-aktas.jpg',
    'sultan-kurt': '/assets/img/kadro/sultan-kurt.jpg',
    'merve-yetkin': '/assets/img/kadro/merve-yetkin.jpg'
  };
  var PHOTO_FALLBACKS = {
    'sultan-kurt': '/assets/img/kadro/sultan-kurt.jpg',
    'yilmaz-isik': '/assets/img/kadro/yilmaz-isik.jpg',
    'yasin-kandemir': '/assets/img/kadro/yasin-kandemir.jpg',
    'kaan-inaltekin': '/assets/img/kadro/kaan-inaltekin.jpg'
  };

  function youtubeIdFromUrl(url) {
    if (global.OVD_TEACHER_VIDEO) return global.OVD_TEACHER_VIDEO.youtubeIdFromUrl(url);
    var u = String(url || '').trim();
    if (!u) return '';
    var m = u.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{6,})/i
    );
    return m ? m[1] : '';
  }

  function isDirectVideoUrl(url) {
    if (global.OVD_TEACHER_VIDEO) return global.OVD_TEACHER_VIDEO.isDirectVideoUrl(url);
    var u = String(url || '').trim();
    if (!u) return false;
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(u)) return true;
    if (/\/storage\/v1\/object\//i.test(u) && /video/i.test(u)) return true;
    return false;
  }

  /** Panel videos[] + video_url → en fazla 3; ilki hover tanıtımı */
  function normalizeVideos(raw, fallbackUrl) {
    var list = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (item, idx) {
        var url = '';
        var title = '';
        var id = 'v-' + (idx + 1);
        if (typeof item === 'string') {
          url = String(item || '').trim();
        } else if (item && typeof item === 'object') {
          url = String(item.url || item.public_url || item.video_url || '').trim();
          title = String(item.title || '').trim();
          if (item.id) id = String(item.id);
        }
        if (!url) return;
        list.push({ id: id, url: url, title: title });
      });
    }
    if (!list.length) {
      var legacy = String(fallbackUrl || '').trim();
      if (legacy) list.push({ id: 'v-1', url: legacy, title: '' });
    }
    return list.slice(0, 3);
  }

  function primaryVideoUrl(videos, fallbackUrl) {
    if (videos && videos.length && videos[0].url) return videos[0].url;
    return String(fallbackUrl || '').trim();
  }

  function embedHtml(url, title) {
    var yt = youtubeIdFromUrl(url);
    var label = title || 'Tanıtım videosu';
    if (yt) {
      return (
        '<div class="teacher-profile-video-frame aspect-video overflow-hidden rounded-xl border border-slate-200 bg-black">' +
        '<iframe src="https://www.youtube.com/embed/' +
        encodeURIComponent(yt) +
        '?rel=0&modestbranding=1&playsinline=1" title="' +
        escapeHtml(label) +
        '" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy" class="h-full w-full border-0"></iframe></div>'
      );
    }
    if (isDirectVideoUrl(url)) {
      return (
        '<div class="teacher-profile-video-frame aspect-video overflow-hidden rounded-xl border border-slate-200 bg-black">' +
        '<video src="' +
        escapeHtml(url) +
        '" controls playsinline preload="metadata" class="h-full w-full"></video></div>'
      );
    }
    var driveId = global.OVD_TEACHER_VIDEO && global.OVD_TEACHER_VIDEO.driveFileIdFromUrl(url);
    if (driveId) {
      return (
        '<div class="teacher-profile-video-frame aspect-video overflow-hidden rounded-xl border border-slate-200 bg-black">' +
        '<iframe src="https://drive.google.com/file/d/' +
        encodeURIComponent(driveId) +
        '/preview" title="' +
        escapeHtml(label) +
        '" allow="autoplay; encrypted-media" allowfullscreen loading="lazy" class="h-full w-full border-0"></iframe></div>'
      );
    }
    var ig = global.OVD_TEACHER_VIDEO && global.OVD_TEACHER_VIDEO.instagramEmbedSrc(url);
    if (ig) {
      return (
        '<div class="teacher-profile-video-frame overflow-hidden rounded-xl border border-slate-200 bg-black" style="aspect-ratio:9/16;max-width:360px">' +
        '<iframe src="' +
        escapeHtml(ig) +
        '" title="' +
        escapeHtml(label) +
        '" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" loading="lazy" class="h-full w-full border-0"></iframe></div>'
      );
    }
    return (
      '<a class="inline-flex text-sm font-bold text-navy underline" href="' +
      escapeHtml(url) +
      '" target="_blank" rel="noopener">' +
      escapeHtml(label || 'Videoyu izle') +
      '</a>'
    );
  }

  function renderVideosSection(videos) {
    if (!videos || !videos.length) return '';
    var heading = videos.length > 1 ? 'Tanıtım videoları' : 'Tanıtım videosu';
    var html =
      '<div class="mt-8" id="teacherVideos">' +
      '<h2 class="font-display text-lg font-bold">' +
      heading +
      '</h2>' +
      '<div class="mt-4 flex flex-col gap-5">';
    videos.forEach(function (v, idx) {
      var title =
        v.title ||
        (idx === 0 ? 'Tanıtım videosu' : 'Video ' + (idx + 1));
      html +=
        '<div class="teacher-profile-video">' +
        (videos.length > 1
          ? '<p class="mb-2 text-sm font-bold text-navy">' + escapeHtml(title) + '</p>'
          : '') +
        embedHtml(v.url, title) +
        '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function slugFromLocation() {
    var q = new URLSearchParams(location.search).get('slug');
    if (q) return q.trim().toLowerCase();
    var parts = location.pathname.replace(/\/+$/, '').split('/');
    var i = parts.indexOf('ogretmen');
    if (i >= 0 && parts[i + 1]) return decodeURIComponent(parts[i + 1]).toLowerCase();
    return '';
  }

  function chips(arr) {
    if (!arr || !arr.length) return '';
    return (
      '<div class="mt-3 flex flex-wrap gap-2">' +
      arr
        .map(function (x) {
          return (
            '<span class="rounded-full bg-navy/10 px-3 py-1 text-xs font-bold text-navy">' +
            escapeHtml(x) +
            '</span>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function slotClass(status) {
    if (status === 'free') return 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer';
    if (status === 'busy') return 'bg-red-50 border-red-200 text-red-700 cursor-not-allowed opacity-80';
    if (status === 'closed') return 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed';
    return 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed';
  }

  function slotLabel(status) {
    if (status === 'free') return 'Seçilebilir';
    if (status === 'busy') return 'Dolu';
    if (status === 'closed') return 'Kapalı';
    return 'Geçmiş';
  }

  function formatReviewDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Istanbul'
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 10);
    }
  }

  function starsHtml(value) {
    var v = Math.max(0, Math.min(5, Number(value) || 0));
    var html = '<span class="inline-flex items-center gap-0.5" aria-label="' + escapeHtml(String(v)) + ' yıldız">';
    for (var i = 1; i <= 5; i++) {
      html +=
        '<span class="' +
        (i <= Math.round(v) ? 'text-amber-500' : 'text-slate-300') +
        '">★</span>';
    }
    return html + '</span>';
  }

  function renderReviewsSection(t) {
    var avg = t.average_rating != null ? Number(t.average_rating) : null;
    if (avg != null && !isFinite(avg)) avg = null;
    var total = Number(t.total_reviews) || 0;
    var reviews = Array.isArray(t.reviews) ? t.reviews : [];
    if (!reviews.length && !(avg != null && total > 0)) {
      return (
        '<div class="mt-10 rounded-2xl border border-dashed border-slate-200 p-6" id="reviewsSection">' +
        '<h2 class="font-display text-lg font-bold text-ink">Öğrenci ve veli yorumları</h2>' +
        '<p class="mt-2 text-sm text-mute">Henüz herkese açık değerlendirme yok.</p></div>'
      );
    }
    var summary =
      avg != null && total > 0
        ? '<p class="mt-2 flex flex-wrap items-center gap-2 text-sm text-mute">' +
          '<span class="text-2xl font-extrabold text-ink">' +
          escapeHtml(avg.toFixed(1)) +
          '</span>' +
          starsHtml(avg) +
          '<span>· ' +
          escapeHtml(String(total)) +
          ' değerlendirme</span></p>'
        : '';
    var list = '';
    if (reviews.length) {
      list = '<ul class="mt-5 space-y-3">';
      reviews.forEach(function (r) {
        if (!r) return;
        var who = r.reviewer_name || (String(r.reviewer_type || '').toUpperCase() === 'PARENT' ? 'Veli' : 'Öğrenci');
        var kind = String(r.reviewer_type || '').toUpperCase() === 'PARENT' ? 'Veli' : 'Öğrenci';
        list +=
          '<li class="rounded-xl border border-slate-200 bg-soft/60 p-4">' +
          '<div class="flex flex-wrap items-center gap-2 text-sm">' +
          '<span class="font-bold text-ink">' +
          escapeHtml(who) +
          '</span>' +
          '<span class="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-mute">' +
          escapeHtml(kind) +
          '</span>' +
          starsHtml(r.rating) +
          '<span class="ml-auto text-[11px] text-mute">' +
          escapeHtml(formatReviewDate(r.created_at)) +
          '</span></div>' +
          (r.comment
            ? '<p class="mt-2 text-sm leading-relaxed text-mute">' + escapeHtml(r.comment) + '</p>'
            : '') +
          '</li>';
      });
      list += '</ul>';
    }
    return (
      '<div class="mt-10" id="reviewsSection">' +
      '<h2 class="font-display text-lg font-bold text-ink">Öğrenci ve veli yorumları</h2>' +
      summary +
      list +
      '</div>'
    );
  }

  function renderAvailability(t, slots) {
    var list = (slots || []).filter(function (s) {
      return s.start_time;
    });
    if (!list.length) {
      return (
        '<div class="mt-10 rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-mute" id="availSection">' +
        '<h2 class="font-display text-lg font-bold text-ink">Müsaitlik takvimi</h2>' +
        '<p class="mt-2">Bu öğretmen için henüz yayınlanmış saat aralığı yok.</p></div>'
      );
    }

    var byDate = {};
    list.forEach(function (s) {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    });

    var html =
      '<div class="mt-10" id="availSection">' +
      '<h2 class="font-display text-lg font-bold text-ink">Müsaitlik takvimi</h2>' +
      '<p class="mt-1 text-sm text-mute">Yeşil: seçilebilir · Gri: kapalı · Kırmızı: dolu · Soluk: geçmiş</p>' +
      '<div class="mt-4 space-y-4">';

    Object.keys(byDate)
      .sort()
      .forEach(function (date) {
        var daySlots = byDate[date];
        var label = daySlots[0].day_label || date;
        html +=
          '<div class="rounded-xl border border-slate-200 p-3">' +
          '<div class="text-sm font-bold text-navy">' +
          escapeHtml(label) +
          ' · ' +
          escapeHtml(date) +
          '</div>' +
          '<div class="mt-2 flex flex-wrap gap-2">';
        daySlots.forEach(function (s) {
          var disabled = s.status !== 'free';
          html +=
            '<button type="button" class="slot-btn rounded-lg border px-2.5 py-2 text-xs font-bold ' +
            slotClass(s.status) +
            '" data-status="' +
            escapeHtml(s.status) +
            '" data-starts="' +
            escapeHtml(s.starts_at || '') +
            '" data-ends="' +
            escapeHtml(s.ends_at || '') +
            '"' +
            (disabled ? ' disabled' : '') +
            '>' +
            escapeHtml(s.start_time) +
            '–' +
            escapeHtml(s.end_time) +
            '<span class="mt-0.5 block text-[10px] font-semibold opacity-80">' +
            slotLabel(s.status) +
            '</span></button>';
        });
        html += '</div></div>';
      });

    html +=
      '</div>' +
      '<form id="bookForm" class="mt-6 hidden rounded-2xl border border-navy/20 bg-soft p-4">' +
      '<h3 class="font-bold text-navy">Saat rezervasyonu</h3>' +
      '<p class="mt-1 text-xs text-mute" id="bookSlotLabel"></p>' +
      '<div class="mt-3 grid gap-2 sm:grid-cols-2">' +
      '<input required name="student_name" placeholder="Ad soyad" class="rounded-xl border border-slate-200 px-3 py-2 text-sm">' +
      '<input required name="student_phone" placeholder="Telefon" class="rounded-xl border border-slate-200 px-3 py-2 text-sm">' +
      '<input type="email" name="student_email" placeholder="E-posta" class="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2">' +
      '</div>' +
      '<input type="hidden" name="starts_at" id="bookStarts">' +
      '<input type="hidden" name="ends_at" id="bookEnds">' +
      '<button type="submit" class="mt-3 rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white">Rezervasyon talebi gönder</button>' +
      '<p class="mt-2 text-xs text-mute" id="bookMsg"></p>' +
      '</form></div>';

    return html;
  }

  function render(t, slots) {
    var exams = Array.isArray(t.exam_areas) ? t.exam_areas : [];
    var grades = Array.isArray(t.grade_levels) ? t.grade_levels : [];
    var specs = Array.isArray(t.specialties) ? t.specialties : [];
    var name = titleCaseTr(t.name) || t.name || 'Öğretmen';
    var role = titleCaseTr(t.title || [t.branch, exams.join(' / ')].filter(Boolean).join(' · '));
    var rawPhoto = PHOTO_OVERRIDES[t.slug] || upgradeRemotePhotoUrl(t.photo_url);
    var photo = isUsablePhoto(rawPhoto)
      ? rawPhoto
      : PHOTO_FALLBACKS[t.slug] || '/assets/img/ovd-logo.png';
    var bio = t.full_bio || t.short_bio || '';
    var buy = '/premium-paketler.html?ogretmen=' + encodeURIComponent(t.slug);
    var videos = normalizeVideos(t.videos, t.video_url);
    var videoUrl = primaryVideoUrl(videos, t.video_url);
    var canHoverVideo = !!(youtubeIdFromUrl(videoUrl) || isDirectVideoUrl(videoUrl));

    return (
      '<div class="grid gap-8 lg:grid-cols-[340px_1fr] lg:gap-12">' +
        '<aside>' +
          '<div class="teacher-hero-box overflow-hidden rounded-2xl border border-slate-200 bg-soft shadow-soft' +
          (canHoverVideo ? ' has-video' : '') +
          '"' +
          (canHoverVideo ? ' data-video="' + escapeHtml(videoUrl) + '"' : '') +
          '>' +
            '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(name) + '" class="teacher-hero-photo" width="480" height="600">' +
            (canHoverVideo
              ? '<div class="teacher-video-layer" aria-hidden="true"></div><span class="teacher-video-badge" aria-hidden="true">Tanıtım videosu</span><button type="button" class="teacher-unmute-btn" aria-label="Sesi aç">🔊 Sesi aç</button>'
              : '') +
          '</div>' +
          '<a href="#availSection" class="mt-4 flex w-full items-center justify-center rounded-xl border border-navy px-4 py-3 text-sm font-bold text-navy hover:bg-soft">Müsait Saatleri Gör</a>' +
          '<a href="' + buy + '" class="mt-2 flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3.5 text-sm font-bold text-white shadow-lift hover:bg-accent-2">Özel Ders Al</a>' +
          '<a href="/ozel-ders.html#ogretmenler" class="mt-2 flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-navy hover:bg-soft">Tüm öğretmenler</a>' +
        '</aside>' +
        '<section>' +
          '<p class="text-sm font-bold uppercase tracking-wider text-accent">Özel ders öğretmeni</p>' +
          '<h1 class="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">' + escapeHtml(name) + '</h1>' +
          '<p class="mt-2 text-xl font-bold text-navy sm:text-2xl">' + escapeHtml(role) + '</p>' +
          (t.university ? '<p class="mt-1 text-sm font-semibold text-mute">' + escapeHtml(t.university) + (t.department ? ' · ' + escapeHtml(t.department) : '') + '</p>' : '') +
          '<dl class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">' +
            '<div class="rounded-xl bg-soft px-3 py-3 text-center"><dt class="text-[10px] font-bold uppercase text-mute">Deneyim</dt><dd class="mt-1 text-sm font-extrabold">' + (t.experience_years != null ? escapeHtml(t.experience_years) + ' yıl' : '—') + '</dd></div>' +
            '<div class="rounded-xl bg-soft px-3 py-3 text-center"><dt class="text-[10px] font-bold uppercase text-mute">Şehir</dt><dd class="mt-1 text-sm font-extrabold">' + escapeHtml(t.city || 'Online') + '</dd></div>' +
            '<div class="rounded-xl bg-soft px-3 py-3 text-center"><dt class="text-[10px] font-bold uppercase text-mute">Format</dt><dd class="mt-1 text-sm font-extrabold">' + escapeHtml(t.lesson_format || 'online') + '</dd></div>' +
            '<div class="rounded-xl bg-soft px-3 py-3 text-center"><dt class="text-[10px] font-bold uppercase text-mute">' + (t.average_rating != null && Number(t.total_reviews) > 0 ? 'Puan' : 'Müsait') + '</dt><dd class="mt-1 text-sm font-extrabold">' + (t.average_rating != null && Number(t.total_reviews) > 0 ? ('★ ' + Number(t.average_rating).toFixed(1) + (t.total_reviews ? ' · ' + t.total_reviews : '')) : (t.accepting_students === false ? 'Dolu' : 'Evet')) + '</dd></div>' +
          '</dl>' +
          (grades.length ? '<div class="mt-8"><h2 class="font-display text-lg font-bold">Seviyeler</h2>' + chips(grades) + '</div>' : '') +
          (exams.length ? '<div class="mt-6"><h2 class="font-display text-lg font-bold">Sınav alanları</h2>' + chips(exams) + '</div>' : '') +
          (specs.length ? '<div class="mt-6"><h2 class="font-display text-lg font-bold">Uzmanlık</h2>' + chips(specs) + '</div>' : '') +
          (bio
            ? '<div class="mt-8"><h2 class="font-display text-lg font-bold">Hakkında</h2><p class="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-mute">' +
              escapeHtml(bio) +
              '</p></div>'
            : '') +
          (t.teaching_approach
            ? '<div class="mt-8"><h2 class="font-display text-lg font-bold">Öğretim yaklaşımı</h2><p class="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-mute">' +
              escapeHtml(t.teaching_approach) +
              '</p></div>'
            : '') +
          renderVideosSection(videos) +
          renderReviewsSection(t) +
          renderAvailability(t, slots) +
        '</section>' +
      '</div>'
    );
  }

  function bindHoverVideo() {
    var box = document.querySelector('.teacher-hero-box.has-video');
    if (!box) return;
    var layer = box.querySelector('.teacher-video-layer');
    function stop() {
      if (box._dwellTimer) {
        clearTimeout(box._dwellTimer);
        box._dwellTimer = null;
      }
      if (box._videoInjectTimer) {
        clearTimeout(box._videoInjectTimer);
        box._videoInjectTimer = null;
      }
      if (box._videoClearTimer) {
        clearTimeout(box._videoClearTimer);
        box._videoClearTimer = null;
      }
      box.classList.remove('is-playing', 'is-muted', 'has-sound');
      box._videoClearTimer = setTimeout(function () {
        box._videoClearTimer = null;
        if (!box.classList.contains('is-playing') && layer) layer.innerHTML = '';
      }, 700);
    }
    function markSoundOn() {
      box.classList.remove('is-muted');
      box.classList.add('has-sound');
    }
    function forceUnmute() {
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
      markSoundOn();
    }
    function injectMedia(url, muted) {
      var yt = youtubeIdFromUrl(url);
      var origin = '';
      try {
        origin = '&origin=' + encodeURIComponent(window.location.origin);
      } catch (e) {
        /* ignore */
      }
      if (yt) {
        layer.innerHTML =
          '<iframe src="https://www.youtube.com/embed/' +
          encodeURIComponent(yt) +
          '?autoplay=1&mute=' +
          (muted ? '1' : '0') +
          '&controls=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&loop=1&playlist=' +
          encodeURIComponent(yt) +
          origin +
          '" title="Tanıtım videosu" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
      } else if (isDirectVideoUrl(url)) {
        layer.innerHTML =
          '<video src="' +
          escapeHtml(url) +
          '" autoplay loop playsinline controls' +
          (muted ? ' muted' : '') +
          '></video>';
        var video = layer.querySelector('video');
        if (video) {
          video.muted = !!muted;
          video.volume = 1;
          var playPromise = video.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(function () {
              video.muted = true;
              box.classList.add('is-muted');
              video.play().catch(function () {
                video.controls = true;
              });
            });
          }
        }
      } else return false;
      if (muted) {
        box.classList.add('is-muted');
        box.classList.remove('has-sound');
      } else {
        markSoundOn();
        forceUnmute();
      }
      return true;
    }
    function start(restart, muted, fromUnmute) {
      if (box.classList.contains('is-playing') && !restart) {
        if (!muted) start(true, false, true);
        return;
      }
      var url = box.getAttribute('data-video') || '';
      if (!layer || !url) return;
      if (!youtubeIdFromUrl(url) && !isDirectVideoUrl(url)) return;
      if (box._videoClearTimer) {
        clearTimeout(box._videoClearTimer);
        box._videoClearTimer = null;
      }
      if (box._videoInjectTimer) {
        clearTimeout(box._videoInjectTimer);
        box._videoInjectTimer = null;
      }
      if (box.classList.contains('is-playing') && !fromUnmute) {
        box.classList.remove('is-playing');
        void box.offsetWidth;
      }
      if (restart) layer.innerHTML = '';
      box.classList.add('is-playing');
      if (muted) box.classList.add('is-muted');
      else box.classList.remove('is-muted');
      var reduceMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var delay = reduceMotion || fromUnmute ? 0 : 160;
      box._videoInjectTimer = setTimeout(function () {
        box._videoInjectTimer = null;
        if (!box.classList.contains('is-playing')) return;
        injectMedia(url, !!muted);
      }, delay);
    }
    var unmuteBtn = box.querySelector('.teacher-unmute-btn');
    if (unmuteBtn) {
      unmuteBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        start(true, false, true);
      });
    }
    var hoverCapable = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (hoverCapable) {
      box.addEventListener('mouseenter', function () {
        start(false, false, false);
        setTimeout(function () {
          if (box.classList.contains('is-playing') && !box.classList.contains('has-sound')) {
            box.classList.add('is-muted');
          }
        }, 800);
      });
      box.addEventListener('mouseleave', stop);
    } else {
      box.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('.teacher-unmute-btn')) return;
        if (box._dwellTimer) {
          clearTimeout(box._dwellTimer);
          box._dwellTimer = null;
        }
        start(true, false, true);
      });
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (box._dwellTimer) {
                clearTimeout(box._dwellTimer);
                box._dwellTimer = null;
              }
              if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                box._dwellTimer = setTimeout(function () {
                  box._dwellTimer = null;
                  start(false, true, false);
                }, 1200);
              } else if (box.classList.contains('is-playing')) {
                stop();
              }
            });
          },
          { threshold: [0.55, 0.7] }
        );
        io.observe(box);
      }
    }
  }

  function bindBooking(slug) {
    var form = document.getElementById('bookForm');
    if (!form) return;
    document.querySelectorAll('.slot-btn[data-status="free"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        form.classList.remove('hidden');
        document.getElementById('bookStarts').value = btn.getAttribute('data-starts') || '';
        document.getElementById('bookEnds').value = btn.getAttribute('data-ends') || '';
        document.getElementById('bookSlotLabel').textContent =
          'Seçilen saat: ' + (btn.textContent || '').replace(/\s+/g, ' ').trim();
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.getElementById('bookMsg');
      var fd = new FormData(form);
      var payload = {
        slug: slug,
        starts_at: fd.get('starts_at'),
        ends_at: fd.get('ends_at'),
        student_name: fd.get('student_name'),
        student_phone: fd.get('student_phone'),
        student_email: fd.get('student_email')
      };
      msg.textContent = 'Gönderiliyor…';
      fetch('/api/public-teacher-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (res) {
          if (!res.ok) {
            var err = res.j && res.j.error;
            var map = {
              slot_unavailable: 'Bu saat artık müsait değil.',
              slot_already_taken: 'Bu saat az önce doldu. Başka saat seçin.',
              slot_in_past: 'Geçmiş saat seçilemez.',
              profile_not_bookable: 'Öğretmen şu an rezervasyon almıyor.'
            };
            throw new Error(map[err] || err || 'Rezervasyon başarısız');
          }
          msg.textContent = 'Rezervasyon alındı. Ekibimiz sizinle iletişime geçecek.';
          form.querySelector('button[type="submit"]').disabled = true;
        })
        .catch(function (err) {
          msg.textContent = err.message || 'Hata';
        });
    });
  }

  function init() {
    var status = document.getElementById('teacherStatus');
    var box = document.getElementById('teacherDetail');
    var missing = document.getElementById('teacherMissing');
    var slug = slugFromLocation();
    if (!slug) {
      if (status) status.classList.add('hidden');
      if (missing) missing.classList.remove('hidden');
      return;
    }

    fetch('/api/public-teachers?slug=' + encodeURIComponent(slug))
      .then(function (r) {
        if (!r.ok) throw new Error('not_found');
        return r.json();
      })
      .then(function (data) {
        var t = data.teacher;
        if (!t) throw new Error('not_found');
        var slots = data.availability_slots || t.availability_slots || [];
        document.title = (titleCaseTr(t.name) || t.name || 'Öğretmen') + ' — Online VIP Dershane';
        var desc = document.querySelector('meta[name="description"]');
        if (desc && t.short_bio) desc.setAttribute('content', t.short_bio.slice(0, 160));
        if (status) status.classList.add('hidden');
        if (box) {
          box.innerHTML = render(t, slots);
          box.classList.remove('hidden');
          bindHoverVideo();
          bindBooking(t.slug);
        }
      })
      .catch(function () {
        if (status) status.classList.add('hidden');
        if (missing) missing.classList.remove('hidden');
      });
  }

  global.OVD_TEACHER_DETAIL = { init: init };

  if (typeof document !== 'undefined') {
    function boot() {
      if (document.getElementById('teacherDetail')) init();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : global);
