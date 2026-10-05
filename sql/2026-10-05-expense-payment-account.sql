-- Giderde "hangi hesaptan ödendi" bilgisi.
--
-- Kurumda birden çok ödeme hesabı var (payment_accounts) ama gider
-- kalemlerinde hangisinden ödendiği tutulmuyordu; genel bakışta da hesap
-- kırılımı görülemiyordu.
--
-- Yalnız KOLON ekler; mevcut kayıtlar etkilenmez, hesap alanı boş kalır ve
-- raporda "Belirtilmemiş" altında toplanır.

alter table public.institution_expense_items
  add column if not exists payment_account_id uuid,
  add column if not exists paid_by text;

create index if not exists iei_payment_account_idx
  on public.institution_expense_items (payment_account_id);

-- Öğretmen hakedişi ödenirken seçilen hesap hakediş kaydında da dursun
alter table public.teacher_payroll_settlements
  add column if not exists payment_account_id uuid;
