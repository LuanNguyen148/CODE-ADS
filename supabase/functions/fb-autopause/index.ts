// @ts-nocheck
// Edge Function: TỰ ĐỘNG TẮT từng chiến dịch / nhóm QC / quảng cáo theo QUY TẮC RIÊNG của mục đó — chạy ngầm theo lịch
// (pg_cron mỗi 15 phút), kể cả khi người dùng tắt web. Quy tắc được cài ở tab Bật/Tắt của web (bảng ads_autopause_rules).
//
// Tắt mục (status=PAUSED) khi HÔM NAY:  chi tiêu >= spend_threshold  VÀ  điều kiện kết quả:
//   use_mess  → mess <= mess_max            (mess tính cùng định nghĩa với web, xem MESS_TYPES)
//   use_phone → số điện thoại <= phone_max  (SĐT do người dùng NHẬP TAY, đọc từ ads_user_state; ngày tính theo giờ Việt Nam)
//   match_mode 'all' = mọi điều kiện đang bật phải đúng; 'any' = chỉ cần một đúng. Không bật điều kiện nào = tắt khi chi đạt ngưỡng.
//
// BẢO MẬT
//   - Chỉ lịch của chúng ta gọi được: bắt buộc header x-cron-secret khớp khóa trong Vault (RPC autopause_secret) hoặc biến môi trường
//     AUTOPAUSE_CRON_SECRET (nếu có, ưu tiên). Không có khóa / khóa < 16 ký tự → 503, không chạy.
//   - Token Facebook của từng người chỉ được đọc ở server (service role) và chỉ dùng cho TÀI KHOẢN CỦA CHÍNH HỌ.
//   - Chỉ ghi lên Facebook đúng một thao tác: POST status=PAUSED lên ID của mục. Không bao giờ ACTIVE, không trường nào khác.
//   - Token không bao giờ nằm trong phản hồi, nhật ký, trạng thái hay thông báo lỗi (hàm clean()).
//   - Chạy thử (dry_run=true): chỉ ghi nhật ký "would_pause", KHÔNG tắt thật.
//   - Giới hạn MAX_PER_USER_RUN mục mỗi lần/người; kiểm tra lại số liệu + trạng thái ngay trước khi tắt; bỏ qua mục không ACTIVE.
//   - Không đọc được dữ liệu SĐT thì KHÔNG đoán SĐT=0: bỏ qua quy tắc có xét SĐT.
//
// Triển khai (CHỈ sau khi chủ dự án đồng ý): supabase/autopause.sql → supabase/autopause-secret.sql (khóa trong Vault)
// → npx supabase functions deploy fb-autopause --no-verify-jwt → supabase/autopause-schedule.sql.

const GRAPH = "https://graph.facebook.com/v21.0";
const MESS_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
  "onsite_conversion.messaging_first_reply",
];
const LEVELS = ["campaign", "adset", "ad"];
const DEDUPE_MS = 12 * 3600 * 1000;   // chạy thử: không ghi lặp "would_pause" của cùng một mục trong 12 giờ
const MAX_PER_USER_RUN = 10;          // tối đa số mục xử lý (tắt / ghi chạy thử) mỗi lần chạy cho mỗi người

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

function sameText(a, b) { // so sánh không lộ độ dài khớp
  a = String(a || ""); b = String(b || "");
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
// Gỡ mọi dấu vết token khỏi chuỗi trước khi lưu / trả về
function clean(msg) {
  return String(msg == null ? "" : msg).replace(/access_token=[^&\s"']+/gi, "access_token=***").replace(/EAA[A-Za-z0-9]{8,}/g, "***").replace(/(bot)?[0-9]{6,}:[A-Za-z0-9_-]{30,}/g, "$1***").slice(0, 300);
}
function messOf(actions) {
  if (!Array.isArray(actions)) return 0;
  for (const t of MESS_TYPES) {
    const f = actions.find((a) => a && a.action_type === t);
    if (f && parseFloat(f.value) > 0) return Math.round(parseFloat(f.value));
  }
  return 0;
}
function vnToday() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
// Tổng SĐT người dùng đã nhập tay HÔM NAY cho mục này (lọc theo cấp: campaign_id / adset_id / ad_id)
function phoneOf(state, rule) {
  const byAcc = (state && state.byAcc) || {};
  const acc = byAcc[rule.account_id] || byAcc[String(rule.account_id).replace(/^act_/, "")] || byAcc["act_" + String(rule.account_id).replace(/^act_/, "")];
  const rows = (acc && acc.days && acc.days[vnToday()]) || [];
  const key = rule.level === "adset" ? "adset_id" : rule.level === "ad" ? "ad_id" : "campaign_id";
  let sum = 0;
  for (const r of rows) if (r && String(r[key]) === String(rule.object_id)) sum += parseFloat(r.phone) || 0;
  return Math.round(sum);
}
// Mục đủ điều kiện tắt?
function qualifies(rule, spend, mess, phone) {
  if (!(spend >= Number(rule.spend_threshold))) return false;
  const conds = [];
  if (rule.use_mess) conds.push(mess <= Number(rule.mess_max || 0));
  if (rule.use_phone) conds.push(phone <= Number(rule.phone_max || 0));
  if (!conds.length) return true;
  return rule.match_mode === "any" ? conds.some(Boolean) : conds.every(Boolean);
}

function sbHeaders(extra) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return Object.assign({ apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, extra || {});
}
const SB = () => Deno.env.get("SUPABASE_URL");

async function graphGet(path, token) {
  const url = GRAPH + path + (path.includes("?") ? "&" : "?") + "access_token=" + encodeURIComponent(token);
  const r = await fetch(url);
  let j = {}; try { j = await r.json(); } catch (_) { j = {}; }
  return j;
}
const isTokenError = (e) => e && (e.code === 190 || e.code === 102 || e.type === "OAuthException");

// ----- Thông báo Telegram (bot của chính người dùng; mã bot chỉ đọc được ở server) -----
const LVL_VI = { campaign: "Chiến dịch", adset: "Nhóm QC", ad: "Quảng cáo" };
function fmtMoney(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
// Lý do mục bị tắt, nêu rõ chỉ tiêu không đạt: "chi 250.000đ ≥ ngưỡng 200.000đ nhưng mess 0 ≤ 2"
function reasonOf(rule, spend, mess, phone) {
  const parts = [];
  if (rule.use_mess) parts.push("mess " + mess + " ≤ " + Number(rule.mess_max || 0));
  if (rule.use_phone) parts.push("SĐT " + phone + " ≤ " + Number(rule.phone_max || 0));
  const cond = !parts.length ? "" : " nhưng " + parts.join(rule.match_mode === "any" ? " hoặc " : " và ");
  return "chi " + fmtMoney(spend) + "đ ≥ ngưỡng " + fmtMoney(rule.spend_threshold) + "đ" + cond;
}
function itemLine(it) {
  return "• " + (LVL_VI[it.level] || "Mục") + " “" + String(it.name || it.id || "").slice(0, 80) + "”: chi " + fmtMoney(it.spend) + "đ · mess " + it.mess +
    (it.phone != null ? " · SĐT " + it.phone : "") + (it.note ? " — " + String(it.note).slice(0, 120) : "") +
    (it.reason ? "\n   ↳ Lý do: " + it.reason : "");
}
function listMsg(head, items, foot) {
  const lines = items.slice(0, 15).map(itemLine);
  if (items.length > 15) lines.push("… và " + (items.length - 15) + " mục khác");
  return (head + "\n" + lines.join("\n") + (foot ? "\n\n" + foot : "")).slice(0, 4000);
}
async function tgSend(token, chatId, text) { // trả về null nếu gửi được, hoặc chuỗi lỗi (đã che mã bot)
  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4096), disable_web_page_preview: true }),
    });
    let j = {}; try { j = await r.json(); } catch (_) { j = {}; }
    if (r.ok && j.ok !== false) return null;
    return clean(j.description || ("Telegram trả mã " + r.status));
  } catch (e) { return clean((e && e.message) || "Không kết nối được Telegram"); }
}
async function notifyUser(uid, ev) {
  if (!(ev.paused.length || ev.would.length || ev.failed.length || ev.problems.length)) return;
  let s = null;
  try {
    const r = await fetch(SB() + "/rest/v1/ads_notify_settings?user_id=eq." + encodeURIComponent(uid) + "&select=*", { headers: sbHeaders() });
    const rows = r.ok ? await r.json() : [];
    s = rows && rows[0];
  } catch (_) { s = null; }
  if (!s || !s.telegram_bot_token || !s.telegram_chat_id) return;
  const msgs = [];
  if (s.notify_paused && ev.paused.length) msgs.push(listMsg("⏱ Tự tắt: đã tạm dừng " + ev.paused.length + " mục vì không đạt chỉ tiêu", ev.paused, "Bật lại: mở web → Bật/Tắt → ⏱ Nhật ký tự tắt."));
  if (s.notify_dry && ev.would.length) msgs.push(listMsg("🧪 Chạy thử: SẼ tạm dừng " + ev.would.length + " mục (chưa tắt thật)", ev.would));
  if (s.notify_problem) {
    if (ev.failed.length) msgs.push(listMsg("⚠️ Tự tắt: không tắt được " + ev.failed.length + " mục", ev.failed));
    for (const p of ev.problems) msgs.push(p);
  }
  if (!msgs.length) return;
  let err = null;
  for (const m of msgs) { const e = await tgSend(s.telegram_bot_token, s.telegram_chat_id, m); if (e) err = e; }
  try {
    await fetch(SB() + "/rest/v1/ads_notify_settings?user_id=eq." + encodeURIComponent(uid), { method: "PATCH", headers: sbHeaders({ Prefer: "return=minimal" }), body: JSON.stringify({ last_notify_at: new Date().toISOString(), last_notify_error: err }) });
  } catch (_) { /* bỏ qua */ }
}

// Xử lý toàn bộ quy tắc của MỘT người dùng. Trả về { paused, would, errors }, ghi nhật ký + cập nhật từng quy tắc.
async function processUser(uid, rules) {
  const total = { paused: 0, would: 0, errors: 0 };
  const ev = { paused: [], would: [], failed: [], problems: [] };
  const out = {}; // id quy tắc → các cột cập nhật
  const now = () => new Date().toISOString();
  const setOut = (rule, o) => { out[rule.id] = Object.assign({ last_run_at: now(), last_status: "ok", last_error: null }, out[rule.id] || {}, o); };
  const logRows = [];
  const addLog = (rule, name, spend, mess, phone, action, note) =>
    logRows.push({ user_id: uid, rule_id: rule.id, account_id: rule.account_id, level: rule.level, object_id: String(rule.object_id), object_name: String(name || "").slice(0, 200), spend, mess, phone, action, note: note ? clean(note) : null });

  try {
    main: {
    // 1. Token của chính người dùng (chỉ đọc ở server)
    let token = "";
    try {
      const ur = await fetch(SB() + "/auth/v1/admin/users/" + encodeURIComponent(uid), { headers: sbHeaders() });
      const u = ur.ok ? await ur.json() : null;
      const t = u && u.user_metadata && u.user_metadata.fb_token;
      token = typeof t === "string" ? t.trim() : "";
    } catch (_) { token = ""; }
    if (!token) { rules.forEach((r) => setOut(r, { last_status: "no_token", last_error: "Tài khoản chưa có token Facebook" })); break main; }

    // 2. Quy tắc hợp lệ; dữ liệu SĐT (chỉ đọc khi có quy tắc xét SĐT)
    const valid = [];
    for (const r of rules) {
      if (!(Number(r.spend_threshold) > 0) || LEVELS.indexOf(r.level) < 0 || !r.object_id || !actIdOf(r.account_id)) setOut(r, { last_status: "bad_rule", last_error: "Quy tắc không hợp lệ" });
      else valid.push(r);
    }
    let state = null, stateOk = true;
    if (valid.some((r) => r.use_phone)) {
      try {
        const sr = await fetch(SB() + "/rest/v1/ads_user_state?user_id=eq." + encodeURIComponent(uid) + "&select=state", { headers: sbHeaders() });
        if (!sr.ok) throw new Error("state " + sr.status);
        const rows = await sr.json();
        state = (rows && rows[0] && rows[0].state) || {};
      } catch (_) { stateOk = false; }
    }
    // 3. Chạy thử: nhớ các mục đã ghi gần đây để không ghi lặp
    let recent = new Set();
    if (valid.some((r) => r.dry_run)) {
      try {
        const since = new Date(Date.now() - DEDUPE_MS).toISOString();
        const lr = await fetch(SB() + "/rest/v1/ads_autopause_log?user_id=eq." + encodeURIComponent(uid) + "&action=eq.would_pause&at=gte." + encodeURIComponent(since) + "&select=object_id", { headers: sbHeaders() });
        recent = new Set(((lr.ok ? await lr.json() : []) || []).map((x) => String(x.object_id)));
      } catch (_) { /* không có nhật ký cũ thì ghi bình thường */ }
    }

    // 4. Gom theo (tài khoản, cấp) để chỉ gọi insights một lần cho mỗi nhóm
    const groups = {};
    for (const r of valid) { const k = actIdOf(r.account_id) + "|" + r.level; (groups[k] = groups[k] || []).push(r); }
    let done = 0, tokenDead = false;
    for (const gk of Object.keys(groups)) {
      if (tokenDead) break;
      const [acc, level] = gk.split("|");
      const ins = await graphGet("/" + acc + "/insights?level=" + level + "&fields=" + level + "_id," + level + "_name,spend,actions&date_preset=today&limit=500", token);
      if (ins.error) {
        if (isTokenError(ins.error)) { tokenDead = true; rules.forEach((r) => setOut(r, { last_status: "token_error", last_error: clean(ins.error.message) })); break; }
        groups[gk].forEach((r) => setOut(r, { last_status: "error", last_error: clean(ins.error.message) })); total.errors++; continue;
      }
      const byId = {};
      for (const row of ins.data || []) if (row && row[level + "_id"] != null) byId[String(row[level + "_id"])] = row;

      for (const rule of groups[gk]) {
        let phone = null;
        if (rule.use_phone) {
          if (!stateOk) { setOut(rule, { last_status: "error", last_error: "Không đọc được dữ liệu số điện thoại" }); continue; }
          phone = phoneOf(state, rule);
        }
        const id = String(rule.object_id), row = byId[id];
        const spend = row ? parseFloat(row.spend) || 0 : 0, mess = row ? messOf(row.actions) : 0;
        setOut(rule, { last_spend: spend, last_mess: mess, last_phone: phone });
        if (!qualifies(rule, spend, mess, phone) || done >= MAX_PER_USER_RUN) continue;

        // Chỉ tắt mục đang ACTIVE, và kiểm tra lại số liệu mới nhất ngay trước khi tắt
        const st = await graphGet("/" + encodeURIComponent(id) + "?fields=effective_status", token);
        if (st.error) { if (isTokenError(st.error)) { tokenDead = true; rules.forEach((r) => setOut(r, { last_status: "token_error", last_error: clean(st.error.message) })); break; } continue; }
        if (st.effective_status !== "ACTIVE") continue;
        const re = await graphGet("/" + encodeURIComponent(id) + "/insights?fields=spend,actions&date_preset=today", token);
        const r2 = re && re.data && re.data[0];
        const spend2 = r2 ? parseFloat(r2.spend) || 0 : 0, mess2 = r2 ? messOf(r2.actions) : 0;
        if (!r2 || !qualifies(rule, spend2, mess2, phone)) continue;
        const name = rule.object_name || (row && row[level + "_name"]);

        if (rule.dry_run) {
          if (recent.has(id)) continue;
          addLog(rule, name, spend2, mess2, phone, "would_pause", "Chạy thử: chưa tắt thật");
          ev.would.push({ level, id, name, spend: spend2, mess: mess2, phone, reason: reasonOf(rule, spend2, mess2, phone) });
          total.would++; done++; continue;
        }
        let pr = {};
        try {
          const r = await fetch(GRAPH + "/" + encodeURIComponent(id), {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "status=PAUSED&access_token=" + encodeURIComponent(token),
          });
          pr = await r.json();
        } catch (e) { pr = { error: { message: "Lỗi kết nối" } }; }
        if (pr && pr.success) { addLog(rule, name, spend2, mess2, phone, "paused", "Tự tắt: đạt điều kiện của quy tắc"); total.paused++; ev.paused.push({ level, id, name, spend: spend2, mess: mess2, phone, reason: reasonOf(rule, spend2, mess2, phone) }); }
        else {
          const em = (pr && pr.error && pr.error.message) || "Facebook không xác nhận";
          addLog(rule, name, spend2, mess2, phone, "error", em); total.errors++; ev.failed.push({ level, id, name, spend: spend2, mess: mess2, phone, note: clean(em), reason: reasonOf(rule, spend2, mess2, phone) }); setOut(rule, { last_status: "error", last_error: clean(em) });
        }
        done++;
      }
    }
    } // hết khối main
  } catch (e) {
    rules.forEach((r) => setOut(r, { last_status: "error", last_error: clean(e && e.message) })); total.errors++;
  }

  if (logRows.length) {
    try { await fetch(SB() + "/rest/v1/ads_autopause_log", { method: "POST", headers: sbHeaders({ Prefer: "return=minimal" }), body: JSON.stringify(logRows) }); } catch (_) { /* nhật ký lỗi không làm hỏng lần chạy */ }
  }
  const flip = (st) => rules.some((r) => out[r.id] && out[r.id].last_status === st && r.last_status !== st);
  if (flip("token_error")) ev.problems.push("⚠️ Tự tắt KHÔNG chạy được: token Facebook đã hết hạn hoặc bị từ chối. Hãy dán token mới ở mục Tài khoản của web.");
  if (flip("no_token")) ev.problems.push("⚠️ Tự tắt KHÔNG chạy được: tài khoản chưa có token Facebook. Hãy dán token ở mục Tài khoản của web.");
  total.events = ev;
  for (const r of rules) {
    const body = out[r.id] || { last_run_at: now(), last_status: "ok", last_error: null };
    try {
      await fetch(SB() + "/rest/v1/ads_autopause_rules?id=eq." + encodeURIComponent(r.id), { method: "PATCH", headers: sbHeaders({ Prefer: "return=minimal" }), body: JSON.stringify(body) });
    } catch (_) { /* bỏ qua */ }
  }
  return total;
}
function actIdOf(x) { const d = String(x || "").replace(/^act_/, "").replace(/\D/g, ""); return d ? "act_" + d : ""; }

// Khóa gọi hàm: ưu tiên biến môi trường AUTOPAUSE_CRON_SECRET (nếu có), không thì lấy trong Vault qua RPC autopause_secret
// (chỉ service_role gọi được; khóa do migration tạo ngẫu nhiên, không ai xem được). Khóa rỗng/ngắn < 16 ký tự bị từ chối.
async function cronSecret() {
  const env = Deno.env.get("AUTOPAUSE_CRON_SECRET");
  let s = env || "";
  if (!s) {
    try {
      const r = await fetch(SB() + "/rest/v1/rpc/autopause_secret", { method: "POST", headers: sbHeaders(), body: "{}" });
      if (r.ok) { const v = await r.json(); s = typeof v === "string" ? v : ""; }
    } catch (_) { s = ""; }
  }
  return s.length >= 16 ? s : "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Chỉ nhận POST" }, 405);
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || !SB()) return json({ error: "Máy chủ chưa cấu hình" }, 503);
  const secret = await cronSecret();
  if (!secret) return json({ error: "Máy chủ chưa cấu hình" }, 503);
  if (!sameText(req.headers.get("x-cron-secret"), secret)) return json({ error: "Không được phép" }, 401);

  let rules = [];
  try {
    const r = await fetch(SB() + "/rest/v1/ads_autopause_rules?enabled=eq.true&select=*", { headers: sbHeaders() });
    rules = r.ok ? await r.json() : [];
  } catch (_) { rules = []; }

  const byUser = {};
  for (const r of rules || []) (byUser[r.user_id] = byUser[r.user_id] || []).push(r);
  const total = { ok: true, users: 0, rules: (rules || []).length, paused: 0, would_pause: 0, errors: 0 };
  for (const uid of Object.keys(byUser)) {
    total.users++;
    const res = await processUser(uid, byUser[uid]);
    total.paused += res.paused; total.would_pause += res.would; total.errors += res.errors;
    try { await notifyUser(uid, res.events); } catch (_) { /* thông báo lỗi không làm hỏng lần chạy */ }
  }
  return json(total);
});
