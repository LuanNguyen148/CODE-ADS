// Bộ lọc ngày của "Báo cáo ngày" và "Tổng theo ngày" TÁCH RIÊNG: chọn ngày/khoảng ở tab này không đổi tab kia.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');
const day = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const today = day(0);
const row = (name, spend) => ({ accountId: 'act_1', campaign: 'C', campaign_id: 'C1', adset: 'A', adset_id: 'A1', name, ad_id: name, spend: String(spend), mess: 5, phone: 1, rev: '1000000' });
const days = {}; for (let i = 0; i <= 8; i++) days[day(-i)] = [row('Bài ' + i, 100000 * (i + 1))];
const seed = { t1: 25, t2: 35, day: today, byAcc: { act_1: { name: 'TK', days } } };

(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      w.localStorage.setItem('ads-eval-v1-s@e.com', JSON.stringify(seed));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(700);
  const val = id => d.getElementById(id).value;
  const pick = async (f, tt) => { d.getElementById('dp-from').value = f; d.getElementById('dp-to').value = tt; d.getElementById('dp-apply').click(); await wait(350); };
  const goDays = async () => { d.getElementById('tab-days').click(); await wait(300); };
  const goDay = async () => { d.getElementById('tab-day').click(); await wait(300); };
  const label = () => d.getElementById('dp-btn').textContent.replace(/\s+/g, ' ').trim();
  const sel = () => val('dp-from') + '..' + val('dp-to');            // ngày/khoảng đang hiện ở ô chọn ngày
  const rowsOfStats = () => [...d.querySelectorAll('#stab tbody tr[data-d]')].map(r => r.dataset.d);
  const ONE = x => x + '..' + x;

  // Báo cáo ngày: chọn hôm qua
  await pick(day(-1), day(-1));
  check(sel() === ONE(day(-1)) && val('day') === day(-1), 'Báo cáo ngày: chọn hôm qua (1 ngày)');
  const dayLabel1 = label();

  // Sang Tổng theo ngày: có khoảng RIÊNG (mặc định 7 ngày gần nhất), không dính ngày hôm qua của Báo cáo ngày
  await goDays();
  check(sel() === day(-6) + '..' + today, 'Tổng theo ngày: có khoảng riêng 7 ngày gần nhất, KHÔNG lấy ngày hôm qua của Báo cáo ngày (thực tế: ' + sel() + ')');
  check(label() !== dayLabel1 && !d.getElementById('rangeCard').hidden && d.getElementById('metaDay').parentNode.id === 'rng-date-slot', 'ô chọn ngày hiện khoảng riêng và nằm ở tab Tổng theo ngày');
  check(rowsOfStats().length === 7, 'bảng Tổng theo ngày hiện 7 ngày (thực tế: ' + rowsOfStats().length + ')');

  // Đổi khoảng ở Tổng theo ngày
  await pick(day(-4), day(-1));
  check(sel() === day(-4) + '..' + day(-1) && rowsOfStats().length === 4 && rowsOfStats().includes(day(-4)) && rowsOfStats().includes(day(-1)), 'Tổng theo ngày: chọn khoảng ' + day(-4) + ' → ' + day(-1) + ', bảng đúng 4 ngày');

  // Về Báo cáo ngày: vẫn là hôm qua, 1 ngày
  await goDay();
  check(sel() === ONE(day(-1)) && val('day') === day(-1), 'về Báo cáo ngày: vẫn xem hôm qua (1 ngày), KHÔNG bị đổi theo khoảng của Tổng theo ngày (thực tế: ' + sel() + ')');
  check(label() === dayLabel1 && d.getElementById('metaDay').parentNode.id === 'hier-date-slot', 'ô chọn ngày của Báo cáo ngày hiện lại đúng nhãn cũ');
  check(!d.getElementById('list').classList.contains('is-range'), 'danh sách Báo cáo ngày không bị khóa ở chế độ khoảng ngày');

  // Báo cáo ngày: chọn KHOẢNG → Tổng theo ngày không đổi theo
  await pick(day(-2), today);
  check(sel() === day(-2) + '..' + today && d.getElementById('list').classList.contains('is-range'), 'Báo cáo ngày: chọn khoảng ' + day(-2) + ' → hôm nay');
  await goDays();
  check(sel() === day(-4) + '..' + day(-1) && rowsOfStats().length === 4, 'sang Tổng theo ngày: vẫn là khoảng riêng ' + day(-4) + ' → ' + day(-1) + ' (thực tế: ' + sel() + ')');
  await goDay();
  check(sel() === day(-2) + '..' + today && d.getElementById('list').classList.contains('is-range'), 'về Báo cáo ngày: khoảng đã chọn ở đó vẫn còn (' + sel() + ')');

  // Tổng theo ngày chọn 1 ngày
  await goDays(); await pick(day(-3), day(-3));
  check(sel() === ONE(day(-3)) && rowsOfStats().length === 1 && rowsOfStats()[0] === day(-3), 'Tổng theo ngày: chọn 1 ngày → bảng 1 dòng');
  await goDay();
  check(sel() === day(-2) + '..' + today, 'về Báo cáo ngày: khoảng của tab này không bị ảnh hưởng (' + sel() + ')');
  await goDays();
  check(sel() === ONE(day(-3)), 'sang lại Tổng theo ngày: vẫn là 1 ngày ' + day(-3) + ' (thực tế: ' + sel() + ')');

  // Bấm một ngày trong bảng thống kê → mở ngày đó ở Báo cáo ngày, khoảng của Tổng theo ngày được giữ
  await pick(day(-5), day(-1));
  d.querySelector('#stab tbody tr[data-d="' + day(-2) + '"]').click(); await wait(500);
  check(d.getElementById('tab-day').getAttribute('aria-selected') === 'true' && sel() === ONE(day(-2)) && val('day') === day(-2), 'bấm ngày trong bảng thống kê → mở đúng ngày đó ở Báo cáo ngày (thực tế: ' + sel() + ')');
  await goDays();
  check(sel() === day(-5) + '..' + day(-1) && rowsOfStats().length === 5, 'quay lại Tổng theo ngày: khoảng riêng vẫn giữ ' + day(-5) + ' → ' + day(-1) + ' (thực tế: ' + sel() + ')');

  // Dữ liệu từng ngày không bị đổi / ghi đè khi qua lại
  const stored = () => JSON.parse(w.localStorage.getItem('ads-eval-v1-s@e.com')).byAcc.act_1.days;
  const before = JSON.stringify(Object.keys(stored()).sort());
  for (let i = 0; i < 3; i++) { await goDay(); await goDays(); }
  const after = stored();
  check(before === JSON.stringify(Object.keys(after).sort()) && JSON.stringify(after[day(-1)].map(r => r.spend)) === JSON.stringify(['200000']) && after[day(-3)][0].spend === '400000', 'qua lại nhiều lần: số liệu từng ngày giữ nguyên, không có ngày mới bị tạo');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
