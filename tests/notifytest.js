// Tab "Thông báo" (Telegram): kết nối bot, báo cáo hằng ngày theo giờ chọn, báo khi tự tắt kèm lý do.
// Mã bot chỉ GHI được từ web (không đọc lại); web KHÔNG ghi trực tiếp vào bảng — chỉ qua hàm save_telegram_bot / save_notify_prefs;
// kết nối + gửi thử + gửi thử báo cáo qua hàm autopause-notify. Kiểm tra giao diện + dữ liệu gửi lên Supabase.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(path.resolve(process.argv[2]));
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
const BOT = '123456789:AAEhBOweik6ad9r_QXMENQjcrGbqCr4K-1';

class Loader extends ResourceLoader {
  fetch(url) {
    if (/jsdelivr|googleapis|gstatic/.test(url)) return Promise.resolve(Buffer.from(''));
    const m = url.match(/^http:\/\/localhost:5500\/([^?#]*)/);
    if (m) { const f = path.join(ROOT, decodeURIComponent(m[1])); return fs.existsSync(f) ? Promise.resolve(fs.readFileSync(f)) : Promise.reject(new Error('404 ' + m[1])); }
    return Promise.resolve(Buffer.from(''));
  }
}
// opt: { local, settings, missingTable, rpcError, fnReply: {status, body} | (op)=>..., confirm }
function boot(opt = {}) {
  const errors = [], upserts = [], deletes = [], selects = [], fnCalls = [], rpcs = [];
  let settings = opt.settings ? Object.assign({ user_id: 'u1' }, opt.settings) : null;
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { const m = String(e.message || e); if (!/navigation|Not implemented/i.test(m)) errors.push(m); });
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8'), {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', resources: new Loader(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (opt.local) w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 'shop@example.com', name: 'Shop', fbToken: 'EAAtestTOKEN', local: !!opt.local }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK 1' }));
      w.confirm = () => (opt.confirm === undefined ? true : opt.confirm);
      const miss = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.ads_notify_settings' in the schema cache" } };
      w.supabase = { createClient() { return {
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'shop@example.com' }, access_token: 'JWT-TEST' } } }),
          signOut: async () => ({}), signInWithPassword: async () => ({ data: {}, error: null }), updateUser: async () => ({ data: {}, error: null }),
        },
        // Mọi thao tác GHI đi qua hàm (web không có quyền insert/update trực tiếp, và không đọc được cột mã bot)
        rpc: async (name, args) => {
          rpcs.push({ name, args });
          if (opt.rpcError) return { error: { message: opt.rpcError } };
          if (name === 'save_telegram_bot') {
            if (!/^[0-9]{6,}:[A-Za-z0-9_-]{30,}$/.test(String(args.p_token || ''))) return { error: { message: 'Mã bot không đúng định dạng' } };
            settings = Object.assign({ user_id: 'u1', notify_paused: true, notify_problem: true, notify_dry: false, report_enabled: false, report_time: '20:00' }, settings || {}, { has_bot: true, telegram_chat_id: null });
            return { error: null };
          }
          if (name === 'save_notify_prefs') {
            if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(args.p_time || ''))) return { error: { message: 'Giờ gửi báo cáo không hợp lệ (phải dạng HH:MM, ví dụ 20:00)' } };
            settings = Object.assign({ user_id: 'u1' }, settings || {}, { notify_paused: args.p_paused, notify_problem: args.p_problem, notify_dry: args.p_dry, report_enabled: args.p_report, report_time: args.p_time });
            return { error: null };
          }
          return { error: { message: 'rpc lạ: ' + name } };
        },
        from(t) {
          if (t === 'ads_notify_settings') return {
            select(cols) { selects.push(cols); return { maybeSingle: async () => (opt.missingTable ? miss : { data: settings, error: null }) }; },
            // web không có quyền insert/update trực tiếp → mọi upsert đều bị Postgres từ chối
            upsert: async (row, o) => { upserts.push({ row, o }); return { error: { message: 'permission denied for table ads_notify_settings' } }; },
            delete() { return { eq: async (c, v) => { deletes.push({ c, v }); settings = null; return { error: null }; } }; },
          };
          if (t === 'ads_autopause_rules') return { select: () => Promise.resolve({ data: [], error: null }), upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({}) }) };
          return { select() { return { maybeSingle: async () => ({ data: null, error: null }) }; }, upsert: async () => ({ error: null }) };
        },
      }; } };
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = (url, init) => {
        url = String(url);
        if (/\/functions\/v1\/autopause-notify/.test(url)) {
          const body = JSON.parse(init.body); fnCalls.push({ url, headers: init.headers, body });
          const rep = typeof opt.fnReply === 'function' ? opt.fnReply(body.op) : (opt.fnReply || { status: 200, body: { ok: true, chat_tail: '1234' } });
          if (body.op === 'link' && rep.status === 200 && settings) settings.telegram_chat_id = '5551234';
          return Promise.resolve({ ok: rep.status < 400, status: rep.status, json: () => Promise.resolve(rep.body) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }), text: () => Promise.resolve('') });
      };
    },
  });
  return { w: dom.window, d: dom.window.document, errors, upserts, deletes, selects, fnCalls, rpcs };
}
const openTab = async (d) => { d.querySelector('#side [data-side-tab="notify"]').click(); await wait(500); };
const fire = (w, el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const lastRpc = (c, name) => c.rpcs.filter(r => r.name === name).pop();
const toasts = d => [...d.querySelectorAll('#nt-stack .nt')].map(e => e.textContent).join(' ');

(async () => {
  // ===== A) Chưa cài gì: tab riêng =====
  let c = boot({}); await wait(700); let d = c.d, w = c.w;
  check(!!d.querySelector('#side [data-side-tab="notify"]') && !!d.getElementById('tab-notify') && /Thông báo/.test(d.getElementById('tab-notify').textContent), 'có mục "Thông báo" ở menu trái và tab "Thông báo" trên banner');
  check(!d.getElementById('tg-notify-btn') && !d.getElementById('tn-dialog'), 'không còn nút 🔔 / popup ở tab Bật/Tắt (đã tách thành tab riêng)');
  check(d.getElementById('v-notify').hidden, 'chưa mở tab → phần Thông báo ẩn');
  d.getElementById('tab-notify').click(); await wait(500);
  check(!d.getElementById('v-notify').hidden && d.getElementById('v-day').hidden && d.getElementById('v-toggle').hidden && d.getElementById('v-settings').hidden && d.getElementById('tab-notify').getAttribute('aria-selected') === 'true', 'bấm tab → chỉ hiện phần Thông báo, các phần khác ẩn');
  const sel = c.selects[c.selects.length - 1] || '';
  check(sel && sel !== '*' && !/telegram_bot_token/.test(sel) && /has_bot/.test(sel) && /telegram_chat_id/.test(sel) && /report_enabled/.test(sel) && /report_time/.test(sel), 'tải cài đặt bằng danh sách cột RÕ RÀNG (có cột báo cáo), không xin cột mã bot — select("' + sel + '")');
  check(/chưa kết nối/i.test(d.getElementById('tn-state').textContent) && d.getElementById('tn-state').dataset.level === 'warn', 'trạng thái: "Chưa kết nối"');
  check(d.getElementById('tn-paused').checked && d.getElementById('tn-problem').checked && !d.getElementById('tn-dry').checked, 'mặc định: báo khi tắt ✓, báo sự cố ✓, báo cả chạy thử ✗');
  check(!d.getElementById('tn-report').checked && d.getElementById('tn-time').value === '20:00' && d.getElementById('tn-hh').value === '8' && d.getElementById('tn-mm').value === '00' && d.getElementById('tn-ap').value === 'PM', 'báo cáo hằng ngày: mặc định TẮT, giờ 20:00 hiển thị dạng 08 : 00 PM (ba ô chọn giờ / phút / AM-PM)');
  const setT = (hh, mm, ap) => { for (const [id, v] of [['tn-hh', hh], ['tn-mm', mm], ['tn-ap', ap]]) { d.getElementById(id).value = v; fire(w, d.getElementById(id), 'change'); } return d.getElementById('tn-time').value; };
  check(setT('9', '30', 'AM') === '09:30' && setT('12', '00', 'AM') === '00:00' && setT('12', '00', 'PM') === '12:00' && setT('11', '55', 'PM') === '23:55' && setT('1', '05', 'PM') === '13:05' && setT('8', '00', 'PM') === '20:00', 'đổi AM/PM → giá trị lưu đúng 24 giờ (9:30 AM=09:30, 12 AM=00:00, 12 PM=12:00, 11:55 PM=23:55, 1:05 PM=13:05)');
  check(d.getElementById('tn-link').disabled && d.getElementById('tn-test').disabled && d.getElementById('tn-report-now').disabled && d.getElementById('tn-remove').hidden, 'chưa có mã bot → khóa Kết nối / Gửi thử / Gửi thử báo cáo, ẩn Xóa kết nối');
  const txt = d.getElementById('v-notify').textContent;
  check(/báo cáo hằng ngày/i.test(txt) && !/BotFather/.test(txt) && !d.querySelector('#v-notify .set-help') && !d.querySelector('#v-notify .set-who small') && !/máy chủ|Telegram —/.test(txt.replace(/Kết nối Telegram trong Cài đặt|Chưa kết nối Telegram[^.]*./g,'')), 'tab Thông báo: có báo cáo hằng ngày; KHÔNG có đoạn giải thích (không .set-help, không dòng phụ đề, không nhắc "máy chủ"); hướng dẫn tạo bot không ở đây');
  const tgPane = d.getElementById('set-pane-tg');
  check(!!tgPane && tgPane.classList.contains('pane-off') && ['tn-token', 'tn-save', 'tn-link', 'tn-test', 'tn-remove', 'tn-state'].every(id => tgPane.contains(d.getElementById(id))) && /BotFather/.test(tgPane.textContent) && /Start/.test(tgPane.textContent), 'phần kết nối Telegram (mã bot, Lưu, Kết nối, Gửi thử, Xóa, hướng dẫn @BotFather) nằm trong Cài đặt → nhóm Telegram');
  check(!d.getElementById('tn-hint') && !d.getElementById('tn-goto-settings') && !d.getElementById('tn-sec-conn'), 'tab Thông báo KHÔNG còn khối tình trạng kết nối / nút mở Cài đặt');
  await openTab(d);
  check(d.getElementById('tn-token').type === 'password', 'ô mã bot dạng mật khẩu');

  // ===== B) Lưu mã bot =====
  for (const bad of ['abc', '123:abc', BOT + ' x', '']) { d.getElementById('tn-token').value = bad; d.getElementById('tn-save').click(); await wait(60); }
  check(c.rpcs.length === 0 && !d.getElementById('tn-err').hidden && /định dạng/i.test(d.getElementById('tn-err').textContent), 'mã bot sai định dạng → báo lỗi, KHÔNG gửi gì lên máy chủ');
  d.getElementById('tn-token').value = '  ' + BOT + '  '; d.getElementById('tn-save').click(); await wait(250);
  const rp = lastRpc(c, 'save_telegram_bot');
  check(rp && rp.args.p_token === BOT && Object.keys(rp.args).join() === 'p_token', 'lưu mã bot qua HÀM save_telegram_bot(p_token) — chỉ gửi mã (đã cắt khoảng trắng), không kèm cờ nào khác (không đè cài đặt đã chọn)');
  check(c.upserts.length === 0, 'KHÔNG ghi bằng upsert trực tiếp (lỗi "permission denied for table" đã gặp thật)');
  check(d.getElementById('tn-token').value === '' && !d.body.innerHTML.includes(BOT), 'lưu xong ô mã bot được XÓA SẠCH, mã bot không còn ở bất kỳ đâu trên trang');
  check(/đã lưu mã bot/i.test(d.getElementById('tn-state').textContent) && /Start/.test(d.getElementById('tn-state').textContent) && !d.getElementById('tn-link').disabled, 'trạng thái: "Đã lưu mã bot, chưa kết nối — bấm Start rồi Kết nối"; mở nút Kết nối');
  check(/ẩn|đã lưu/i.test(d.getElementById('tn-token').placeholder), 'ô mã bot ghi "đã lưu (ẩn)"');

  // ===== C) Kết nối (tìm chat ID) =====
  d.getElementById('tn-link').click(); await wait(300);
  const f = c.fnCalls[c.fnCalls.length - 1];
  check(f && /\/functions\/v1\/autopause-notify$/.test(f.url) && f.body.op === 'link' && f.headers.Authorization === 'Bearer JWT-TEST' && !!f.headers.apikey, 'Kết nối → gọi hàm autopause-notify op "link" kèm phiên đăng nhập và apikey');
  check(!JSON.stringify(f.body).includes(BOT), 'nội dung gửi lên không chứa mã bot');
  check(/đã kết nối/i.test(d.getElementById('tn-state').textContent) && /1234/.test(d.getElementById('tn-state').textContent) && d.getElementById('tn-state').dataset.level === 'ok', 'kết nối xong → "Đã kết nối Telegram (chat …1234)" (xanh)');
  check(!d.getElementById('tn-test').disabled && !d.getElementById('tn-report-now').disabled && !d.getElementById('tn-remove').hidden, 'đã kết nối → mở Gửi thử, Gửi thử báo cáo, hiện Xóa kết nối');

  // ===== D) Gửi thử + gửi thử báo cáo =====
  d.getElementById('tn-test').click(); await wait(250);
  check(c.fnCalls[c.fnCalls.length - 1].body.op === 'test' && /đã gửi/i.test(toasts(d)), 'Gửi tin thử → op "test" + báo "Đã gửi"');
  d.getElementById('tn-report-now').click(); await wait(250);
  check(c.fnCalls[c.fnCalls.length - 1].body.op === 'report' && /báo cáo/i.test(toasts(d)), 'Gửi thử báo cáo ngay → op "report" + thông báo');

  // ===== E) Cài đặt báo cáo + cờ: lưu bằng nút, qua hàm save_notify_prefs =====
  const nR = c.rpcs.length;
  d.getElementById('tn-report').checked = true; fire(w, d.getElementById('tn-report'), 'change'); d.getElementById('tn-time').value = '21:30'; fire(w, d.getElementById('tn-time'), 'change'); d.getElementById('tn-dry').checked = true; await wait(100);
  check(c.rpcs.length === nR && c.upserts.length === 0, 'đổi ô chỉ thay đổi trên màn hình, CHƯA gửi gì cho tới khi bấm "Lưu cài đặt thông báo"');
  d.getElementById('tn-prefs-save').click(); await wait(300);
  const pr = lastRpc(c, 'save_notify_prefs');
  check(pr && pr.args.p_report === true && pr.args.p_time === '21:30' && pr.args.p_dry === true && pr.args.p_paused === true && pr.args.p_problem === true && Object.keys(pr.args).sort().join() === 'p_dry,p_paused,p_problem,p_report,p_time', 'Lưu → hàm save_notify_prefs đúng 5 tham số (báo cáo bật, 21:30, cờ) — user do máy chủ lấy từ phiên đăng nhập');
  check(c.upserts.length === 0 && /21:30/.test(toasts(d)), 'không upsert trực tiếp; báo "báo cáo sẽ gửi lúc 21:30"');
  check(d.getElementById('tn-report').checked && d.getElementById('tn-time').value === '21:30' && d.getElementById('tn-dry').checked, 'tải lại từ máy chủ vẫn giữ: báo cáo bật, 21:30, báo chạy thử');
  d.getElementById('tn-time').value = ''; d.getElementById('tn-prefs-save').click(); await wait(100);
  check(lastRpc(c, 'save_notify_prefs') === pr && !d.getElementById('tn-err').hidden && /giờ/i.test(d.getElementById('tn-err').textContent), 'giờ trống → báo lỗi, KHÔNG gửi lên máy chủ');
  check(c.errors.length === 0, 'không lỗi JavaScript' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();

  // ===== F) Lỗi từ máy chủ hiện rõ =====
  c = boot({ settings: { has_bot: true, telegram_chat_id: null, notify_paused: true, notify_problem: true, notify_dry: false, report_enabled: false, report_time: '20:00' }, fnReply: { status: 404, body: { error: { message: 'Chưa thấy tin nhắn nào gửi cho bot. Hãy mở bot trong Telegram, bấm Start rồi bấm Kết nối lại.' } } } });
  await wait(700); d = c.d; w = c.w; await openTab(d);
  d.getElementById('tn-link').click(); await wait(300);
  check(!d.getElementById('tn-err').hidden && /bấm Start/.test(d.getElementById('tn-err').textContent) && d.getElementById('tn-state').dataset.level !== 'ok', 'lỗi từ máy chủ (chưa bấm Start) → hiện nguyên văn hướng dẫn, trạng thái chưa kết nối');
  c.w.close();

  // ===== G) Đã kết nối sẵn: nạp trạng thái, gửi thử lỗi, xóa kết nối =====
  c = boot({ settings: { has_bot: true, telegram_chat_id: '5551234', notify_paused: false, notify_problem: true, notify_dry: true, report_enabled: true, report_time: '08:15', last_notify_at: new Date().toISOString(), last_notify_error: 'Forbidden: bot was blocked by the user' }, fnReply: { status: 502, body: { error: { message: 'Forbidden: bot was blocked by the user' } } } });
  await wait(700); d = c.d; w = c.w; await openTab(d);
  check(!d.getElementById('tn-paused').checked && d.getElementById('tn-problem').checked && d.getElementById('tn-dry').checked, 'nạp cờ đã lưu vào các ô');
  check(d.getElementById('tn-report').checked && d.getElementById('tn-time').value === '08:15', 'nạp báo cáo đã lưu: bật, 08:15');
  check(/1234/.test(d.getElementById('tn-state').textContent) && /blocked|lỗi/i.test(d.getElementById('tn-state').textContent) && d.getElementById('tn-state').dataset.level === 'bad', 'đã kết nối nhưng lần gửi gần nhất lỗi → trạng thái ĐỎ kèm lý do');
  d.getElementById('tn-report-now').click(); await wait(250);
  check(!d.getElementById('tn-err').hidden && /blocked/.test(d.getElementById('tn-err').textContent), 'gửi thử báo cáo lỗi → hiện lý do');
  w.confirm = () => false; d.getElementById('tn-remove').click(); await wait(150);
  check(c.deletes.length === 0, 'Xóa kết nối nhưng BẤM HỦY → không xóa');
  w.confirm = () => true; d.getElementById('tn-remove').click(); await wait(250);
  check(c.deletes.length === 1 && c.deletes[0].c === 'user_id' && c.deletes[0].v === 'u1', 'xác nhận → xóa dòng cài đặt của chính mình (theo user_id)');
  check(/chưa kết nối/i.test(d.getElementById('tn-state').textContent) && d.getElementById('tn-link').disabled && !d.getElementById('tn-report').checked, 'sau khi xóa → về "Chưa kết nối", khóa nút, báo cáo về tắt');
  check(c.errors.length === 0, 'không lỗi JavaScript' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();

  // ===== G2) Máy chủ từ chối: hiện lý do, mã bot vẫn bị xóa khỏi ô =====
  c = boot({ rpcError: 'Mã bot không đúng định dạng (phải dạng 123456789:AAE…)' }); await wait(700); d = c.d; w = c.w; await openTab(d);
  d.getElementById('tn-token').value = BOT; d.getElementById('tn-save').click(); await wait(250);
  check(!d.getElementById('tn-err').hidden && /định dạng/.test(d.getElementById('tn-err').textContent) && d.getElementById('tn-token').value === '' && !d.body.innerHTML.includes(BOT) && /chưa kết nối/i.test(d.getElementById('tn-state').textContent), 'hàm lưu mã bot báo lỗi → hiện lý do, ô mã bot được xóa, trạng thái vẫn "chưa kết nối"');
  d.getElementById('tn-prefs-save').click(); await wait(200);
  check(!d.getElementById('tn-err').hidden && /định dạng/.test(d.getElementById('tn-err').textContent) && c.upserts.length === 0, 'lưu cài đặt bị máy chủ từ chối → hiện lý do, không lỗi JS');
  c.w.close();

  // ===== H) Khóa: tài khoản test local, bảng/cột chưa có =====
  c = boot({ local: true }); await wait(700); d = c.d; await openTab(d);
  check(['tn-token', 'tn-save', 'tn-link', 'tn-test', 'tn-paused', 'tn-report', 'tn-time', 'tn-report-now', 'tn-prefs-save'].every(id => d.getElementById(id).disabled) && /test/i.test(d.getElementById('tn-note').textContent) && !d.getElementById('tn-note').hidden, 'tài khoản test local: khóa mọi ô + giải thích');
  check(c.errors.length === 0, 'không lỗi JavaScript (local)' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();
  c = boot({ missingTable: true }); await wait(700); d = c.d; await openTab(d);
  check(!d.getElementById('tn-note').hidden && /chưa/i.test(d.getElementById('tn-note').textContent) && d.getElementById('tn-save').disabled && d.getElementById('tn-prefs-save').disabled, 'bảng/cột chưa có trên máy chủ → báo "chưa kích hoạt" và khóa (không lỗi)');
  check(c.errors.length === 0, 'không lỗi JavaScript khi bảng chưa có' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();

  // ===== H2) Mở thẳng Cài đặt → Telegram (không qua tab Thông báo) vẫn nạp tình trạng kết nối =====
  c = boot({ settings: { has_bot: true, telegram_chat_id: '5559876', notify_paused: true, notify_problem: true, notify_dry: false, report_enabled: false, report_time: '20:00' } }); await wait(700); d = c.d;
  d.querySelector('#side [data-side-tab="settings"]').click(); d.getElementById('set-tab-tg').click(); await wait(400);
  check(/9876/.test(d.getElementById('tn-state').textContent) && d.getElementById('tn-state').dataset.level === 'ok' && !d.getElementById('tn-test').disabled, 'mở thẳng Cài đặt → Telegram: nạp đúng "Đã kết nối (chat …9876)", mở nút Gửi thử; dòng ở tab Thông báo không còn nhắc kết nối');
  check(c.errors.length === 0, 'không lỗi JavaScript khi mở Cài đặt' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();

  // ===== I) Phím mũi tên chuyển tab theo thứ tự có tab Thông báo; tab đã lưu được khôi phục =====
  c = boot({}); await wait(700); d = c.d; w = c.w;
  d.getElementById('tab-toggle').click(); await wait(200); d.getElementById('tabs').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(300);
  check(d.getElementById('tab-notify').getAttribute('aria-selected') === 'true', 'mũi tên phải từ "Bật / Tắt" → "Thông báo"');
  d.getElementById('tabs').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(300);
  check(d.getElementById('tab-settings').getAttribute('aria-selected') === 'true', 'mũi tên phải tiếp → "Cài đặt"');
  check(c.errors.length === 0, 'không lỗi JavaScript khi chuyển tab' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
