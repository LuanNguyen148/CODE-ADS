-- CHẾ ĐỘ TỰ ĐỘNG TẮT — khóa gọi hàm fb-autopause, do Supabase Vault giữ (không phải đặt biến môi trường bằng tay).
-- Chạy sau supabase/autopause.sql và TRƯỚC supabase/autopause-schedule.sql. Chạy lại an toàn (không đổi khóa đang dùng).
--
-- Khóa là 32 byte ngẫu nhiên tạo ngay trong CSDL: không ai (kể cả chủ dự án) biết giá trị, không nằm trong repo hay trong lệnh nào.
--   - Lịch chạy (pg_cron) lấy khóa từ Vault và gửi kèm header x-cron-secret.
--   - Hàm fb-autopause lấy khóa qua RPC public.autopause_secret() (chỉ service_role gọi được) để so sánh.
-- Muốn đổi khóa (xoay vòng): xóa khóa cũ trong Vault rồi chạy lại file này.
--   delete from vault.secrets where name = 'autopause_cron_secret';

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'autopause_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'autopause_cron_secret', 'Khóa để lịch chạy ngầm gọi hàm fb-autopause');
  end if;
end $$;

create or replace function public.autopause_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'autopause_cron_secret' limit 1
$$;

-- Chỉ máy chủ (service_role) được đọc khóa; người dùng web và người chưa đăng nhập bị cấm hẳn
revoke all on function public.autopause_secret() from public, anon, authenticated;
grant execute on function public.autopause_secret() to service_role;
