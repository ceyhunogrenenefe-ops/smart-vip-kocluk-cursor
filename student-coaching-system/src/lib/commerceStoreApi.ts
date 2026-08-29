/**
 * Öğrenci/Veli Kitap Mağazası — API istemcisi
 */
import { apiFetch } from './session';
import type {
  CommerceBook,
  CommerceBookPackage,
  CommerceSettings,
  CommerceStudentBookAssignment,
  CommerceVendorOffer,
  StoreBrowseCategory,
  StoreBrowseNav,
} from '../types/commerce.types';

async function post<T = unknown>(op: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await apiFetch('/api/commerce-store', { method: 'POST', body: JSON.stringify({ op, ...params }) });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`));
  if (!data.ok) throw new Error(String(data.error ?? op));
  return data as T;
}

// Ayarlar
export const csGetSettings = () => post<{ settings: CommerceSettings }>('catalog.settings');

// Katalog
export type CatalogListParams = {
  search?: string;
  subject?: string;
  publisher?: string;
  class_level?: string;
  series?: string;
  price_min?: number;
  price_max?: number;
  teacher_recommended?: boolean;
  is_featured?: boolean;
  is_bestseller?: boolean;
  is_new_arrival?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  limit?: number;
  offset?: number;
};

export type OfferWithBook = CommerceVendorOffer & {
  unpriced?: boolean;
  commerce_books: Pick<CommerceBook, 'id' | 'slug' | 'title' | 'author' | 'publisher' | 'subject' | 'class_levels' | 'exam_types' | 'cover_image_url' | 'page_count' | 'metadata'>;
  commerce_vendors: { id: string; name: string };
};

export const csListCatalog = (params?: CatalogListParams) =>
  post<{ offers: OfferWithBook[]; total: number | null }>('catalog.list', params ?? {});

export const csGetBook = (idOrSlug: string, isSlug = true) =>
  post<{ book: CommerceBook & { commerce_vendor_offers: (CommerceVendorOffer & { commerce_vendors: { id: string; name: string } })[] } }>(
    'catalog.get',
    isSlug ? { slug: idOrSlug } : { id: idOrSlug }
  );

export const csListPackages = (class_level?: string) =>
  post<{ packages: CommerceBookPackage[] }>('catalog.packages', class_level ? { class_level } : {});

export type StoreCollectionBook = CommerceBook & {
  buyable?: boolean;
  commerce_vendor_offers?: (CommerceVendorOffer & { commerce_vendors?: { id: string; name: string; slug?: string } })[];
};

export type StoreCollection = {
  key: string;
  label: string;
  publisher: string | null;
  class_level: string;
  exam: string;
  coming_soon: boolean;
  cover_image_url: string | null;
  description: string;
  book_count: number;
  priced_count: number;
  books: StoreCollectionBook[];
};

export const csListCollections = () =>
  post<{ collections: StoreCollection[] }>('catalog.collections');

export type StoreBrowseCategoryWithBooks = StoreBrowseCategory & {
  books: StoreCollectionBook[];
};

export const csListBrowse = () =>
  post<StoreBrowseNav & { categories: StoreBrowseCategoryWithBooks[] }>('catalog.browse');

export const csGetAssigned = (student_id?: string) =>
  post<{ assignments: (CommerceStudentBookAssignment & { commerce_books: Pick<CommerceBook, 'id' | 'slug' | 'title' | 'author' | 'cover_image_url' | 'publisher'> | null })[] }>(
    'catalog.assigned',
    student_id ? { student_id } : {}
  );

// Sepet
export type CartItem = {
  id: string;
  quantity: number;
  price_kurus_snapshot: number;
  title_snapshot: string | null;
  vendor_offer_id: string | null;
  package_id: string | null;
  price_changed?: boolean;
  out_of_stock?: boolean;
  commerce_vendor_offers?: (CommerceVendorOffer & { commerce_books?: { id: string; slug: string; title: string; cover_image_url: string | null; author: string | null }; commerce_vendors?: { id: string; name: string } }) | null;
  commerce_book_packages?: Pick<CommerceBookPackage, 'id' | 'name' | 'slug' | 'price_kurus' | 'cover_image_url'> | null;
};

export type CartResponse = { ok: true; cart_id: string; items: CartItem[]; subtotal_kurus: number };

export const csGetCart = () => post<CartResponse>('cart.get');
export const csAddToCart = (vendor_offer_id?: string, package_id?: string, quantity = 1) =>
  post<{ ok: true; items: CartItem[] }>('cart.add', { vendor_offer_id, package_id, quantity });
export const csUpdateCartItem = (item_id: string, quantity: number) =>
  post<{ ok: true; items: CartItem[] }>('cart.update', { item_id, quantity });
export const csRemoveFromCart = (item_id: string) =>
  post<{ ok: true; items: CartItem[] }>('cart.remove', { item_id });
export const csClearCart = () => post<{ ok: true; items: CartItem[] }>('cart.clear');
export const csApplyCoupon = (code: string) =>
  post<{ ok: boolean; coupon?: { id: string; code: string; discount_type: string; discount_value: number; max_discount_kurus: number | null; min_order_kurus: number }; error?: string }>('cart.apply_coupon', { code });

export type CheckoutHandoffPayload = {
  items: { title: string; qty: number; unit_kurus: number }[];
  subtotal_kurus: number;
  shipping_kurus: number;
  discount_kurus: number;
  total_kurus: number;
  coupon_code?: string | null;
  cart_id?: string | null;
  user_id?: string | null;
  student_id?: string | null;
  ref?: string;
  created_at?: string;
};

export async function csCreateCheckoutHandoff(payload: CheckoutHandoffPayload) {
  const res = await apiFetch('/api/commerce-checkout-handoff', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok || !data.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`));
  return data as { ok: true; token: string; expires_at: string; checkout: CheckoutHandoffPayload };
}

export type CheckoutPrepareResponse = {
  ok: true;
  token: string;
  payment_ref: string;
  order_id: string;
  order_number: string;
  total_kurus: number;
  subtotal_kurus: number;
  shipping_kurus: number;
  discount_kurus: number;
  checkout_url: string;
};

export const csCheckoutPrepare = (coupon_code?: string | null, student_id?: string | null) =>
  post<CheckoutPrepareResponse>('cart.checkout_prepare', {
    ...(coupon_code ? { coupon_code } : {}),
    ...(student_id ? { student_id } : {}),
  });

export type CheckoutIbanResponse = {
  ok: true;
  payment_method: 'iban';
  order_id: string;
  order_number: string;
  total_kurus: number;
  receipt_url: string;
  iban_payment: { enabled: boolean; holder: string; iban: string; note: string };
};

export const csCheckoutIban = (params: {
  file_base64: string;
  mime_type: string;
  coupon_code?: string | null;
  student_id?: string | null;
}) =>
  post<CheckoutIbanResponse>('cart.checkout_iban', {
    file_base64: params.file_base64,
    mime_type: params.mime_type,
    ...(params.coupon_code ? { coupon_code: params.coupon_code } : {}),
    ...(params.student_id ? { student_id: params.student_id } : {}),
  });

// "Bu kitap bende var"
export const csMarkOwned = (book_id: string, vendor_offer_id?: string, student_id?: string) =>
  post<{ ok: true; assignment_id: string; already_existed: boolean }>('assignment.own', { book_id, vendor_offer_id, student_id });

export type StaffRosterStudent = { id: string; name: string | null; class_level: string | null; class_id: string | null };
export type StaffRosterClass = { id: string; name: string | null; class_level: string | null };

export const csStaffRoster = () =>
  post<{ classes: StaffRosterClass[]; students: StaffRosterStudent[]; can_manage: boolean }>('staff.roster');

export const csStaffAssign = (params: {
  book_ids: string[];
  student_ids?: string[];
  class_id?: string;
  class_level?: string;
  assignment_type?: 'required' | 'recommended' | 'optional';
  notes?: string;
}) =>
  post<{ created: number; updated: number; student_count: number; book_count: number; catalog_recommended?: boolean }>('staff.assign', params);

export const csStaffCreatePackage = (params: {
  name: string;
  book_ids: string[];
  class_level?: string;
  description?: string;
  price_kurus?: number;
}) =>
  post<{ package: CommerceBookPackage; item_count: number; price_kurus?: number; auto_summed?: boolean }>('staff.package_create', params);

export const csStaffUpdatePackage = (params: {
  id: string;
  name?: string;
  description?: string | null;
  class_level?: string | null;
  price_kurus?: number;
}) =>
  post<{ package: CommerceBookPackage }>('staff.package_update', params);

export const csStaffDeletePackage = (id: string) =>
  post<{ ok: true }>('staff.package_delete', { id });

export const csStaffSetPackageItems = (params: { package_id: string; book_ids: string[]; auto_sum?: boolean }) =>
  post<{ item_count: number; price_kurus?: number | null; auto_summed?: boolean }>('staff.package_items_set', params);
