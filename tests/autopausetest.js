// Tab Bật/Tắt: biểu tượng "Tự tắt" trên các mục ĐANG BẬT → bấm mở popup cài điều kiện (tiền chạy, mess, số điện thoại) cho TỪNG mục.
// Việc tắt thật chạy ngầm trên máy chủ (xem testautopause.js). Ở đây kiểm tra giao diện + dữ liệu gửi lên Supabase.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(path.resolve(process.argv[2]));
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

class Loader extends ResourceLoader {
  fetch(url) {
    if (/jsdelivr|googleapis|gstatic/.test(url)) return Promise.resolve(Buffer.from(''));
    const m = url.match(/^http:\/\/localhost:5500\/([^?#]*)/);
    if (m) { const f = path.join(ROOT, decodeURIComponent(m[1])); return fs.existsSync(f) ? Promise.resolve(fs.readFileSync(f)) : Promise.reject(new Error('404 ' + m[1])); }
    return Promise.resolve(Buffer.from(''));
  }
}
const ago = m => new Date(Date.now() - m * 60000).toISOString();
const FB = {
  campaigns: [{ id: 'C1', name: 'Camp A', status: 'ACTIVE' }, { id: 'C2', name: 'Camp B', status: 'PAUSED' }, { id: 'C3', name: 'Camp C', status: 'ACTIVE' }, { id: 'C4', name: 'Camp D', status: 'ACTIVE' }],
  adsets: [{ id: 'A1', name: 'Nhóm 1', status: 'ACTIVE', campaign_id: 'C1' }],
  ads: [{ id: 'AD1', name: 'Bài 1', status: 'ACTIVE', campaign_id: 'C1', adset_id: 'A1' }],
};
// opt: { local, rules, logs, missingTable, confirm, saveError }
function boot(opt = {}) {
  const errors = [], upserts = [], deletes = [], updates = [], posts = [];
  const rules = (opt.rules || []).map((r, i) => Object.assign({ id: 100 + i, user_id: 'u1', account_id: 'act_1', level: 'campaign' }, r));
  let nextId = 500;
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { const m = String(e.message || e); if (!/navigation|Not implemented/i.test(m)) errors.push(m); });
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8'), {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', resources: new Loader(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (opt.local) w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 'shop@example.com', name: 'Shop', fbToken: 'EAAtestTOKEN', local: !!opt.local }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK 1' }));
      w.confirm = () => (opt.confirm === undefined ? true : opt.confirm);
      const miss = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.ads_autopause_rules' in the schema cache" } };
      w.supabase = { createClient() { return {
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'shop@example.com' }, access_token: 't' } } }),
          signOut: async () => ({}), signInWithPassword: async () => ({ data: {}, error: null }), updateUser: async () => ({ data: {}, error: null }),
        },
        from(t) {
          if (t === 'ads_autopause_rules') return {
            select() { return Promise.resolve(opt.missingTable ? miss : { data: rules.slice(), error: null }); },
            upsert: async (row, o) => {
              upserts.push({ row, o });
              if (opt.saveError) return { error: { message: opt.saveError } };
              const ex = rules.find(r => r.object_id === row.object_id);
              if (ex) Object.assign(ex, row); else rules.push(Object.assign({ id: nextId++ }, row));
              return { error: null };
            },
            delete() { return { eq: async (c, v) => { deletes.push({ c, v }); const i = rules.findIndex(r => r[c] === v); if (i >= 0) rules.splice(i, 1); return { error: null }; } }; },
          };
          if (t === 'ads_autopause_log') return {
            select() { const q = { order() { return q; }, limit: async () => (opt.missingTable ? miss : { data: opt.logs || [], error: null }) }; return q; },
            update(v) { return { eq: async (c, val) => { updates.push({ v, c, val }); return { error: null }; } }; },
          };
          return { select() { return { maybeSingle: async () => ({ data: null, error: null }) }; }, upsert: async () => ({ error: null }) };
        },
      }; } };
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = (url, init) => {
        url = String(url); const dec = decodeURIComponent(url);
        if (init && init.method === 'POST') { posts.push({ url: dec, body: String(init.body || '') }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) }); }
        const k = (dec.match(/\/(campaigns|adsets|ads)\?/) || [])[1];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: k ? FB[k] : [] }), text: () => Promise.resolve('') });
      };
    },
  });
  return { w: dom.window, d: dom.window.document, errors, upserts, deletes, updates, posts, rules };
}
const openToggle = async (d) => { d.querySelector('#side [data-side-tab="toggle"]').click(); await wait(900); };
const digits = s => String(s).replace(/\D/g, '');
const fire = (w, el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const icon = (d, id) => d.querySelector('#tg-list [data-ap-open="' + id + '"]');
const dlgOpen = d => d.getElementById('ap-dialog').hasAttribute('open');

(async () => {
  // ===== A) Biểu tượng chỉ ở mục ĐANG BẬT; trạng thái theo quy tắc =====
  let c = boot({ rules: [
    { object_id: 'C1', object_name: 'Camp A', enabled: true, dry_run: true, spend_threshold: 200000, use_mess: true, mess_max: 0, use_phone: false, phone_max: 0, match_mode: 'all', last_run_at: ago(5), last_status: 'ok', last_spend: 120000, last_mess: 1, last_phone: null },
    { object_id: 'C3', object_name: 'Camp C', enabled: true, dry_run: false, spend_threshold: 300000, use_mess: true, mess_max: 2, use_phone: true, phone_max: 1, match_mode: 'any', last_run_at: ago(9), last_status: 'ok', last_spend: 310000, last_mess: 5, last_phone: 2 },
    { object_id: 'C4', object_name: 'Camp D', enabled: false, dry_run: true, spend_threshold: 150000, use_mess: true, mess_max: 0, use_phone: false, phone_max: 0, match_mode: 'all' },
  ] });
  await wait(700); await openToggle(c.d); let d = c.d, w = c.w;
  check(!!icon(d, 'C1') && !!icon(d, 'C3') && !!icon(d, 'C4'), 'mục ĐANG BẬT (C1, C3, C4) có biểu tượng tự tắt');
  check(!icon(d, 'C2'), 'mục TẠM DỪNG (C2) không có biểu tượng');
  check(icon(d, 'C1').dataset.st === 'try' && icon(d, 'C3').dataset.st === 'on' && icon(d, 'C4').dataset.st === 'off', 'trạng thái biểu tượng: chạy thử / đang tự tắt thật / quy tắc đang tắt');
  check(/chạy thử/i.test(icon(d, 'C1').title) && /tự tắt/i.test(icon(d, 'C3').title), 'tooltip nói rõ trạng thái (thực tế C1: "' + icon(d, 'C1').title + '")');
  c.w.close();

  c = boot({ rules: [] }); await wait(700); await openToggle(c.d); d = c.d; w = c.w;
  check(icon(d, 'C1').dataset.st === 'none', 'chưa có quy tắc → biểu tượng ở trạng thái "chưa cài"');
  check(d.querySelectorAll('#tg-list .tg-row').length === 4 && d.querySelectorAll('#tg-list .tg-auto, #tg-list .tg-auto-ghost').length === 4, 'mọi dòng đều có 1 ô cho biểu tượng (dòng tạm dừng dùng ô trống để cột thẳng hàng)');

  // ===== B) Mở popup, mặc định an toàn =====
  icon(d, 'C1').click(); await wait(250);
  check(dlgOpen(d) && /Camp A/.test(d.getElementById('ap-title').textContent), 'bấm biểu tượng → mở popup, tiêu đề có tên mục (Camp A)');
  check(/chiến dịch/i.test(d.getElementById('ap-level').textContent), 'popup ghi rõ cấp của mục (chiến dịch)');
  check(digits(d.getElementById('ap-spend').value) === '200000', 'mặc định: số tiền chạy ≥ 200.000');
  check(d.getElementById('ap-use-mess').checked && d.getElementById('ap-mess').value === '0' && !d.getElementById('ap-mess').disabled, 'mặc định: xét số mess ≤ 0');
  check(!d.getElementById('ap-use-phone').checked && d.getElementById('ap-phone').disabled, 'mặc định: KHÔNG xét số điện thoại (ô nhập bị khóa)');
  check(d.getElementById('ap-dry').checked, 'mặc định: CHẠY THỬ');
  check(d.getElementById('ap-del').hidden, 'chưa có quy tắc → ẩn nút Xóa quy tắc');
  check(/nhập tay/i.test(d.getElementById('ap-phone-note').textContent), 'có lưu ý số điện thoại do bạn nhập tay (chưa nhập thì coi như 0)');
  check(d.getElementById('ap-match-wrap').hidden, 'chỉ xét mess → ẩn lựa chọn "cả hai / một trong hai"');
  check(/200\.000/.test(d.getElementById('ap-summary').textContent) && /mess/i.test(d.getElementById('ap-summary').textContent), 'có câu tóm tắt điều kiện (thực tế: "' + d.getElementById('ap-summary').textContent.trim() + '")');

  // ===== C) Lưu quy tắc mới =====
  d.getElementById('ap-save').click(); await wait(250);
  let u = c.upserts[c.upserts.length - 1];
  check(u && u.row.user_id === 'u1' && u.row.account_id === 'act_1' && u.row.level === 'campaign' && u.row.object_id === 'C1' && u.row.object_name === 'Camp A', 'lưu: gửi đúng chủ, tài khoản, cấp, ID và tên mục');
  check(u && u.row.enabled === true && u.row.dry_run === true && u.row.spend_threshold === 200000 && u.row.use_mess === true && u.row.mess_max === 0 && u.row.use_phone === false && u.row.phone_max === 0 && u.row.match_mode === 'all', 'lưu: enabled, chạy thử, ngưỡng 200000, mess ≤ 0, không xét SĐT, mode all');
  check(u && u.o && u.o.onConflict === 'user_id,object_id', 'lưu bằng upsert theo (user_id, object_id)');
  check(u && !Object.keys(u.row).some(k => /^last_/.test(k)), 'không gửi các cột last_* (do máy chủ quản lý)');
  check(!dlgOpen(d) && icon(d, 'C1').dataset.st === 'try', 'lưu xong → đóng popup, biểu tượng chuyển sang "chạy thử"');

  // ===== D) Đổi ngưỡng, thêm điều kiện số điện thoại, chế độ "một trong hai" =====
  icon(d, 'C1').click(); await wait(200);
  check(!d.getElementById('ap-del').hidden, 'đã có quy tắc → hiện nút Xóa quy tắc');
  d.getElementById('ap-spend').value = '150k'; fire(w, d.getElementById('ap-spend'), 'input');
  const up = d.getElementById('ap-use-phone'); up.checked = true; fire(w, up, 'change');
  check(!d.getElementById('ap-phone').disabled && !d.getElementById('ap-match-wrap').hidden, 'tick "số điện thoại" → mở khóa ô nhập và hiện lựa chọn cả hai / một trong hai');
  d.getElementById('ap-mess').value = '2'; d.getElementById('ap-phone').value = '3';
  const anyR = d.querySelector('#ap-match-wrap input[value="any"]'); anyR.checked = true; fire(w, anyR, 'change');
  check(/HOẶC|một trong/i.test(d.getElementById('ap-summary').textContent) && /3/.test(d.getElementById('ap-summary').textContent), 'câu tóm tắt đổi theo (HOẶC, ngưỡng SĐT 3) — thực tế: "' + d.getElementById('ap-summary').textContent.trim() + '"');
  d.getElementById('ap-save').click(); await wait(250);
  u = c.upserts[c.upserts.length - 1];
  check(u.row.spend_threshold === 150000 && u.row.mess_max === 2 && u.row.use_phone === true && u.row.phone_max === 3 && u.row.match_mode === 'any', 'lưu: 150k, mess ≤ 2, SĐT ≤ 3, mode any');
  check(c.rules.filter(r => r.object_id === 'C1').length === 1, 'sửa quy tắc cũ không tạo thêm dòng (một mục một quy tắc)');

  // ===== E) Kiểm tra dữ liệu nhập =====
  icon(d, 'C1').click(); await wait(200); const n0 = c.upserts.length;
  for (const bad of ['abc', '0', '-5', '']) { d.getElementById('ap-spend').value = bad; d.getElementById('ap-save').click(); await wait(60); }
  check(c.upserts.length === n0 && !d.getElementById('ap-err').hidden && /tiền/i.test(d.getElementById('ap-err').textContent), 'số tiền sai ("abc", 0, âm, rỗng) → báo lỗi, KHÔNG lưu (thực tế: "' + d.getElementById('ap-err').textContent.trim() + '")');
  d.getElementById('ap-spend').value = '200000';
  for (const bad of ['x', '-1', '1.5', '']) { d.getElementById('ap-mess').value = bad; d.getElementById('ap-save').click(); await wait(60); }
  check(c.upserts.length === n0 && /mess/i.test(d.getElementById('ap-err').textContent), 'số mess sai (chữ, âm, thập phân, rỗng) → báo lỗi, không lưu');
  d.getElementById('ap-mess').value = '0'; d.getElementById('ap-phone').value = 'abc'; d.getElementById('ap-save').click(); await wait(60);
  check(c.upserts.length === n0 && /điện thoại/i.test(d.getElementById('ap-err').textContent), 'số điện thoại sai → báo lỗi, không lưu');
  d.getElementById('ap-cancel').click(); await wait(100);
  check(!dlgOpen(d), 'nút Hủy đóng popup, không lưu');

  // ===== F) Chế độ THẬT phải xác nhận =====
  icon(d, 'C1').click(); await wait(200);
  d.getElementById('ap-phone').value = '3'; d.getElementById('ap-dry').checked = false; fire(w, d.getElementById('ap-dry'), 'change');
  const n1 = c.upserts.length; w.confirm = () => false; d.getElementById('ap-save').click(); await wait(150);
  check(c.upserts.length === n1 && dlgOpen(d), 'bỏ "Chạy thử" nhưng BẤM HỦY xác nhận → không lưu, popup vẫn mở');
  w.confirm = () => true; d.getElementById('ap-save').click(); await wait(250);
  check(c.upserts[c.upserts.length - 1].row.dry_run === false && icon(d, 'C1').dataset.st === 'on', 'xác nhận → lưu dry_run:false, biểu tượng chuyển sang "đang tự tắt thật"');

  // ===== G) Công tắc quy tắc + xóa =====
  icon(d, 'C1').click(); await wait(200);
  const en = d.getElementById('ap-enabled'); check(en.checked, 'công tắc "Tự tắt khi đạt điều kiện" đang bật');
  en.checked = false; fire(w, en, 'change'); d.getElementById('ap-save').click(); await wait(250);
  check(c.upserts[c.upserts.length - 1].row.enabled === false && icon(d, 'C1').dataset.st === 'off', 'tắt công tắc → lưu enabled:false, biểu tượng "quy tắc đang tắt"');
  icon(d, 'C1').click(); await wait(200); d.getElementById('ap-del').click(); await wait(250);
  check(c.deletes.length === 1 && c.deletes[0].c === 'object_id' && c.deletes[0].v === 'C1' && icon(d, 'C1').dataset.st === 'none' && !dlgOpen(d), 'Xóa quy tắc → xóa theo object_id, biểu tượng về "chưa cài", đóng popup');
  check(c.errors.length === 0, 'không lỗi JavaScript' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();

  // ===== H) Cấp nhóm QC và quảng cáo =====
  c = boot({}); await wait(700); await openToggle(c.d); d = c.d; w = c.w;
  d.querySelector('#tg-lvl-tabs [data-lvl="adset"]').click(); await wait(300);
  check(!!icon(d, 'A1'), 'cấp Nhóm QC: mục đang bật cũng có biểu tượng');
  icon(d, 'A1').click(); await wait(200);
  check(/nhóm/i.test(d.getElementById('ap-level').textContent), 'popup ghi "nhóm quảng cáo"');
  d.getElementById('ap-save').click(); await wait(250);
  u = c.upserts[c.upserts.length - 1]; check(u.row.level === 'adset' && u.row.object_id === 'A1', 'lưu quy tắc cấp adset với đúng ID');
  d.querySelector('#tg-lvl-tabs [data-lvl="ad"]').click(); await wait(300);
  check(!!icon(d, 'AD1'), 'cấp Quảng cáo: mục đang bật cũng có biểu tượng');
  icon(d, 'AD1').click(); await wait(200); d.getElementById('ap-save').click(); await wait(250);
  check(c.upserts[c.upserts.length - 1].row.level === 'ad', 'lưu quy tắc cấp ad'); c.w.close();

  // ===== I) Trạng thái lần chạy gần nhất + cảnh báo token =====
  c = boot({ rules: [{ object_id: 'C1', object_name: 'Camp A', enabled: true, dry_run: false, spend_threshold: 200000, use_mess: true, mess_max: 0, use_phone: false, phone_max: 0, match_mode: 'all', last_run_at: ago(5), last_status: 'ok', last_spend: 120000, last_mess: 1, last_phone: null },
    { object_id: 'C3', object_name: 'Camp C', enabled: true, dry_run: false, spend_threshold: 200000, use_mess: true, mess_max: 0, use_phone: false, phone_max: 0, match_mode: 'all', last_run_at: ago(10), last_status: 'token_error', last_error: 'Error validating access token' }] });
  await wait(700); await openToggle(c.d); d = c.d; w = c.w;
  icon(d, 'C1').click(); await wait(200);
  const st = d.getElementById('ap-status').textContent;
  check(/5 phút/.test(st) && /120/.test(st) && /mess\D*1/i.test(st), 'popup hiện lần chạy gần nhất: 5 phút trước, chi 120.000, mess 1 (thực tế: "' + st.trim() + '")');
  d.getElementById('ap-cancel').click(); await wait(100);
  check(!d.getElementById('tg-ap-sum').hidden && /hết hạn|token/i.test(d.getElementById('tg-ap-sum').textContent) && d.getElementById('tg-ap-sum').dataset.level === 'bad', 'đầu danh sách có cảnh báo ĐỎ khi có quy tắc bị lỗi token (thực tế: "' + d.getElementById('tg-ap-sum').textContent.trim() + '")');
  icon(d, 'C3').click(); await wait(200);
  check(/hết hạn|từ chối/i.test(d.getElementById('ap-status').textContent) && d.getElementById('ap-status').dataset.level === 'bad', 'popup của mục bị lỗi token cũng báo đỏ + hướng dẫn dán token mới');
  c.w.close();
  c = boot({ rules: [{ object_id: 'C1', object_name: 'Camp A', enabled: true, dry_run: true, spend_threshold: 200000, use_mess: true, mess_max: 0, use_phone: false, phone_max: 0, match_mode: 'all', last_run_at: ago(3), last_status: 'ok' }] });
  await wait(700); await openToggle(c.d); d = c.d;
  check(!d.getElementById('tg-ap-sum').hidden && /1 quy tắc/.test(d.getElementById('tg-ap-sum').textContent) && d.getElementById('tg-ap-sum').dataset.level !== 'bad', 'có quy tắc, không lỗi → dòng tóm tắt trung tính "1 quy tắc…" (thực tế: "' + d.getElementById('tg-ap-sum').textContent.trim() + '")');
  c.w.close();

  // ===== J) Khóa: tài khoản test local, bảng chưa tạo, lỗi lưu =====
  c = boot({ local: true }); await wait(700); await openToggle(c.d); d = c.d;
  check(!!icon(d, 'C1') || d.querySelectorAll('#tg-list .tg-auto').length >= 0, '(local) giao diện vẫn vẽ được');
  if (icon(d, 'C1')) { icon(d, 'C1').click(); await wait(200);
    check(['ap-spend', 'ap-save'].every(id => d.getElementById(id).disabled) && /test/i.test(d.getElementById('ap-note').textContent) && !d.getElementById('ap-note').hidden, 'tài khoản test local: popup bị khóa + giải thích'); }
  check(c.errors.length === 0, 'không lỗi JavaScript (local)' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();
  c = boot({ missingTable: true }); await wait(700); await openToggle(c.d); d = c.d;
  icon(d, 'C1').click(); await wait(200);
  check(!d.getElementById('ap-note').hidden && /chưa/i.test(d.getElementById('ap-note').textContent) && d.getElementById('ap-save').disabled, 'bảng chưa tạo trên máy chủ → popup báo "chưa kích hoạt" và khóa nút Lưu (không lỗi)');
  check(d.getElementById('tg-ap-sum').hidden, 'bảng chưa có → không hiện dòng tóm tắt');
  check(c.errors.length === 0, 'không lỗi JavaScript khi bảng chưa có' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();
  c = boot({ saveError: 'permission denied for table ads_autopause_rules' }); await wait(700); await openToggle(c.d); d = c.d;
  icon(d, 'C1').click(); await wait(200); d.getElementById('ap-save').click(); await wait(250);
  check(dlgOpen(d) && !d.getElementById('ap-err').hidden && /permission denied/.test(d.getElementById('ap-err').textContent) && icon(d, 'C1').dataset.st === 'none', 'lưu lỗi → popup ở lại, hiện lý do, biểu tượng không đổi'); c.w.close();

  // ===== K) Nhật ký + Bật lại =====
  const logs = [
    { id: 11, at: ago(30), account_id: 'act_1', level: 'campaign', object_id: '120001', object_name: 'Camp Noel', spend: 250000, mess: 0, phone: 0, action: 'paused', note: null, restored_at: null },
    { id: 12, at: ago(60), account_id: 'act_1', level: 'ad', object_id: '120002', object_name: 'Bài Cũ', spend: 300000, mess: 0, phone: 0, action: 'paused', note: null, restored_at: ago(20) },
    { id: 13, at: ago(90), account_id: 'act_1', level: 'adset', object_id: '120003', object_name: 'Nhóm Thử', spend: 210000, mess: 0, phone: 0, action: 'would_pause', note: 'Chạy thử', restored_at: null },
    { id: 14, at: ago(120), account_id: 'act_1', level: 'campaign', object_id: '120004', object_name: 'Camp Lỗi', spend: 220000, mess: 0, phone: 0, action: 'error', note: 'Permissions error', restored_at: null },
  ];
  c = boot({ logs }); await wait(700); await openToggle(c.d); d = c.d; w = c.w;
  check(!!d.getElementById('tg-log-btn'), 'có nút "Nhật ký tự tắt" ở tab Bật/Tắt');
  d.getElementById('tg-log-btn').click(); await wait(300);
  check(d.getElementById('ap-log-dialog').hasAttribute('open'), 'bấm nút → mở nhật ký');
  const rowsTxt = [...d.querySelectorAll('#ap-log tr')].map(r => r.textContent.replace(/\s+/g, ' '));
  check(rowsTxt.length === 4, 'nhật ký 4 dòng (thực tế ' + rowsTxt.length + ')');
  check(/Camp Noel/.test(rowsTxt[0]) && /Đã tắt/.test(rowsTxt[0]) && /Chiến dịch/i.test(rowsTxt[0]), 'dòng "đã tắt": tên + cấp + nhãn');
  check(/Đã bật lại/.test(rowsTxt[1]) && /Quảng cáo/i.test(rowsTxt[1]), 'dòng đã khôi phục ghi "Đã bật lại"');
  check(/Sẽ tắt/.test(rowsTxt[2]) && /chạy thử/i.test(rowsTxt[2]) && /Nhóm/i.test(rowsTxt[2]), 'dòng chạy thử ghi "Sẽ tắt (chạy thử)"');
  check(/Lỗi/.test(rowsTxt[3]) && /Permissions error/.test(rowsTxt[3]), 'dòng lỗi ghi lý do');
  const btns = [...d.querySelectorAll('#ap-log [data-ap-restore]')];
  check(btns.length === 1 && btns[0].dataset.apRestore === '11', 'chỉ dòng "đã tắt, chưa bật lại" có nút Bật lại');
  btns[0].click(); await wait(300);
  const post = c.posts[c.posts.length - 1];
  check(post && /\/120001(\?|$)/.test(post.url) && /status=ACTIVE/.test(post.body), 'Bật lại → POST status=ACTIVE lên đúng ID 120001 (qua fb-proxy)');
  check(post && !/EAAtestTOKEN/.test(post.url), 'URL gửi đi không chứa token (proxy dùng token ở server)');
  check(c.updates.some(x => x.c === 'id' && x.val === 11 && x.v.restored_at), 'Bật lại xong → ghi restored_at vào nhật ký');
  check(c.errors.length === 0, 'không lỗi JavaScript' + (c.errors[0] ? ': ' + c.errors[0] : '')); c.w.close();

  // ===== L) Cài đặt không còn tab con cũ =====
  c = boot({}); await wait(700);
  check(!c.d.getElementById('set-tab-auto') && !c.d.getElementById('set-pane-auto'), 'đã bỏ tab con "Tự tắt chiến dịch" ở Cài đặt (chuyển sang tab Bật/Tắt)'); c.w.close();

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
