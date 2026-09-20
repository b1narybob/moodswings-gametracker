/* Mood Swings — app boot. */
(function () {
  'use strict';

  var UI = window.MSUI;

  function init() {
    // tab bar
    document.querySelectorAll('#tabbar .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {}
        UI.showView(t.dataset.view);
        UI.render();
      });
    });

    // undo
    document.getElementById('undo-btn').addEventListener('click', function () {
      if (UI.store.undo()) {
        UI.render();
        UI.toast('Undone');
      }
    });

    // static views
    UI.renderCards();
    UI.renderRules();

    // default view
    UI.showView('setup');
    UI.render();

    // sheet scrim / escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.closeSheet();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
