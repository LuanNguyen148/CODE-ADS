-- CHẾ ĐỘ TỰ ĐỘNG TẮT — quy tắc gắn TỪNG chiến dịch / nhóm QC / quảng cáo (cài ở tab Bật/Tắt của web).
-- ĐÃ ÁP DỤNG lên Supabase ngày 2026-11-21 (migration autopause_tables + autopause_tighten_grants). Chạy lại an toàn.
-- Chạy trước supabase/autopause-schedule.sql. Chạy lại nhiều lần an toàn (create ... if not exists / drop policy if exists).

-- Mỗi dòng = một quy tắc cho MỘT mục. Tắt mục khi HÔM NAY: chi tiêu >= spend_threshold VÀ (điều kiện kết quả).
-- Điều kiện kết quả (tùy chọn): mess <= mess_max (use_mess) và/hoặc SĐT <= phone_max (use_phone);
--   match_mode 'all' = các điều kiện đang bật phải ĐỀU đúng, 'any' = chỉ cần MỘT đúng.
--   Không bật điều kiện nào = tắt ngay khi chi tiêu đạt ngưỡng.
create table if not exists public.ads_autopause_rules (
  id              bigserial primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      text not null,                                        -- tài khoản quảng cáo chứa mục này (act_...)
  level           text not null check (level in ('campaign', 'adset', 'ad')),
  object_id       text not null,                                        -- ID Facebook của chiến dịch / nhóm QC / quảng cáo
  object_name     text,
  enabled         boolean not null default true,
  dry_run         boolean not null default true,                        -- mặc định CHẠY THỬ: chỉ ghi nhật ký, không tắt thật
  spend_threshold numeric not null check (spend_threshold > 0),         -- chi tiêu HÔM NAY (theo đơn vị tiền của tài khoản QC)
  use_mess        boolean not null default true,
  mess_max        int not null default 0 check (mess_max >= 0),
  use_phone       boolean not null default false,                       -- SĐT do người dùng nhập tay (đọc từ ads_user_state)
  phone_max       int not null default 0 check (phone_max >= 0),
  match_mode      text not null default 'all' check (match_mode in ('all', 'any')),
  -- do máy chủ ghi sau mỗi lần chạy:
  last_run_at     timestamptz,
  last_status     text,                                                 -- ok | no_token | token_error | bad_rule | error
  last_error      text,
  last_spend      numeric,
  last_mess       int,
  last_phone      int,
  updated_at      timestamptz not null default now(),
  unique (user_id, object_id)
);
create index if not exists ads_autopause_rules_user on public.ads_autopause_rules (user_id) where enabled;

-- Nhật ký: chỉ máy chủ (service role) ghi; người dùng chỉ đọc và đánh dấu "đã bật lại"
create table if not exists public.ads_autopause_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rule_id     bigint references public.ads_autopause_rules(id) on delete set null,
  at          timestamptz not null default now(),
  account_id  text,
  level       text,
  object_id   text not null,
  object_name text,
  spend       numeric,
  mess        int,
  phone       int,
  action      text not null check (action in ('paused', 'would_pause', 'error')),
  note        text,
  restored_at timestamptz
);
create index if not exists ads_autopause_log_user_at on public.ads_autopause_log (user_id, at desc);

alter table public.ads_autopause_rules enable row level security;
alter table public.ads_autopause_log   enable row level security;

drop policy if exists "rules own select" on public.ads_autopause_rules;
drop policy if exists "rules own insert" on public.ads_autopause_rules;
drop policy if exists "rules own update" on public.ads_autopause_rules;
drop policy if exists "rules own delete" on public.ads_autopause_rules;
create policy "rules own select" on public.ads_autopause_rules for select using (auth.uid() = user_id);
create policy "rules own insert" on public.ads_autopause_rules for insert with check (auth.uid() = user_id);
create policy "rules own update" on public.ads_autopause_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rules own delete" on public.ads_autopause_rules for delete using (auth.uid() = user_id);

drop policy if exists "log own select" on public.ads_autopause_log;
drop policy if exists "log own update" on public.ads_autopause_log;
create policy "log own select" on public.ads_autopause_log for select using (auth.uid() = user_id);
create policy "log own update" on public.ads_autopause_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Người dùng chỉ được sửa ĐÚNG cột restored_at của nhật ký (không sửa chi tiêu, tên, hành động…)
revoke update on public.ads_autopause_log from authenticated;
grant update (restored_at) on public.ads_autopause_log to authenticated;
-- Quy tắc: người dùng ghi các cột cấu hình; KHÔNG ghi các cột last_* (do máy chủ ghi)
revoke insert on public.ads_autopause_rules from authenticated;
revoke update on public.ads_autopause_rules from authenticated;
grant insert (user_id, account_id, level, object_id, object_name, enabled, dry_run, spend_threshold, use_mess, mess_max, use_phone, phone_max, match_mode, updated_at) on public.ads_autopause_rules to authenticated;
-- (user_id, object_id cũng cần trong quyền sửa vì upsert của PostgREST ghi cả hai cột khi trùng khóa; RLS vẫn buộc user_id = chính mình)
grant update (user_id, object_id, account_id, level, object_name, enabled, dry_run, spend_threshold, use_mess, mess_max, use_phone, phone_max, match_mode, updated_at) on public.ads_autopause_rules to authenticated;

-- Siết quyền mặc định của Supabase (đã áp dụng bằng migration autopause_tighten_grants).
-- RLS đã chặn dữ liệu, nhưng TRUNCATE không bị RLS chặn nên thu hồi hẳn; vai anon (chưa đăng nhập) không cần quyền gì.
revoke all on public.ads_autopause_rules from anon;
revoke all on public.ads_autopause_log from anon;
revoke truncate, trigger, references on public.ads_autopause_rules from authenticated;
revoke insert, delete, truncate, trigger, references on public.ads_autopause_log from authenticated;
