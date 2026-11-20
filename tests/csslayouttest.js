// Quy tắc bố cục CSS không được mất: popup Tài khoản cố định kích thước (không nở khi đổi tab Facebook / Dư nợ),
// ô số liệu đều chiều cao, các điều khiển cùng chiều cao 44px, đầu thẻ canh theo hàng đầu.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
// Gộp CSS theo đúng thứ tự trình duyệt nạp: <style> trong trang, rồi các file css/ được <link> sau đó (file nạp sau thắng khi cùng độ ưu tiên)
const dir = require('path').dirname(require('path').resolve(process.argv[2]));
const linked = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"?]+)/g)].map(m => m[1]).filter(f => fs.existsSync(dir + '/' + f)).map(f => fs.readFileSync(dir + '/' + f, 'utf8'));
const css = html.match(/<style>([\s\S]*?)<\/style>/g).concat(linked).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = css.match(/[^{}]+{[^{}]*}/g) || [];
const find = (selRe, propRe) => rules.some(r => selRe.test(r.split('{')[0]) && propRe.test(r.split('{')[1]));

check(find(/\.acct\[open\]/, /(^|;)\s*height:\s*min\(/), 'popup Tài khoản có chiều cao CỐ ĐỊNH khi mở (.acct[open]{height:…}) → đổi tab không bị nở');
check(find(/\.acct\[open\]/, /display:\s*flex/) && find(/\.acct\[open\]/, /overflow:\s*hidden/), 'popup Tài khoản: khung flex, phần thân cuộn bên trong');
check(find(/\.acct-sec:not\(\.pane-off\)/, /overflow:\s*auto/) && find(/\.acct-sec:not\(\.pane-off\)/, /flex:\s*1/), 'nhóm đang hiện chiếm hết chỗ còn lại và tự cuộn nếu dài');
check(find(/\.hero \.kp/, /grid-auto-rows:\s*1fr/), '4 ô số liệu đầu trang đều chiều cao (grid-auto-rows:1fr)');
check(find(/\.drill-grid/, /grid-auto-rows:\s*1fr/), 'các ô số liệu trong thẻ đều chiều cao');
check(find(/\.drill-top/, /align-items:\s*flex-start/), 'đầu thẻ: nhãn cấp + tên và cụm nút bên phải cùng canh theo hàng đầu');
check(find(/\.tbl th:last-child/, /text-align:\s*center/), 'cột cuối của bảng: tiêu đề canh giữa như ô nút');
check(['#dp-btn|\\.dp-btn', '\\.hier-sort select', '\\.acc-sel select'].every(s => find(new RegExp(s), /min-height:\s*44px/)), 'ngày, sắp xếp, chọn tài khoản cùng cao 44px');
// Nhãn ngày dưới biểu đồ "Tổng theo ngày" phải đọc rõ: không nhỏ hơn 12px, đậm, màu chữ chính; ngày chưa có dữ liệu không bị mờ quá
{
  // luật cuối cùng (thắng) cho từng thuộc tính của ".sc span"
  const last = (selRe, prop) => { let v = null; rules.forEach(r => { if (selRe.test(r.split('{')[0].trim())) { const m = r.split('{')[1].match(new RegExp('(?:^|;)\\s*' + prop + ':\\s*([^;}]+)')); if (m) v = m[1].trim(); } }); return v; };
  const fs12 = parseFloat(last(/^\.sc span$/, 'font-size'));
  check(fs12 >= 12, 'nhãn ngày dưới biểu đồ cỡ chữ >= 12px (hiện ' + fs12 + 'px)');
  check(Number(last(/^\.sc span$/, 'font-weight')) >= 600, 'nhãn ngày dưới biểu đồ đậm (>= 600)');
  check(/var\(--tx\)/.test(last(/^\.sc span$/, 'color') || ''), 'nhãn ngày dùng màu chữ chính (--tx), không dùng màu nhạt (--mu)');
  const noOp = last(/^\.sc\.no$/, 'opacity');
  check(noOp === null || parseFloat(noOp) >= 0.9, 'cột ngày chưa có dữ liệu không bị làm mờ cả nhãn (opacity ' + noOp + ')');
}
// Tên quảng cáo (ô nhập .nm trong bảng) dài thì hiện "…" thay vì bị cắt cụt giữa chữ (lỗi thấy trên điện thoại)
check(find(/\.tbl td\.in \.nm\b/, /text-overflow:\s*ellipsis/), 'bảng Báo cáo ngày: tên quảng cáo dài hiện dấu "…"');
// Tiêu đề cột đầu bảng Báo cáo ngày thẳng mép với nội dung (ô đầu thụt 16px)
check(find(/\.tbl th:first-child/, /padding-left:\s*16px/), 'bảng Báo cáo ngày: tiêu đề cột đầu thụt 16px như ô bên dưới');
// Điện thoại (< 1100px): thông báo hiện ở PHÍA TRÊN màn hình, mới nhất nằm trên cùng (người dùng yêu cầu)
{
  const m = css.match(/@media \(max-width:1099px\)\s*{\s*\.nt-stack\s*{([^}]*)}/);
  const body = m ? m[1] : '';
  check(!!m && /(^|;)\s*top:\s*calc\(env\(safe-area-inset-top/.test(body) && /bottom:\s*auto/.test(body), 'điện thoại: khung thông báo neo ở phía trên (top theo vùng an toàn, bottom:auto)');
  check(!!m && !/column-reverse/.test(body), 'điện thoại: thông báo mới nhất nằm trên cùng (không đảo cột)');
}
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 2);
