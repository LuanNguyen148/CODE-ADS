// Đóng gói iPhone (.ipa): cấu hình Capacitor, gom web vào www/, quy trình GitHub Actions. (Không build được .ipa ở máy Windows — bài thử chỉ kiểm tra đồ nghề.)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const cfg = JSON.parse(read('capacitor.config.json'));
check(cfg.appId === 'com.adscgd.app' && cfg.appName === 'adsCGD' && cfg.webDir === 'www', 'capacitor.config.json: appId com.adscgd.app, tên adsCGD, webDir www');
const host = (cfg.server && cfg.server.hostname) || 'localhost';
check(!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && !/\.localhost$/.test(host), 'tên miền trong app (' + host + ') KHÔNG phải localhost → tài khoản test local (localDev) không bật trong ứng dụng');

cp.execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-www.js')], { stdio: 'pipe' });
const www = p => fs.existsSync(path.join(ROOT, 'www', p));
check(www('index.html') && www('dashboard.html') && www('js/config.js') && www('css/ui-polish.css') && www('audio/jingle-bells-orchestra.mp3') && www('font/cormorant-garamond-semibold.woff2'), 'www/ có đủ trang, js, css, nhạc, font');
check(!www('_redirects') && !www('supabase') && !www('tests') && !www('node_modules') && !www('CLAUDE.md') && !www('.env'), 'www/ KHÔNG chứa file nội bộ (supabase, tests, CLAUDE.md, _redirects…)');
// mọi tài nguyên tương đối được trang gọi đều có trong www/
const miss = [];
for (const f of ['index.html', 'dashboard.html']) {
  const h = read(f);
  for (const m of h.matchAll(/(?:src|href)="((?:css|js|image|audio|font)\/[^"?#]+)/g)) if (!www(m[1])) miss.push(f + ' → ' + m[1]);
}
check(miss.length === 0, 'mọi css/js/ảnh/nhạc/font mà index.html và dashboard.html gọi đều có trong www/' + (miss.length ? ': ' + miss.slice(0, 3).join(', ') : ''));

const icon = fs.readFileSync(path.join(ROOT, 'ios-assets', 'icon-1024.png'));
check(icon.slice(1, 4).toString() === 'PNG' && icon.readUInt32BE(16) === 1024 && icon.readUInt32BE(20) === 1024, 'biểu tượng ios-assets/icon-1024.png đúng 1024×1024 PNG');

const wf = read('.github/workflows/build-ios-ipa.yml');
check(/workflow_dispatch/.test(wf) && /runs-on:\s*macos/.test(wf) && /cap add ios/.test(wf) && /capacitor-assets generate/.test(wf) && /xcodebuild archive/.test(wf) && /CODE_SIGNING_ALLOWED=NO/.test(wf) && /Payload/.test(wf) && /\.ipa/.test(wf) && /upload-artifact/.test(wf), 'quy trình GitHub Actions: chạy tay, máy macOS, tạo dự án iOS + biểu tượng, build không ký, đóng Payload → .ipa, tải lên Artifacts');
check(!/secrets\.|password|certificate|\.p12|mobileprovision/i.test(wf), 'quy trình không dùng khóa/chứng chỉ/mật khẩu nào (bản chưa ký)');
check(/^www\/\r?$/m.test(read('.gitignore')) && /^ios\/\r?$/m.test(read('.gitignore')), 'www/ và ios/ (sinh tự động) nằm trong .gitignore');
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 2);
