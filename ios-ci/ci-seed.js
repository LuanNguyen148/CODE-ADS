// CHỈ dùng trong quy trình chụp ảnh trình giả lập iPhone (ios-simulator-shots.yml) — KHÔNG đi vào bản .ipa phát hành.
// Gieo phiên test + dữ liệu mẫu, rồi tự đổi tab / giao diện theo lịch để workflow chụp màn hình từng màn.
(function () {
  try {
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var day = function (off) { var d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
    var row = function (c, id, s, m, p, r) { return { accountId: 'act_1', campaign: c, campaign_id: id, adset: 'Nhóm ' + id, adset_id: 'A' + id, name: 'Bài ' + id, ad_id: 'AD' + id, spend: String(s), mess: m, phone: p, rev: String(r) }; };
    if (!localStorage.getItem('ci_seeded')) {
      localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 'ci@example.com', name: 'luan148', fbToken: 'EAAmock', local: true }));
      localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'HAI 7' }));
      localStorage.setItem('ads_theme_v1', 'day');
      localStorage.setItem('ads-eval-v1-ci@example.com', JSON.stringify({ t1: 25, t2: 35, who: 'luan148', tab: 'day', byAcc: { act_1: { name: 'HAI 7 - 2026', days: (function () { var o = {}; o[day(0)] = [row('CHIẾN DỊCH LẤY DATA KHÁCH HÀNG 07/10', 'C1', 580000, 9, 3, 0), row('Chiến dịch Lấy Data 10/10 Test', 'C2', 360000, 6, 1, 0), row('Chiến lấy data 20/11 (trả lời tọa đàm)', 'C3', 79000, 0, 0, 1500000)]; o[day(-1)] = [row('C', 'C1', 500000, 5, 2, 1000000)]; return o; })() } } }));
      localStorage.setItem('ci_seeded', '1');
    }
    if (/dashboard\.html/.test(location.pathname)) {
      // Lịch đổi màn (giây sau khi mở trang): workflow chụp ở 6, 12, 18, 24, 30, 36, 42 giây
      var steps = [[10, 'tab-days'], [16, 'tab-toggle'], [22, 'tab-notify'], [28, 'tab-settings'], [34, 'night'], [40, 'tab-day']];
      steps.forEach(function (s) {
        setTimeout(function () {
          try {
            if (s[1] === 'night') { var b = document.querySelector('[data-theme="night"]'); if (b) b.click(); return; }
            var t = document.getElementById(s[1]); if (t) t.click();
          } catch (e) {}
        }, s[0] * 1000);
      });
    }
  } catch (e) {}
})();
