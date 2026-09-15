/**
 * Meta “Setup Webhooks Subscriptions” 4 adımını CRM tanılamasına map eder.
 * Docs: developers.facebook.com — Instagram webhook subscriptions.
 */

/**
 * @param {object} input
 * @param {boolean} [input.verifyTokenPresent]
 * @param {boolean} [input.endpointReachable] — GET verify bilinen; production URL sabit
 * @param {boolean} [input.appInstagramSubscribed]
 * @param {boolean} [input.appPageSubscribed]
 * @param {boolean} [input.pageSubscribedAppsMessages]
 * @param {boolean} [input.igAccountSubscribedApps]
 * @param {string|null} [input.igDmLikelyCause]
 * @param {boolean} [input.igDmCapabilityOk]
 * @param {boolean} [input.hasInstagramManageMessagesScope]
 * @param {string[]} [input.appInstagramFields]
 */
export function buildMetaWebhookSetupChecklist(input = {}) {
  const fields = Array.isArray(input.appInstagramFields) ? input.appInstagramFields : [];
  const hasMessagesField = !fields.length || fields.includes('messages');
  const cause = String(input.igDmLikelyCause || '');
  const advancedBlocked = cause === 'missing_advanced_access_or_permission';
  const routingSuspect = cause === 'api_ok_webhook_routing';

  const step1Ok = Boolean(input.verifyTokenPresent !== false && input.endpointReachable !== false);
  const step2Ok = Boolean(input.appInstagramSubscribed && input.appPageSubscribed && hasMessagesField);
  const step3Ok = Boolean(
    input.pageSubscribedAppsMessages || input.igAccountSubscribedApps
  );
  // Step 4 / Live: Advanced Access olmadan gerçek kullanıcı DM gelmez (yorum gelebilir)
  const step4Blocked = advancedBlocked || input.hasInstagramManageMessagesScope === false;
  const step4Ok = Boolean(input.igDmCapabilityOk) && !step4Blocked;

  const steps = [
    {
      id: 1,
      meta_title: 'Create an endpoint',
      title: 'Endpoint (GET verify + POST events)',
      ok: step1Ok,
      detail:
        'Production: https://www.dersonlinevipkocluk.com/api/meta/webhook — hub.verify_token + hub.challenge; POST’a 200 OK.',
      action: step1Ok
        ? null
        : 'Vercel META_WEBHOOK_VERIFY_TOKEN = App Dashboard Verify Token; App Dashboard callback bu URL olmalı.'
    },
    {
      id: 2,
      meta_title: 'Subscribe your app to webhook fields',
      title: 'App Dashboard / Graph app subscriptions',
      ok: step2Ok,
      detail:
        'object=instagram + object=page → messages (+ messaging_referral, comments, …) aynı callback URL.',
      action: step2Ok
        ? null
        : 'CRM → Hattı bağla veya App Dashboard → Webhooks → Instagram/Page fields (messages).'
    },
    {
      id: 3,
      meta_title: 'Enable subscriptions (subscribed_apps)',
      title: 'POST /{Page|IG}/subscribed_apps',
      ok: step3Ok,
      detail:
        'Messenger Platform: Page ID + Page token. Instagram Login: graph.instagram.com + IG User token.',
      action: step3Ok
        ? null
        : 'Hattı bağla — Page (ve varsa IG business) subscribed_fields=messages,… yenilenir.'
    },
    {
      id: 4,
      meta_title: 'Test + Live / Advanced Access',
      title: 'Gerçek DM testi (Dashboard Test değil)',
      ok: step4Ok,
      detail: advancedBlocked
        ? 'App Live + Advanced Access (instagram_manage_messages / pages_messaging) şart; aksi halde yorum gelir, yeni kullanıcı/reklam DM gelmez.'
        : routingSuspect
          ? 'Conversations API OK — webhook routing / Inbox partner kontrolü.'
          : 'Tester olmayan IG hesabından DM + reklam CTM; entry.id=0 sentetik test CRM oluşturmaz.',
      action: step4Ok
        ? 'Gerçek IG DM atın; CRM Inbox channel=instagram.'
        : advancedBlocked || input.hasInstagramManageMessagesScope === false
          ? 'Meta App Dashboard → Live mode + App Review → Advanced Access: instagram_manage_messages, pages_messaging (+ Business Verification).'
          : 'Hattı bağla sonrası gerçek DM; Conversation Routing’de yalnız SmartKocluk.'
    }
  ];

  const allOk = steps.every((s) => s.ok);
  const blocker = steps.find((s) => !s.ok) || null;

  return {
    ok: allOk,
    source: 'meta_setup_webhooks_subscriptions',
    callback_url: 'https://www.dersonlinevipkocluk.com/api/meta/webhook',
    requirements: {
      app_live_mode: true,
      business_verification: true,
      advanced_access_fields: ['instagram_manage_messages', 'pages_messaging'],
      note: 'Apps must be Live; Advanced Access required for real-user messaging webhooks (comments may still arrive).'
    },
    steps,
    blocker: blocker
      ? { step: blocker.id, title: blocker.title, action: blocker.action, detail: blocker.detail }
      : null,
    hint: blocker?.action || (allOk ? 'Meta 4 adım tamam — gerçek IG DM ile doğrulayın.' : null)
  };
}
