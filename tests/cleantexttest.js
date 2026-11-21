// Bỏ các dòng chữ giải thích thừa (người dùng yêu cầu): "N ngày được chọn · N ngày có dữ liệu", "Dùng chung bộ chọn ngày…",
// "Các bài trùng tên được gộp lại…", "Màu CPQC: ≤ mức tốt → …". Đổi giữa các tab vẫn không lỗi. Hàng lọc gọn: không xuống dòng sớm.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

(async () => {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(700);
  for (const t of ['day', 'days', 'toggle', 'days', 'day']) { d.querySelector('#side [data-side-tab="' + t + '"]').click(); await wait(80); }
  // đọc cả khi các tab đang ẩn: gom chữ của toàn trang
  const cl = d.body.cloneNode(true); cl.querySelectorAll('script,style').forEach(e => e.remove());
  const all = cl.textContent.replace(/\s+/g, ' ');
  check(!/ngày được chọn/.test(all) && !/ngày có dữ liệu/.test(all), 'không còn dòng "N ngày được chọn · N ngày có dữ liệu"');
  check(!/Dùng chung bộ chọn ngày/.test(all) && !/Xem tối đa 31 ngày/.test(all), 'không còn dòng "Dùng chung bộ chọn ngày với Báo cáo ngày… Xem tối đa 31 ngày"');
  check(!/trùng tên được gộp/.test(all), 'không còn dòng "Các bài trùng tên được gộp lại…"');
  check(!/Màu CPQC:/.test(all) && !d.getElementById('thr-hint'), 'không còn dòng "Màu CPQC: ≤ mức tốt → Tốt · … Cắt / sửa"');
  check(!!d.getElementById('t1') && !!d.getElementById('t2') && !d.getElementById('t1').hasAttribute('aria-describedby'), 'hai ô ngưỡng CPQC vẫn còn, không trỏ aria-describedby tới dòng đã xóa');
  check(errors.length === 0, 'đổi qua lại các tab không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  // CSS: hàng công cụ (ngày + kiểu xem + sắp xếp) nằm cùng một hàng, không xuống dòng lẻ
  const dir = path.dirname(path.resolve(process.argv[2]));
  const linked = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"?]+)/g)].map(m => m[1]).filter(f => fs.existsSync(dir + '/' + f)).map(f => fs.readFileSync(dir + '/' + f, 'utf8'));
  const css = html.match(/<style>([\s\S]*?)<\/style>/g).concat(linked).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = css.match(/[^{}]+{[^{}]*}/g) || [];
  const last = (selRe, prop) => { let v = null; rules.forEach(r => { if (selRe.test(r.split('{')[0].trim())) { const m = r.split('{')[1].match(new RegExp('(?:^|;)\\s*' + prop + ':\\s*([^;}]+)')); if (m) v = m[1].trim(); } }); return v; };
  check(last(/^\.hier-tools$/, 'flex-wrap') === 'nowrap', 'hàng công cụ (ngày · Thẻ/Bảng · Sắp xếp) không tự xuống dòng lẻ (flex-wrap:nowrap)');
  check(/^\d+px$/.test(last(/^\.hier-tools \.day-pick$/, 'min-width') || ''), 'nút ngày trong hàng công cụ có min-width bằng px (phần trăm làm tính sai độ rộng nên bị tràn xuống dòng)');
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
