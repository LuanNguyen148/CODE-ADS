// Mở lại ứng dụng (iOS giữ trang trong bộ nhớ khi ẩn): phải tự làm mới số liệu. Vắng lâu hoặc sang ngày mới thì nạp lại trang.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

(async () => {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { const m = String(e.message || e); if (!/navigation|Not implemented/i.test(m)) errors.push(m); });
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(900);
  let reloads = 0, syncs = 0, toggles = 0;
  w.ADS_RELOAD = () => { reloads++; };
  const btn = d.getElementById('fb-sync-btn');
  btn.addEventListener('click', () => { syncs++; });          // đếm số lần bấm ngầm nút "Lấy số liệu"
  w.renderToggleView = () => { toggles++; };
  const p2 = n => String(n).padStart(2, '0'), n0 = new Date(), today = n0.getFullYear() + '-' + p2(n0.getMonth() + 1) + '-' + p2(n0.getDate());
  const reset = () => { reloads = 0; syncs = 0; toggles = 0; };
  const setTab = async t => { d.getElementById('bn-' + t).click(); await wait(150); };

  check(typeof w.ADS_RESUME === 'function', 'có cơ chế làm mới khi mở lại ứng dụng (ADS_RESUME)');
  // --- Báo cáo ngày ---
  await setTab('day'); reset();
  check(w.ADS_RESUME(5000, today) === 'bỏ qua' && syncs === 0 && reloads === 0, 'vắng 5 giây (lướt qua ứng dụng khác) → KHÔNG làm gì');
  check(w.ADS_RESUME(30000, today) === 'lấy số liệu' && syncs === 1 && reloads === 0, 'vắng 30 giây ở Báo cáo ngày → lấy lại số liệu đang xem (bấm ngầm "Lấy số liệu")');
  reset(); btn.disabled = true;
  check(w.ADS_RESUME(30000, today) === 'bỏ qua' && syncs === 0, 'đang tải dở (nút bị khóa) → không bấm chồng thêm lần nữa'); btn.disabled = false;
  // --- Tổng theo ngày ---
  await setTab('days'); reset();
  check(w.ADS_RESUME(60000, today) === 'lấy số liệu' && syncs === 1, 'vắng 1 phút ở Tổng theo ngày → lấy lại số liệu của khoảng đang xem');
  // --- Bật/Tắt ---
  await setTab('toggle'); reset();
  check(w.ADS_RESUME(45000, today) === 'làm mới Bật/Tắt' && syncs === 0, 'vắng 45 giây ở Bật/Tắt → làm mới trạng thái + chi tiêu hôm nay');
  // --- Tab không cần dữ liệu ---
  await setTab('settings'); reset();
  check(w.ADS_RESUME(120000, today) === 'bỏ qua' && syncs === 0 && toggles === 0 && reloads === 0, 'ở Cài đặt → không gọi Facebook vô ích');
  await setTab('notify'); reset();
  check(w.ADS_RESUME(120000, today) === 'bỏ qua' && syncs === 0, 'ở Thông báo → không gọi Facebook vô ích');
  // --- Vắng lâu / sang ngày mới → nạp lại ---
  await setTab('day'); reset();
  check(w.ADS_RESUME(10 * 60 * 1000, today) === 'nạp lại' && reloads === 1 && syncs === 0, 'vắng đủ 10 phút → nạp lại cả trang (lấy lại cloud + danh sách tài khoản + số liệu)');
  reset();
  check(w.ADS_RESUME(9 * 60 * 1000, today) === 'lấy số liệu' && reloads === 0, 'vắng 9 phút → chưa nạp lại, chỉ lấy số liệu');
  reset();
  check(w.ADS_RESUME(20000, '2099-01-01') === 'nạp lại' && reloads === 1, 'đã sang NGÀY MỚI (dù chỉ vắng 20 giây) → nạp lại để chuyển sang ngày hôm nay');
  reset(); w.ADS_RELOADING = true;
  check(w.ADS_RESUME(30 * 60 * 1000, '2099-01-01') === 'bỏ qua' && reloads === 0, 'đang nạp lại dở (nhận bản cloud) → không chồng thêm lần nạp');
  w.ADS_RELOADING = false;

  // --- Sự kiện thật: ẩn rồi hiện lại trang, đo thời gian bằng Date.now ---
  await setTab('day'); reset();
  const realNow = w.Date.now; let clock = realNow();
  w.Date.now = () => clock;
  const vis = s => { Object.defineProperty(d, 'visibilityState', { value: s, configurable: true }); d.dispatchEvent(new w.Event('visibilitychange')); };
  vis('hidden'); clock += 40000; vis('visible'); await wait(50);
  check(syncs === 1, 'ẩn ứng dụng 40 giây rồi mở lại (sự kiện visibilitychange) → tự lấy lại số liệu');
  reset(); vis('hidden'); clock += 3000; vis('visible'); await wait(50);
  check(syncs === 0 && reloads === 0, 'ẩn 3 giây rồi mở lại → không làm gì');
  reset(); vis('hidden'); clock += 11 * 60 * 1000; vis('visible'); await wait(50);
  check(reloads === 1, 'ẩn 11 phút rồi mở lại → nạp lại trang');
  reset(); d.dispatchEvent(new w.Event('pause')); clock += 25000; d.dispatchEvent(new w.Event('resume')); await wait(50);
  check(syncs === 1, 'sự kiện pause/resume của khung ứng dụng (Capacitor) cũng làm mới số liệu');
  reset(); w.dispatchEvent(Object.assign(new w.Event('pageshow'), { persisted: true })); await wait(20);
  check(reloads === 1, 'trang khôi phục từ bộ nhớ đệm (pageshow persisted) → nạp lại');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
