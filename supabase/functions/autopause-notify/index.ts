// @ts-nocheck
// Edge Function: thông báo Telegram cho chế độ tự tắt + BÁO CÁO HẰNG NGÀY.
// Người dùng (đã đăng nhập web) bấm:
//   op "link"   — tìm chat ID từ bot của chính họ (họ đã mở bot và bấm Start), lưu lại và gửi tin xác nhận.
//   op "test"   — gửi một tin thử tới chat đã kết nối.
//   op "report" — gửi thử báo cáo hôm nay ngay bây giờ (không đánh dấu "đã gửi hôm nay").
// pg_cron (mỗi 15 phút) gọi:
//   op "due"    — kèm header x-cron-secret: gửi báo cáo cho người dùng đã bật báo cáo và ĐẾN GIỜ họ chọn (giờ Việt Nam), mỗi ngày một lần.
//
// BẢO MẬT
//   - op của người dùng bắt buộc phiên đăng nhập Supabase hợp lệ (JWT qua /auth/v1/user). Người dùng lấy từ JWT, KHÔNG tin user_id trong nội dung gửi lên.
//   - op "due" bắt buộc header x-cron-secret khớp khóa (biến môi trường hoặc Vault qua RPC autopause_secret); không có khóa → 503, sai → 401.
//   - Mã bot Telegram và token Facebook chỉ đọc ở đây bằng service role; không bao giờ trả về trình duyệt, không nằm trong lỗi (hàm clean()).
//   - Báo cáo lấy từ ads_user_state (đúng nội dung nút báo cáo của tab Báo cáo ngày), KHÔNG gọi Facebook. Telegram: getUpdates và sendMessage.
//
// Triển khai (CHỈ sau khi chủ dự án đồng ý): npx supabase functions deploy autopause-notify --no-verify-jwt
// (--no-verify-jwt để trình duyệt gửi được yêu cầu CORS "OPTIONS" và cron gọi bằng khóa; việc xác thực do code bên dưới tự làm.)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};
const MAX_DUE_USERS = 200;   // tối đa số người xử lý mỗi lần cron
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json" }, CORS) });
const fail = (status, message) => reply(status, { error: { message } });

function clean(msg) {
  return String(msg == null ? "" : msg).replace(/(bot)?[0-9]{6,}:[A-Za-z0-9_-]{30,}/g, "$1***").replace(/access_token=[^&\s"']+/gi, "access_token=***").replace(/EAA[A-Za-z0-9]{8,}/g, "***").slice(0, 300);
}
function sbHeaders(extra) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return Object.assign({ apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, extra || {});
}
const SB = () => Deno.env.get("SUPABASE_URL");

function sameText(a, b) { // so sánh không lộ độ dài khớp
  a = String(a || ""); b = String(b || "");
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
// Khóa gọi hàm: ưu tiên biến môi trường AUTOPAUSE_CRON_SECRET, không thì Vault qua RPC autopause_secret (chỉ service_role gọi được). < 16 ký tự bị từ chối.
async function cronSecret() {
  let s = Deno.env.get("AUTOPAUSE_CRON_SECRET") || "";
  if (!s) {
    try {
      const r = await fetch(SB() + "/rest/v1/rpc/autopause_secret", { method: "POST", headers: sbHeaders(), body: "{}" });
      if (r.ok) { const v = await r.json(); s = typeof v === "string" ? v : ""; }
    } catch (_) { s = ""; }
  }
  return s.length >= 16 ? s : "";
}

// Người dùng đăng nhập (từ JWT); trả về id hoặc null
async function verifiedUserId(req) {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === "undefined" || jwt === "null") return null;
  const apikey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!SB() || !apikey) return null;
  try {
    const r = await fetch(SB() + "/auth/v1/user", { headers: { apikey, Authorization: "Bearer " + jwt } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && typeof u.id === "string" ? u.id : null;
  } catch (_) { return null; }
}
async function tg(token, method, body) { // trả về { ok, status, json } hoặc { ok:false, error }
  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
    });
    let j = {}; try { j = await r.json(); } catch (_) { j = {}; }
    return { ok: r.ok && j.ok !== false, status: r.status, json: j };
  } catch (e) { return { ok: false, status: 0, json: {}, error: clean((e && e.message) || "Không kết nối được Telegram") }; }
}
async function tgSend(token, chatId, text) { // null nếu gửi được, hoặc chuỗi lỗi (đã che mã bot)
  const r = await tg(token, "sendMessage", { chat_id: chatId, text: String(text).slice(0, 4000) });
  return r.ok ? null : clean(r.error || r.json.description || ("Telegram trả mã " + r.status));
}

// ----- Báo cáo hằng ngày -----
function fmtMoney(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
// Cùng cách đọc số tiền như trang web ("5tr", "3,5tr", "100k", "7.000.000")
function pm(s){s=String(s==null?"":s).toLowerCase().replace(/\s+/g,"");var q=s.match(/^(\d+)(k|tr|triệu|m|tỷ|ty|b)(\d+)$/);if(q){var bs={k:1e3,tr:1e6,"triệu":1e6,m:1e6,"tỷ":1e9,ty:1e9,b:1e9}[q[2]];return parseFloat(q[1]+"."+q[3])*bs}var m=s.match(/^([\d.,]+)(k|nghìn|ngàn|tr|triệu|m|tỷ|ty|b)?$/);if(!m)return 0;var x=m[1],u=m[2],f=1;if(u){f=/^(k|nghìn|ngàn)$/.test(u)?1e3:/^(tr|triệu|m)$/.test(u)?1e6:1e9;x=x.replace(/,/g,".");if((x.match(/\./g)||[]).length>1)x=x.replace(/\./g,"")}else if(/^\d{1,3}([.,]\d{3})+$/.test(x))x=x.replace(/[.,]/g,"");else x=x.replace(",",".");var v=parseFloat(x);return isFinite(v)?v*f:0}
function vnNow() { return new Date(Date.now() + 7 * 3600 * 1000); } // đọc bằng toISOString = giờ Việt Nam
const vnDate = () => vnNow().toISOString().slice(0, 10);
const vnHM = () => vnNow().toISOString().slice(11, 16);
async function stateOf(uid) {
  try {
    const r = await fetch(SB() + "/rest/v1/ads_user_state?user_id=eq." + encodeURIComponent(uid) + "&select=state", { headers: sbHeaders() });
    const rows = r.ok ? await r.json() : [];
    return (rows && rows[0] && rows[0].state) || null;
  } catch (_) { return null; }
}
// ----- Báo cáo = ĐÚNG nội dung nút báo cáo ở tab "Báo cáo ngày" của web (hàm report() trong dashboard.html) -----
// Dữ liệu lấy từ ads_user_state (số liệu từng dòng của ngày hôm nay, giờ Việt Nam), KHÔNG gọi Facebook.
// Các hàm sg/vn/rp/total/sblock được chép nguyên từ web để số rút gọn giống hệt (1219000 → "1tr2", 71700 → "72k"…).
function sg(x) { if (x >= 100) return Math.round(x / 10) * 10; if (x >= 10) return Math.round(x); return Math.round(x * 10) / 10; }
function vn(x, u) { const r = sg(x); let i = Math.floor(r + 1e-9), f = Math.round((r - i) * 10); if (f >= 10) { i++; f = 0; } return i + u + (f ? f : ""); }
function rp(v) {
  if (!isFinite(v)) return "–";
  v = Math.round(v);
  if (v < 1000) return String(v);
  if (v < 1e6) { if (sg(v / 1e3) < 1000) return vn(v / 1e3, "k"); v = 1e6; }
  if (v < 1e9) { if (sg(v / 1e6) < 1000) return vn(v / 1e6, "tr"); v = 1e9; }
  return vn(v / 1e9, "tỷ");
}
const num = (v) => { v = parseFloat(v); return isFinite(v) ? v : 0; };
const money = (v) => (isFinite(v) ? fmtMoney(v) : "–");
const divv = (a, b) => (b > 0 ? a / b : NaN);
function total(rows) {
  const t = { s: 0, m: 0, p: 0, d: 0 };
  for (const r of rows) { t.s += pm(r.spend); t.m += num(r.mess); t.p += num(r.phone); t.d += pm(r.rev); }
  t.gm = divv(t.s, t.m); t.gp = divv(t.s, t.p); t.cp = t.d > 0 ? t.s / t.d * 100 : NaN;
  return t;
}
function sblock(title, c) {
  return [title,
    "- Tổng tiền chạy : " + rp(c.s),
    "- Số lượng mess : " + money(c.m),
    "- Giá mess : " + rp(c.gm),
    "- Số lượng số: " + money(c.p),
    "- Giá số : " + rp(c.gp),
    "- Doanh số : " + rp(c.d),
    "CPQC: " + (isFinite(c.cp) ? (Math.round(c.cp) + "%") : "%")].join("\n");
}
// Trả về { texts: [...] } (tách tin khi dài quá 4000 ký tự) hoặc { error, status }.
async function buildReport(uid) {
  const st = await stateOf(uid);
  if (!st) return { status: 404, error: "Chưa có dữ liệu Báo cáo ngày. Hãy mở web và đồng bộ số liệu hôm nay." };
  const day = vnDate(), map = {}, camps = [], all = [];
  const dis = st.disabledAcc || {};
  for (const k of Object.keys(st.byAcc || {})) {
    if (k === "__ALL__" || dis[k]) continue;
    const a = st.byAcc[k];
    const rows = (a && a.days && Array.isArray(a.days[day])) ? a.days[day] : [];
    for (const r of rows) {
      if (!r) continue;
      const c = String(r.campaign || "").trim();
      if ((!c || c === "Chiến dịch mặc định") && !r._manual) continue;
      if (!(pm(r.spend) > 0)) continue;
      all.push(r);
      const n = c || "Chiến dịch thủ công";
      const key = k + "|" + (r.campaign_id ? String(r.campaign_id) : n.toLowerCase());
      if (!map[key]) { map[key] = { name: n, rows: [] }; camps.push(map[key]); }
      map[key].rows.push(r);
    }
  }
  if (!all.length) return { texts: [String(st.who || "…") + "\nHôm nay chưa có số liệu chi tiêu trong Báo cáo ngày."] };
  camps.sort((x, y) => total(y.rows).s - total(x.rows).s);
  const blocks = [String(st.who || "…").slice(0, 60) + "\n" + sblock("Tổng ngày", total(all))];
  for (const c of camps) blocks.push(sblock(c.name.slice(0, 100) + " :", total(c.rows)));
  const texts = []; let cur = "";
  for (const b of blocks) {
    if (cur && (cur + "\n\n" + b).length > 3900) { texts.push(cur); cur = b; } else cur = cur ? cur + "\n\n" + b : b;
  }
  if (cur) texts.push(cur);
  return { texts };
}

async function settingsOf(uid) {
  try {
    const r = await fetch(SB() + "/rest/v1/ads_notify_settings?user_id=eq." + encodeURIComponent(uid) + "&select=*", { headers: sbHeaders() });
    const rows = r.ok ? await r.json() : [];
    return rows && rows[0];
  } catch (_) { return null; }
}
async function patchSettings(uid, body) {
  try {
    await fetch(SB() + "/rest/v1/ads_notify_settings?user_id=eq." + encodeURIComponent(uid), { method: "PATCH", headers: sbHeaders({ Prefer: "return=minimal" }), body: JSON.stringify(body) });
  } catch (_) { /* bỏ qua */ }
}

// Gửi báo cáo cho một người đến giờ. Luôn ghi last_report_date để không thử lại mỗi 15 phút.
async function sendDue(s) {
  const uid = s.user_id;
  let err = null;
  try {
    const rep = await buildReport(uid);
    const texts = rep.texts || ["⚠️ Không lấy được báo cáo hôm nay: " + rep.error];
    for (const text of texts) { const e = await tgSend(s.telegram_bot_token, s.telegram_chat_id, text); if (e) err = e; }
  } catch (e) { err = clean((e && e.message) || "Lỗi không rõ"); }
  await patchSettings(uid, { last_report_date: vnDate(), last_notify_at: new Date().toISOString(), last_notify_error: err, updated_at: new Date().toISOString() });
  return { sent: !err, error: !!err };
}

async function handleDue(req) {
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || !SB()) return fail(503, "Máy chủ chưa cấu hình");
  const secret = await cronSecret();
  if (!secret) return fail(503, "Máy chủ chưa cấu hình");
  if (!sameText(req.headers.get("x-cron-secret"), secret)) return fail(401, "Không được phép");
  let rows = [];
  try {
    const r = await fetch(SB() + "/rest/v1/ads_notify_settings?report_enabled=eq.true&telegram_chat_id=not.is.null&telegram_bot_token=not.is.null&select=*", { headers: sbHeaders() });
    rows = r.ok ? await r.json() : [];
  } catch (_) { rows = []; }
  const today = vnDate(), hm = vnHM();
  const due = (Array.isArray(rows) ? rows : []).filter((s) => s && s.telegram_bot_token && s.telegram_chat_id && s.report_enabled && String(s.report_time || "20:00") <= hm && String(s.last_report_date || "") !== today).slice(0, MAX_DUE_USERS);
  let sent = 0, errors = 0;
  for (const s of due) {
    const r = await sendDue(s);
    if (r.sent) sent++;
    if (r.error) errors++;
  }
  return reply(200, { ok: true, due: due.length, sent, errors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "Chỉ nhận POST");
  let op = "";
  try { const b = await req.clone().json(); op = String((b && b.op) || ""); } catch (_) { op = ""; }
  if (op === "due") return handleDue(req);

  const uid = await verifiedUserId(req);
  if (!uid) return fail(401, "Chưa đăng nhập hoặc phiên đã hết hạn");
  if (op !== "link" && op !== "test" && op !== "report") return fail(400, "Thao tác không hợp lệ");

  const s = await settingsOf(uid);
  const token = s && s.telegram_bot_token;
  if (!token) return fail(400, "Chưa lưu mã bot Telegram. Hãy dán mã bot rồi bấm Lưu trước.");

  if (op === "test") {
    if (!s.telegram_chat_id) return fail(400, "Chưa kết nối chat Telegram. Hãy bấm Kết nối trước.");
    const e = await tgSend(token, s.telegram_chat_id, "🔔 Thử thông báo: kết nối Telegram với adsCGD hoạt động tốt. Khi chế độ tự tắt tạm dừng một chiến dịch, tin sẽ về đây.");
    if (e) return fail(502, e);
    return reply(200, { ok: true });
  }
  if (op === "report") {
    if (!s.telegram_chat_id) return fail(400, "Chưa kết nối chat Telegram. Hãy bấm Kết nối trước.");
    const rep = await buildReport(uid);
    if (rep.error) return fail(rep.status || 502, rep.error);
    for (const text of rep.texts) { const e = await tgSend(token, s.telegram_chat_id, text); if (e) return fail(502, e); }
    return reply(200, { ok: true });
  }

  // op === "link": tìm chat riêng mới nhất đã nhắn cho bot
  const u = await tg(token, "getUpdates", { limit: 50, timeout: 0 });
  if (!u.ok) {
    if (u.error) return fail(502, u.error);
    if (u.status === 401 || u.status === 404) return fail(400, "Mã bot không đúng hoặc đã bị thu hồi. Hãy tạo lại mã ở @BotFather rồi dán lại.");
    if (u.status === 409) return fail(400, "Bot này đang dùng webhook nên không tìm được chat. Hãy dùng bot mới tạo (chưa gắn webhook).");
    return fail(502, clean(u.json.description || ("Telegram trả mã " + u.status)));
  }
  let chat = null;
  for (const up of (u.json.result || [])) {
    const c = up && up.message && up.message.chat;
    if (c && c.type === "private" && c.id != null) chat = String(c.id); // lấy tin MỚI NHẤT (danh sách tăng dần)
  }
  if (!chat) return fail(404, "Chưa thấy tin nhắn nào gửi cho bot. Hãy mở bot trong Telegram, bấm Start (hoặc gửi 1 tin bất kỳ) rồi bấm Kết nối lại.");
  try {
    await fetch(SB() + "/rest/v1/ads_notify_settings?user_id=eq." + encodeURIComponent(uid), {
      method: "PATCH", headers: sbHeaders({ Prefer: "return=minimal" }), body: JSON.stringify({ telegram_chat_id: chat, updated_at: new Date().toISOString() }),
    });
  } catch (_) { return fail(502, "Không lưu được chat ID, thử lại sau."); }
  await tg(token, "sendMessage", { chat_id: chat, text: "✅ Đã kết nối adsCGD. Khi chế độ tự tắt tạm dừng một chiến dịch hoặc token Facebook hết hạn, tin sẽ về đây." });
  return reply(200, { ok: true, chat_tail: chat.slice(-4) });
});
