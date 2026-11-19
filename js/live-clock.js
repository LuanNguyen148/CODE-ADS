(() => {
  'use strict';
  const root = document.getElementById('live-clock');
  if (!root) return;
  const time = root.querySelector('.live-clock-time');
  const date = root.querySelector('.live-clock-date');
  const icon = root.querySelector('.live-clock-icon');
  const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  const pad = n => String(n).padStart(2, '0');
  function tick() {
    const d = new Date(), h = d.getHours();
    time.textContent = `${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    date.textContent = `${days[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    icon.textContent = h >= 6 && h < 18 ? '☀' : '☾';
  }
  tick();
  setInterval(tick, 1000);
})();
