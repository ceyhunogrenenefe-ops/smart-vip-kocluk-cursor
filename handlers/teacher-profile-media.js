/**
 * Öğretmen vitrin medya yükleme (signed upload)
 * POST /api/teacher-profile-media?op=sign
 * body: { kind: 'photo'|'document'|'presentation', fileName, contentType, size }
 */
import { randomUUID } from 'crypto';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasAdmin, roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { ensureTeacherProfileForUser } from '../api/_lib/teacher-profile.js';

const BUCKET = process.env.TEACHER_PROFILE_BUCKET || 'teacher-profiles';

const ALLOWED = {
  photo: {
    mime: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    ext: ['jpg', 'jpeg', 'png', 'webp'],
    maxBytes: 5 * 1024 * 1024
  },
  document: {
    mime: [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    ext: ['pdf', 'ppt', 'pptx'],
    maxBytes: 20 * 1024 * 1024
  },
  presentation: {
    mime: [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    ext: ['pdf', 'ppt', 'pptx'],
    maxBytes: 20 * 1024 * 1024
  }
};

function safeExt(name, allowedExts) {
  const raw = String(name || '')
    .split('.')
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!allowedExts.includes(raw)) return null;
  return raw;
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const roles = actorRoleSet(actor);
    const isTeacher = roles.has('teacher') || actor.role === 'teacher';
    const isAdmin = roleSetHasAdmin(roles) || roleSetHasSuperAdmin(roles);
    if (!isTeacher && !isAdmin) return res.status(403).json({ error: 'forbidden' });

    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const op = String(req.query.op || 'sign').trim();
    const body = req.body || {};

    let profileUserId = String(actor.sub || '');
    if (isAdmin && body.user_id) profileUserId = String(body.user_id);

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role, roles')
      .eq('id', profileUserId)
      .maybeSingle();
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    if (isTeacher && !isAdmin && String(user.id) !== String(actor.sub)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const profile = await ensureTeacherProfileForUser(user, { actorId: actor.sub });
    if (!profile) return res.status(400).json({ error: 'not_a_teacher' });

    if (op === 'sign') {
      const kind = String(body.kind || 'photo').trim();
      const rules = ALLOWED[kind];
      if (!rules) return res.status(400).json({ error: 'invalid_kind' });

      const contentType = String(body.contentType || body.content_type || '').toLowerCase().trim();
      if (!rules.mime.includes(contentType)) {
        return res.status(400).json({ error: 'invalid_mime', allowed: rules.mime });
      }
      const size = Number(body.size || 0);
      if (!size || size > rules.maxBytes) {
        return res.status(400).json({ error: 'invalid_size', max_bytes: rules.maxBytes });
      }
      const ext = safeExt(body.fileName || body.filename, rules.ext);
      if (!ext) return res.status(400).json({ error: 'invalid_extension', allowed: rules.ext });

      const path = `${profile.id}/${kind}/${randomUUID()}.${ext}`;
      let result = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (result.error) {
        result = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
      }
      if (result.error) {
        // Bucket yoksa anlamlı hata
        return res.status(503).json({
          error: 'storage_unavailable',
          hint: `Supabase Storage'da "${BUCKET}" bucket oluşturun (public veya signed).`,
          detail: result.error.message
        });
      }

      return res.status(200).json({
        bucket: BUCKET,
        path,
        token: result.data?.token || null,
        signedUrl: result.data?.signedUrl || null,
        contentType,
        kind,
        profile_id: profile.id
      });
    }

    if (op === 'confirm') {
      const kind = String(body.kind || 'photo').trim();
      const path = String(body.path || '').trim();
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const mime = String(body.contentType || body.mime_type || '').trim();
      if (!path || path.includes('..') || !path.startsWith(profile.id + '/')) {
        return res.status(400).json({ error: 'invalid_path' });
      }

      let publicUrl = null;
      try {
        const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        publicUrl = pub?.publicUrl || null;
      } catch {
        publicUrl = null;
      }

      if (kind === 'photo') {
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            photo_path: path,
            photo_url: publicUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id)
          .select('*')
          .single();
        if (error) throw error;
        return res.status(200).json({ profile: updated, path, publicUrl });
      }

      const { data: doc, error } = await supabaseAdmin
        .from('teacher_documents')
        .insert({
          profile_id: profile.id,
          kind: kind === 'presentation' ? 'presentation' : 'document',
          title: title || 'Belge',
          description: description || null,
          storage_path: path,
          mime_type: mime || null,
          is_public: true,
          created_at: new Date().toISOString()
        })
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ document: doc, path, publicUrl });
    }

    return res.status(400).json({ error: 'unknown_op' });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg.includes('Unauthorized') || msg.includes('auth')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[teacher-profile-media]', msg);
    return res.status(500).json({ error: 'server_error' });
  }
}
