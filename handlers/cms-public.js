import { isCmsSchemaError } from '../api/_lib/cms-schema.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const nowIso = () => new Date().toISOString();

function corsJson(res, status, body) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
  return res.status(status).json(body);
}

async function fetchBootstrap() {
  const [
    themeRes,
    seoRes,
    slidersRes,
    menusRes,
    homeRes,
    testimonialRes,
    faqRes
  ] = await Promise.all([
    supabaseAdmin.from('cms_theme_settings').select('*').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('cms_seo_settings').select('*').eq('id', 1).maybeSingle(),
    supabaseAdmin
      .from('cms_sliders')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .limit(50),
    supabaseAdmin.from('cms_menus').select('id, menu_key, label').is('institution_id', null),
    supabaseAdmin
      .from('cms_pages')
      .select('id')
      .is('institution_id', null)
      .eq('published', true)
      .eq('is_home', true)
      .maybeSingle(),
    supabaseAdmin.from('cms_testimonials').select('*').eq('active', true).order('sort_order', { ascending: true }).limit(24),
    supabaseAdmin.from('cms_faq_items').select('*').eq('active', true).order('sort_order', { ascending: true }).limit(50)
  ]);

  let menuItemsByMenu = {};
  const menuRows = menusRes.data || [];
  const menuIds = menuRows.map((m) => m.id).filter(Boolean);
  if (menuIds.length) {
    const { data: items } = await supabaseAdmin
      .from('cms_menu_items')
      .select('*')
      .in('menu_id', menuIds)
      .eq('visible', true)
      .order('sort_order', { ascending: true });
    menuItemsByMenu = {};
    for (const row of menuRows) {
      menuItemsByMenu[row.menu_key] = (items || []).filter((it) => it.menu_id === row.id);
    }
  }

  let page = null;
  let sections = [];
  const hid = homeRes.data?.id;
  if (hid) {
    const { data: p } = await supabaseAdmin.from('cms_pages').select('*').eq('id', hid).maybeSingle();
    page = p;
    const { data: sec } = await supabaseAdmin
      .from('cms_page_sections')
      .select('*')
      .eq('page_id', hid)
      .eq('visible', true)
      .order('sort_order', { ascending: true });
    sections = sec || [];
  }

  const sliders = (slidersRes.data || []).filter((s) => {
    const now = Date.parse(nowIso());
    if (s.publish_from && Date.parse(s.publish_from) > now) return false;
    if (s.publish_until && Date.parse(s.publish_until) < now) return false;
    return true;
  });

  return {
    theme: themeRes.data || null,
    seo: seoRes.data || null,
    sliders,
    menus: menuRows.map((m) => ({
      ...m,
      items: menuItemsByMenu[m.menu_key] || []
    })),
    home: page ? { ...page, sections } : null,
    testimonials: testimonialRes.data || [],
    faq: faqRes.data || []
  };
}

async function fetchPageBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) throw new Error('missing_slug');

  const { data: page, error } = await supabaseAdmin
    .from('cms_pages')
    .select('*')
    .is('institution_id', null)
    .eq('published', true)
    .eq('slug', s)
    .maybeSingle();

  if (error) throw error;
  if (!page) return null;

  const { data: sections } = await supabaseAdmin
    .from('cms_page_sections')
    .select('*')
    .eq('page_id', page.id)
    .eq('visible', true)
    .order('sort_order', { ascending: true });

  return { ...page, sections: sections || [] };
}

async function fetchBlogList() {
  const { data } = await supabaseAdmin
    .from('cms_blog_posts')
    .select('id, slug, title, excerpt, cover_image_url, published_at, author_name, tags')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(48);
  return data || [];
}

async function fetchBlogPost(slug) {
  const s = String(slug || '').trim().toLowerCase();
  const { data: row } = await supabaseAdmin
    .from('cms_blog_posts')
    .select('*')
    .eq('published', true)
    .eq('slug', s)
    .maybeSingle();
  return row || null;
}

/** Herkese açık — yalnız yayınlı içerik */
export default async function handler(req, res) {
  if (req.method !== 'GET') return corsJson(res, 405, { error: 'method_not_allowed' });

  const op = String(req.query?.op || 'bootstrap');

  try {
    if (op === 'bootstrap') {
      const payload = await fetchBootstrap();
      return corsJson(res, 200, { ok: true, data: payload });
    }
    if (op === 'page') {
      const slug = String(req.query?.slug || '');
      const page = await fetchPageBySlug(slug.replace(/^\//, ''));
      if (!page) return corsJson(res, 404, { error: 'not_found' });
      return corsJson(res, 200, { ok: true, data: page });
    }
    if (op === 'blog') {
      const slug = req.query?.slug;
      if (slug) {
        const post = await fetchBlogPost(String(slug));
        if (!post) return corsJson(res, 404, { error: 'not_found' });
        return corsJson(res, 200, { ok: true, data: post });
      }
      const posts = await fetchBlogList();
      return corsJson(res, 200, { ok: true, data: posts });
    }
    return corsJson(res, 400, { error: 'unknown_op' });
  } catch (e) {
    console.error('[cms-public]', errorMessage(e), e);
    if (isCmsSchemaError(e)) {
      return corsJson(res, 200, {
        ok: true,
        data: {
          theme: null,
          seo: null,
          sliders: [],
          menus: [],
          home: null,
          testimonials: [],
          faq: []
        },
        schema_missing: true
      });
    }
    return corsJson(res, 500, { error: errorMessage(e) });
  }
}
