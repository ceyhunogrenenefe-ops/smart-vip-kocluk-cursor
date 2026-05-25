import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { cmsSchemaMissingResponse, isCmsSchemaError } from '../api/_lib/cms-schema.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

function requireSuperAdmin(actor) {
  if (actor.role === 'super_admin') return;
  const roles = Array.isArray(actor.roles) ? actor.roles : [];
  if (roles.includes('super_admin')) return;
  const err = new Error('forbidden');
  err.code = 403;
  throw err;
}

function readJson(req) {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  try {
    requireSuperAdmin(actor);
  } catch {
    return res.status(403).json({ error: 'forbidden' });
  }

  const body = req.method === 'GET' ? {} : readJson(req);
  const resource = String(req.query?.resource || body.resource || '').trim();
  const action = String(req.query?.action || body.action || '').trim();

  try {
    if (resource === 'pages') {
      if (req.method === 'GET' && action === 'list') {
        const { data, error } = await supabaseAdmin
          .from('cms_pages')
          .select('*')
          .is('institution_id', null)
          .order('updated_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'GET' && action === 'get') {
        const id = String(req.query?.id || '').trim();
        const { data, error } = await supabaseAdmin.from('cms_pages').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        const { data: sections } = await supabaseAdmin
          .from('cms_page_sections')
          .select('*')
          .eq('page_id', id)
          .order('sort_order', { ascending: true });
        return res.status(200).json({ ok: true, data: { ...data, sections: sections || [] } });
      }
      if (req.method === 'POST') {
        const payload = body.payload || body;
        const id = String(payload.id || '').trim();
        const row = {
          title: payload.title,
          slug: String(payload.slug || '').trim().toLowerCase(),
          page_kind: payload.page_kind || 'page',
          excerpt: payload.excerpt ?? null,
          content: payload.content ?? null,
          featured_image_url: payload.featured_image_url ?? null,
          seo_title: payload.seo_title ?? null,
          seo_description: payload.seo_description ?? null,
          og_image_url: payload.og_image_url ?? null,
          canonical_url: payload.canonical_url ?? null,
          robots: payload.robots ?? null,
          schema_markup: payload.schema_markup ?? null,
          published: Boolean(payload.published),
          published_at: payload.published ? payload.published_at || new Date().toISOString() : null,
          is_home: Boolean(payload.is_home),
          institution_id: null,
          created_by: actor.sub ? String(actor.sub) : null,
          updated_at: new Date().toISOString()
        };
        Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
        if (!row.slug || !payload.title) {
          return res.status(400).json({ error: 'slug_title_required' });
        }
        if (id.length > 10) {
          const { data, error } = await supabaseAdmin.from('cms_pages').update(row).eq('id', id).select('*').maybeSingle();
          if (error) throw error;
          return res.status(200).json({ ok: true, data });
        }
        const { data, error } = await supabaseAdmin
          .from('cms_pages')
          .insert({ ...row, created_at: new Date().toISOString() })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'DELETE') {
        const id = String(req.query?.id || body.id || '').trim();
        await supabaseAdmin.from('cms_page_sections').delete().eq('page_id', id);
        const { error } = await supabaseAdmin.from('cms_pages').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    if (resource === 'page_sections') {
      if (req.method === 'POST' && action === 'reorder') {
        const list = Array.isArray(body.payload?.sections) ? body.payload.sections : [];
        await Promise.all(
          list.slice(0, 80).map((s, i) =>
            supabaseAdmin.from('cms_page_sections').update({ sort_order: i }).eq('id', String(s.id))
          )
        );
        return res.status(200).json({ ok: true });
      }
      if (req.method === 'POST' || req.method === 'PATCH') {
        const payload = body.payload || body;
        const pageId = String(payload.page_id || '').trim();
        const id = String(payload.id || '').trim();
        const row = {
          page_id: pageId,
          section_type: String(payload.section_type || 'custom'),
          props: payload.props ?? {},
          visible: payload.visible !== false,
          responsive: payload.responsive ?? {},
          sort_order: Number(payload.sort_order ?? 0),
          updated_at: new Date().toISOString()
        };
        if (!pageId) return res.status(400).json({ error: 'page_id_required' });

        if (id) {
          const { data, error } = await supabaseAdmin
            .from('cms_page_sections')
            .update(row)
            .eq('id', id)
            .select('*')
            .maybeSingle();
          if (error) throw error;
          return res.status(200).json({ ok: true, data });
        }
        const { data, error } = await supabaseAdmin
          .from('cms_page_sections')
          .insert({ ...row, created_at: new Date().toISOString() })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'DELETE') {
        const id = String(req.query?.id || body.id || '').trim();
        const { error } = await supabaseAdmin.from('cms_page_sections').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    if (resource === 'sliders') {
      if (req.method === 'GET') {
        const { data, error } = await supabaseAdmin.from('cms_sliders').select('*').order('sort_order', { ascending: true });
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'POST') {
        const p = body.payload || body;
        const id = String(p.id || '').trim();
        const row = {
          sort_order: Number(p.sort_order ?? 0),
          active: p.active !== false,
          desktop_image_url: p.desktop_image_url ?? null,
          mobile_image_url: p.mobile_image_url ?? null,
          video_url: p.video_url ?? null,
          title: p.title ?? null,
          subtitle: p.subtitle ?? null,
          cta_label: p.cta_label ?? null,
          cta_href: p.cta_href ?? null,
          overlay_opacity: p.overlay_opacity != null ? Number(p.overlay_opacity) : null,
          animation: p.animation || 'fade',
          publish_from: p.publish_from || null,
          publish_until: p.publish_until || null,
          institution_id: null,
          updated_at: new Date().toISOString()
        };
        Object.keys(row).forEach((k) => row[k] === null && delete row[k]);
        if (id) {
          const { data, error } = await supabaseAdmin.from('cms_sliders').update(row).eq('id', id).select('*').maybeSingle();
          if (error) throw error;
          return res.status(200).json({ ok: true, data });
        }
        const { data, error } = await supabaseAdmin
          .from('cms_sliders')
          .insert({ ...row, created_at: new Date().toISOString(), institution_id: null })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'DELETE') {
        const id = String(req.query?.id || body.id || '').trim();
        const { error } = await supabaseAdmin.from('cms_sliders').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    if (resource === 'menus') {
      const { data: menus, error: mErr } = await supabaseAdmin.from('cms_menus').select('*').is('institution_id', null);
      if (mErr) throw mErr;
      const ids = (menus || []).map((x) => x.id);
      let items = [];
      if (ids.length) {
        const r = await supabaseAdmin.from('cms_menu_items').select('*').in('menu_id', ids).order('sort_order');
        items = r.data || [];
      }
      const tree =
        menus?.map((m) => ({
          ...m,
          items: items.filter((i) => i.menu_id === m.id)
        })) || [];
      return res.status(200).json({
        ok: true,
        data: { menus: menus || [], items, tree }
      });
    }

    if (resource === 'menu_items') {
      if (req.method === 'POST') {
        const p = body.payload || body;
        const id = String(p.id || '').trim();
        const row = {
          menu_id: String(p.menu_id || '').trim(),
          parent_id: p.parent_id || null,
          label: String(p.label || ''),
          href: String(p.href || '#'),
          target: p.target || '_self',
          sort_order: Number(p.sort_order ?? 0),
          visible: p.visible !== false,
          mega: p.mega ?? null,
          updated_at: new Date().toISOString()
        };
        if (!row.menu_id || !row.label) return res.status(400).json({ error: 'invalid' });
        if (id) {
          const { data, error } = await supabaseAdmin
            .from('cms_menu_items')
            .update(row)
            .eq('id', id)
            .select('*')
            .maybeSingle();
          if (error) throw error;
          return res.status(200).json({ ok: true, data });
        }
        const { data, error } = await supabaseAdmin
          .from('cms_menu_items')
          .insert({ ...row, created_at: new Date().toISOString() })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'DELETE') {
        const id = String(req.query?.id || body.id || '').trim();
        const { error } = await supabaseAdmin.from('cms_menu_items').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    if (resource === 'theme') {
      if (req.method === 'GET') {
        const { data } = await supabaseAdmin.from('cms_theme_settings').select('*').eq('id', 1).maybeSingle();
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'POST') {
        const p = body.payload || body;
        delete p.id;
        const { data, error } = await supabaseAdmin
          .from('cms_theme_settings')
          .upsert({ id: 1, ...p, updated_at: new Date().toISOString() })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
    }

    if (resource === 'seo') {
      if (req.method === 'GET') {
        const { data } = await supabaseAdmin.from('cms_seo_settings').select('*').eq('id', 1).maybeSingle();
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'POST') {
        const p = body.payload || body;
        delete p.id;
        const { data, error } = await supabaseAdmin
          .from('cms_seo_settings')
          .upsert({ id: 1, ...p, updated_at: new Date().toISOString() })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
    }

    if (resource === 'blog_categories') {
      const { data, error } = await supabaseAdmin.from('cms_blog_categories').select('*').order('sort_order');
      if (error) throw error;
      return res.status(200).json({ ok: true, data });
    }

    if (resource === 'blog_posts') {
      if (req.method === 'GET' && action === 'list') {
        const { data, error } = await supabaseAdmin
          .from('cms_blog_posts')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'POST') {
        const p = body.payload || body;
        const id = String(p.id || '').trim();
        const row = {
          slug: String(p.slug || '').trim().toLowerCase(),
          title: String(p.title || ''),
          excerpt: p.excerpt ?? null,
          body: p.body ?? null,
          cover_image_url: p.cover_image_url ?? null,
          author_name: p.author_name ?? null,
          tags: Array.isArray(p.tags) ? p.tags : [],
          category_id: p.category_id ?? null,
          seo_title: p.seo_title ?? null,
          seo_description: p.seo_description ?? null,
          published: Boolean(p.published),
          published_at: p.published ? p.published_at || new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        };
        if (!row.slug || !row.title) return res.status(400).json({ error: 'invalid_post' });
        if (id) {
          const { data, error } = await supabaseAdmin.from('cms_blog_posts').update(row).eq('id', id).select('*').maybeSingle();
          if (error) throw error;
          return res.status(200).json({ ok: true, data });
        }
        const { data, error } = await supabaseAdmin
          .from('cms_blog_posts')
          .insert({ ...row, created_at: new Date().toISOString() })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'DELETE') {
        const id = String(req.query?.id || body.id || '').trim();
        const { error } = await supabaseAdmin.from('cms_blog_posts').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    if (resource === 'media') {
      if (req.method === 'GET') {
        const { data, error } = await supabaseAdmin
          .from('cms_media_files')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(240);
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'POST') {
        const p = body.payload || body;
        const { data, error } = await supabaseAdmin
          .from('cms_media_files')
          .insert({
            file_url: String(p.file_url || ''),
            folder: p.folder || '/',
            mime: p.mime ?? null,
            alt: p.alt ?? null,
            institution_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'DELETE') {
        const id = String(req.query?.id || body.id || '').trim();
        const { error } = await supabaseAdmin.from('cms_media_files').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    if (resource === 'testimonials') {
      if (req.method === 'GET') {
        const { data } = await supabaseAdmin.from('cms_testimonials').select('*').order('sort_order');
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'POST') {
        const p = body.payload || body;
        const id = String(p.id || '').trim();
        const { id: _omit, institution_id: _i2, ...rest } = p;
        const row = {
          sort_order: Number(rest.sort_order ?? 0),
          active: rest.active !== false,
          student_name: rest.student_name ?? null,
          program: rest.program ?? null,
          quote: String(rest.quote || ''),
          rating: rest.rating != null ? Number(rest.rating) : null,
          avatar_url: rest.avatar_url ?? null,
          video_url: rest.video_url ?? null,
          institution_id: null,
          updated_at: new Date().toISOString()
        };
        if (id) {
          const { data, error } = await supabaseAdmin
            .from('cms_testimonials')
            .update(row)
            .eq('id', id)
            .select('*')
            .maybeSingle();
          if (error) throw error;
          return res.status(200).json({ ok: true, data });
        }
        const { data, error } = await supabaseAdmin
          .from('cms_testimonials')
          .insert({ ...row, created_at: new Date().toISOString() })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'DELETE') {
        const id = String(req.query?.id || body.id || '').trim();
        await supabaseAdmin.from('cms_testimonials').delete().eq('id', id);
        return res.status(200).json({ ok: true });
      }
    }

    if (resource === 'faq') {
      if (req.method === 'GET') {
        const { data } = await supabaseAdmin.from('cms_faq_items').select('*').order('sort_order');
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'POST') {
        const p = body.payload || body;
        const id = String(p.id || '').trim();
        const row = {
          sort_order: Number(p.sort_order ?? 0),
          active: p.active !== false,
          question: String(p.question || ''),
          answer: String(p.answer || ''),
          schema_eligible: p.schema_eligible !== false,
          institution_id: null,
          updated_at: new Date().toISOString()
        };
        if (id) {
          const { data, error } = await supabaseAdmin.from('cms_faq_items').update(row).eq('id', id).select('*').maybeSingle();
          if (error) throw error;
          return res.status(200).json({ ok: true, data });
        }
        const { data, error } = await supabaseAdmin
          .from('cms_faq_items')
          .insert({ ...row, created_at: new Date().toISOString() })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'DELETE') {
        const id = String(req.query?.id || body.id || '').trim();
        await supabaseAdmin.from('cms_faq_items').delete().eq('id', id);
        return res.status(200).json({ ok: true });
      }
    }

    if (resource === 'forms') {
      if (req.method === 'GET') {
        const { data } = await supabaseAdmin.from('cms_forms').select('*').order('updated_at', { ascending: false });
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'POST') {
        const p = body.payload || body;
        const id = String(p.id || '').trim();
        const row = {
          name: String(p.name || ''),
          slug: String(p.slug || '').toLowerCase(),
          fields_json: p.fields_json || [],
          whatsapp_phone: p.whatsapp_phone ?? null,
          webhook_url: p.webhook_url ?? null,
          kvkk_required: p.kvkk_required !== false,
          active: p.active !== false,
          institution_id: null,
          updated_at: new Date().toISOString()
        };
        if (id) {
          const { data, error } = await supabaseAdmin.from('cms_forms').update(row).eq('id', id).select('*').maybeSingle();
          if (error) throw error;
          return res.status(200).json({ ok: true, data });
        }
        const { data, error } = await supabaseAdmin
          .from('cms_forms')
          .insert({ ...row, created_at: new Date().toISOString() })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
      if (req.method === 'DELETE') {
        const id = String(req.query?.id || body.id || '').trim();
        await supabaseAdmin.from('cms_forms').delete().eq('id', id);
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(400).json({ error: 'unknown_resource', resource, action });
  } catch (e) {
    console.error('[cms-admin]', resource, action, errorMessage(e));
    if (isCmsSchemaError(e)) {
      return cmsSchemaMissingResponse(res, req.method);
    }
    return res.status(500).json({ error: errorMessage(e) });
  }
}
