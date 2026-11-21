-- CHẾ ĐỘ TỰ ĐỘNG TẮT CHIẾN DỊCH — lịch chạy ngầm mỗi 15 phút.
-- ĐÃ ÁP DỤNG ngày 2026-11-21 (migration autopause_schedule, với <PROJECT_REF> = mã dự án thật). File này là MẪU để dựng lại.
-- Thứ tự dựng lại: 1. supabase/autopause.sql  2. supabase/autopause-secret.sql (khóa ngẫu nhiên trong Vault)
--   3. npx supabase functions deploy fb-autopause --no-verify-jwt  4. file này (thay <PROJECT_REF>).
-- Không bao giờ ghi chuỗi bí mật vào file trong repo.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ads-autopause',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/fb-autopause',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'autopause_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- DỪNG KHẨN CẤP (chạy dòng này để gỡ lịch; hoặc tắt công tắc trong Cài đặt của web):
-- select cron.unschedule('ads-autopause');

-- BÁO CÁO HẰNG NGÀY (Telegram) — job thứ hai, mỗi 15 phút. Hàm autopause-notify tự chọn người ĐẾN GIỜ họ đặt (giờ Việt Nam) và mỗi ngày chỉ gửi một lần.
-- ĐÃ ÁP DỤNG ngày 2026-11-21 (migration autopause_report_schedule, jobid 2). Thay <PROJECT_REF> như trên khi dựng lại.
select cron.schedule(
  'ads-report',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/autopause-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'autopause_cron_secret')
    ),
    body    := '{"op":"due"}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
-- Gỡ riêng báo cáo hằng ngày: select cron.unschedule('ads-report');
