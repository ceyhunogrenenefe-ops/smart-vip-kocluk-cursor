import { createHash } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import {
  BRAND_CSS_VARIABLES,
  DEFAULT_PIPELINE_STAGES,
  DEMO_PASSWORD,
  PERMISSION_CATALOG,
  ROLE_PERMISSIONS,
  RoleCode,
} from '@online-vip-crm/shared';
import {
  ChannelConnectionStatus,
  ContactType,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Priority,
  PrismaClient,
  Provider,
  TaskStatus,
  TaskType,
} from '@prisma/client';

const prisma = new PrismaClient();

const IDS = {
  institution: '11111111-1111-4111-8111-111111111111',
  plan: '22222222-2222-4222-8222-222222222222',
  pipeline: '33333333-3333-4333-8333-333333333333',
  owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  admin: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  kayit: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  rehber: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  superadmin: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  channelWa: '44444444-4444-4444-8444-444444444401',
  channelIg: '44444444-4444-4444-8444-444444444402',
  channelFb: '44444444-4444-4444-8444-444444444403',
  channelEmail: '44444444-4444-4444-8444-444444444404',
  channelWeb: '44444444-4444-4444-8444-444444444405',
  contactParent: '55555555-5555-4555-8555-555555555501',
  contactStudent: '55555555-5555-4555-8555-555555555502',
  contactProspect: '55555555-5555-4555-8555-555555555503',
  conversation1: '66666666-6666-4666-8666-666666666601',
  conversation2: '66666666-6666-4666-8666-666666666602',
  lead1: '77777777-7777-4777-8777-777777777701',
  task1: '88888888-8888-4888-8888-888888888801',
} as const;

async function seedRolesAndPermissions() {
  for (const entry of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: entry.key },
      create: {
        key: entry.key,
        groupName: entry.group,
        description: entry.description,
      },
      update: {
        groupName: entry.group,
        description: entry.description,
      },
    });
  }

  const roleDefs: Array<{ code: RoleCode; name: string; description: string }> = [
    {
      code: RoleCode.PLATFORM_SUPER_ADMIN,
      name: 'Platform Super Admin',
      description: 'Tüm kurumlar ve platform yönetimi',
    },
    {
      code: RoleCode.INSTITUTION_OWNER,
      name: 'Kurum Sahibi',
      description: 'Kurumun tüm verileri ve ayarları',
    },
    {
      code: RoleCode.INSTITUTION_ADMIN,
      name: 'Kurum Yöneticisi',
      description: 'Mesaj, satış ve personel yönetimi',
    },
    {
      code: RoleCode.REGISTRATION_STAFF,
      name: 'Kayıt Personeli',
      description: 'Gelen kutusu, lead ve görev takibi',
    },
    {
      code: RoleCode.GUIDANCE_TEACHER,
      name: 'Rehber Öğretmen',
      description: 'Atanan öğrenci/veli iletişimi',
    },
    {
      code: RoleCode.READ_ONLY,
      name: 'Salt Okunur',
      description: 'Yetkili ekranları görüntüleme',
    },
  ];

  for (const def of roleDefs) {
    const role = await prisma.role.upsert({
      where: { code: def.code },
      create: def,
      update: { name: def.name, description: def.description },
    });

    const permissionKeys = ROLE_PERMISSIONS[def.code];
    for (const key of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
}

async function seedInstitutionAndUsers(passwordHash: string) {
  await prisma.plan.upsert({
    where: { code: 'demo' },
    create: {
      id: IDS.plan,
      code: 'demo',
      name: 'Demo Plan',
      description: 'Geliştirme / demo planı',
      features: {
        create: [
          { featureKey: 'channels', limitValue: 5 },
          { featureKey: 'users', limitValue: 25 },
        ],
      },
    },
    update: { name: 'Demo Plan' },
  });

  const institution = await prisma.institution.upsert({
    where: { slug: 'online-vip-dershane' },
    create: {
      id: IDS.institution,
      name: 'Online VIP Dershane',
      slug: 'online-vip-dershane',
      status: 'ACTIVE',
      settings: {
        create: {
          brandName: 'Online VIP Dershane',
          brandColors: BRAND_CSS_VARIABLES,
          contactEmail: 'demo@onlinevipdershane.local',
          contactPhone: '+905550000000',
          websiteUrl: 'https://onlinevipdershane.com',
          settings: { locale: 'tr-TR', formApiKey: 'dev-public-forms-key' },
        },
      },
      subscription: {
        create: {
          planId: IDS.plan,
          status: 'active',
        },
      },
    },
    update: { name: 'Online VIP Dershane', status: 'ACTIVE' },
  });

  await prisma.institutionSettings.upsert({
    where: { institutionId: institution.id },
    create: {
      institutionId: institution.id,
      brandName: 'Online VIP Dershane',
      brandColors: BRAND_CSS_VARIABLES,
      contactEmail: 'demo@onlinevipdershane.local',
      settings: { locale: 'tr-TR', formApiKey: 'dev-public-forms-key' },
    },
    update: {
      brandColors: BRAND_CSS_VARIABLES,
      settings: { locale: 'tr-TR', formApiKey: 'dev-public-forms-key' },
    },
  });

  const users = [
    {
      id: IDS.superadmin,
      email: 'superadmin@demo.onlinevipdershane.local',
      firstName: 'Platform',
      lastName: 'Süper Admin',
      role: RoleCode.PLATFORM_SUPER_ADMIN,
      isPlatformAdmin: true,
    },
    {
      id: IDS.owner,
      email: 'owner@demo.onlinevipdershane.local',
      firstName: 'Demo',
      lastName: 'Kurum Sahibi',
      role: RoleCode.INSTITUTION_OWNER,
      isPlatformAdmin: false,
    },
    {
      id: IDS.admin,
      email: 'admin@demo.onlinevipdershane.local',
      firstName: 'Demo',
      lastName: 'Yönetici',
      role: RoleCode.INSTITUTION_ADMIN,
      isPlatformAdmin: false,
    },
    {
      id: IDS.kayit,
      email: 'kayit@demo.onlinevipdershane.local',
      firstName: 'Demo',
      lastName: 'Kayıt',
      role: RoleCode.REGISTRATION_STAFF,
      isPlatformAdmin: false,
    },
    {
      id: IDS.rehber,
      email: 'rehber@demo.onlinevipdershane.local',
      firstName: 'Demo',
      lastName: 'Rehber',
      role: RoleCode.GUIDANCE_TEACHER,
      isPlatformAdmin: false,
    },
  ] as const;

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        id: u.id,
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        displayName: `${u.firstName} ${u.lastName}`,
        isPlatformAdmin: u.isPlatformAdmin,
        isActive: true,
      },
      update: {
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        isActive: true,
        isPlatformAdmin: u.isPlatformAdmin,
      },
    });

    if (u.role !== RoleCode.PLATFORM_SUPER_ADMIN) {
      await prisma.userInstitution.upsert({
        where: {
          userId_institutionId: {
            userId: user.id,
            institutionId: institution.id,
          },
        },
        create: {
          userId: user.id,
          institutionId: institution.id,
          isDefault: true,
        },
        update: { isDefault: true },
      });
    }

    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    const existing = await prisma.userRole.findFirst({
      where: {
        userId: user.id,
        roleId: role.id,
        institutionId:
          u.role === RoleCode.PLATFORM_SUPER_ADMIN ? null : institution.id,
      },
    });
    if (!existing) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          institutionId:
            u.role === RoleCode.PLATFORM_SUPER_ADMIN ? null : institution.id,
        },
      });
    }
  }

  return institution;
}

async function seedPipeline(institutionId: string) {
  const pipeline = await prisma.pipeline.upsert({
    where: { id: IDS.pipeline },
    create: {
      id: IDS.pipeline,
      institutionId,
      name: 'Varsayılan Satış Hattı',
      isDefault: true,
      isActive: true,
    },
    update: { name: 'Varsayılan Satış Hattı', isDefault: true, isActive: true },
  });

  const stageIds: Record<string, string> = {};
  for (let i = 0; i < DEFAULT_PIPELINE_STAGES.length; i++) {
    const stage = DEFAULT_PIPELINE_STAGES[i]!;
    const id = createHash('md5')
      .update(`${pipeline.id}:${stage.key}`)
      .digest('hex')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

    const row = await prisma.pipelineStage.upsert({
      where: { pipelineId_key: { pipelineId: pipeline.id, key: stage.key } },
      create: {
        id,
        pipelineId: pipeline.id,
        key: stage.key,
        name: stage.name,
        color: stage.color,
        sortOrder: i,
        isWon: stage.isWon,
        isLost: stage.isLost,
        isActive: true,
      },
      update: {
        name: stage.name,
        color: stage.color,
        sortOrder: i,
        isWon: stage.isWon,
        isLost: stage.isLost,
      },
    });
    stageIds[stage.key] = row.id;
  }

  await prisma.lostReason.upsert({
    where: {
      institutionId_name: { institutionId, name: 'Fiyat yüksek bulundu' },
    },
    create: { institutionId, name: 'Fiyat yüksek bulundu' },
    update: {},
  });

  return { pipeline, stageIds };
}

async function seedChannels(institutionId: string) {
  const channels = [
    {
      id: IDS.channelWa,
      provider: Provider.WHATSAPP,
      displayName: 'WhatsApp Demo',
      accountName: '+90 555 000 00 01',
      providerAccountId: 'demo-wa-account',
      status: ChannelConnectionStatus.CONNECTED,
    },
    {
      id: IDS.channelIg,
      provider: Provider.INSTAGRAM,
      displayName: 'Instagram Demo',
      accountName: '@onlinevip_demo',
      providerAccountId: 'demo-ig-account',
      status: ChannelConnectionStatus.CONNECTED,
    },
    {
      id: IDS.channelFb,
      provider: Provider.FACEBOOK,
      displayName: 'Facebook Demo',
      accountName: 'Online VIP Demo Sayfası',
      providerAccountId: 'demo-fb-page',
      status: ChannelConnectionStatus.SETUP_REQUIRED,
    },
    {
      id: IDS.channelEmail,
      provider: Provider.EMAIL,
      displayName: 'Kurumsal E-posta Demo',
      accountName: 'demo-inbox@onlinevipdershane.local',
      providerAccountId: 'demo-email',
      status: ChannelConnectionStatus.SETUP_REQUIRED,
    },
    {
      id: IDS.channelWeb,
      provider: Provider.WEBSITE,
      displayName: 'Web Formu Demo',
      accountName: 'crm-demo-form',
      providerAccountId: 'demo-web-form',
      status: ChannelConnectionStatus.CONNECTED,
    },
  ] as const;

  for (const ch of channels) {
    await prisma.channelConnection.upsert({
      where: { id: ch.id },
      create: {
        id: ch.id,
        institutionId,
        provider: ch.provider,
        displayName: ch.displayName,
        accountName: ch.accountName,
        providerAccountId: ch.providerAccountId,
        status: ch.status,
        lastSyncedAt: ch.status === ChannelConnectionStatus.CONNECTED ? new Date() : null,
        metadata: { demo: true },
      },
      update: {
        displayName: ch.displayName,
        status: ch.status,
        accountName: ch.accountName,
      },
    });
  }
}

async function seedCrmDemo(institutionId: string, stageIds: Record<string, string>) {
  await prisma.contact.upsert({
    where: { id: IDS.contactParent },
    create: {
      id: IDS.contactParent,
      institutionId,
      firstName: 'Ayşe',
      lastName: 'Demo',
      displayName: 'Ayşe Demo (Veli)',
      primaryPhone: '+905551112201',
      primaryEmail: 'ayse.demo.parent@example.invalid',
      city: 'İstanbul',
      district: 'Kadıköy',
      contactType: ContactType.PARENT,
      source: 'whatsapp',
      assignedUserId: IDS.kayit,
      notes: 'Sahte demo veli kaydı — gerçek PII değildir.',
    },
    update: {},
  });

  await prisma.contact.upsert({
    where: { id: IDS.contactStudent },
    create: {
      id: IDS.contactStudent,
      institutionId,
      firstName: 'Mehmet',
      lastName: 'Demo',
      displayName: 'Mehmet Demo (Öğrenci)',
      primaryPhone: '+905551112202',
      primaryEmail: 'mehmet.demo.student@example.invalid',
      city: 'İstanbul',
      contactType: ContactType.STUDENT,
      source: 'referral',
      assignedUserId: IDS.rehber,
    },
    update: {},
  });

  await prisma.contact.upsert({
    where: { id: IDS.contactProspect },
    create: {
      id: IDS.contactProspect,
      institutionId,
      firstName: 'Zeynep',
      lastName: 'Demo',
      displayName: 'Zeynep Demo (Aday)',
      primaryPhone: '+905551112203',
      primaryEmail: 'zeynep.demo.prospect@example.invalid',
      city: 'Ankara',
      contactType: ContactType.PROSPECT,
      source: 'website',
      assignedUserId: IDS.kayit,
    },
    update: {},
  });

  await prisma.contactIdentity.upsert({
    where: {
      institutionId_provider_externalUserId: {
        institutionId,
        provider: Provider.WHATSAPP,
        externalUserId: '905551112201',
      },
    },
    create: {
      contactId: IDS.contactParent,
      institutionId,
      provider: Provider.WHATSAPP,
      providerAccountId: 'demo-wa-account',
      externalUserId: '905551112201',
      normalizedValue: '+905551112201',
      isVerified: true,
      metadata: { wa_id: '905551112201', demo: true },
    },
    update: {},
  });

  const parent = await prisma.parent.upsert({
    where: { contactId: IDS.contactParent },
    create: {
      institutionId,
      contactId: IDS.contactParent,
      relationship: 'anne',
    },
    update: {},
  });

  const student = await prisma.student.upsert({
    where: { contactId: IDS.contactStudent },
    create: {
      institutionId,
      contactId: IDS.contactStudent,
      gradeLevel: '8',
      program: 'LGS',
      schoolName: 'Demo Ortaokulu',
      enrollmentStatus: 'prospect',
    },
    update: {},
  });

  await prisma.studentParent.upsert({
    where: {
      studentId_parentId: { studentId: student.id, parentId: parent.id },
    },
    create: { studentId: student.id, parentId: parent.id, isPrimary: true },
    update: { isPrimary: true },
  });

  const tag = await prisma.tag.upsert({
    where: { institutionId_name: { institutionId, name: 'LGS' } },
    create: { institutionId, name: 'LGS', color: '#1a3fad' },
    update: {},
  });

  await prisma.contactTag.upsert({
    where: {
      contactId_tagId: { contactId: IDS.contactParent, tagId: tag.id },
    },
    create: { contactId: IDS.contactParent, tagId: tag.id },
    update: {},
  });

  await prisma.conversation.upsert({
    where: { id: IDS.conversation1 },
    create: {
      id: IDS.conversation1,
      institutionId,
      channelConnectionId: IDS.channelWa,
      contactId: IDS.contactParent,
      provider: Provider.WHATSAPP,
      externalConversationId: 'demo-wa-conv-1',
      status: ConversationStatus.OPEN,
      priority: Priority.HIGH,
      lastMessageAt: new Date(),
      lastMessagePreview: 'LGS programı hakkında bilgi alabilir miyim?',
      unreadCount: 1,
    },
    update: {
      lastMessageAt: new Date(),
      lastMessagePreview: 'LGS programı hakkında bilgi alabilir miyim?',
    },
  });

  await prisma.conversation.upsert({
    where: { id: IDS.conversation2 },
    create: {
      id: IDS.conversation2,
      institutionId,
      channelConnectionId: IDS.channelWeb,
      contactId: IDS.contactProspect,
      provider: Provider.WEBSITE,
      externalConversationId: 'demo-web-conv-1',
      status: ConversationStatus.PENDING,
      priority: Priority.NORMAL,
      subject: 'Web formu — TYT bilgi talebi',
      lastMessageAt: new Date(),
      lastMessagePreview: 'TYT yaz kampı kontenjanı var mı?',
      unreadCount: 1,
    },
    update: {},
  });

  const existingAssignment = await prisma.conversationAssignment.findFirst({
    where: { conversationId: IDS.conversation1, userId: IDS.kayit, isActive: true },
  });
  if (!existingAssignment) {
    await prisma.conversationAssignment.create({
      data: {
        conversationId: IDS.conversation1,
        userId: IDS.kayit,
        isActive: true,
      },
    });
  }

  const demoMessages = [
    {
      institutionId,
      conversationId: IDS.conversation1,
      channelConnectionId: IDS.channelWa,
      provider: Provider.WHATSAPP,
      externalMessageId: 'demo-wa-msg-1',
      direction: MessageDirection.INBOUND,
      messageType: MessageType.TEXT,
      textContent: 'Merhaba, LGS programı hakkında bilgi alabilir miyim?',
      senderContactId: IDS.contactParent,
      status: MessageStatus.RECEIVED,
      providerTimestamp: new Date(),
      sentAt: new Date(),
    },
    {
      institutionId,
      conversationId: IDS.conversation1,
      channelConnectionId: IDS.channelWa,
      provider: Provider.WHATSAPP,
      externalMessageId: 'demo-wa-msg-2',
      direction: MessageDirection.OUTBOUND,
      messageType: MessageType.TEXT,
      textContent:
        'Merhaba Ayşe Hanım, tabii ki. Size 10 dakika içinde dönüş yapacağız.',
      senderUserId: IDS.kayit,
      status: MessageStatus.DELIVERED,
      sentAt: new Date(),
      deliveredAt: new Date(),
    },
    {
      institutionId,
      conversationId: IDS.conversation2,
      channelConnectionId: IDS.channelWeb,
      provider: Provider.WEBSITE,
      externalMessageId: 'demo-web-msg-1',
      direction: MessageDirection.INBOUND,
      messageType: MessageType.TEXT,
      textContent: 'TYT yaz kampı kontenjanı var mı?',
      senderContactId: IDS.contactProspect,
      status: MessageStatus.RECEIVED,
      sentAt: new Date(),
    },
  ] as const;

  for (const msg of demoMessages) {
    await prisma.message.upsert({
      where: {
        institutionId_provider_externalMessageId: {
          institutionId: msg.institutionId,
          provider: msg.provider,
          externalMessageId: msg.externalMessageId,
        },
      },
      create: msg,
      update: {
        textContent: msg.textContent,
        status: msg.status,
      },
    });
  }

  const newStageId = stageIds['new_request'];
  if (!newStageId) {
    throw new Error('Missing pipeline stage new_request');
  }

  await prisma.lead.upsert({
    where: { id: IDS.lead1 },
    create: {
      id: IDS.lead1,
      institutionId,
      contactId: IDS.contactParent,
      studentId: IDS.contactStudent,
      pipelineId: IDS.pipeline,
      stageId: newStageId,
      title: 'LGS — Mehmet Demo',
      source: 'whatsapp',
      campaign: 'demo-campaign',
      program: 'LGS',
      gradeLevel: '8',
      estimatedValue: 45000,
      currency: 'TRY',
      probability: 40,
      assignedUserId: IDS.kayit,
      lastContactAt: new Date(),
      nextActionAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    update: {
      stageId: newStageId,
      assignedUserId: IDS.kayit,
    },
  });

  await prisma.task.upsert({
    where: { id: IDS.task1 },
    create: {
      id: IDS.task1,
      institutionId,
      title: 'Veli aranacak — LGS bilgi',
      description: 'Demo görev: Ayşe Demo ile LGS programı bilgilendirmesi.',
      taskType: TaskType.CALL_PARENT,
      priority: Priority.HIGH,
      status: TaskStatus.TODO,
      assignedUserId: IDS.kayit,
      createdBy: IDS.admin,
      contactId: IDS.contactParent,
      leadId: IDS.lead1,
      conversationId: IDS.conversation1,
      dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      reminderAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
    update: {
      status: TaskStatus.TODO,
      assignedUserId: IDS.kayit,
    },
  });

  const canned = [
    {
      title: 'İlk karşılama',
      body: 'Merhaba {{name}}, Online VIP Dershane kayıt biriminden yazıyoruz. Size nasıl yardımcı olabiliriz?',
      shortcut: '/merhaba',
    },
    {
      title: 'Deneme dersi teklifi',
      body: 'Uygun görürseniz ücretsiz deneme dersi planlayabiliriz. Tercih ettiğiniz iki zaman dilimini paylaşır mısınız?',
      shortcut: '/deneme',
    },
  ];
  for (const item of canned) {
    const existing = await prisma.cannedResponse.findFirst({
      where: { institutionId, shortcut: item.shortcut },
    });
    if (!existing) {
      await prisma.cannedResponse.create({
        data: { institutionId, ...item },
      });
    }
  }
}

async function main() {
  console.log('Seeding Online VIP CRM demo data...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await seedRolesAndPermissions();
  const institution = await seedInstitutionAndUsers(passwordHash);
  const { stageIds } = await seedPipeline(institution.id);
  await seedChannels(institution.id);
  await seedCrmDemo(institution.id, stageIds);

  console.log('Seed completed.');
  console.log('Demo institution: Online VIP Dershane');
  console.log('Demo password (all users): Demo123!@#');
  console.log('Users:');
  console.log('  - owner@demo.onlinevipdershane.local');
  console.log('  - admin@demo.onlinevipdershane.local');
  console.log('  - kayit@demo.onlinevipdershane.local');
  console.log('  - rehber@demo.onlinevipdershane.local');
  console.log('  - superadmin@demo.onlinevipdershane.local');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
