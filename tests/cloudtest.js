// Đồng bộ cloud: máy mới đăng nhập KHÔNG được làm mất SĐT/doanh số đã nhập ở máy khác.
// Chạy code thật (js/config.js, js/supabase-client.js, dashboard.html) với Supabase giả ghi lại mọi lần pull/upsert.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(path.resolve(process.argv[2]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');
const today = (() => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); })();
const EMAIL = 'shop@example.com', KEY = 'ads-eval-v1-' + EMAIL;
const adRow = (extra) => Object.assign({ accountId: 'act_1', campaign_id: 'C1', campaign: 'Camp A', adset_id: 'A1', adset: 'Set 1', ad_id: 'AD1', name: 'QC A', spend: 698376, mess: 18, phone: 6, rev: '3900000' }, extra || {});
const stateOf = rows => ({ t1: 25, t2: 35, day: today, tab: 'day', who: 'Shop', byAcc: { act_1: { name: 'TK 1', days: { [today]: rows } } } });
const rowOf = st => (((st.byAcc || {}).act_1 || {}).days || {})[today] || [];

class Loader extends ResourceLoader {
  fetch(url, o) {
    if (/jsdelivr|googleapis|gstatic/.test(url)) return Promise.resolve(Buffer.from(''));
    const m = url.match(/^http:\/\/localhost:5500\/([^?#]*)/);
    if (m) { const f = path.join(ROOT, decodeURIComponent(m[1])); return fs.existsSync(f) ? Promise.resolve(fs.readFileSync(f)) : Promise.reject(new Error('404 ' + m[1])); }
    return Promise.resolve(Buffer.from(''));
  }
}

// Supabase giả. cloud = { state, updated_at } hoặc null (chưa có dữ liệu); pullFails = true để mô phỏng lỗi mạng.
function makeWorld({ cloud, pullFails }) {
  const world = { cloud, upserts: [], pullFails: !!pullFails };
  world.lib = { createClient() { return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' }, access_token: 'tok' } } }), signOut: async () => ({}) },
    from() { return {
      select() { return { maybeSingle: async () => { await wait(300); return world.pullFails ? { data: null, error: { message: 'network down' } } : { data: world.cloud, error: null }; } }; },
      upsert: async (row) => { world.upserts.push(row); world.cloud = { state: row.state, updated_at: row.updated_at }; return { error: null }; },
    }; },
  }; } };
  return world;
}

// Mở dashboard như một lần tải trang. snapshot = nội dung localStorage / sessionStorage có sẵn (mô phỏng nạp lại hoặc máy cũ).
function boot(world, snapshot) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { const m = String(e.message || e); if (!/navigation|Not implemented/i.test(m)) errors.push(m); });
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8'), {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', resources: new Loader(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.supabase = world.lib;
      for (const [k, v] of Object.entries(snapshot.local || {})) w.localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(snapshot.session || {})) w.sessionStorage.setItem(k, v);
      w.matchMedia = q => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = (url) => { url = String(url); let body = { data: [] };
        if (/adaccounts/.test(url)) body = { data: [{ account_id: '1', name: 'TK 1', account_status: 1, currency: 'VND' }] };
        if (/insights/.test(url)) body = { data: [{ campaign_id: 'C1', campaign_name: 'Camp A', adset_id: 'A1', adset_name: 'Set 1', ad_id: 'AD1', ad_name: 'QC A', spend: '698376', actions: [] }] };
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') }); };
    },
  });
  return { w: dom.window, errors };
}
const base = { 'ads_auth_session_v1': JSON.stringify({ email: EMAIL, name: 'Shop' }), 'ads_fb_config_v4': JSON.stringify({ accountId: 'act_1', accountName: 'TK 1' }) };
const snap = w => { const local = {}, session = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); local[k] = w.localStorage.getItem(k); } for (let i = 0; i < w.sessionStorage.length; i++) { const k = w.sessionStorage.key(i); session[k] = w.sessionStorage.getItem(k); } return { local, session }; };

(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

  // 1) MÁY MỚI: chưa có dữ liệu cục bộ, cloud đang giữ SĐT/doanh số nhập từ máy tính
  {
    const world = makeWorld({ cloud: { state: stateOf([adRow()]), updated_at: hourAgo } });
    let { w } = boot(world, { local: base });
    await wait(1800);                                   // lần mở đầu: nhận dữ liệu cloud rồi nạp lại trang
    const afterPull = snap(w); w.close();
    check(rowOf(JSON.parse(afterPull.local[KEY] || '{}')).length === 1 && rowOf(JSON.parse(afterPull.local[KEY])).pop().rev === '3900000', 'máy mới: nhận dữ liệu từ cloud (rev 3900000, SĐT 6) và nạp lại trang');
    check(world.upserts.length === 0, 'máy mới: KHÔNG đẩy gì lên cloud trước khi nhận dữ liệu cloud (' + world.upserts.length + ' lần đẩy)');
    ({ w } = boot(world, afterPull));                   // mô phỏng trang nạp lại
    await wait(3200);
    const fin = rowOf(world.cloud.state)[0] || {}, loc = rowOf(JSON.parse(w.localStorage.getItem(KEY) || '{}'))[0] || {};
    check(fin.rev === '3900000' && Number(fin.phone) === 6, 'máy mới: dữ liệu cloud cuối cùng vẫn giữ rev=' + fin.rev + ', phone=' + fin.phone);
    check(loc.rev === '3900000' && Number(loc.phone) === 6, 'máy mới: màn hình hiển thị rev=' + loc.rev + ', phone=' + loc.phone);
    w.close();
  }

  // 2) MÁY ĐÃ ĐỒNG BỘ (máy tính): sửa SĐT/doanh số vẫn được lưu lên cloud
  {
    const cloudTs = new Date(Date.now() - 600 * 1000).toISOString();
    const world = makeWorld({ cloud: { state: stateOf([adRow()]), updated_at: cloudTs } });
    const local = Object.assign({}, base, { [KEY]: JSON.stringify(stateOf([adRow()])), [KEY + '-cloudts']: cloudTs });
    const { w } = boot(world, { local });
    await wait(1200);
    const tabAd = w.document.querySelector('[data-htab="ad"]'); if (tabAd) tabAd.click();
    await wait(100);
    const inp = w.document.querySelector('#list .vid [data-f="rev"]');
    check(!!inp, 'máy đã đồng bộ: tìm thấy ô doanh số của quảng cáo');
    if (inp) { inp.value = '5000000'; inp.dispatchEvent(new w.Event('input', { bubbles: true })); }
    await wait(2000);
    check(world.upserts.length >= 1 && (rowOf(world.cloud.state)[0] || {}).rev === '5000000', 'máy đã đồng bộ: sửa doanh số → lên cloud (rev=' + (rowOf(world.cloud.state)[0] || {}).rev + ')');
    check(!!w.localStorage.getItem(KEY + '-cloudts') && w.localStorage.getItem(KEY + '-cloudts') > cloudTs, 'máy đã đồng bộ: mốc đồng bộ được cập nhật sau khi đẩy thành công');
    w.close();
  }

  // 3) KHÔNG ĐỌC ĐƯỢC CLOUD (lỗi mạng): tuyệt đối không đẩy gì lên
  {
    const world = makeWorld({ cloud: { state: stateOf([adRow()]), updated_at: hourAgo }, pullFails: true });
    const { w } = boot(world, { local: base });
    await wait(3000);
    check(world.upserts.length === 0, 'lỗi mạng khi đọc cloud: KHÔNG ghi đè cloud (' + world.upserts.length + ' lần đẩy)');
    w.close();
  }

  // 4) NGƯỜI DÙNG MỚI HOÀN TOÀN: cloud chưa có dữ liệu → bản trên máy được đẩy lên bình thường
  {
    const world = makeWorld({ cloud: null });
    const { w } = boot(world, { local: Object.assign({}, base, { [KEY]: JSON.stringify(stateOf([adRow()])) }) });
    await wait(3000);
    check(world.upserts.length >= 1 && rowOf(world.cloud.state).length === 1, 'cloud trống: dữ liệu trên máy được lưu lên cloud lần đầu');
    w.close();
  }

  // 5) MÁY TÍNH CŨ (có dữ liệu, chưa có mốc đồng bộ) trong khi cloud đã bị máy khác ghi đè thành trống:
  //    không được lấy bản trống của cloud; phải giữ dữ liệu trên máy và khôi phục cloud
  {
    const overwritten = { state: stateOf([adRow({ rev: '', phone: 0 })]), updated_at: new Date().toISOString() };
    const world = makeWorld({ cloud: overwritten });
    const { w } = boot(world, { local: Object.assign({}, base, { [KEY]: JSON.stringify(stateOf([adRow()])) }) });
    await wait(3500);
    const loc = rowOf(JSON.parse(w.localStorage.getItem(KEY) || '{}'))[0] || {}, cl = rowOf(world.cloud.state)[0] || {};
    check(loc.rev === '3900000' && Number(loc.phone) === 6, 'máy cũ có dữ liệu: giữ nguyên SĐT/doanh số trên máy (rev=' + loc.rev + ')');
    check(cl.rev === '3900000' && Number(cl.phone) === 6, 'máy cũ có dữ liệu: cloud được khôi phục từ máy (rev=' + cl.rev + ', phone=' + cl.phone + ')');
    w.close();
  }

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
