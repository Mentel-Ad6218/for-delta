/* 旧脚本 / 缺失脚本检测：避免按钮出现但完全没有反应时无从判断。 */
(function () {
  window.__TIDAL_APP_READY__ = false;

  function showFailure(reason) {
    if (window.__TIDAL_APP_READY__) return;
    var box = document.getElementById('appLoadError');
    if (!box) return;
    box.textContent =
      '页面脚本没有正确加载' +
      (reason ? '（' + reason + '）' : '') +
      '。请确认 js/app.js、js/boot-guard.js 已上传到最新版本，然后强制刷新页面。';
    box.hidden = false;
  }

  window.addEventListener('error', function (event) {
    if (!window.__TIDAL_APP_READY__) {
      showFailure(event && event.message ? String(event.message).slice(0, 80) : '加载错误');
    }
  });

  window.setTimeout(function () {
    if (!window.__TIDAL_APP_READY__) showFailure('超时');
  }, 6000);
})();
