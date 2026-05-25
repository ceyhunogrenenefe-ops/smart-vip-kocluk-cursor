-- Kurumsal web sitesi + CMS + SEO (Smart Koçluk / Online VIP Dershane)
-- API: service role (Vercel handlers) — RLS kapalı politika = yalnız servis rolü veya dashboard SQL.
-- İstemci doğrudan yazmaz; super_admin için /api/cms-admin.
-- NOT: institutions.id ve users.id bu projede TEXT — institution_id / created_by TEXT kullanılır.

-- ---------------------------------------------------------------------------
-- Global ayarlar (tek satır / id=1)
-- ---------------------------------------------------------------------------
create table if not exists public.cms_theme_settings (
  id smallint primary key default 1 check (id = 1),
  site_name text default 'Online VIP Dershane',
  logo_url text,
  favicon_url text,
  primary_hex text default '#0f172a',
  accent_hex text default '#dc2626',
  font_family text default '"Noto Sans", system-ui, sans-serif',
  mode text default 'light' check (mode in ('light', 'dark', 'system')),
  extra_json jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.cms_seo_settings (
  id smallint primary key default 1 check (id = 1),
  default_meta_title text,
  default_meta_description text,
  og_site_name text,
  twitter_card text default 'summary_large_image',
  canonical_base_url text,
  robots_txt text,
  default_og_image_url text,
  extra_head_markup text,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Sayfalar + bölüm builder (JSON)
-- ---------------------------------------------------------------------------
create table if not exists public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  page_kind text not null default 'page' check (
    page_kind in ('page', 'landing', 'course', 'blog_index', 'legal')
  ),
  title text not null,
  slug text not null,
  excerpt text,
  content text,
  featured_image_url text,
  seo_title text,
  seo_description text,
  og_image_url text,
  canonical_url text,
  robots text,
  schema_markup jsonb,
  published boolean not null default false,
  published_at timestamptz,
  is_home boolean not null default false,
  builder_version smallint not null default 1,
  created_by text references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists cms_pages_slug_home_null_inst
  on public.cms_pages (lower(slug))
  where institution_id is null;
create unique index if not exists cms_pages_slug_inst
  on public.cms_pages (institution_id, lower(slug))
  where institution_id is not null;

create index if not exists cms_pages_published_slug_idx on public.cms_pages (published, lower(slug));

create table if not exists public.cms_page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.cms_pages (id) on delete cascade,
  sort_order int not null default 0,
  section_type text not null,
  visible boolean not null default true,
  responsive jsonb default '{}'::jsonb,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cms_page_sections_page_sort_idx on public.cms_page_sections (page_id, sort_order);

-- ---------------------------------------------------------------------------
-- Slider
-- ---------------------------------------------------------------------------
create table if not exists public.cms_sliders (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  sort_order int not null default 0,
  active boolean not null default true,
  publish_from timestamptz,
  publish_until timestamptz,
  desktop_image_url text,
  mobile_image_url text,
  video_url text,
  title text,
  subtitle text,
  cta_label text,
  cta_href text,
  overlay_opacity numeric(4, 2) default 0.35,
  animation text default 'fade',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cms_sliders_active_sort_idx on public.cms_sliders (active, sort_order);

-- ---------------------------------------------------------------------------
-- Menü
-- ---------------------------------------------------------------------------
create table if not exists public.cms_menus (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  menu_key text not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PG14 uyumu (NULLS NOT DISTINCT yerine kısmi unique index)
create unique index if not exists cms_menus_global_menu_key_uidx
  on public.cms_menus (menu_key)
  where institution_id is null;
create unique index if not exists cms_menus_inst_menu_key_uidx
  on public.cms_menus (institution_id, menu_key)
  where institution_id is not null;

create table if not exists public.cms_menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.cms_menus (id) on delete cascade,
  parent_id uuid references public.cms_menu_items (id) on delete cascade,
  sort_order int not null default 0,
  label text not null,
  href text not null,
  target text default '_self',
  mega jsonb,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cms_menu_items_menu_sort_idx on public.cms_menu_items (menu_id, sort_order);

-- ---------------------------------------------------------------------------
-- Blog
-- ---------------------------------------------------------------------------
create table if not exists public.cms_blog_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cms_blog_posts (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.cms_blog_categories (id) on delete set null,
  slug text not null,
  title text not null,
  excerpt text,
  cover_image_url text,
  author_name text,
  body text,
  tags text[] default '{}',
  toc_json jsonb,
  faq_schema jsonb,
  article_schema jsonb,
  seo_title text,
  seo_description text,
  og_image_url text,
  canonical_url text,
  robots text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cms_blog_posts_slug_lower_uidx on public.cms_blog_posts (lower(slug));

create index if not exists cms_blog_posts_pub_idx on public.cms_blog_posts (published, published_at desc nulls last);

-- ---------------------------------------------------------------------------
-- Medya, testimonials, FAQ, formlar
-- ---------------------------------------------------------------------------
create table if not exists public.cms_media_files (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  folder text default '/',
  file_url text not null,
  mime text,
  width int,
  height int,
  alt text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cms_media_folder_idx on public.cms_media_files (institution_id, folder);

create table if not exists public.cms_testimonials (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  sort_order int not null default 0,
  active boolean not null default true,
  student_name text,
  program text,
  quote text not null,
  rating smallint,
  avatar_url text,
  video_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.cms_faq_items (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  sort_order int not null default 0,
  active boolean not null default true,
  question text not null,
  answer text not null,
  schema_eligible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cms_forms (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  name text not null,
  slug text not null,
  fields_json jsonb not null default '[]'::jsonb,
  whatsapp_phone text,
  webhook_url text,
  meta_lead_event text,
  email_to text,
  kvkk_required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cms_forms_global_slug_uidx
  on public.cms_forms (lower(slug))
  where institution_id is null;
create unique index if not exists cms_forms_inst_slug_uidx
  on public.cms_forms (institution_id, lower(slug))
  where institution_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: doğrudan istemci erişimini kapat (yalnız service role / SQL editor)
-- ---------------------------------------------------------------------------
alter table public.cms_theme_settings enable row level security;
alter table public.cms_seo_settings enable row level security;
alter table public.cms_pages enable row level security;
alter table public.cms_page_sections enable row level security;
alter table public.cms_sliders enable row level security;
alter table public.cms_menus enable row level security;
alter table public.cms_menu_items enable row level security;
alter table public.cms_blog_categories enable row level security;
alter table public.cms_blog_posts enable row level security;
alter table public.cms_media_files enable row level security;
alter table public.cms_testimonials enable row level security;
alter table public.cms_faq_items enable row level security;
alter table public.cms_forms enable row level security;

-- Varsayılan veri (tek kurulum)
insert into public.cms_theme_settings (id) values (1) on conflict (id) do nothing;
insert into public.cms_seo_settings (id, default_meta_title, default_meta_description, og_site_name)
values (
  1,
  'Online VIP Dershane | Premium Online Eğitim',
  'TYT, AYT, LGS ve uluslararası programlarla uzaktan kurumsal eğitim deneyimi.',
  'Online VIP Dershane'
)
on conflict (id) do nothing;

insert into public.cms_menus (institution_id, menu_key, label)
select null, 'header', 'Ana üst menü'
where not exists (select 1 from public.cms_menus where institution_id is null and menu_key = 'header');

insert into public.cms_menus (institution_id, menu_key, label)
select null, 'footer', 'Alt menü'
where not exists (select 1 from public.cms_menus where institution_id is null and menu_key = 'footer');

-- Varsayılan anasayfa (taslak)
insert into public.cms_pages (
  institution_id,
  title,
  slug,
  page_kind,
  published,
  is_home,
  excerpt
)
select
  null,
  'Ana Sayfa',
  'home',
  'landing',
  true,
  true,
  'Kurumsal site anasayfa taslağı.'
where not exists (
  select 1 from public.cms_pages where institution_id is null and lower(slug) = 'home'
);

-- Örnek bölümler (premium hero + CTA): yalnız sayfa oluştuyduysak ekle
do $$
declare
  pid uuid;
begin
  select id into pid from public.cms_pages where institution_id is null and lower(slug) = 'home' limit 1;
  if pid is null then
    return;
  end if;
  if exists (select 1 from public.cms_page_sections where page_id = pid) then
    return;
  end if;
  insert into public.cms_page_sections (page_id, sort_order, section_type, props) values
  (pid, 0, 'hero', jsonb_build_object(
    'eyebrow', 'Online VIP Dershane',
    'headline', 'Kurumsal çevrim içi öğrenme — premium deneyim',
    'sub', 'Modern panel, LMS, koçluk ve canlı dersler tek yapı altında.',
    'primaryLabel', 'Bilgi al',
    'primaryHref', '#iletisim',
    'secondaryLabel', 'Programlar',
    'secondaryHref', '/kurumsal/kurslar',
    'align', 'left'
  )),
  (pid, 10, 'stats', jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object('value', '%92', 'label', 'Memnuniyet'),
      jsonb_build_object('value', '10K+', 'label', 'Aktivite'),
      jsonb_build_object('value', '7/24', 'label', 'Destek odaklı')
    )
  )),
  (pid, 20, 'whatsapp_cta', jsonb_build_object(
    'headline', 'Hemen yazın — danışmanla görüşün',
    'phone', '905XXXXXXXXX',
    'message', 'Merhaba, Online VIP Dershane hakkında bilgi almak istiyorum.'
  ));
end $$;

-- Örnek header / footer linkleri (idempotent)
do $$
declare
  hid uuid;
  fid uuid;
begin
  select id into hid from public.cms_menus where institution_id is null and menu_key = 'header' limit 1;
  select id into fid from public.cms_menus where institution_id is null and menu_key = 'footer' limit 1;
  if hid is not null then
    insert into public.cms_menu_items (menu_id, label, href, sort_order, visible)
    select hid, v.label, v.href, v.sort_order, true
    from (values
      ('Kurslar', '/kurumsal/kurslar', 20),
      ('Blog', '/kurumsal/blog', 30),
      ('İletişim', '/kurumsal/iletisim', 40)
    ) as v(label, href, sort_order)
    where not exists (select 1 from public.cms_menu_items i where i.menu_id = hid and i.href = v.href);
  end if;
  if fid is not null then
    insert into public.cms_menu_items (menu_id, label, href, sort_order, visible)
    select fid, v.label, v.href, v.sort_order, true
    from (values
      ('KVKK', '/kurumsal/kvkk', 10),
      ('Gizlilik', '/kurumsal/gizlilik-politikasi', 20),
      ('Mesafeli satış', '/kurumsal/mesafeli-satis', 30)
    ) as v(label, href, sort_order)
    where not exists (select 1 from public.cms_menu_items i where i.menu_id = fid and i.href = v.href);
  end if;
end $$;
