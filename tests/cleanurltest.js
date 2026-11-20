// Địa chỉ gọn trên web đã deploy: /dashboard.html → /dashboard, /index.html → / (giữ ?… và #…).
// Chạy local (localhost, 127.0.0.1, file://) thì giữ nguyên vì máy chủ local không hiểu /dashboard.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.dirname(path.resolve(process.argv[2]));
const code = fs.readFileSync(path.join(root, 'js/clean-url.js'), 'utf8');
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
function run(url) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url, runScripts: 'outside-only' });
  let err = null; try { dom.window.eval(code); } catch (e) { err = e; }
  const h = dom.window.location.href; dom.window.close(); return { href: h, err };
}
let r = run('https://ads-cgd.netlify.app/dashboard.html');
check(r.href === 'https://ads-cgd.netlify.app/dashboard', 'web: /dashboard.html → /dashboard (' + r.href + ')');
r = run('https://ads-cgd.netlify.app/dashboard.html?acc=1#top');
check(r.href === 'https://ads-cgd.netlify.app/dashboard?acc=1#top', 'giữ phần ?… và #… (' + r.href + ')');
r = run('https://ads-cgd.netlify.app/index.html');
check(r.href === 'https://ads-cgd.netlify.app/', 'web: /index.html → / (' + r.href + ')');
r = run('https://ads-cgd.netlify.app/dashboard');
check(r.href === 'https://ads-cgd.netlify.app/dashboard', 'địa chỉ đã gọn thì để nguyên');
r = run('http://localhost:5500/dashboard.html');
check(r.href === 'http://localhost:5500/dashboard.html', 'localhost: giữ nguyên (máy chủ local không có /dashboard)');
r = run('http://127.0.0.1:5500/dashboard.html');
check(r.href === 'http://127.0.0.1:5500/dashboard.html', '127.0.0.1: giữ nguyên');
r = run('file:///G:/x/dashboard.html');
check(r.href === 'file:///G:/x/dashboard.html' && !r.err, 'file://: giữ nguyên, không lỗi');

const red = fs.existsSync(path.join(root, '_redirects')) ? fs.readFileSync(path.join(root, '_redirects'), 'utf8') : '';
check(/^\/dashboard\s+\/dashboard\.html\s+200\s*$/m.test(red), '_redirects: /dashboard mở dashboard.html (tải lại không bị 404)');
['index.html', 'dashboard.html'].forEach(f => {
  const h = fs.readFileSync(path.join(root, f), 'utf8');
  const head = h.slice(0, h.indexOf('</head>'));
  check(/<script src="js\/clean-url\.js[^"]*"><\/script>/.test(head), f + ': nạp js/clean-url.js trong <head> (chạy sớm, không defer)');
});
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 2);
