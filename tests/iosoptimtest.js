// Tối ưu cho iOS: bản www/ trong app, thanh trạng thái, màn hình chờ, quy trình chụp ảnh giả lập, CSS cảm ứng.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
cp.execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-www.js')], { stdio: 'pipe' });
const cfg = JSON.parse(read('capacitor.config.json'));
const wf = read('.github/workflows/build-ios-ipa.yml'), sim = read('.github/workflows/ios-simulator-shots.yml');

const wi = read('www/index.html'), wd = read('www/dashboard.html');
const vp = h => (h.match(/<meta name="viewport" content="([^"]*)"/) || [])[1] || '';
check(/maximum-scale=1/.test(vp(wi)) && /user-scalable=no/.test(vp(wi)) && /maximum-scale=1/.test(vp(wd)) && (vp(wd).match(/maximum-scale/g) || []).length === 1 && /viewport-fit=cover/.test(vp(wd)), 'bản www/: khóa phóng to hai ngón (maximum-scale=1, user-scalable=no), giữ viewport-fit=cover, không lặp tham số');
check(!/maximum-scale/.test(read('index.html')) && !/maximum-scale/.test(read('dashboard.html')), 'web thật (index.html/dashboard.html gốc) KHÔNG bị khóa phóng to — chỉ bản trong app');
check(!wi.includes('ci-seed') && !wd.includes('ci-seed') && !fs.existsSync(path.join(ROOT, 'www', 'ci-seed.js')), 'bản phát hành không chứa dữ liệu mẫu ci-seed');
check(cfg.plugins && cfg.plugins.StatusBar && cfg.plugins.StatusBar.style === 'DARK' && /status-bar@6/.test(wf), 'thanh trạng thái chữ sáng trên nền đỏ (StatusBar DARK) + cài plugin status-bar');
const sp = fs.readFileSync(path.join(ROOT, 'ios-assets', 'splash-2732.png'));
check(sp.readUInt32BE(16) === 2732 && sp.readUInt32BE(20) === 2732 && /splash\.png/.test(wf) && /splashBackgroundColor/.test(wf), 'màn hình chờ 2732×2732 có sẵn và được đưa vào quy trình (thay hình Capacitor mặc định)');
check(/workflow_dispatch/.test(sim) && /iphonesimulator/.test(sim) && /simctl boot/.test(sim) && /simctl install/.test(sim) && /simctl launch/.test(sim) && (sim.match(/screenshot shots/g) || []).length >= 7 && /upload-artifact/.test(sim) && /ci-seed/.test(sim) && /hostname='localhost'/.test(sim), 'quy trình chụp ảnh giả lập: build iphonesimulator, bật iPhone, cài + mở app, ≥ 7 ảnh, tải lên Artifacts, dùng dữ liệu mẫu + localhost');
check(!/secrets\./.test(sim), 'quy trình giả lập không dùng khóa bí mật');
const seed = read('ios-ci/ci-seed.js');
check(/ads_auth_session_v1/.test(seed) && /local: true/.test(seed) && !/EAA[A-Za-z0-9]{12,}/.test(seed) && !/@gmail|@yahoo|@hotmail/.test(seed), 'ci-seed.js: chỉ phiên test giả (EAAmock, ci@example.com), không có token/email thật');
const css = read('css/ui-polish.css');
check(/@media \(hover:none\) and \(pointer:coarse\)/.test(css) && /font-size:16px !important/.test(css) && /min-height:44px/.test(css), 'CSS cảm ứng: ô nhập ≥ 16px (iOS không tự phóng to) và vùng chạm ≥ 44px');
check(/-webkit-touch-callout:none/.test(css) && /touch-action:manipulation/.test(css), 'tắt bảng gọi nhanh khi giữ nút và chờ chạm đúp (cảm giác như app)');
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 2);
