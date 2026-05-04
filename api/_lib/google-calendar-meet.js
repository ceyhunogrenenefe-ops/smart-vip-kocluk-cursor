import { google } from 'googleapis';
import { decryptFromStorage, encryptForStorage } from './token-crypto.js';
import { supabaseAdmin } from './supabase-admin.js';

/** @param {{ access_token?: string|null, refresh_token?: string|null, expiry_date_ms?: number }} row */
async function persistTokens(userId, row) {
  const payload = {
    encrypted_access_token: row.access_token != null ? encryptForStorage(row.access_token) : null,
    encrypted_refresh_token: encryptForStorage(row.refresh_token || ''),
    expiry_date_ms: row.expiry_date_ms ?? 0,
    updated_at: new Date().toISOString()
  };
  await supabaseAdmin.from('integrations_google').upsert(
    {
      user_id: userId,
      ...payload
    },
    { onConflict: 'user_id' }
  );
}

/**
 * Loads OAuth credentials for coach user row, refreshes access token when needed.
 * @returns {Promise<import('googleapis').calendar_v3.Calendar>}
 */
export async function getAuthorizedCalendar(userId) {
  const { data: row, error } = await supabaseAdmin
    .from('integrations_google')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!row) throw new Error('google_not_connected');

  const refreshToken = decryptFromStorage(row.encrypted_refresh_token);
  const accessFromRow = row.encrypted_access_token ? decryptFromStorage(row.encrypted_access_token) : '';
  const rowExpiry = Number(row.expiry_date_ms || 0) || 0;
  const accessStillValid = accessFromRow && rowExpiry > Date.now() + 15_000;

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('missing_google_oauth_env');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (refreshToken) {
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
      access_token: accessFromRow || undefined,
      expiry_date: rowExpiry || undefined
    });

    oauth2Client.on('tokens', async (tokens) => {
      const nextExpiry = tokens.expiry_date ? Number(tokens.expiry_date) : Date.now() + 3600_000;
      await persistTokens(userId, {
        access_token: tokens.access_token ?? null,
        refresh_token: tokens.refresh_token ? tokens.refresh_token : refreshToken,
        expiry_date_ms: nextExpiry
      });
    });

    if (!oauth2Client.credentials.access_token || (rowExpiry && rowExpiry < Date.now())) {
      const rtResult = await oauth2Client.refreshAccessToken().catch((err) => {
        const m = err?.message || err?.response?.data?.error || String(err);
        throw new Error(
          `Google erişim anahtarı yenilenemedi. Google ile yeniden bağlanın veya Google Cloud’da Calendar API + OAuth kapsamlarını kontrol edin. Ayrıntı: ${m}`
        );
      });
      const credentials = rtResult?.credentials || {};
      if (credentials.refresh_token || credentials.access_token) {
        await persistTokens(userId, {
          access_token: credentials.access_token ?? oauth2Client.credentials.access_token ?? null,
          refresh_token: credentials.refresh_token ?? refreshToken,
          expiry_date_ms: credentials.expiry_date ? Number(credentials.expiry_date) : Date.now() + 3600_000
        });
        oauth2Client.setCredentials({
          refresh_token: credentials.refresh_token ?? refreshToken,
          access_token: credentials.access_token ?? oauth2Client.credentials.access_token,
          expiry_date: credentials.expiry_date ? Number(credentials.expiry_date) : undefined
        });
      } else {
        throw new Error(
          'Google token yenilemesi boş döndü; çıkış yapıp Google ile yeniden yetkilendirme deneyin.'
        );
      }
    }
  } else if (accessStillValid) {
    oauth2Client.setCredentials({
      access_token: accessFromRow,
      expiry_date: rowExpiry
    });
  } else {
    throw new Error('google_reauthorize_required');
  }

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export async function createMeetCalendarEvent(params) {
  const {
    userId,
    summary,
    description,
    startIso,
    endIso,
    attendeeEmails = []
  } = params;

  const calendar = await getAuthorizedCalendar(userId);
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const event = {
    summary,
    description,
    start: { dateTime: startIso, timeZone: 'Europe/Istanbul' },
    end: { dateTime: endIso, timeZone: 'Europe/Istanbul' },
    attendees: attendeeEmails.filter(Boolean).map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };

  let res;
  try {
    res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: 1,
      sendUpdates: 'none'
    });
  } catch (err) {
    const apiMsg =
      err?.response?.data?.error?.message ||
      err?.errors?.[0]?.message ||
      err?.message ||
      'calendar_insert_failed';
    throw new Error(
      `Google Takvim etkinliği oluşturulamadı (${apiMsg}). Takvim API etkin mi, hesapta Meet oluşturma izni var mı kontrol edin.`
    );
  }

  const meetLink =
    res.data.hangoutLink ||
    res.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    '';

  return {
    eventId: res.data.id || '',
    meetLink,
    htmlLink: res.data.htmlLink || ''
  };
}
