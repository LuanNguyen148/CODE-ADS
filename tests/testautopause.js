// Edge Function fb-autopause (chạy ngầm theo lịch): tự TẮT từng chiến dịch / nhóm QC / quảng cáo theo quy tắc riêng
// (chi tiêu hôm nay >= ngưỡng VÀ điều kiện mess / số điện thoại). Chạy index.ts bằng Node với Deno + fetch giả.
const fs = require('fs');
let src = fs.readFileSync(process.argv[2], 'utf8');
if (/^\s*(import|export)\s/m.test(src)) throw new Error('fb-autopause không được dùng import/export (để test bằng Node)');

let handler; const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'SERVICEKEY', AUTOPAUSE_CRON_SECRET: 'cron-secret-0123456789' };
global.Deno = { serve: h => { handler = h; }, env: { get: k => env[k] } };

// "hôm nay" theo giờ Việt Nam (UTC+7) — khóa ngày trong state do người dùng nhập tay SĐT
const vnToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
let S;
const rule = (o = {}) => Object.assign({ id: 1, user_id: 'U1', account_id: 'act_111', level: 'campaign', object_id: 'C1', object_name: 'Camp 1', enabled: true, dry_run: false, spend_threshold: 200000, use_mess: true, mess_max: 0, use_phone: false, phone_max: 0, match_mode: 'all' }, o);
const row = (lvl, id, spend, actions = [], name) => ({ [lvl + '_id']: id, [lvl + '_name']: name || ('N' + id), spend: String(spend), actions });
const reset = (over = {}) => {
  S = Object.assign({
    rules: [rule()], users: { U1: { user_metadata: { fb_token: 'EAAuser1TOKEN' } } },
    insights: { campaign: [row('campaign', 'C1', 250000)], adset: [], ad: [] },
    status: {}, recheck: null, states: {}, stateFail: false, vault: undefined, rpcCalls: [],
    notify: {}, tgSends: [], tgMode: 'ok', notifyPatches: [],
    graphPosts: [], graphGets: [], logRows: [], patches: [], recentLog: [], graphError: null, postError: null,
  }, over);
};
global.fetch = async (url, init = {}) => {
  url = String(url); const method = (init.method || 'GET').toUpperCase();
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st });
  if (url.startsWith(env.SUPABASE_URL + '/rest/v1/ads_autopause_rules')) {
    if (method === 'GET') return json(/enabled=eq\.true/.test(url) ? S.rules.filter(r => r.enabled) : S.rules);
    S.patches.push({ url, id: (url.match(/id=eq\.(\d+)/) || [])[1], body: JSON.parse(init.body) }); return json([]);
  }
  if (url.startsWith(env.SUPABASE_URL + '/rest/v1/ads_autopause_log')) {
    if (method === 'GET') return json(S.recentLog);
    JSON.parse(init.body).forEach(r => S.logRows.push(r)); return new Response('', { status: 201 });
  }
  if (url.startsWith(env.SUPABASE_URL + '/rest/v1/ads_user_state')) {
    if (S.stateFail) return json({ message: 'boom' }, 500);
    const uid = (url.match(/user_id=eq\.([^&]+)/) || [])[1];
    return json(S.states[uid] ? [{ state: S.states[uid] }] : []);
  }
  if (url.startsWith(env.SUPABASE_URL + '/rest/v1/ads_notify_settings')) { // cài đặt thông báo Telegram (chỉ máy chủ đọc được mã bot)
    const uid = (url.match(/user_id=eq\.([^&]+)/) || [])[1];
    if (method === 'GET') return json(S.notify[uid] ? [Object.assign({ user_id: uid }, S.notify[uid])] : []);
    S.notifyPatches.push({ uid, body: JSON.parse(init.body) }); return json([]);
  }
  if (url.startsWith('https://api.telegram.org/bot')) {
    const bot = (url.match(/\/bot([^/]+)\//) || [])[1];
    if (S.tgMode === 'throw') throw new Error('request to ' + url + ' failed, reason: ECONNRESET');
    S.tgSends.push({ bot, body: JSON.parse(init.body) });
    if (S.tgMode === 'fail') return json({ ok: false, description: 'Forbidden: bot was blocked by the user' }, 403);
    return json({ ok: true, result: {} });
  }
  if (url === env.SUPABASE_URL + '/rest/v1/rpc/autopause_secret') { // khóa lưu trong Vault, chỉ service_role gọi được
    S.rpcCalls.push({ method, auth: (init.headers || {}).Authorization, apikey: (init.headers || {}).apikey });
    if (S.vault === undefined) return json({ message: 'not found' }, 404);
    if (S.vault === 'FAIL') return json({ message: 'boom' }, 500);
    return json(S.vault);
  }
  const um = url.match(/\/auth\/v1\/admin\/users\/([^/?]+)/);
  if (um) return S.users[um[1]] ? json(S.users[um[1]]) : json({}, 404);
  if (url.startsWith('https://graph.facebook.com/v21.0/')) {
    const tok = (url.match(/access_token=([^&]+)/) || [])[1] || ((init.body || '').match(/access_token=([^&]+)/) || [])[1] || '';
    if (method === 'POST') { S.graphPosts.push({ url, body: String(init.body || ''), tok }); return S.postError ? json({ error: { message: S.postError } }, 400) : json({ success: true }); }
    S.graphGets.push({ url: decodeURIComponent(url), tok });
    if (S.graphError) return json({ error: S.graphError }, 400);
    const lm = url.match(/\/act_\d+\/insights\?level=(campaign|adset|ad)&/);
    if (lm) return json({ data: S.insights[lm[1]] || [] });
    const im = url.match(/graph\.facebook\.com\/v21\.0\/(\w+)\/insights/);
    if (im) { const all = [].concat(S.insights.campaign, S.insights.adset, S.insights.ad); const r = (S.recheck && S.recheck[im[1]]) || all.find(x => [x.campaign_id, x.adset_id, x.ad_id].includes(im[1])); return json({ data: r ? [r] : [] }); }
    const sm = url.match(/graph\.facebook\.com\/v21\.0\/(\w+)\?fields=effective_status/);
    if (sm) return json({ id: sm[1], effective_status: S.status[sm[1]] || 'ACTIVE' });
  }
  return json({ error: 'unmocked ' + url }, 500);
};
new Function(src)();

const call = (secret, method = 'POST') => handler(new Request('https://x.supabase.co/functions/v1/fb-autopause', { method, headers: secret === undefined ? {} : { 'x-cron-secret': secret } }));
const run = async () => { const r = await call('cron-secret-0123456789'); const t = await r.text(); return { status: r.status, text: t }; };
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
const msg = [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '3' }];
const patchOf = id => S.patches.filter(p => String(p.id) === String(id)).pop();

(async () => {
  // --- bảo vệ ---
  reset(); let r = await call('sai-secret'); check(r.status === 401 && S.graphPosts.length === 0 && S.graphGets.length === 0, 'sai secret → 401, không gọi gì');
  reset(); r = await call(undefined); check(r.status === 401, 'không có secret → 401');
  reset(); delete env.AUTOPAUSE_CRON_SECRET; r = await call('cron-secret-0123456789'); check(r.status === 503, 'máy chủ chưa đặt secret → 503 (đóng, không chạy bừa)'); env.AUTOPAUSE_CRON_SECRET = 'cron-secret-0123456789';
  reset(); r = await call('cron-secret-0123456789', 'GET'); check(r.status === 405, 'chỉ nhận POST (lịch gọi) → GET bị 405');

  // --- khóa bí mật lưu trong Vault (không cần đặt biến môi trường bằng tay) ---
  const saveEnv = env.AUTOPAUSE_CRON_SECRET; delete env.AUTOPAUSE_CRON_SECRET;
  reset({ vault: 'vault-khoa-rat-dai-0123456789' });
  r = await call('vault-khoa-rat-dai-0123456789'); let vt = await r.text();
  check(r.status === 200 && JSON.parse(vt).ok === true, 'chưa có biến môi trường nhưng có khóa trong Vault: gọi đúng khóa → 200');
  check(S.rpcCalls.length === 1 && S.rpcCalls[0].method === 'POST' && S.rpcCalls[0].auth === 'Bearer SERVICEKEY' && S.rpcCalls[0].apikey === 'SERVICEKEY', 'đọc khóa bằng RPC autopause_secret với quyền service_role (POST)');
  check(!vt.includes('vault-khoa-rat-dai'), 'phản hồi không chứa khóa');
  reset({ vault: 'vault-khoa-rat-dai-0123456789' }); r = await call('sai-khoa'); vt = await r.text();
  check(r.status === 401 && !vt.includes('vault-khoa-rat-dai') && S.graphGets.length === 0, 'khóa Vault: gọi sai khóa → 401, không lộ khóa, không gọi Facebook');
  reset({ vault: 'vault-khoa-rat-dai-0123456789' }); r = await call(undefined); check(r.status === 401, 'khóa Vault: không gửi khóa → 401');
  reset({ vault: undefined }); r = await call('bat-ky'); check(r.status === 503, 'không có khóa ở đâu cả (Vault chưa có) → 503');
  reset({ vault: 'FAIL' }); r = await call('bat-ky'); check(r.status === 503, 'Vault lỗi → 503 (đóng, không chạy bừa)');
  reset({ vault: '' }); r = await call(''); check(r.status === 503, 'khóa Vault rỗng → 503 (không được coi khóa rỗng là hợp lệ)');
  reset({ vault: 'ngan' }); r = await call('ngan'); check(r.status === 503, 'khóa Vault quá ngắn (< 16 ký tự) → 503 (không nhận khóa yếu)');
  env.AUTOPAUSE_CRON_SECRET = 'bien-moi-truong-1234567890'; reset({ vault: 'vault-khoa-rat-dai-0123456789' });
  r = await call('vault-khoa-rat-dai-0123456789'); check(r.status === 401 && S.rpcCalls.length === 0, 'có cả hai: biến môi trường được ưu tiên (khóa Vault không còn hiệu lực, không cần gọi Vault)');
  r = await call('bien-moi-truong-1234567890'); check(r.status === 200, 'có cả hai: dùng đúng khóa biến môi trường → 200');
  env.AUTOPAUSE_CRON_SECRET = 'ngan'; reset(); r = await call('ngan'); check(r.status === 503, 'biến môi trường quá ngắn (< 16 ký tự) cũng bị từ chối → 503');
  env.AUTOPAUSE_CRON_SECRET = saveEnv; // khóa dùng cho các phép thử bên dưới là "cron-secret-0123456789" 

  // --- chạy thử / chạy thật ---
  reset({ rules: [rule({ dry_run: true })] }); let out = await run();
  check(S.graphPosts.length === 0, 'chạy thử: KHÔNG gửi lệnh tắt nào lên Facebook');
  check(S.logRows.length === 1 && S.logRows[0].action === 'would_pause' && S.logRows[0].object_id === 'C1' && S.logRows[0].spend === 250000 && S.logRows[0].mess === 0 && S.logRows[0].rule_id === 1 && S.logRows[0].level === 'campaign', 'chạy thử: ghi nhật ký would_pause (C1, chi 250000, mess 0, rule_id, level)');
  check(patchOf(1) && patchOf(1).body.last_status === 'ok' && patchOf(1).body.last_spend === 250000 && patchOf(1).body.last_mess === 0 && patchOf(1).body.last_run_at, 'ghi lại lần chạy + số liệu kiểm tra (last_spend, last_mess) vào quy tắc');
  reset(); out = await run();
  check(S.graphPosts.length === 1 && /\/v21\.0\/C1(\?|$)/.test(S.graphPosts[0].url) && /status=PAUSED/.test(S.graphPosts[0].body), 'chạy thật: tắt đúng C1 bằng status=PAUSED');
  check(S.logRows.length === 1 && S.logRows[0].action === 'paused' && S.logRows[0].user_id === 'U1', 'chạy thật: ghi nhật ký "paused" của đúng người dùng');
  check(S.graphPosts.every(p => /^status=PAUSED$/.test(p.body.replace(/&?access_token=[^&]*/, ''))), 'mọi lệnh ghi lên Facebook CHỈ là status=PAUSED (không bao giờ ACTIVE hay trường khác)');
  check(S.graphPosts.every(p => p.tok === 'EAAuser1TOKEN'), 'dùng đúng token của chính người dùng đó');

  // --- 3 cấp: chiến dịch / nhóm QC / quảng cáo ---
  reset({ rules: [rule({ id: 2, level: 'adset', object_id: 'A1' }), rule({ id: 3, level: 'ad', object_id: 'AD1' })], insights: { campaign: [], adset: [row('adset', 'A1', 300000)], ad: [row('ad', 'AD1', 260000)] } }); await run();
  check(S.graphGets.some(g => /level=adset/.test(g.url)) && S.graphGets.some(g => /level=ad&/.test(g.url)), 'quy tắc cấp nhóm QC / quảng cáo lấy số liệu đúng cấp (level=adset, level=ad)');
  check(S.graphPosts.map(p => p.url.match(/v21\.0\/(\w+)/)[1]).sort().join() === 'A1,AD1', 'tắt đúng nhóm A1 và quảng cáo AD1');

  // --- điều kiện tiền ---
  reset({ insights: { campaign: [row('campaign', 'C1', 199999)], adset: [], ad: [] } }); await run();
  check(S.graphPosts.length === 0, 'chi 199.999 (dưới ngưỡng 200.000) → không tắt');
  reset({ insights: { campaign: [row('campaign', 'C1', 200000)], adset: [], ad: [] } }); await run();
  check(S.graphPosts.length === 1, 'chi đúng 200.000 (bằng ngưỡng) → tắt');
  reset({ insights: { campaign: [], adset: [], ad: [] } }); await run();
  check(S.graphPosts.length === 0 && patchOf(1) && patchOf(1).body.last_spend === 0, 'mục chưa có chi tiêu hôm nay → không tắt, ghi last_spend=0');

  // --- điều kiện mess ---
  reset({ insights: { campaign: [row('campaign', 'C1', 900000, msg)], adset: [], ad: [] } }); await run();
  check(S.graphPosts.length === 0, 'mess=3 > mess_max=0 → không tắt dù chi nhiều');
  reset({ rules: [rule({ mess_max: 5 })], insights: { campaign: [row('campaign', 'C1', 900000, msg)], adset: [], ad: [] } }); await run();
  check(S.graphPosts.length === 1, 'mess=3 ≤ mess_max=5 → tắt (đặt được ngưỡng mess)');
  reset({ insights: { campaign: [row('campaign', 'C1', 900000, [{ action_type: 'onsite_conversion.messaging_first_reply', value: '2' }])], adset: [], ad: [] } }); await run();
  check(S.graphPosts.length === 0, 'mess tính cùng định nghĩa với web (messaging_first_reply cũng là mess)');

  // --- điều kiện số điện thoại (nhập tay, lấy từ ads_user_state) ---
  const stateWith = (phone) => ({ byAcc: { act_111: { days: { [vnToday()]: [{ campaign_id: 'C1', adset_id: 'A1', ad_id: 'AD1', phone: String(phone) }, { campaign_id: 'C1', adset_id: 'A2', ad_id: 'AD2', phone: '1' }, { campaign_id: 'C9', ad_id: 'AD9', phone: '50' }], '2000-01-01': [{ campaign_id: 'C1', phone: '99' }] } } } });
  reset({ rules: [rule({ use_phone: true, phone_max: 0 })], states: { U1: stateWith(0) } }); await run();
  check(S.graphPosts.length === 0 && patchOf(1).body.last_phone === 1, 'SĐT: cộng các dòng của chiến dịch C1 hôm nay (0+1=1), bỏ ngày khác và chiến dịch khác → 1 > 0 nên không tắt (mode all)');
  reset({ rules: [rule({ use_phone: true, phone_max: 1 })], states: { U1: stateWith(0) } }); await run();
  check(S.graphPosts.length === 1, 'SĐT=1 ≤ phone_max=1 và mess=0 ≤ 0 → tắt (cả hai đúng)');
  reset({ rules: [rule({ use_phone: true, phone_max: 0, match_mode: 'any' })], states: { U1: stateWith(0) } }); await run();
  check(S.graphPosts.length === 1, 'mode any: mess=0 đúng dù SĐT=1 > 0 → chỉ cần một điều kiện đúng → tắt');
  reset({ rules: [rule({ use_phone: true, phone_max: 0, match_mode: 'any' })], states: { U1: stateWith(0) }, insights: { campaign: [row('campaign', 'C1', 250000, msg)], adset: [], ad: [] } }); await run();
  check(S.graphPosts.length === 0, 'mode any: cả mess (3>0) lẫn SĐT (1>0) đều sai → không tắt');
  reset({ rules: [rule({ level: 'ad', object_id: 'AD1', use_phone: true, phone_max: 0 })], states: { U1: stateWith(0) }, insights: { campaign: [], adset: [], ad: [row('ad', 'AD1', 250000)] } }); await run();
  check(S.graphPosts.length === 1 && patchOf(1).body.last_phone === 0, 'SĐT cấp quảng cáo: chỉ cộng dòng có ad_id=AD1 (=0) → tắt');
  reset({ rules: [rule({ use_phone: true })], stateFail: true }); await run();
  check(S.graphPosts.length === 0 && patchOf(1).body.last_status === 'error', 'không đọc được dữ liệu SĐT → KHÔNG tắt (không đoán SĐT=0), last_status=error');
  reset({ rules: [rule({ use_phone: true })], states: {} }); await run();
  check(S.graphPosts.length === 1, 'chưa có dữ liệu ngày hôm nay của người dùng → SĐT=0 (chưa nhập) → vẫn xét như 0');
  reset({ rules: [rule({ use_mess: false, use_phone: false })], insights: { campaign: [row('campaign', 'C1', 250000, msg)], adset: [], ad: [] } }); await run();
  check(S.graphPosts.length === 1, 'không chọn mess/SĐT: tắt ngay khi chi đạt ngưỡng (kể cả đã có mess)');
  reset({ rules: [rule()], stateFail: true }); await run();
  check(S.graphPosts.length === 1, 'quy tắc không xét SĐT thì không cần đọc dữ liệu SĐT (lỗi đọc không ảnh hưởng)');

  // --- trạng thái, kiểm tra lại, giới hạn ---
  reset({ status: { C1: 'PAUSED' } }); await run();
  check(S.graphPosts.length === 0, 'mục không ở trạng thái ACTIVE → bỏ qua (không tắt cái đã tắt)');
  reset({ recheck: { C1: row('campaign', 'C1', 260000, [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '1' }]) } }); await run();
  check(S.graphPosts.length === 0 && S.logRows.length === 0, 'kiểm tra lại ngay trước khi tắt: mess vừa xuất hiện → KHÔNG tắt');
  reset({ rules: Array.from({ length: 14 }, (_, i) => rule({ id: 100 + i, object_id: 'C' + (10 + i) })), insights: { campaign: Array.from({ length: 14 }, (_, i) => row('campaign', 'C' + (10 + i), 300000)), adset: [], ad: [] } }); await run();
  check(S.graphPosts.length === 10, 'giới hạn 10 lần tắt mỗi lần chạy mỗi người (14 quy tắc đủ điều kiện, chỉ tắt 10)');
  reset({ rules: [rule({ dry_run: true })], recentLog: [{ object_id: 'C1' }] }); await run();
  check(S.logRows.length === 0, 'chạy thử: C1 đã có "would_pause" gần đây → không ghi lặp mỗi 15 phút');

  // --- lỗi Facebook / token ---
  reset({ graphError: { code: 190, message: 'Error validating access token: Session has expired' } }); out = await run();
  check(S.graphPosts.length === 0 && patchOf(1).body.last_status === 'token_error', 'token hết hạn (mã 190) → không tắt gì, last_status=token_error');
  check(!/EAAuser1TOKEN/.test(out.text) && !JSON.stringify(S.patches).includes('EAAuser1TOKEN') && !JSON.stringify(S.logRows).includes('EAAuser1TOKEN'), 'token không lọt vào phản hồi, nhật ký hay trạng thái');
  reset({ users: { U1: { user_metadata: {} } } }); await run();
  check(S.graphGets.length === 0 && patchOf(1).body.last_status === 'no_token', 'người dùng chưa có token → last_status=no_token, không gọi Facebook');
  reset({ postError: 'Permissions error' }); await run();
  check(S.logRows.length === 1 && S.logRows[0].action === 'error' && /Permissions/.test(S.logRows[0].note || ''), 'Facebook từ chối lệnh tắt → ghi nhật ký "error" kèm lý do');
  reset({ rules: [rule({ spend_threshold: 0 })] }); await run();
  check(S.graphPosts.length === 0 && patchOf(1).body.last_status === 'bad_rule', 'ngưỡng tiền không hợp lệ → bỏ qua, last_status=bad_rule');

  // --- cách ly người dùng, quy tắc đang tắt ---
  reset({ rules: [rule({ id: 1, user_id: 'U1' }), rule({ id: 2, user_id: 'U2' })], users: { U1: { user_metadata: { fb_token: 'EAAuser1TOKEN' } }, U2: { user_metadata: { fb_token: 'EAAuser2TOKEN' } } } }); await run();
  check(S.graphGets.some(g => g.tok === 'EAAuser1TOKEN') && S.graphGets.some(g => g.tok === 'EAAuser2TOKEN') && new Set(S.logRows.map(l => l.user_id)).size === 2, 'hai người dùng: mỗi người dùng token riêng, nhật ký ghi đúng chủ');
  reset({ rules: [rule({ enabled: false })] }); await run();
  check(S.graphGets.length === 0 && S.graphPosts.length === 0, 'quy tắc đang TẮT → không đụng tới Facebook');

  // ================= THÔNG BÁO TELEGRAM =================
  const BOT1 = '123456789:AAEhBOweik6ad9r_QXMENQjcrGbqCr4K-1', BOT2 = '987654321:AAFzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-2';
  const nset = (o = {}) => Object.assign({ telegram_bot_token: BOT1, telegram_chat_id: '555', notify_paused: true, notify_problem: true, notify_dry: false }, o);
  const twoCamps = n => ({ rules: Array.from({ length: n }, (_, i) => rule({ id: 300 + i, object_id: 'C' + (50 + i), object_name: 'Camp ' + (50 + i) })), insights: { campaign: Array.from({ length: n }, (_, i) => row('campaign', 'C' + (50 + i), 250000 + i * 1000)), adset: [], ad: [] } });

  reset({ notify: { U1: nset() } }); out = await run();
  check(S.tgSends.length === 1 && S.tgSends[0].body.chat_id === '555' && S.tgSends[0].bot === BOT1, 'tắt thật → gửi ĐÚNG 1 tin Telegram tới chat ID của người dùng bằng bot của họ');
  const tx = S.tgSends[0] ? S.tgSends[0].body.text : '';
  check(/đã tạm dừng/i.test(tx) && /Camp 1/.test(tx) && /250\.000/.test(tx) && /mess 0/.test(tx) && /Chiến dịch/.test(tx), 'tin báo có: "đã tạm dừng", tên mục, cấp, chi 250.000, mess 0 (thực tế: ' + JSON.stringify(tx.slice(0, 120)) + ')');
  check(!/EAAuser1TOKEN/.test(tx) && !out.text.includes(BOT1) && !JSON.stringify(S.logRows).includes(BOT1) && !JSON.stringify(S.patches).includes(BOT1), 'mã bot và token Facebook không lọt vào tin nhắn, phản hồi, nhật ký hay trạng thái');
  check(S.notifyPatches.length === 1 && S.notifyPatches[0].body.last_notify_at && S.notifyPatches[0].body.last_notify_error === null, 'ghi lại lần gửi gần nhất (last_notify_at, không lỗi)');
  // ---- tin báo nêu rõ LÝ DO không đạt chỉ tiêu ----
  check(/vì không đạt chỉ tiêu/i.test(tx), 'tiêu đề tin nói rõ "vì không đạt chỉ tiêu"');
  check(/Lý do: chi 250\.000đ ≥ ngưỡng 200\.000đ nhưng mess 0 ≤ 0/.test(tx), 'mỗi mục có dòng lý do: "chi 250.000đ ≥ ngưỡng 200.000đ nhưng mess 0 ≤ 0" (thực tế: ' + JSON.stringify((tx.match(/Lý do:[^\n]*/) || [''])[0]) + ')');
  reset({ rules: [rule({ mess_max: 2 })], insights: { campaign: [row('campaign', 'C1', 260000, [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '1' }])], adset: [], ad: [] }, notify: { U1: nset() } }); await run();
  check(/Lý do: chi 260\.000đ ≥ ngưỡng 200\.000đ nhưng mess 1 ≤ 2/.test((S.tgSends[0] || { body: { text: '' } }).body.text), 'ngưỡng mess tùy chỉnh: "nhưng mess 1 ≤ 2"');
  reset({ rules: [rule({ use_phone: true, phone_max: 0, match_mode: 'any' })], states: { U1: { byAcc: { act_111: { days: { [vnToday()]: [{ campaign_id: 'C1', phone: '1' }] } } } } }, notify: { U1: nset() } }); await run();
  check(/Lý do:[^\n]*mess 0 ≤ 0 hoặc SĐT 1 ≤ 0/.test((S.tgSends[0] || { body: { text: '' } }).body.text), 'xét cả mess và SĐT, chế độ HOẶC: "mess 0 ≤ 0 hoặc SĐT 1 ≤ 0"');
  reset({ rules: [rule({ use_mess: false, use_phone: false })], notify: { U1: nset() } }); await run();
  check(/Lý do: chi 250\.000đ ≥ ngưỡng 200\.000đ/.test((S.tgSends[0] || { body: { text: '' } }).body.text) && !/nhưng/.test((S.tgSends[0] || { body: { text: '' } }).body.text), 'quy tắc chỉ theo tiền: lý do chỉ nêu chi tiêu ≥ ngưỡng (không có điều kiện kết quả)');
  reset({ rules: [rule({ dry_run: true })], notify: { U1: nset({ notify_dry: true }) } }); await run();
  check(/Lý do:/.test((S.tgSends[0] || { body: { text: '' } }).body.text), 'tin chạy thử cũng nêu lý do (sẽ tắt vì gì)');
  reset({ postError: 'Permissions error', notify: { U1: nset() } }); await run();
  check(/Lý do:/.test((S.tgSends[0] || { body: { text: '' } }).body.text) && /Permissions/.test((S.tgSends[0] || { body: { text: '' } }).body.text), 'tin "không tắt được" vẫn nêu lý do cần tắt + lý do Facebook từ chối');
  reset({ notify: { U1: nset() } }); await run();

  reset(); await run(); check(S.tgSends.length === 0, 'người dùng chưa cài Telegram → không gửi gì, lần chạy vẫn bình thường (tắt vẫn hoạt động)');
  reset({ notify: { U1: nset({ telegram_chat_id: null }) } }); await run(); check(S.tgSends.length === 0, 'có mã bot nhưng chưa kết nối chat ID → không gửi');
  reset({ notify: { U1: nset({ telegram_bot_token: null }) } }); await run(); check(S.tgSends.length === 0, 'có chat ID nhưng không có mã bot → không gửi');
  reset({ notify: { U1: nset({ notify_paused: false }) } }); await run(); check(S.tgSends.length === 0 && S.graphPosts.length === 1, 'tắt "báo khi tắt" → không gửi, nhưng vẫn TẮT chiến dịch');
  reset(Object.assign(twoCamps(3), { notify: { U1: nset() } })); await run();
  check(S.graphPosts.length === 3 && S.tgSends.length === 1 && (S.tgSends[0].body.text.match(/Camp 5\d/g) || []).length === 3 && /3 mục/.test(S.tgSends[0].body.text), 'tắt 3 mục trong 1 lần chạy → gộp thành 1 tin liệt kê cả 3 (không spam)');
  reset(Object.assign(twoCamps(30), { notify: { U1: nset() }, rules: twoCamps(30).rules })); await run();
  check(S.tgSends.length >= 1 && S.tgSends.every(m => m.body.text.length <= 4096), 'tin dài vẫn ≤ 4096 ký tự (giới hạn Telegram)');
  // chạy thử
  reset({ rules: [rule({ dry_run: true })], notify: { U1: nset() } }); await run(); check(S.tgSends.length === 0, 'chạy thử + chưa bật "báo cả chạy thử" → không gửi');
  reset({ rules: [rule({ dry_run: true })], notify: { U1: nset({ notify_dry: true }) } }); await run();
  check(S.tgSends.length === 1 && /chạy thử/i.test(S.tgSends[0].body.text) && /chưa tắt thật/i.test(S.tgSends[0].body.text) && S.graphPosts.length === 0, 'bật "báo cả chạy thử" → gửi tin ghi rõ "chạy thử, chưa tắt thật"');
  // lỗi khi tắt
  reset({ postError: 'Permissions error', notify: { U1: nset() } }); await run();
  check(S.tgSends.length === 1 && /không tắt được/i.test(S.tgSends[0].body.text) && /Permissions/.test(S.tgSends[0].body.text), 'Facebook từ chối lệnh tắt → tin báo "không tắt được" kèm lý do');
  reset({ postError: 'Permissions error', notify: { U1: nset({ notify_problem: false }) } }); await run(); check(S.tgSends.length === 0, 'tắt "báo sự cố" → không báo lỗi tắt');
  // token hết hạn: chỉ báo lần ĐẦU (chuyển từ bình thường sang lỗi), không lặp mỗi 15 phút
  reset({ graphError: { code: 190, message: 'Session has expired' }, notify: { U1: nset() }, rules: [rule({ last_status: 'ok' })] }); await run();
  check(S.tgSends.length === 1 && /token Facebook/i.test(S.tgSends[0].body.text) && /hết hạn|từ chối/i.test(S.tgSends[0].body.text) && /Tài khoản/.test(S.tgSends[0].body.text), 'token hết hạn lần đầu → 1 tin cảnh báo, hướng dẫn dán token mới ở mục Tài khoản');
  reset({ graphError: { code: 190, message: 'Session has expired' }, notify: { U1: nset() }, rules: [rule({ last_status: 'token_error' })] }); await run();
  check(S.tgSends.length === 0, 'token vẫn hết hạn ở lần chạy sau → KHÔNG báo lại (tránh spam mỗi 15 phút)');
  reset({ graphError: { code: 190, message: 'Session has expired' }, notify: { U1: nset() }, rules: [rule({ id: 1, last_status: 'ok' }), rule({ id: 2, object_id: 'C2', last_status: 'ok' })] }); await run();
  check(S.tgSends.length === 1, 'nhiều quy tắc cùng lỗi token → chỉ 1 tin cho cả người dùng');
  reset({ users: { U1: { user_metadata: {} } }, notify: { U1: nset() }, rules: [rule({ last_status: 'ok' })] }); await run();
  check(S.tgSends.length === 1 && /token Facebook/i.test(S.tgSends[0].body.text), 'chưa có token Facebook → cũng báo lần đầu');
  reset({ graphError: { code: 190, message: 'x' }, notify: { U1: nset({ notify_problem: false }) }, rules: [rule({ last_status: 'ok' })] }); await run(); check(S.tgSends.length === 0, 'tắt "báo sự cố" → không báo token hết hạn');
  // Telegram lỗi không làm hỏng việc tắt
  reset({ tgMode: 'fail', notify: { U1: nset() } }); out = await run();
  check(out.status === 200 && S.graphPosts.length === 1 && S.logRows.length === 1, 'Telegram từ chối (bị chặn bot) → chiến dịch vẫn được tắt, nhật ký vẫn ghi, hàm vẫn trả 200');
  check(S.notifyPatches.length === 1 && /blocked/i.test(S.notifyPatches[0].body.last_notify_error || ''), 'ghi lý do lỗi gửi vào last_notify_error');
  reset({ tgMode: 'throw', notify: { U1: nset() } }); out = await run();
  check(out.status === 200 && S.graphPosts.length === 1, 'Telegram mất kết nối → vẫn tắt, vẫn trả 200');
  check(S.notifyPatches.length === 1 && !JSON.stringify(S.notifyPatches).includes(BOT1) && !out.text.includes(BOT1), 'thông báo lỗi kết nối KHÔNG chứa mã bot (URL có mã bot đã bị che)');
  // cách ly người dùng
  reset({ rules: [rule({ id: 1, user_id: 'U1' }), rule({ id: 2, user_id: 'U2' })], users: { U1: { user_metadata: { fb_token: 'EAAuser1TOKEN' } }, U2: { user_metadata: { fb_token: 'EAAuser2TOKEN' } } }, notify: { U1: nset(), U2: nset({ telegram_bot_token: BOT2, telegram_chat_id: '777' }) } }); await run();
  check(S.tgSends.length === 2 && S.tgSends.some(m => m.bot === BOT1 && m.body.chat_id === '555') && S.tgSends.some(m => m.bot === BOT2 && m.body.chat_id === '777'), 'hai người dùng: mỗi người nhận tin qua bot và chat riêng của mình');

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
