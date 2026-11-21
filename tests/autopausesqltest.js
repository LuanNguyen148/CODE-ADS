// Kiểm tra tĩnh các file SQL của chế độ tự tắt (quy tắc gắn TỪNG chiến dịch / nhóm QC / quảng cáo):
// bảo mật dòng (RLS), ràng buộc, cột được phép sửa, không chứa bí mật, lịch chạy dùng Vault.
const fs = require('fs'), path = require('path');
const root = path.dirname(path.resolve(process.argv[2]));
const read = f => fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : null;
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

const sql = read('supabase/autopause.sql');
check(!!sql, 'có supabase/autopause.sql');
if (sql) {
  const s = sql.replace(/--.*$/gm, '');
  check(/create table if not exists public\.ads_autopause_rules/i.test(s) && /create table if not exists public\.ads_autopause_log/i.test(s), 'tạo 2 bảng: ads_autopause_rules và ads_autopause_log');
  check(/id\s+bigserial\s+primary key/i.test(s.slice(s.search(/ads_autopause_rules/i))) && /user_id\s+uuid\s+not null\s+references auth\.users\(id\)\s+on delete cascade/i.test(s), 'rules: nhiều quy tắc mỗi người (id riêng), xóa tài khoản thì xóa theo');
  check(/unique\s*\(\s*user_id\s*,\s*object_id\s*\)/i.test(s), 'mỗi mục (chiến dịch/nhóm/QC) chỉ có 1 quy tắc: unique (user_id, object_id)');
  check(/level\s+text\s+not null\s+check\s*\(\s*level\s+in\s*\(\s*'campaign'\s*,\s*'adset'\s*,\s*'ad'\s*\)\s*\)/i.test(s), 'level chỉ nhận campaign / adset / ad');
  check((s.match(/enable row level security/gi) || []).length >= 2, 'bật RLS cho cả hai bảng');
  check(/spend_threshold\s+numeric\s+not null\s+check\s*\(\s*spend_threshold\s*>\s*0\s*\)/i.test(s), 'ngưỡng tiền phải > 0 (ràng buộc ở CSDL)');
  check(/mess_max\s+int\s+not null\s+default\s+0\s+check\s*\(\s*mess_max\s*>=\s*0\s*\)/i.test(s) && /phone_max\s+int\s+not null\s+default\s+0\s+check\s*\(\s*phone_max\s*>=\s*0\s*\)/i.test(s), 'ngưỡng mess và SĐT mặc định 0, không âm');
  check(/use_mess\s+boolean\s+not null\s+default\s+true/i.test(s) && /use_phone\s+boolean\s+not null\s+default\s+false/i.test(s), 'mặc định xét mess, KHÔNG xét SĐT (SĐT nhập tay)');
  check(/match_mode\s+text\s+not null\s+default\s+'all'\s+check\s*\(\s*match_mode\s+in\s*\(\s*'all'\s*,\s*'any'\s*\)\s*\)/i.test(s), 'match_mode: all (cả hai) / any (một trong hai), mặc định all');
  check(/dry_run\s+boolean\s+not null\s+default\s+true/i.test(s), 'mặc định CHẠY THỬ (dry_run=true) để không tắt thật khi mới tạo');
  check(/check\s*\(\s*action\s+in\s*\(\s*'paused'\s*,\s*'would_pause'\s*,\s*'error'\s*\)\s*\)/i.test(s), 'log.action chỉ nhận paused / would_pause / error');
  check(/last_spend\s+numeric/i.test(s) && /last_mess\s+int/i.test(s) && /last_phone\s+int/i.test(s), 'lưu số liệu kiểm tra gần nhất (last_spend, last_mess, last_phone) để hiện trong popup');
  const pol = [...s.matchAll(/create policy\s+"[^"]+"\s+on\s+public\.(\w+)\s+for\s+(\w+)\s+([^;]*);/gi)].map(m => ({ t: m[1], op: m[2].toLowerCase(), body: m[3] }));
  check(pol.length >= 6 && pol.every(p => /auth\.uid\(\)\s*=\s*user_id/.test(p.body)), 'mọi policy đều khóa theo auth.uid() = user_id (' + pol.length + ' policy)');
  check(['select', 'insert', 'update', 'delete'].every(op => pol.some(p => p.t === 'ads_autopause_rules' && p.op === op)), 'rules: người dùng được xem / thêm / sửa / xóa quy tắc của chính mình');
  check(!pol.some(p => p.t === 'ads_autopause_log' && (p.op === 'insert' || p.op === 'delete')), 'người dùng KHÔNG được tự thêm/xóa nhật ký (chỉ máy chủ ghi) — chỉ đọc và đánh dấu đã bật lại');
  check(/grant update \(restored_at\) on public\.ads_autopause_log to authenticated/i.test(s) && /revoke update on public\.ads_autopause_log from authenticated/i.test(s), 'người dùng chỉ được sửa đúng cột restored_at của nhật ký');
  // cột do máy chủ quản lý (last_*) không nằm trong quyền sửa/thêm của người dùng
  const ins = (s.match(/grant insert \(([^)]*)\) on public\.ads_autopause_rules to authenticated/i) || [])[1] || '';
  const upd = (s.match(/grant update \(([^)]*)\) on public\.ads_autopause_rules to authenticated/i) || [])[1] || '';
  check(ins && upd && !/last_/.test(ins) && !/last_/.test(upd), 'người dùng KHÔNG được ghi các cột last_* (do máy chủ ghi)');
  check(/revoke (insert|insert, update|update, insert) on public\.ads_autopause_rules from authenticated/i.test(s) || (/revoke insert on public\.ads_autopause_rules from authenticated/i.test(s) && /revoke update on public\.ads_autopause_rules from authenticated/i.test(s)), 'thu hồi quyền mặc định rồi chỉ cấp theo cột');
  // Siết quyền mặc định của Supabase (anon / authenticated mặc định có quyền rất rộng; RLS chặn dữ liệu nhưng vẫn thu hồi cho chắc)
  check(/revoke all on public\.ads_autopause_rules from anon/i.test(s) && /revoke all on public\.ads_autopause_log from anon/i.test(s), 'thu hồi MỌI quyền của vai anon (chưa đăng nhập) trên cả hai bảng');
  check(/revoke[^;]*truncate[^;]*on public\.ads_autopause_rules from authenticated/i.test(s) && /revoke[^;]*truncate[^;]*on public\.ads_autopause_log from authenticated/i.test(s), 'thu hồi TRUNCATE (RLS không chặn được) của người dùng trên cả hai bảng');
  check(/revoke[^;]*insert[^;]*delete[^;]*on public\.ads_autopause_log from authenticated/i.test(s), 'người dùng không có quyền INSERT / DELETE nhật ký ở mức bảng');
  check(!/service_role|eyJ[A-Za-z0-9_-]{20,}|EAA[A-Za-z0-9]{8,}/.test(sql), 'không chứa khóa/token');
}
const nt = read('supabase/autopause-notify.sql');
check(!!nt, 'có supabase/autopause-notify.sql (cài đặt thông báo Telegram)');
if (nt) {
  const s = nt.replace(/--.*$/gm, '');
  check(/create table if not exists public\.ads_notify_settings/i.test(s) && /user_id\s+uuid\s+primary key\s+references auth\.users\(id\)\s+on delete cascade/i.test(s), 'bảng ads_notify_settings: mỗi người một dòng, xóa tài khoản thì xóa theo');
  check(/telegram_bot_token\s+text/i.test(s) && /telegram_chat_id\s+text/i.test(s), 'có cột mã bot và chat ID Telegram');
  check(/check\s*\(\s*telegram_bot_token is null or telegram_bot_token\s*~\s*'\^\[0-9\]\{6,\}:\[A-Za-z0-9_-\]\{30,\}\$'\s*\)/i.test(s), 'mã bot phải đúng định dạng Telegram (ràng buộc ở CSDL)');
  check(/has_bot\s+boolean\s+generated always as/i.test(s), 'cột has_bot (đã có mã bot chưa) để web biết mà không cần đọc mã');
  check(/notify_paused\s+boolean\s+not null\s+default\s+true/i.test(s) && /notify_problem\s+boolean\s+not null\s+default\s+true/i.test(s) && /notify_dry\s+boolean\s+not null\s+default\s+false/i.test(s), 'mặc định: báo khi tắt + báo sự cố (token hết hạn), KHÔNG báo chạy thử');
  check(/enable row level security/i.test(s) && ['select', 'insert', 'update', 'delete'].every(op => new RegExp('create policy\\s+"[^"]+"\\s+on public\\.ads_notify_settings\\s+for\\s+' + op + '[^;]*auth\\.uid\\(\\)\\s*=\\s*user_id', 'i').test(s)), 'RLS: xem/thêm/sửa/xóa chỉ dòng của chính mình');
  check(/revoke all on public\.ads_notify_settings from anon/i.test(s) && /revoke all on public\.ads_notify_settings from authenticated/i.test(s), 'thu hồi mọi quyền mặc định của anon và authenticated rồi cấp lại theo cột');
  const sel = (s.match(/grant select \(([^)]*)\) on public\.ads_notify_settings to authenticated/i) || [])[1] || '';
  check(sel && !/telegram_bot_token/.test(sel) && /has_bot/.test(sel) && /telegram_chat_id/.test(sel), 'người dùng ĐỌC được chat ID và has_bot nhưng KHÔNG đọc được mã bot (chỉ máy chủ đọc)');
  // Lỗi thật đã gặp: upsert (ON CONFLICT DO UPDATE) phải ĐỌC EXCLUDED.<cột> nên đòi quyền SELECT cột mã bot — mà web không được đọc mã bot.
  // Cách đúng: web KHÔNG ghi trực tiếp gì cả trong bảng này (chỉ đọc + xóa); mọi thao tác ghi đi qua hàm security definer có kiểm tra.
  check(!/grant\s+(insert|update)[^;]*on public\.ads_notify_settings to authenticated/i.test(s) && /revoke insert, update on public\.ads_notify_settings from authenticated/i.test(s), 'web KHÔNG có quyền ghi trực tiếp (insert/update) vào ads_notify_settings — chỉ qua hàm');
  check(/report_enabled\s+boolean\s+not null\s+default\s+false/i.test(s) && /report_time\s+text\s+not null\s+default\s+'20:00'\s+check\s*\(\s*report_time\s*~\s*'\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$'\s*\)/i.test(s) && /last_report_date\s+date/i.test(s), 'cột báo cáo hằng ngày: report_enabled (mặc định tắt), report_time (mặc định 20:00, đúng định dạng HH:MM), last_report_date');
  check(/grant select \([^)]*report_enabled[^)]*report_time[^)]*last_report_date[^)]*\) on public\.ads_notify_settings to authenticated/i.test(s), 'web ĐỌC được cài đặt báo cáo + ngày gửi gần nhất');
  check(/create or replace function public\.save_telegram_bot\s*\(\s*p_token text\s*\)\s*returns void/i.test(s) && /security definer/i.test(s) && /set search_path\s*=\s*''/i.test(s), 'hàm save_telegram_bot(p_token): security definer + search_path rỗng');
  check(/auth\.uid\(\)/.test(s.slice(s.search(/save_telegram_bot/i))) && /uid is null/i.test(s), 'hàm chỉ ghi dòng của chính người gọi (auth.uid()), chưa đăng nhập thì từ chối');
  check(/p_token\s*!~\s*'\^\[0-9\]\{6,\}:\[A-Za-z0-9_-\]\{30,\}\$'/.test(s), 'hàm kiểm tra định dạng mã bot trước khi lưu');
  check(/telegram_chat_id\s*=\s*null/i.test(s.slice(s.search(/save_telegram_bot/i))), 'đổi bot thì xóa chat ID cũ (trong hàm)');
  check(!/drop function[^;]*save_telegram_bot\s*\(\s*text\s*,\s*boolean/i.test(s) === false, 'có xóa bản hàm cũ 4 tham số (save_telegram_bot(text, boolean, boolean, boolean))');
  check(/create or replace function public\.save_notify_prefs\s*\(\s*p_paused boolean\s*,\s*p_problem boolean\s*,\s*p_dry boolean\s*,\s*p_report boolean\s*,\s*p_time text\s*\)\s*returns void/i.test(s), 'hàm save_notify_prefs(p_paused, p_problem, p_dry, p_report, p_time)');
  const pf = s.slice(s.search(/function public\.save_notify_prefs/i));
  check(/security definer/i.test(pf) && /set search_path\s*=\s*''/i.test(pf) && /auth\.uid\(\)/.test(pf) && /uid is null/i.test(pf), 'save_notify_prefs: security definer, search_path rỗng, chỉ dòng của chính người gọi');
  check(/p_time\s*!~\s*'\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$'/.test(pf), 'save_notify_prefs kiểm tra giờ HH:MM hợp lệ (00:00–23:59)');
  check(/Asia\/Ho_Chi_Minh/.test(pf) && /last_report_date/.test(pf), 'giờ báo cáo tính theo giờ Việt Nam; đổi giờ/bật báo cáo sau giờ đã chọn thì KHÔNG gửi bù ngay trong ngày (đặt last_report_date = hôm nay)');
  check(/revoke all on function public\.save_telegram_bot\([^)]*\) from public, anon/i.test(s) && /grant execute on function public\.save_telegram_bot\([^)]*\) to authenticated/i.test(s) && /revoke all on function public\.save_notify_prefs\([^)]*\) from public, anon/i.test(s) && /grant execute on function public\.save_notify_prefs\([^)]*\) to authenticated/i.test(s), 'chỉ người đã đăng nhập (authenticated) gọi được 2 hàm; anon và public bị thu hồi');
  check(/grant delete on public\.ads_notify_settings to authenticated/i.test(s), 'người dùng xóa được kết nối của mình');
  check(!/EAA[A-Za-z0-9]{8,}|[0-9]{8,}:[A-Za-z0-9_-]{30,}/.test(nt), 'không chứa mã bot / token thật');
}
const sec = read('supabase/autopause-secret.sql');
check(!!sec, 'có supabase/autopause-secret.sql (khóa gọi hàm do Vault giữ)');
if (sec) {
  const s = sec.replace(/--.*$/gm, '');
  check(/vault\.create_secret\s*\(\s*encode\s*\(\s*extensions\.gen_random_bytes\s*\(\s*32\s*\)\s*,\s*'hex'\s*\)\s*,\s*'autopause_cron_secret'/i.test(s), 'khóa tạo NGẪU NHIÊN 32 byte ngay trong CSDL (không ai biết giá trị)');
  check(/if not exists\s*\(\s*select 1 from vault\.secrets where name\s*=\s*'autopause_cron_secret'\s*\)/i.test(s), 'chạy lại không tạo/ghi đè khóa đang dùng (if not exists)');
  check(/create or replace function public\.autopause_secret\(\)\s*returns text/i.test(s) && /security definer/i.test(s) && /set search_path\s*=\s*''/i.test(s), 'hàm đọc khóa: security definer + search_path rỗng (chống đánh tráo)');
  check(/revoke all on function public\.autopause_secret\(\) from public, anon, authenticated/i.test(s), 'thu hồi quyền gọi hàm của public / anon / authenticated');
  check(/grant execute on function public\.autopause_secret\(\) to service_role/i.test(s), 'chỉ service_role (máy chủ) được gọi hàm đọc khóa');
  check(!/EAA[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}/.test(sec) && !/create_secret\s*\(\s*'[^']{8,}'\s*,/i.test(s), 'không ghi giá trị khóa cố định trong file');
}
const cron = read('supabase/autopause-schedule.sql');
check(!!cron, 'có supabase/autopause-schedule.sql');
if (cron) {
  const c = cron.replace(/--.*$/gm, '');
  check(/create extension if not exists pg_cron/i.test(c) && /create extension if not exists pg_net/i.test(c), 'bật pg_cron và pg_net');
  check(/cron\.schedule\(\s*'ads-autopause'\s*,\s*'\*\/15 \* \* \* \*'/i.test(c), 'lịch chạy mỗi 15 phút, tên job ads-autopause');
  check(/vault\.decrypted_secrets/i.test(c) && /autopause_cron_secret/.test(c), 'secret lấy từ Vault (không ghi thẳng vào lịch)');
  check(/x-cron-secret/i.test(c) && /functions\/v1\/fb-autopause/.test(c), 'gọi đúng hàm fb-autopause kèm header x-cron-secret');
  check(!/EAA[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}/.test(cron) && /<[A-Z_ ]+>/.test(cron), 'chỉ dùng chỗ trống <...>, không có giá trị bí mật thật');
  check(/cron\.unschedule\(\s*'ads-autopause'\s*\)/i.test(cron), 'có sẵn lệnh gỡ lịch (cron.unschedule) để dừng khẩn cấp');
  check(/cron\.schedule\(\s*'ads-report'\s*,\s*'\*\/15 \* \* \* \*'/i.test(c) && /functions\/v1\/autopause-notify/.test(c) && /'\{"op":"due"\}'/.test(c) && /cron\.unschedule\(\s*'ads-report'\s*\)/i.test(cron), 'job thứ hai ads-report: mỗi 15 phút gọi autopause-notify {"op":"due"} (báo cáo hằng ngày), có lệnh gỡ riêng');
}
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 2);
