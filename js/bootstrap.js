(() => {
  'use strict';
  const shell = document.querySelector('.auth-shell');
  shell.inert = true;
  shell.setAttribute('aria-busy', 'true');
  const scripts = [...document.querySelectorAll('script[data-app-src]')];

  // Tải song song mọi script hiệu ứng nhưng vẫn chạy đúng thứ tự (async = false),
  // thay vì chờ tải xong từng file một như trước.
  const loadInOrder = sources => Promise.all(sources.map(source => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source.dataset.appSrc;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Script could not load: ${script.src}`));
    source.replaceWith(script);
  })));

  window.svgAssets.mount(['frame-light-template.svg', 'frame-menu-row.svg']).then(() => {
    const wanted = scripts.filter(source => {
      if (source.getAttribute('data-music-spectrum') !== null &&
          (location.protocol !== 'file:' || !window.OKLOGIN_SETTINGS.music.enabled || !window.OKLOGIN_SETTINGS.music.visualizer)) {
        source.remove();
        return false;
      }
      return true;
    });
    return loadInOrder(wanted);
  }).then(() => {
    shell.inert = false;
    shell.removeAttribute('aria-busy');
  }).catch(error => {
    console.error('Không tải được giao diện.', error);
    const message = document.createElement('p');
    message.className = 'asset-load-error';
    message.setAttribute('role', 'alert');
    message.textContent = 'Không tải được giao diện. Vui lòng tải lại trang.';
    shell.before(message);
    shell.removeAttribute('aria-busy');
  });
})();
