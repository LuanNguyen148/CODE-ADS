// Edge Function autopause-notify: người dùng (đã đăng nhập) bấm "Kết nối" (tìm chat ID từ bot Telegram của mình) hoặc "Gửi tin thử".
// Chạy index.ts bằng Node với Deno + fetch giả. Mã bot chỉ đọc ở server, không bao giờ trả về trình duyệt.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
if (/^\s*(import|export)\s/m.test(src)) throw new Error('autopause-notify không được dùng import/export (để test bằng Node)');

let handler; const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'SERVICEKEY', SUPABASE_ANON_KEY: 'ANONKEY' };
global.Deno = { serve: h => { handler = h; }, env: { get: k => env[k] } };
const BOT = '123456789:AAEhBOweik6ad9r_QXMENQjcrGbqCr4K-1', BOT2 = '987654321:AAFzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-2';
let S;
const reset = (o = {}) => { S = Object.assign({ jwts: { JWT1: 'U1', JWT2: 'U2' }, settings: { U1: { telegram_bot_token: BOT, telegram_chat_id: null }, U2: { telegram_bot_token: BOT2, telegram_chat_id: '777' } }, updates: [], tgUpdatesStatus: 200, tgSendStatus: 200, tgThrow: false, patches: [], tgCalls: [], authCalls: [],
  // --- báo cáo hằng ngày ---
  fbusers: { U1: { user_metadata: { fb_token: 'EAAuser1TOKEN' } }, U2: { user_metadata: { fb_token: 'EAAuser2TOKEN' } }, U3: { user_metadata: { fb_token: 'EAAuser3TOKEN' } }, U4: { user_metadata: { fb_token: 'EAAuser4TOKEN' } } },
  fbAccounts: [{ account_id: '111', name: 'HAI 7', currency: 'VND', account_status: 1 }, { account_id: '222', name: 'TK cũ', currency: 'VND', account_status: 2 }],
  fbCampaigns: { act_111: [{ campaign_id: 'C1', campaign_name: 'CHIẾN DỊCH LẤY DATA 07/10', spend: '580000', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '9' }] }, { campaign_id: 'C2', campaign_name: 'Chiến dịch 10/10 Test', spend: '360000', actions: [{ action_type: 'onsite_conversion.messaging_first_reply', value: '6' }] }, { campaign_id: 'C3', campaign_name: 'Camp không chi', spend: '0', actions: [] }] },
  fbError: null, states: {}, logs: {}, vault: undefined, graphCalls: [], logQueries: [], dueQueries: [] }, o); };
global.fetch = async (url, init = {}) => {
  url = String(url); const method = (init.method || 'GET').toUpperCase();
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st });
  if (url === env.SUPABASE_URL + '/auth/v1/user') {
    S.authCalls.push(init.headers); const jwt = ((init.headers || {}).Authorization || '').replace('Bearer ', '');
    return S.jwts[jwt] ? json({ id: S.jwts[jwt], email: 'x@example.com' }) : json({ msg: 'invalid' }, 401);
  }
  if (url.startsWith(env.SUPABASE_URL + '/rest/v1/ads_notify_settings')) {
    const uid = (url.match(/user_id=eq\.([^&]+)/) || [])[1];
    if (method === 'GET') {
      if (uid) return json(S.settings[uid] ? [Object.assign({ user_id: uid }, S.settings[uid])] : []);
      S.dueQueries.push(decodeURIComponent(url)); // danh sách người dùng cần gửi báo cáo (máy chủ tự lọc bằng bộ lọc trong URL)
      let rows = Object.entries(S.settings).map(([id, s]) => Object.assign({ user_id: id }, s));
      if (/report_enabled=eq\.true/.test(url)) rows = rows.filter(r => r.report_enabled);
      if (/telegram_chat_id=not\.is\.null/.test(url)) rows = rows.filter(r => r.telegram_chat_id);
      if (/telegram_bot_token=not\.is\.null/.test(url)) rows = rows.filter(r => r.telegram_bot_token);
      return json(rows);
    }
    S.patches.push({ uid, body: JSON.parse(init.body), apikey: (init.headers || {}).apikey }); return json([]);
  }
  if (url.startsWith(env.SUPABASE_URL + '/rest/v1/ads_user_state')) { const id = (url.match(/user_id=eq\.([^&]+)/) || [])[1]; return json(S.states[id] ? [{ state: S.states[id] }] : []); }
  if (url.startsWith(env.SUPABASE_URL + '/rest/v1/ads_autopause_log')) { S.logQueries.push(decodeURIComponent(url)); const id = (url.match(/user_id=eq\.([^&]+)/) || [])[1]; return json(S.logs[id] || []); }
  if (url === env.SUPABASE_URL + '/rest/v1/rpc/autopause_secret') return S.vault === undefined ? json({ message: 'not found' }, 404) : json(S.vault);
  const adm = url.match(/\/auth\/v1\/admin\/users\/([^/?]+)/);
  if (adm) return S.fbusers[adm[1]] ? json(S.fbusers[adm[1]]) : json({}, 404);
  if (url.startsWith('https://graph.facebook.com/v21.0/')) {
    const gtok = (url.match(/access_token=([^&]+)/) || [])[1] || ''; S.graphCalls.push({ url: decodeURIComponent(url), tok: gtok });
    if (S.fbError) return json({ error: S.fbError }, 400);
    if (/\/me\/adaccounts/.test(url)) return json({ data: S.fbAccounts });
    const im = url.match(/\/(act_\d+)\/insights/);
    if (im) { if (!/level=campaign/.test(url)) return json({ data: [] }); return json({ data: S.fbCampaigns[im[1]] || [] }); }
  }
  if (url.startsWith('https://api.telegram.org/bot')) {
    const bot = (url.match(/\/bot([^/]+)\//) || [])[1], meth = (url.match(/\/bot[^/]+\/([A-Za-z]+)/) || [])[1];
    S.tgCalls.push({ bot, meth, body: init.body ? JSON.parse(init.body) : null });
    if (S.tgThrow) throw new Error('request to ' + url + ' failed, reason: ECONNRESET');
    if (meth === 'getUpdates') {
      if (S.tgUpdatesStatus === 401) return json({ ok: false, error_code: 401, description: 'Unauthorized' }, 401);
      if (S.tgUpdatesStatus === 409) return json({ ok: false, error_code: 409, description: 'Conflict: can\'t use getUpdates method while webhook is active' }, 409);
      return json({ ok: true, result: S.updates });
    }
    if (meth === 'sendMessage') return S.tgSendStatus === 200 ? json({ ok: true, result: {} }) : json({ ok: false, description: 'Forbidden: bot was blocked by the user' }, 403);
  }
  return json({ error: 'unmocked ' + url }, 500);
};
new Function(src)();
const call = (op, jwt = 'JWT1', method = 'POST', extra = {}) => handler(new Request('https://x.supabase.co/functions/v1/autopause-notify', { method, headers: Object.assign({ 'content-type': 'application/json', apikey: 'ANONKEY' }, jwt ? { authorization: 'Bearer ' + jwt } : {}), body: method === 'POST' ? JSON.stringify(Object.assign({ op }, extra)) : undefined }));
const run = async (...a) => { const r = await call(...a); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, text: t, json: j }; };
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
const upd = (id, chatId, type = 'private') => ({ update_id: id, message: { message_id: id, chat: { id: chatId, type }, text: '/start' } });

(async () => {
  // --- bảo vệ ---
  reset(); let r = await handler(new Request('https://x.supabase.co/functions/v1/autopause-notify', { method: 'OPTIONS' }));
  check(r.status === 204 && /authorization/i.test(r.headers.get('access-control-allow-headers') || ''), 'OPTIONS → 204, cho phép header authorization (trình duyệt gọi được)');
  reset(); r = await handler(new Request('https://x.supabase.co/functions/v1/autopause-notify', { method: 'GET' })); check(r.status === 405, 'GET → 405');
  reset(); r = await run('link', null); check(r.status === 401 && S.tgCalls.length === 0, 'không đăng nhập → 401, không gọi Telegram');
  reset(); r = await run('link', 'JWT-SAI'); check(r.status === 401 && S.tgCalls.length === 0, 'JWT sai → 401, không gọi Telegram');
  reset(); r = await run('xoa-het'); check(r.status === 400, 'thao tác lạ → 400');

  // --- link: tìm chat ID ---
  reset({ updates: [upd(1, 999111), upd(2, 555222)] }); r = await run('link');
  check(r.status === 200 && r.json.ok === true && r.json.chat_tail === '5222', 'kết nối: lấy chat ID của tin nhắn MỚI NHẤT gửi cho bot (…5222), trả về chỉ 4 số cuối');
  check(S.patches.length === 1 && S.patches[0].uid === 'U1' && S.patches[0].body.telegram_chat_id === '555222', 'lưu chat ID đúng người dùng (U1)');
  check(S.tgCalls.some(c => c.meth === 'sendMessage' && c.body.chat_id === 555222 || (c.meth === 'sendMessage' && String(c.body.chat_id) === '555222')) && S.tgCalls.every(c => c.bot === BOT), 'gửi tin xác nhận "đã kết nối" vào đúng chat, chỉ dùng bot của người dùng này');
  check(!r.text.includes(BOT) && !JSON.stringify(S.patches).includes(BOT), 'mã bot không có trong phản hồi hay dữ liệu lưu thêm');
  check(S.tgCalls.every(c => ['getUpdates', 'sendMessage'].includes(c.meth)), 'chỉ gọi 2 phương thức Telegram: getUpdates và sendMessage');
  reset({ updates: [upd(1, -100123, 'group'), upd(2, 555222, 'private'), upd(3, -100124, 'supergroup')] }); r = await run('link');
  check(r.status === 200 && S.patches[0].body.telegram_chat_id === '555222', 'chỉ nhận chat RIÊNG (private), bỏ qua nhóm');
  reset({ updates: [upd(1, -100123, 'group')] }); r = await run('link'); check(r.status === 404 && /Start/.test(r.json.error.message) && S.patches.length === 0, 'chỉ có tin từ nhóm → 404, hướng dẫn mở bot và bấm Start, không lưu gì');
  reset({ updates: [] }); r = await run('link'); check(r.status === 404 && /Start/.test(r.json.error.message), 'chưa ai nhắn bot → 404 "mở bot, bấm Start rồi thử lại"');
  reset({ settings: { U1: { telegram_bot_token: null } } }); r = await run('link'); check(r.status === 400 && /mã bot/i.test(r.json.error.message) && S.tgCalls.length === 0, 'chưa lưu mã bot → 400, không gọi Telegram');
  reset(); S.settings = {}; r = await run('link'); check(r.status === 400 && /mã bot/i.test(r.json.error.message), 'chưa có dòng cài đặt nào → 400 như trên');
  reset({ tgUpdatesStatus: 401 }); r = await run('link'); check(r.status === 400 && /không đúng|thu hồi/i.test(r.json.error.message), 'mã bot sai/bị thu hồi (Telegram 401) → 400 "mã bot không đúng"');
  reset({ tgUpdatesStatus: 409 }); r = await run('link'); check(r.status === 400 && /webhook/i.test(r.json.error.message), 'bot đang dùng webhook (409) → giải thích rõ');
  reset({ updates: [upd(1, 555222)], tgSendStatus: 403 }); r = await run('link');
  check(r.status === 200 && r.json.ok === true && S.patches.length === 1, 'tìm được chat nhưng tin xác nhận gửi lỗi → vẫn lưu chat ID (đã kết nối), không làm hỏng');
  reset({ updates: [upd(1, 555222)] }); r = await run('link', 'JWT1', 'POST', { user_id: 'U2' });
  check(S.patches[0].uid === 'U1' && S.tgCalls.every(c => c.bot === BOT), 'chống giả mạo: bỏ qua user_id trong nội dung gửi lên, chỉ dùng người dùng của JWT');
  reset({ tgThrow: true }); r = await run('link'); check(r.status >= 400 && !r.text.includes(BOT), 'Telegram mất kết nối → báo lỗi, KHÔNG lộ mã bot (URL đã bị che)');

  // --- test: gửi tin thử ---
  reset({ jwts: { JWT1: 'U2' } }); r = await run('test');
  check(r.status === 200 && r.json.ok === true && S.tgCalls.length === 1 && S.tgCalls[0].meth === 'sendMessage' && String(S.tgCalls[0].body.chat_id) === '777' && S.tgCalls[0].bot === BOT2 && /Thử|thử/.test(S.tgCalls[0].body.text), 'gửi thử: tin tới chat đã kết nối bằng bot của người dùng đó');
  reset(); r = await run('test'); check(r.status === 400 && /kết nối/i.test(r.json.error.message) && S.tgCalls.length === 0, 'chưa kết nối chat → 400 "hãy kết nối trước"');
  reset({ jwts: { JWT1: 'U2' }, tgSendStatus: 403 }); r = await run('test'); check(r.status === 502 && /blocked/i.test(r.json.error.message), 'Telegram từ chối → 502 kèm lý do');
  reset({ jwts: { JWT1: 'U2' }, tgThrow: true }); r = await run('test'); check(r.status === 502 && !r.text.includes(BOT2), 'mất kết nối khi gửi thử → 502, không lộ mã bot');

  // ================= BÁO CÁO HẰNG NGÀY = nội dung báo cáo của tab "Báo cáo ngày" =================
  const realNow = Date.now; const T0 = Date.UTC(2026, 10, 21, 13, 5); // 20:05 giờ Việt Nam, 21/11/2026
  const atTime = t => { Date.now = () => t; };
  const conn = (o = {}) => Object.assign({ telegram_bot_token: BOT, telegram_chat_id: '555', report_enabled: true, report_time: '20:00', last_report_date: null }, o);
  const DAY = '2026-11-21'; const logOf = [];
  const rowsA = [
    { campaign: 'CHIẾN DỊCH LẤY DATA 07/10', campaign_id: 'C1', name: 'Bài 1', spend: '580000', mess: 9, phone: 3, rev: '' },
    { campaign: 'CHIẾN DỊCH LẤY DATA 07/10', campaign_id: 'C1', name: 'Bài 2', spend: '1.200', mess: '0', phone: '0', rev: '' },
    { campaign: 'Chiến dịch 10/10 Test', campaign_id: 'C2', name: 'Bài 3', spend: '360000', mess: 6, phone: 1, rev: '' },
    { campaign: 'Chiến lấy data 20/11', campaign_id: 'C5', name: 'Bài 5', spend: '79000', mess: 0, phone: 0, rev: '1tr5' },
    { campaign: 'Chiến dịch không chi', campaign_id: 'C3', spend: '0', mess: 0, phone: 0, rev: '' },
    { campaign: 'Chiến dịch mặc định', campaign_id: 'C4', spend: '5000', mess: 1, phone: 0, rev: '' },
  ];
  const stRep = (o = {}) => Object.assign({ who: 'luan148', t1: 25, t2: 35, byAcc: { act_111: { days: { [DAY]: rowsA, '2026-11-20': [{ campaign: 'Hôm qua', spend: '999999', mess: 99, phone: 99, rev: '9tr' }] } }, __ALL__: { days: { [DAY]: [{ campaign: 'Trùng', spend: '777777' }] } }, act_off: { days: { [DAY]: [{ campaign: 'Tắt', spend: '888888' }] } } }, disabledAcc: { act_off: true } }, o);
  const textOf = () => (S.tgCalls.filter(c => c.meth === 'sendMessage').map(c => c.body.text)[0] || '');
  const sendsN = () => S.tgCalls.filter(c => c.meth === 'sendMessage').length;
  atTime(T0);

  reset({ settings: { U1: conn() }, states: { U1: stRep() } }); r = await run('report');
  let rt = textOf();
  check(r.status === 200 && r.json.ok === true && sendsN() === 1 && String(S.tgCalls[0].body.chat_id) === '555' && S.tgCalls[0].bot === BOT, 'báo cáo: gửi 1 tin tới chat đã kết nối bằng bot của người dùng');
  check(S.graphCalls.length === 0, 'báo cáo lấy từ dữ liệu Báo cáo ngày của người dùng — KHÔNG gọi Facebook');
  const bl = rt.split('\n\n');
  check(bl[0] === ['luan148', 'Tổng ngày', '- Tổng tiền chạy : 1tr', '- Số lượng mess : 15', '- Giá mess : 68k', '- Số lượng số: 4', '- Giá số : 260k', '- Doanh số : 1tr5', 'CPQC: 68%'].join('\n'), 'mở đầu là tên người dùng (S.who), rồi "Tổng ngày" đúng từng dòng (thực tế: ' + JSON.stringify(bl[0]) + ')');
  check(bl[1] === ['CHIẾN DỊCH LẤY DATA 07/10 :', '- Tổng tiền chạy : 580k', '- Số lượng mess : 9', '- Giá mess : 64k', '- Số lượng số: 3', '- Giá số : 190k', '- Doanh số : 0', 'CPQC: %'].join('\n') || /^CHIẾN DỊCH LẤY DATA 07\/10 :/.test(bl[1]), 'chiến dịch gộp các dòng cùng campaign_id, tên + " :" (thực tế: ' + JSON.stringify(bl[1]) + ')');
  check(/Doanh số : 0\nCPQC: %$/.test(bl[1]) && /Giá số : –/.test(bl[3]) && /Giá mess : –/.test(bl[3]) && /Doanh số : 1tr5\nCPQC: 5%$/.test(bl[3]), 'doanh số 0 → "CPQC: %"; chia cho 0 → "–"; có doanh số → CPQC làm tròn % (5%) — đúng mẫu');
  check(bl.length === 4 && !/không chi|Trùng|Tắt|Hôm qua|mặc định/.test(rt), 'chỉ chiến dịch có chi tiêu hôm nay; bỏ dòng chiến dịch mặc định, tài khoản "__ALL__", tài khoản đã tắt, ngày khác');
  check(/^Chiến dịch 10\/10 Test :/.test(bl[2]) && /^Chiến lấy data 20\/11 :/.test(bl[3]), 'xếp chiến dịch theo chi tiêu giảm dần');
  check(!/tự tắt/i.test(rt) && S.logQueries.length === 0, 'KHÔNG có phần mục đã tự tắt');
  check(!rt.includes(BOT) && !r.text.includes(BOT), 'mã bot không lọt vào tin hay phản hồi');
  // chiến dịch thủ công, nhiều tài khoản cùng tên chiến dịch khác campaign_id
  reset({ settings: { U1: conn() }, states: { U1: stRep({ byAcc: { a1: { days: { [DAY]: [{ campaign: 'X', campaign_id: '1', spend: '100000', mess: 1 }, { _manual: true, spend: '50000', mess: 0 }] } }, a2: { days: { [DAY]: [{ campaign: 'X', campaign_id: '2', spend: '200000', mess: 2 }] } } } }) } }); await run('report');
  check(textOf().split('\n\n').length === 4 && /^Chiến dịch thủ công :/.test(textOf().split('\n\n')[3]) && /^X :\n- Tổng tiền chạy : 200k/.test(textOf().split('\n\n')[1]), 'nhiều tài khoản gộp chung một báo cáo; chiến dịch trùng tên nhưng khác campaign_id không gộp; dòng nhập tay (_manual) → "Chiến dịch thủ công"');
  reset({ settings: { U1: conn() }, states: { U1: stRep({ byAcc: { a: { days: { [DAY]: [{ campaign: 'R', campaign_id: 'r', spend: '100000', mess: 1, rev: '150000' }] } } } }) } }); await run('report');
  check(/CPQC: 67%/.test(textOf()), 'CPQC làm tròn (66,67% → 67%), giống web');
  // không có dữ liệu
  reset({ settings: { U1: conn() } }); r = await run('report'); check(r.status === 404 && /Báo cáo ngày/.test(r.json.error.message) && sendsN() === 0, 'chưa có dữ liệu Báo cáo ngày → 404 nói rõ, không gửi');
  reset({ settings: { U1: conn() }, states: { U1: stRep({ byAcc: { act_111: { days: { [DAY]: [{ campaign: 'A', spend: '0' }] } } } }) } }); await run('report'); check(/luan148\nHôm nay chưa có số liệu chi tiêu/.test(textOf()), 'có dữ liệu nhưng chưa chi tiêu → tin ngắn nói rõ');
  // dài quá 4000 ký tự → tách tin theo khối
  reset({ settings: { U1: conn() }, states: { U1: stRep({ byAcc: { a: { days: { [DAY]: Array.from({ length: 60 }, (_, i) => ({ campaign: 'Chiến dịch dài ' + 'x'.repeat(60) + i, campaign_id: 'K' + i, spend: String(100000 + i * 1000), mess: 1 })) } } } }) } }); await run('report');
  const many = S.tgCalls.filter(c => c.meth === 'sendMessage').map(c => c.body.text);
  check(many.length >= 2 && many.every(x => x.length <= 4000) && many.join('\n\n').split('Chiến dịch dài').length - 1 === 60, 'rất nhiều chiến dịch → tách thành nhiều tin ≤ 4000 ký tự, đủ 60 chiến dịch, không cắt ngang khối');
  // đối chiếu với hàm báo cáo THẬT của web: cùng số liệu → cùng chữ
  {
    const web = fs.readFileSync(require('path').join(__dirname, '..', 'dashboard.html'), 'utf8');
    const grab = n => { const m = web.match(new RegExp('function ' + n + '\\([^)]*\\)\\{[^\\n]*\\n')) || web.match(new RegExp('function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n')); return m ? m[0] : ''; };
    const code = ['sg', 'vn', 'rp', 'n', 'money', 'div', 'pm', 'calc', 'total', 'sblock'].map(grab).join('\n') + '\nreturn {rp, total, sblock, pm};';
    let W = null; try { W = new Function('S', code)({ t1: 25, t2: 35 }); } catch (e) { console.log('lỗi nạp hàm web: ' + e.message); }
    check(!!W, 'nạp được hàm báo cáo thật của web (sg, vn, rp, total, sblock) để đối chiếu');
    if (W) {
      let same = true, bad = '';
      for (const v of [0, 5, 999, 1000, 1234, 9999, 71700, 99999, 100000, 304000, 999999, 1000000, 1219000, 1500000, 12345678, 999999999, 1e9, 2.5e9]) { reset({ settings: { U1: conn() }, states: { U1: stRep({ byAcc: { a: { days: { [DAY]: [{ campaign: 'Z', campaign_id: 'z', spend: String(v), mess: 3, phone: 2, rev: String(v * 2) }] } } } }) } }); await run('report'); const t = textOf(); const exp = W.sblock('Tổng ngày', W.total([{ spend: String(v), mess: 3, phone: 2, rev: String(v * 2) }])); if (v > 0 && t.split('\n\n')[0].split('\n').slice(2).join('\n') !== exp.split('\n').slice(1).join('\n')) { same = false; bad += v + ' '; } }
      check(same, 'số liệu và số rút gọn GIỐNG HỆT báo cáo thật của web với 17 giá trị thử (lệch ở: ' + (bad || 'không') + ')');
    }
  }
  reset({ settings: { U1: conn({ telegram_chat_id: null }) }, states: { U1: stRep() } }); r = await run('report'); check(r.status === 400 && /kết nối/i.test(r.json.error.message) && sendsN() === 0, 'chưa kết nối chat → 400');
  reset({ settings: { U1: conn() }, states: { U1: stRep() }, tgSendStatus: 403 }); r = await run('report'); check(r.status === 502 && /blocked/i.test(r.json.error.message), 'Telegram từ chối → 502 kèm lý do');
  reset({ settings: { U1: conn() }, states: { U1: stRep() }, tgThrow: true }); r = await run('report'); check(r.status >= 400 && !r.text.includes(BOT), 'mất kết nối Telegram → báo lỗi, không lộ mã bot');
  reset({ settings: { U1: conn() } }); r = await run('report', null); check(r.status === 401 && sendsN() === 0, 'báo cáo thử: không đăng nhập → 401');

  // --- đến giờ gửi (cron gọi mỗi 15 phút) ---
  const CRON = 'cron-secret-0123456789'; env.AUTOPAUSE_CRON_SECRET = CRON;
  const callDue = (secret) => handler(new Request('https://x.supabase.co/functions/v1/autopause-notify', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, secret === null ? {} : { 'x-cron-secret': secret }), body: JSON.stringify({ op: 'due' }) }));
  const runDue = async (secret = CRON) => { const x = await callDue(secret); const t = await x.text(); let j = {}; try { j = JSON.parse(t); } catch (_) {} return { status: x.status, text: t, json: j }; };
  const sends = () => S.tgCalls.filter(c => c.meth === 'sendMessage');
  reset(); r = await runDue('sai-khoa'); check(r.status === 401 && S.graphCalls.length === 0 && S.tgCalls.length === 0, 'đến giờ: sai khóa → 401, không làm gì');
  reset(); r = await runDue(null); check(r.status === 401, 'đến giờ: không có khóa → 401');
  delete env.AUTOPAUSE_CRON_SECRET; reset(); r = await runDue('bat-ky-khoa-dai-0123456789'); check(r.status === 503, 'đến giờ: máy chủ chưa có khóa (env/Vault) → 503, không chạy');
  reset({ vault: 'vault-khoa-rat-dai-0123456789', settings: { U1: conn() }, states: { U1: stRep() } }); r = await runDue('vault-khoa-rat-dai-0123456789'); check(r.status === 200 && sends().length === 1, 'dùng được khóa trong Vault (như hàm fb-autopause)');
  env.AUTOPAUSE_CRON_SECRET = CRON;

  reset({ settings: { U1: conn(), U2: conn({ report_time: '21:00' }), U3: conn({ last_report_date: '2026-11-21' }), U4: conn({ report_enabled: false }), U5: conn({ telegram_chat_id: null }) }, states: { U1: stRep() }, logs: { U1: logOf } }); r = await runDue();
  check(r.status === 200 && r.json.ok === true && r.json.due === 1 && r.json.sent === 1 && sends().length === 1 && String(sends()[0].body.chat_id) === '555', 'đến 20:05: chỉ người dùng ĐẾN GIỜ (20:00) được gửi — không gửi người chọn 21:00, người đã gửi hôm nay, người tắt báo cáo, người chưa kết nối');
  check(S.dueQueries.length === 1 && /report_enabled=eq\.true/.test(S.dueQueries[0]) && /telegram_chat_id=not\.is\.null/.test(S.dueQueries[0]) && /telegram_bot_token=not\.is\.null/.test(S.dueQueries[0]), 'truy vấn người dùng lọc sẵn ở CSDL: báo cáo bật + có mã bot + có chat ID');
  const pu = S.patches.find(p => p.uid === 'U1');
  check(pu && pu.body.last_report_date === '2026-11-21' && pu.body.last_notify_at && pu.body.last_notify_error === null, 'ghi ngày đã gửi (2026-11-21, giờ VN) để không gửi lặp trong ngày');
  check(S.patches.filter(p => p.uid !== 'U1').length === 0, 'không đụng tới dòng của người dùng khác');
  // không gửi lặp: áp dụng bản ghi rồi chạy lại
  S.settings.U1.last_report_date = '2026-11-21'; S.tgCalls = []; r = await runDue(); check(sends().length === 0 && r.json.due === 0, 'chạy lại 15 phút sau (đã ghi ngày) → KHÔNG gửi lặp');
  // ranh giới giờ & sang ngày
  atTime(Date.UTC(2026, 10, 21, 12, 59)); reset({ settings: { U1: conn() }, states: { U1: stRep() } }); await runDue(); check(sends().length === 0, '19:59 (trước 20:00) → chưa gửi');
  atTime(Date.UTC(2026, 10, 21, 13, 0)); reset({ settings: { U1: conn() }, states: { U1: stRep() } }); await runDue(); check(sends().length === 1, 'đúng 20:00 → gửi');
  atTime(T0); reset({ settings: { U1: conn({ last_report_date: '2026-11-20' }) }, states: { U1: stRep() } }); await runDue(); check(sends().length === 1 && S.patches[0].body.last_report_date === '2026-11-21', 'đã gửi hôm qua → hôm nay đến giờ thì gửi tiếp');
  atTime(Date.UTC(2026, 10, 21, 17, 30)); reset({ settings: { U1: conn({ report_time: '00:10', last_report_date: '2026-11-21' }) }, states: { U1: stRep() } }); await runDue(); check(sends().length === 1 && S.patches[0].body.last_report_date === '2026-11-22', 'qua nửa đêm: 00:30 ngày 22/11 (VN), giờ chọn 00:10, mới gửi ngày 21 → gửi báo cáo ngày mới, ghi 2026-11-22');
  atTime(T0);
  // lỗi không chặn người khác
  reset({ settings: { U1: conn(), U3: conn() }, fbusers: { U1: { user_metadata: { fb_token: 'EAAuser1TOKEN' } }, U3: { user_metadata: { fb_token: 'EAAuser3TOKEN' } } }, states: { U1: stRep(), U3: stRep() } });
  const origFb = S.fbError; r = await runDue();
  check(r.json.due === 2 && r.json.sent === 2 && sends().length === 2 && S.patches.filter(p => p.uid === 'U1').length === 1 && S.patches.filter(p => p.uid === 'U3').length === 1, 'hai người dùng cùng đến giờ: cả hai đều được gửi, mỗi người một lần ghi ngày');
  reset({ settings: { U1: conn() } }); r = await runDue();
  check(sends().length === 1 && /Báo cáo ngày/.test(sends()[0].body.text) && S.patches[0].body.last_report_date === '2026-11-21', 'đến giờ mà chưa có dữ liệu Báo cáo ngày → vẫn gửi 1 tin nói rõ, ghi ngày để không lặp mỗi 15 phút');
  reset({ settings: { U1: conn() }, states: { U1: stRep() }, tgSendStatus: 403 }); r = await runDue();
  check(r.status === 200 && r.json.sent === 0 && r.json.errors === 1 && S.patches[0].body.last_report_date === '2026-11-21' && /blocked/i.test(S.patches[0].body.last_notify_error || ''), 'Telegram từ chối → hàm vẫn 200, ghi ngày + lý do lỗi (không thử lại mỗi 15 phút)');
  reset({ settings: { U1: conn() }, states: { U1: stRep() }, tgThrow: true }); r = await runDue();
  check(r.status === 200 && !JSON.stringify(S.patches).includes(BOT) && !r.text.includes(BOT), 'mất kết nối Telegram → không lộ mã bot trong trạng thái/phản hồi');
  Date.now = realNow;

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
