// Thông báo "Đã tải thành công tài khoản <tên>" + bấm vào chữ bị cắt "…" để xem tên đầy đủ.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');
const today = (() => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); })();
const LONG = 'Chiến dịch Noel khuyến mãi lớn cuối năm 2026 | Tệp khách hàng nữ 25-45 tuổi Hà Nội và TP.HCM | Video ông già Noel tặng quà';
const seed = { t1: 25, t2: 35, day: today, byAcc: { act_1: { name: 'HAI 7 - 2026', days: { [today]: [
  { accountId: 'act_1', campaign: LONG, campaign_id: 'C1', adset: 'Nhóm 1', adset_id: 'A1', name: 'Quảng cáo có tên rất dài ' + 'x'.repeat(60), ad_id: 'AD1', spend: '100000', mess: 5, phone: 1, rev: '500000' },
] } } } };

function boot(withSeed) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt' }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'HAI 7 - 2026' }));
      if (withSeed) w.localStorage.setItem('ads-eval-v1-s@e.com', JSON.stringify(seed));
      w.matchMedia = q => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = url => { url = String(url); let body = { data: [] };
        if (/me\/adaccounts/.test(url)) body = { data: [{ account_id: '1', name: 'HAI 7 - 2026', account_status: 1, currency: 'VND' }] };
        if (/insights/.test(url)) {
          const r0 = seed.byAcc.act_1.days[today][0]; // tự đồng bộ lúc mở trang trả đúng các tên dài này
          body = withSeed ? { data: [{ campaign_id: 'C1', campaign_name: r0.campaign, adset_id: 'A1', adset_name: 'Nhóm 1', ad_id: 'AD1', ad_name: r0.name, spend: '100000', actions: [] }] }
            : { data: [{ campaign_id: 'C1', campaign_name: 'Camp A', adset_id: 'A1', adset_name: 'Set 1', ad_id: 'AD1', ad_name: 'QC A', spend: '698376', actions: [] }] };
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') }); };
    },
  });
  return { w: dom.window, errors };
}

(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

  // ===== 1) Thông báo tải tài khoản =====
  {
    const { w } = boot(false);
    await wait(1200);
    const msgs = [...w.document.querySelectorAll('#nt-stack .nt')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
    check(msgs.some(m => /Đã tải thành công tài khoản HAI 7 - 2026/.test(m)), 'thông báo: "Đã tải thành công tài khoản HAI 7 - 2026" (' + msgs.join(' || ') + ')');
    check(!msgs.some(m => /Đã nạp|Chiến dịch của TK|act_1/.test(m)), 'thông báo không còn "Đã nạp … Chiến dịch của TK act_…"');
    w.close();
  }

  // ===== 2) Bấm chữ bị cắt để xem tên đầy đủ =====
  const { w, errors } = boot(true);
  await wait(700);
  const d = w.document;
  const tipText = () => { const t = d.getElementById('fulltip'); return t ? t.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const cut = (el, on) => { Object.defineProperty(el, 'scrollHeight', { value: on ? 120 : 20, configurable: true }); Object.defineProperty(el, 'clientHeight', { value: 40, configurable: true }); Object.defineProperty(el, 'scrollWidth', { value: on ? 400 : 100, configurable: true }); Object.defineProperty(el, 'clientWidth', { value: 150, configurable: true }); };

  const nm = d.querySelector('#list .nm-main');
  check(!!nm, 'có tên chiến dịch trên thẻ');
  cut(nm, false); nm.click();
  check(tipText() === '', 'tên hiển thị đủ (không bị cắt) → bấm không hiện gì thêm');
  d.querySelector('[data-htab="campaign"]').click();
  cut(d.querySelector('#list .nm-main'), true);
  d.querySelector('#list .nm-main').click();
  check(tipText().includes('Chiến dịch Noel khuyến mãi lớn cuối năm 2026') && tipText().includes('Video ông già Noel tặng quà'), 'tên bị cắt "…" → bấm hiện khung tên đầy đủ (' + tipText().slice(0, 50) + '…)');
  check(d.querySelector('[data-htab="campaign"]').classList.contains('active'), 'bấm xem tên không nhảy sang tab Nhóm QC');
  d.body.click();
  check(tipText() === '', 'bấm ra ngoài → khung tên đóng');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  // Ô tên quảng cáo (input) bị cắt
  d.querySelector('[data-htab="ad"]').click();
  const inp = d.querySelector('#list input.nm');
  check(!!inp, 'tab Quảng cáo có ô tên');
  if (inp) { cut(inp, true); inp.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
  check(tipText().startsWith('Quảng cáo có tên rất dài'), 'ô tên quảng cáo bị cắt → bấm hiện tên đầy đủ');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(tipText() === '', 'nhấn Esc → đóng khung tên');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
