-- THÔNG BÁO TELEGRAM cho chế độ tự động tắt + BÁO CÁO HẰNG NGÀY (bot của chính người dùng). Tab "Thông báo" của web.
-- ĐÃ ÁP DỤNG toàn bộ lên Supabase ngày 2026-11-21 (migration autopause_notify_report_prefs; đã thử thật 14 phép với vai authenticated/anon).
-- Cột báo cáo (report_*), hàm save_notify_prefs và save_telegram_bot bản 1 tham số đã chạy. File chạy lại nhiều lần an toàn.
--
-- Mã bot Telegram là bí mật: web KHÔNG đọc được và KHÔNG ghi trực tiếp được — chỉ gọi hàm bên dưới (security definer).
-- Web chỉ ĐỌC các cột an toàn (has_bot, chat ID, các cờ, cài đặt báo cáo) và XÓA kết nối của mình. Quyền cấp THEO CỘT.
--
-- Lỗi thật đã gặp khi để web ghi trực tiếp: câu lệnh "thêm hoặc cập nhật" (upsert) đọc EXCLUDED.<cột> nên Postgres đòi quyền ĐỌC
-- mọi cột được ghi; cột mã bot cố ý không cấp quyền đọc → "permission denied for table ads_notify_settings". Vì vậy mọi thao tác ghi đi qua hàm.
create table if not exists public.ads_notify_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  telegram_bot_token text,
  telegram_chat_id   text,
  has_bot            boolean generated always as (telegram_bot_token is not null and telegram_bot_token <> '') stored,
  notify_paused      boolean not null default true,    -- báo NGAY khi một mục bị tự tắt, kèm LÝ DO không đạt chỉ tiêu (hoặc không tắt được)
  notify_problem     boolean not null default true,    -- báo sự cố: token Facebook hết hạn / thiếu token / lỗi (chỉ báo lần đầu, không lặp mỗi 15 phút)
  notify_dry         boolean not null default false,   -- báo cả khi chạy thử ("sẽ tắt")
  last_notify_at     timestamptz,
  last_notify_error  text,
  updated_at         timestamptz not null default now(),
  check (telegram_bot_token is null or telegram_bot_token ~ '^[0-9]{6,}:[A-Za-z0-9_-]{30,}$')
);

-- Báo cáo hằng ngày: gửi 1 tin tổng kết (chi tiêu, mess, SĐT, doanh số, CPQC, các mục đã tự tắt) vào giờ người dùng chọn (giờ Việt Nam).
alter table public.ads_notify_settings add column if not exists report_enabled boolean not null default false;
alter table public.ads_notify_settings add column if not exists report_time text not null default '20:00' check (report_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.ads_notify_settings add column if not exists last_report_date date;   -- ngày (giờ VN) đã gửi báo cáo gần nhất; do máy chủ ghi

alter table public.ads_notify_settings enable row level security;

drop policy if exists "notify own select" on public.ads_notify_settings;
drop policy if exists "notify own insert" on public.ads_notify_settings;
drop policy if exists "notify own update" on public.ads_notify_settings;
drop policy if exists "notify own delete" on public.ads_notify_settings;
create policy "notify own select" on public.ads_notify_settings for select using (auth.uid() = user_id);
create policy "notify own insert" on public.ads_notify_settings for insert with check (auth.uid() = user_id);
create policy "notify own update" on public.ads_notify_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notify own delete" on public.ads_notify_settings for delete using (auth.uid() = user_id);

revoke all on public.ads_notify_settings from anon;
revoke all on public.ads_notify_settings from authenticated;
-- ĐỌC: mọi cột TRỪ telegram_bot_token. GHI TRỰC TIẾP: không có (chỉ qua hàm). XÓA: được (kết nối của chính mình).
grant select (user_id, telegram_chat_id, has_bot, notify_paused, notify_problem, notify_dry, report_enabled, report_time, last_report_date, last_notify_at, last_notify_error, updated_at) on public.ads_notify_settings to authenticated;
grant delete on public.ads_notify_settings to authenticated;
revoke insert, update on public.ads_notify_settings from authenticated;

-- Bản hàm cũ (4 tham số) thay bằng bản 1 tham số: lưu mã bot KHÔNG đụng tới các cờ thông báo đã chọn.
drop function if exists public.save_telegram_bot(text, boolean, boolean, boolean);

-- Lưu mã bot: chạy với quyền chủ bảng (security definer) nên ghi được cột mã bot mà web không đọc được.
-- Chỉ ghi dòng của CHÍNH người gọi (auth.uid()); kiểm tra định dạng; đổi bot thì xóa chat ID cũ (chat cũ thuộc bot cũ).
create or replace function public.save_telegram_bot(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Chưa đăng nhập' using errcode = '28000';
  end if;
  p_token := btrim(coalesce(p_token, ''));
  if p_token !~ '^[0-9]{6,}:[A-Za-z0-9_-]{30,}$' then
    raise exception 'Mã bot không đúng định dạng (phải dạng 123456789:AAE…)' using errcode = '22023';
  end if;
  insert into public.ads_notify_settings (user_id, telegram_bot_token, telegram_chat_id, updated_at)
  values (uid, p_token, null, now())
  on conflict (user_id) do update set
    telegram_bot_token = excluded.telegram_bot_token,
    telegram_chat_id   = null,
    updated_at         = now();
end;
$$;
revoke all on function public.save_telegram_bot(text) from public, anon;
grant execute on function public.save_telegram_bot(text) to authenticated;

-- Lưu các cài đặt thông báo (cờ + báo cáo hằng ngày). Giờ phải đúng HH:MM (00:00–23:59, giờ Việt Nam).
-- Bật báo cáo hoặc đổi giờ SAU khi giờ mới đã qua trong ngày → không gửi bù ngay (đặt last_report_date = hôm nay), báo cáo đầu tiên là ngày mai.
create or replace function public.save_notify_prefs(p_paused boolean, p_problem boolean, p_dry boolean, p_report boolean, p_time text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  vn  timestamp := (now() at time zone 'Asia/Ho_Chi_Minh');
  prev public.ads_notify_settings%rowtype;
  new_last date;
begin
  if uid is null then
    raise exception 'Chưa đăng nhập' using errcode = '28000';
  end if;
  p_time := btrim(coalesce(p_time, ''));
  if p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Giờ gửi báo cáo không hợp lệ (phải dạng HH:MM, ví dụ 20:00)' using errcode = '22023';
  end if;
  select * into prev from public.ads_notify_settings where user_id = uid;
  new_last := prev.last_report_date;
  if coalesce(p_report, false) and (prev.user_id is null or not prev.report_enabled or prev.report_time is distinct from p_time) then
    new_last := case when to_char(vn, 'HH24:MI') >= p_time then vn::date else null end;
  end if;
  insert into public.ads_notify_settings (user_id, notify_paused, notify_problem, notify_dry, report_enabled, report_time, last_report_date, updated_at)
  values (uid, coalesce(p_paused, true), coalesce(p_problem, true), coalesce(p_dry, false), coalesce(p_report, false), p_time, new_last, now())
  on conflict (user_id) do update set
    notify_paused    = excluded.notify_paused,
    notify_problem   = excluded.notify_problem,
    notify_dry       = excluded.notify_dry,
    report_enabled   = excluded.report_enabled,
    report_time      = excluded.report_time,
    last_report_date = excluded.last_report_date,
    updated_at       = now();
end;
$$;
revoke all on function public.save_notify_prefs(boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.save_notify_prefs(boolean, boolean, boolean, boolean, text) to authenticated;
