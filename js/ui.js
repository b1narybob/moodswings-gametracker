/* Mood Swings — UI layer. Views: setup, match, cards, rules, history. */
(function (global) {
  'use strict';

  var E = global.MSEngine, C = global.MSCards;
  var store = new E.Store();

  var currentView = 'setup';
  var setupDraft = { names: ['', '', '', ''], count: 2, firstId: null, ritualCard: null };

  /* ---------- tiny helpers ---------- */

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {} }
  function toast(msg) {
    var root = $('toast-root');
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 350); }, 2400);
  }

  /* ---------- bottom sheet ---------- */

  var sheetKind = null;
  function openSheet(html, kind) {
    sheetKind = kind || null;
    var sheet = $('sheet'), scrim = $('sheet-scrim');
    $('sheet-body').innerHTML = html;
    scrim.classList.remove('hidden');
    sheet.classList.remove('hidden');
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.remove('peek'); }); });
    sheet.classList.add('peek');
    // force reflow then animate in
    void sheet.offsetWidth;
    sheet.classList.remove('peek');
    scrim.onclick = closeSheet;
  }
  function closeSheet() {
    if (sheetKind === 'scoring' && store.state && store.state.phase === 'scoring' && store.state.scoring) {
      store.state.scoring.dismissed = true;
      store.save();
    }
    sheetKind = null;
    var sheet = $('sheet');
    sheet.classList.add('peek');
    setTimeout(function () {
      sheet.classList.add('hidden');
      $('sheet-scrim').classList.add('hidden');
    }, 240);
  }
  function sheetOpen() { return !$('sheet').classList.contains('hidden'); }

  function confirmSheet(title, body, okLabel, onOk, danger) {
    openSheet(
      '<div class="sheet-title">' + esc(title) + '</div>' +
      '<p class="sheet-sub">' + body + '</p>' +
      '<div class="btn-row"><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="cf-ok">' + esc(okLabel) + '</button>' +
      '<button class="btn btn-ghost" id="cf-no">Cancel</button></div>'
    );
    $('cf-ok').onclick = function () { closeSheet(); onOk(); };
    $('cf-no').onclick = closeSheet;
  }

  /* ---------- confetti ---------- */

  function confetti(n) {
    var root = $('confetti-root');
    var colors = ['#8b7bff', '#f472b6', '#7dd3fc', '#4ade80', '#f5c66b', '#f5f4f0'];
    for (var i = 0; i < (n || 90); i++) {
      var p = document.createElement('div');
      p.className = 'confetti-piece';
      var s = 6 + Math.random() * 8;
      p.style.cssText = 'left:' + (Math.random() * 100) + 'vw;width:' + s + 'px;height:' + (s * 0.6) + 'px;' +
        'background:' + colors[i % colors.length] + ';animation-duration:' + (2.2 + Math.random() * 2.2) + 's;' +
        'animation-delay:' + (Math.random() * 0.6) + 's;';
      root.appendChild(p);
      (function (el) { setTimeout(function () { el.remove(); }, 5200); })(p);
    }
  }

  /* ---------- navigation ---------- */

  var VIEWS = ['setup', 'match', 'cards', 'rules', 'history'];
  function showView(name) {
    currentView = name;
    VIEWS.forEach(function (v) { $('view-' + v).classList.toggle('hidden', v !== name); });
    document.querySelectorAll('#tabbar .tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === name);
    });
    window.scrollTo(0, 0);
    if (name === 'match') renderMatch();
    if (name === 'history') renderHistory();
    if (name === 'setup') renderSetup();
  }

  function refreshChrome() {
    $('undo-btn').classList.toggle('hidden', !store.canUndo());
    $('match-dot').classList.toggle('hidden', !(store.state && store.state.phase !== 'gameover'));
    var sub = 'Game Assistant';
    if (store.state && store.state.phase !== 'gameover') {
      var st = store.state;
      if (st.phase === 'scoring') sub = 'Round ' + st.round + ' · scoring';
      else {
        var ap = E.playerById(st, E.activePid(st));
        sub = 'Round ' + st.round + ' · ' + (ap ? ap.name + "'s turn" : 'in progress');
      }
    }
    $('header-sub').textContent = sub;
  }

  function render() {
    refreshChrome();
    if (currentView === 'match') renderMatch();
    else if (currentView === 'setup') renderSetup();
  }

  /* ================= SETUP ================= */

  function renderSetup() {
    var el = $('view-setup');
    var saved = store.loadSaved();
    var html = '';

    if (saved && !store.state) {
      var st = saved.state;
      var d = new Date(saved.savedAt);
      html += '<div class="card"><p class="eyebrow">Interrupted match</p>' +
        '<div class="hist-row"><div class="hist-trophy">⏸</div><div class="hist-main">' +
        '<div class="hn">' + esc(st.players.map(function (p) { return p.name; }).join(' · ')) + '</div>' +
        '<div class="hs">Round ' + st.round + ' · saved ' + d.toLocaleString() + '</div>' +
        '</div></div>' +
        '<div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="resume-btn">Resume match</button>' +
        '<button class="btn btn-ghost" id="discard-btn">Discard</button></div></div>';
    }

    html += '<h2 class="view-title">New match</h2>' +
      '<p class="view-sub">Two to four players share one deck. Set up the table, then let the app run the rounds.</p>';

    // player count stepper
    html += '<div class="card"><p class="eyebrow">Players</p><div class="stepper" style="margin-bottom:14px">' +
      '<button id="pc-dec" aria-label="Fewer players">−</button>' +
      '<div class="step-val" id="pc-val">' + setupDraft.count + '</div>' +
      '<button id="pc-inc" aria-label="More players">+</button></div><div id="name-slots">';

    var known = E.knownNames();
    for (var i = 0; i < setupDraft.count; i++) {
      html += '<div class="player-slot"><div class="slot-num">' + (i + 1) + '</div>' +
        '<div class="field" style="flex:1;margin:0"><input type="text" data-slot="' + i + '" placeholder="Player ' + (i + 1) + ' name" value="' +
        esc(setupDraft.names[i]) + '" list="known-names" maxlength="24" autocomplete="off"></div></div>';
    }
    html += '</div><datalist id="known-names">' + known.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div>';

    // first player ritual
    html += '<div class="card ritual-card"><p class="eyebrow" style="text-align:center">Who goes first?</p>';
    if (!setupDraft.ritualCard) {
      html += '<p class="view-sub" style="margin-bottom:12px">The rules say: reveal the bottom card of the deck — whoever <strong>most recently felt that emotion</strong> chooses who starts.</p>' +
        '<button class="btn btn-ghost" id="ritual-btn" style="margin-top:0">Reveal bottom card</button>';
    } else {
      var rc = setupDraft.ritualCard;
      html += '<div class="ritual-emotion">' + esc(rc.name) + '</div>' +
        '<p class="view-sub" style="margin-bottom:6px">Who most recently felt <strong>' + esc(rc.name.toLowerCase()) + '</strong>? They choose who starts round 1.</p>' +
        '<div class="ritual-pick" id="first-pick">' +
        activeNames().map(function (nm, idx) {
          return '<button class="chip-btn' + (setupDraft.firstId === 's' + idx ? ' selected' : '') + '" data-first="' + idx + '">' + esc(nm) + '</button>';
        }).join('') + '</div>' +
        '<button class="btn btn-ghost" id="ritual-btn" style="margin-top:14px">Reveal a different card</button>';
    }
    html += '</div>';

    html += '<button class="btn btn-primary" id="start-btn">Start match</button>' +
      '<p class="view-sub" style="text-align:center;margin-top:14px">Everything is saved automatically —<br>close the tab anytime and pick up where you left off.</p>';

    el.innerHTML = html;

    if (saved && !store.state) {
      $('resume-btn').onclick = function () { store.resume(saved); vibrate(); showView('match'); render(); toast('Match resumed — round ' + store.state.round); };
      $('discard-btn').onclick = function () {
        confirmSheet('Discard saved match?', 'The interrupted match will be permanently deleted.', 'Discard', function () {
          try { localStorage.removeItem('mswings.match.v1'); } catch (e) {}
          renderSetup();
        }, true);
      };
    }

    $('pc-dec').onclick = function () { if (setupDraft.count > 2) { setupDraft.count--; renderSetup(); } };
    $('pc-inc').onclick = function () { if (setupDraft.count < 4) { setupDraft.count++; renderSetup(); } };
    el.querySelectorAll('[data-slot]').forEach(function (inp) {
      inp.addEventListener('input', function () { setupDraft.names[+inp.dataset.slot] = inp.value; });
    });
    var rb = $('ritual-btn');
    if (rb) rb.onclick = function () {
      var pool = C.all;
      setupDraft.ritualCard = pool[Math.floor(Math.random() * pool.length)];
      vibrate();
      renderSetup();
    };
    var fp = $('first-pick');
    if (fp) fp.querySelectorAll('[data-first]').forEach(function (b) {
      b.onclick = function () {
        setupDraft.firstId = 's' + b.dataset.first;
        vibrate();
        fp.querySelectorAll('.chip-btn').forEach(function (x) { x.classList.remove('selected'); });
        b.classList.add('selected');
      };
    });
    $('start-btn').onclick = startMatch;
  }

  function activeNames() {
    var out = [];
    for (var i = 0; i < setupDraft.count; i++) {
      var n = (setupDraft.names[i] || '').trim() || ('Player ' + (i + 1));
      out.push(n);
    }
    return out;
  }

  function startMatch() {
    var names = activeNames();
    var firstIdx = 0;
    if (setupDraft.firstId && setupDraft.firstId[0] === 's') firstIdx = Math.min(+setupDraft.firstId.slice(1), names.length - 1);
    store.undoStack = [];
    var st = E.newMatch(names, null);
    // rotate turn order so the chosen first player starts
    var order = st.players.map(function (p) { return p.id; });
    st.order = order.slice(firstIdx).concat(order.slice(0, firstIdx));
    store.state = st;
    store.save();
    // remember names
    try {
      var known = E.knownNames();
      names.forEach(function (n) { if (known.indexOf(n) === -1) known.push(n); });
      localStorage.setItem('mswings.names.v1', JSON.stringify(known.slice(-12)));
    } catch (e) {}
    setupDraft = { names: names.concat(['', '', '', '']).slice(0, 4), count: names.length, firstId: null, ritualCard: null };
    vibrate(20);
    showView('match');
    render();
    toast(names[firstIdx] + ' takes the first turn');
  }

  /* ================= MATCH ================= */

  function stars(wins) {
    var s = '';
    for (var i = 0; i < E.WIN_ROUNDS; i++) s += i < wins ? '★' : '<span class="off">★</span>';
    return '<span class="winstars">' + s + '</span>';
  }

  function renderMatch() {
    var el = $('view-match');
    var st = store.state;
    if (!st) {
      el.innerHTML = '<h2 class="view-title">No match yet</h2>' +
        '<p class="view-sub">Set up a new match to start tracking turns, scores, and rounds.</p>' +
        '<button class="btn btn-primary" id="go-setup">Set up match</button>';
      $('go-setup').onclick = function () { showView('setup'); };
      return;
    }
    if (st.phase === 'gameover') { renderGameOver(el, st); return; }

    var html = '<div class="round-banner"><div><div class="round-num">Round ' + st.round + '</div>' +
      '<div class="round-hint">' + (st.phase === 'scoring' ? 'Scoring…' : turnHint(st)) + '</div></div>' +
      '<div style="text-align:right">' + stars(Math.max.apply(null, st.players.map(function (p) { return p.wins; }))) + '</div></div>';

    // turn strip
    html += '<div class="turn-strip">';
    st.order.forEach(function (pid, i) {
      var p = E.playerById(st, pid);
      var cls = 'turn-node';
      if (st.turnDoneAt[pid]) cls += ' done';
      if (st.phase === 'play' && i === st.turnPos) cls += ' now';
      html += '<div class="' + cls + '">' + esc(p.name) + '</div>';
      if (i < st.order.length - 1) html += '<div class="turn-arrow">→</div>';
    });
    html += '</div>';

    st.players.forEach(function (p) {
      var isActive = st.phase === 'play' && E.activePid(st) === p.id;
      var done = !!st.turnDoneAt[p.id];
      var score = E.scoreOf(p);
      var badges = '';
      if (st.order[0] === p.id) badges += '<span class="badge badge-first">First</span>';
      if (st.hurtFeelings === p.id) badges += '<span class="badge badge-hurt">Hurt feelings · +1 play</span>';
      if (isActive) badges += '<span class="badge badge-turn">● turn</span>';
      if (done) badges += '<span class="badge badge-pass">done</span>';

      html += '<div class="player-panel' + (isActive ? ' active-turn' : '') + (done ? ' done-turn' : '') + '">' +
        '<div class="panel-head"><div class="avatar">' + esc(p.name.trim()[0].toUpperCase()) + '</div>' +
        '<div><div class="pname">' + esc(p.name) + '</div>' +
        '<div class="psub">' + stars(p.wins) + badges + '</div></div>' +
        '<div class="panel-score"><div class="num">' + score + '</div><div class="lbl">score</div></div></div>';

      if (p.board.length) {
        html += '<div class="mood-board">';
        p.board.forEach(function (m) {
          html += '<button class="mood-chip' + (m.suppressed ? ' suppressed' : '') + '" data-mood="' + m.uid + '">' +
            '<span class="dot dot-' + m.color + '"></span>' + esc(m.name) +
            '<span class="mv">' + moodValue(m) + '</span>' +
            (m.rotated ? '<span class="rot">⟲</span>' : '') +
            '</button>';
        });
        html += '</div>';
      } else {
        html += '<div class="empty-board">No moods in play yet.</div>';
      }

      if (isActive) {
        var left = E.playsAllowed(st, p.id) - st.playsMade[p.id];
        html += '<div class="panel-actions">' +
          '<button class="mini-btn primary" id="play-' + p.id + '">＋ Play a mood' + (left > 1 ? ' (' + left + ' left)' : '') + '</button>' +
          '<button class="mini-btn" id="extra-' + p.id + '" title="Grant an extra play (card effect)">+1 play</button>' +
          '<button class="mini-btn quiet" id="pass-' + p.id + '">' + (st.playsMade[p.id] ? 'Done' : 'Pass') + '</button></div>';
      }
      html += '</div>';
    });

    html += '<div class="divider"></div>' +
      '<button class="btn btn-ghost" id="end-early">End match early</button>';

    el.innerHTML = html;

    // wire mood chips
    el.querySelectorAll('[data-mood]').forEach(function (chip) {
      chip.onclick = function () { openMoodEditor(chip.dataset.mood); };
    });
    // wire active player actions
    st.players.forEach(function (p) {
      var bp = $('play-' + p.id), be = $('extra-' + p.id), bn = $('pass-' + p.id);
      if (bp) bp.onclick = function () { openCardPicker(p.id); };
      if (be) be.onclick = function () {
        store.mutate(function (s) { E.grantExtraPlay(s, p.id); });
        vibrate(); render(); toast('+1 play for ' + p.name + ' (card effect)');
      };
      if (bn) bn.onclick = function () { endPlayerTurn(p.id); };
    });
    $('end-early').onclick = function () {
      confirmSheet('End match early?', 'The match will be archived as incomplete.', 'End match', function () {
        store.archive(); showView('setup'); render();
      }, true);
    };

    // auto-open scoring when all turns are done (once per scoring phase;
    // if the user dismisses it, don't pop it back up on every render)
    if (st.phase === 'scoring' && !sheetOpen() && !st.scoring.dismissed) {
      setTimeout(openScoringSheet, 350);
    }
    refreshChrome();
  }

  function turnHint(st) {
    var p = E.playerById(st, E.activePid(st));
    var left = E.playsAllowed(st, p.id) - st.playsMade[p.id];
    return esc(p.name) + ' — play a mood' + (left > 1 ? ' (' + left + ' plays)' : '') + ' or pass';
  }

  function moodValue(m) { return m.suppressed ? 0 : m.value; }

  function endPlayerTurn(pid) {
    var st = store.state;
    var p = E.playerById(st, pid);
    store.mutate(function (s) { E.endTurn(s, pid); });
    vibrate(12);
    var ns = store.state;
    if (ns.phase === 'scoring') {
      toast('All turns taken — scoring');
      render();
    } else {
      render();
      toast(E.playerById(ns, E.activePid(ns)).name + "'s turn");
    }
  }

  /* ---------- play-a-mood flow ---------- */

  var pickPid = null, pickQuery = '', pickColor = 'all';

  function openCardPicker(pid) {
    pickPid = pid; pickQuery = ''; pickColor = 'all';
    renderCardPicker();
  }

  function renderCardPicker() {
    var st = store.state;
    var p = E.playerById(st, pickPid);
    var list = C.search(pickQuery).filter(function (c) { return !c.special; });
    if (pickColor !== 'all') list = list.filter(function (c) { return c.color === pickColor; });
    var shown = list.slice(0, 40);

    var html = '<div class="sheet-title">Play a mood</div>' +
      '<p class="sheet-sub">' + esc(p.name) + ' — choose the card being played. Its value lands on your board.</p>' +
      '<div class="field"><input type="search" id="pk-q" placeholder="Search ' + C.all.length + ' cards…" value="' + esc(pickQuery) + '" autocomplete="off"></div>' +
      '<div class="chip-row">' +
      ['all', 'white', 'blue', 'black', 'red', 'green'].map(function (col) {
        return '<button class="fchip' + (pickColor === col ? ' on' : '') + '" data-col="' + col + '">' + (col === 'all' ? 'All' : col[0].toUpperCase() + col.slice(1)) + '</button>';
      }).join('') + '</div><div id="pk-list">';

    if (!shown.length) html += '<p class="view-sub" style="text-align:center;padding:20px">No cards match.</p>';
    shown.forEach(function (c) {
      html += '<button class="card-pick" data-card="' + c.id + '"><span class="dot dot-' + c.color + '"></span>' +
        '<span><span class="nm">' + esc(c.name) + '</span><span class="die-tag die-' + c.die + '">' + (c.die === 'white' ? 'fixed' : 'variable') + '</span>' +
        '<div class="meta">' + c.color + ' · ' + c.rarity + (c.secondary != null ? ' · 2nd value ' + c.secondary : '') + '</div></span>' +
        '<span class="pv">' + c.value + '</span></button>';
    });
    if (list.length > 40) html += '<p class="view-sub" style="text-align:center">' + (list.length - 40) + ' more — keep typing to narrow.</p>';
    html += '</div>';
    openSheet(html);

    var q = $('pk-q');
    q.focus();
    q.addEventListener('input', function () { pickQuery = q.value; preserveFocus(renderCardPicker, 'pk-q', q.value); });
    document.querySelectorAll('#sheet-body [data-col]').forEach(function (b) {
      b.onclick = function () { pickColor = b.dataset.col; renderCardPicker(); };
    });
    document.querySelectorAll('#sheet-body [data-card]').forEach(function (b) {
      b.onclick = function () { openMoodConfigure(pickPid, +b.dataset.card); };
    });
  }

  function preserveFocus(rerender, id, val) {
    rerender();
    var el = $(id);
    if (el) { el.focus(); el.value = val; el.setSelectionRange(val.length, val.length); }
  }

  function openMoodConfigure(pid, cardId) {
    var card = C.byId(cardId);
    var st = store.state;
    var p = E.playerById(st, pid);
    var html = '<div class="sheet-title">' + esc(card.name) + '</div>' +
      '<p class="sheet-sub"><span class="dot dot-' + card.color + '" style="display:inline-block;width:11px;height:11px;border-radius:50%"></span> ' +
      card.color + ' · ' + card.rarity + ' · <strong style="color:var(--text)">' + (card.die === 'white' ? 'Fixed' : 'Variable') + ' value</strong></p>' +
      '<div class="callout info">' + esc(card.summary) + '</div>';

    if (card.die === 'black') {
      html += '<div class="callout warn"><span class="co-title">Black die — set the current value</span>Variable values change with the board. Set what it is worth right now; you can recheck it at scoring.</div>';
    }
    html += '<p class="eyebrow">Effective value</p><div class="stepper" style="margin-bottom:14px">' +
      '<button id="mv-dec">−</button><div class="step-val" id="mv-val">' + card.value + '</div><button id="mv-inc">+</button></div>';

    if (card.secondary != null) {
      html += '<div class="toggle-row"><div><div class="t-label">Rotated — use secondary value</div>' +
        '<div class="t-sub">Turn the card 180° so ' + card.secondary + ' is top-right</div></div>' +
        '<label class="switch"><input type="checkbox" id="mv-rot"><span class="track"></span></label></div>';
    }
    html += '<div style="height:16px"></div><button class="btn btn-primary" id="mv-ok">Play ' + esc(card.name) + '</button>' +
      '<button class="btn btn-ghost" id="mv-back">Back to cards</button>';

    openSheet(html);
    var val = card.value, rotated = false;
    var valEl = $('mv-val');
    $('mv-dec').onclick = function () { val = Math.max(0, val - 1); valEl.textContent = val; vibrate(6); };
    $('mv-inc').onclick = function () { val = Math.min(30, val + 1); valEl.textContent = val; vibrate(6); };
    var rot = $('mv-rot');
    if (rot) rot.onchange = function () {
      rotated = rot.checked;
      val = rotated ? card.secondary : card.value;
      valEl.textContent = val;
    };
    $('mv-back').onclick = function () { renderCardPicker(); };
    $('mv-ok').onclick = function () {
      try {
        store.mutate(function (s) { E.playMood(s, pid, card, { value: val, rotated: rotated }); });
      } catch (err) { toast(err.message); return; }
      vibrate(15);
      closeSheet();
      setTimeout(function () { render(); toast(card.name + ' in play for ' + E.playerById(store.state, pid).name); }, 250);
    };
  }

  /* ---------- mood editor ---------- */

  function openMoodEditor(moodUid) {
    var st = store.state;
    var mood = E.findMood(st, moodUid);
    if (!mood) return;
    var card = C.byId(mood.cardId);
    var html = '<div class="sheet-title">' + esc(mood.name) + '</div>' +
      '<p class="sheet-sub">' + (card ? esc(card.summary) : '') + '</p>' +
      '<p class="eyebrow">Current value' + (mood.dieColor === 'black' ? ' (black die — recheck me)' : '') + '</p>' +
      '<div class="stepper" style="margin-bottom:14px"><button id="me-dec">−</button>' +
      '<div class="step-val" id="me-val">' + mood.value + '</div><button id="me-inc">+</button></div>';

    if (mood.secondary != null) {
      html += '<div class="toggle-row"><div><div class="t-label">Rotated (secondary value ' + mood.secondary + ')</div>' +
        '<div class="t-sub">Card turned 180°</div></div>' +
        '<label class="switch"><input type="checkbox" id="me-rot"' + (mood.rotated ? ' checked' : '') + '><span class="track"></span></label></div>';
    }
    html += '<div class="toggle-row"><div><div class="t-label">Suppressed</div>' +
      '<div class="t-sub">Worth 0 while suppressed (turned sideways)</div></div>' +
      '<label class="switch"><input type="checkbox" id="me-sup"' + (mood.suppressed ? ' checked' : '') + '><span class="track"></span></label></div>' +
      '<div style="height:16px"></div>' +
      '<button class="btn btn-ghost" id="me-move">Move to another player</button>' +
      '<button class="btn btn-danger" id="me-del">Remove from play</button>' +
      '<button class="btn btn-ghost" id="me-close">Done</button>';

    openSheet(html);
    var valEl = $('me-val');
    var live = mood.value;
    function pushVal() { store.mutate(function (s) { E.setMoodValue(s, moodUid, live); }); valEl.textContent = live; refreshChrome(); }
    $('me-dec').onclick = function () { live = Math.max(0, live - 1); pushVal(); vibrate(6); };
    $('me-inc').onclick = function () { live = Math.min(30, live + 1); pushVal(); vibrate(6); };
    var rot = $('me-rot');
    if (rot) rot.onchange = function () {
      store.mutate(function (s) { E.setMoodRotated(s, moodUid, rot.checked); });
      live = E.findMood(store.state, moodUid).value; valEl.textContent = live; render();
    };
    $('me-sup').onchange = function () {
      var v = $('me-sup').checked;
      store.mutate(function (s) { E.setMoodSuppressed(s, moodUid, v); });
      render();
    };
    $('me-move').onclick = function () {
      var s2 = store.state;
      var holderId = null;
      s2.players.forEach(function (pl) {
        if (pl.board.some(function (m) { return m.uid === moodUid; })) holderId = pl.id;
      });
      var others = s2.players.filter(function (pl) { return pl.id !== holderId; });
      openSheet('<div class="sheet-title">Move ' + esc(mood.name) + '</div><p class="sheet-sub">Stolen, given, or borrowed — pick the new owner.</p>' +
        others.map(function (pl) { return '<button class="card-pick" data-mv="' + pl.id + '"><span class="nm">' + esc(pl.name) + '</span></button>'; }).join('') +
        '<button class="btn btn-ghost" id="mv-back2">Back</button>');
      document.querySelectorAll('#sheet-body [data-mv]').forEach(function (b) {
        b.onclick = function () {
          var target = b.dataset.mv;
          store.mutate(function (s) {
            var m = E.findMood(s, moodUid);
            if (!m) return;
            s.players.forEach(function (pl) { pl.board = pl.board.filter(function (x) { return x.uid !== moodUid; }); });
            E.playerById(s, target).board.push(m);
          });
          closeSheet(); setTimeout(render, 250); toast('Moved to ' + E.playerById(store.state, target).name);
        };
      });
      $('mv-back2').onclick = function () { openMoodEditor(moodUid); };
    };
    $('me-del').onclick = function () {
      confirmSheet('Remove ' + mood.name + '?', 'It leaves play (discarded, tucked, or returned — handle the physical card).', 'Remove', function () {
        store.mutate(function (s) { E.removeMood(s, moodUid); });
        render();
      }, true);
    };
    $('me-close').onclick = function () { closeSheet(); render(); };
  }

  /* ---------- scoring ---------- */

  function openScoringSheet() {
    var st = store.state;
    if (!st || st.phase !== 'scoring') return;
    var sc = st.scoring;
    sc.dismissed = false;
    var html = '<div class="sheet-title">Round ' + st.round + ' — scoring</div>' +
      '<p class="sheet-sub">Highest total wins the round. Moods stay in play.</p>' +
      '<table class="score-table">';
    st.order.forEach(function (pid) {
      var p = E.playerById(st, pid);
      html += '<tr class="' + (pid === sc.winnerId ? 'winner' : '') + '"><td class="st-name">' + esc(p.name) + '</td>' +
        '<td class="st-score">' + sc.scores[pid] + '</td></tr>';
    });
    html += '</table>';
    if (sc.tied) {
      var tiedNames = st.players.filter(function (p) { return sc.scores[p.id] === sc.scores[sc.winnerId]; }).map(function (p) { return p.name; });
      html += '<div class="callout warn"><span class="co-title">Tiebreak applied</span>' + esc(tiedNames.join(', ')) +
        ' tied — ' + esc(E.playerById(st, sc.winnerId).name) + ' took the earliest turn, so they win the round.</div>';
    }
    if (sc.blackDice.length) {
      html += '<p class="eyebrow" style="margin-top:16px">Recheck black-die values</p>';
      sc.blackDice.forEach(function (b) {
        html += '<div class="recheck-row"><div class="rn">' + esc(b.name) + '<small>' + esc(b.pname) + '</small></div>' +
          '<div class="stepper"><button data-bd="' + b.uid + '|-1">−</button>' +
          '<div class="step-val" id="bd-' + b.uid + '">' + b.value + '</div>' +
          '<button data-bd="' + b.uid + '|1">+</button></div></div>';
      });
    }
    html += '<p class="eyebrow" style="margin-top:16px">Round winner</p><div class="ritual-pick" id="win-pick" style="justify-content:flex-start">' +
      st.players.map(function (p) {
        return '<button class="chip-btn' + (p.id === sc.winnerId ? ' selected' : '') + '" data-win="' + p.id + '">' + esc(p.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="callout info" style="margin-top:14px"><span class="co-title">After-scoring effects first</span>' +
      'Resolve any “after scoring” effects in turn order before confirming — Sneakiness can change the winner. Adjust the winner above if one did.</div>' +
      '<div style="height:8px"></div>' +
      '<button class="btn btn-primary" id="score-ok">Confirm round</button>' +
      '<button class="btn btn-ghost" id="score-awe">Scoring cancelled (Awe)</button>';

    openSheet(html, 'scoring');

    document.querySelectorAll('#sheet-body [data-bd]').forEach(function (b) {
      b.onclick = function () {
        var parts = b.dataset.bd.split('|');
        var m = E.findMood(store.state, parts[0]);
        if (!m) return;
        var nv = Math.max(0, Math.min(30, m.value + (+parts[1])));
        store.mutate(function (s) { E.setMoodValue(s, parts[0], nv); });
        vibrate(6);
        // recompute scoring snapshot live
        var s2 = store.state;
        var scores = E.scoresOf(s2);
        var w = E.computeWinner(s2, scores);
        s2.scoring.scores = scores; s2.scoring.winnerId = w.winnerId; s2.scoring.tied = w.tied;
        store.save();
        openScoringSheet();
      };
    });
    document.querySelectorAll('#sheet-body [data-win]').forEach(function (b) {
      b.onclick = function () {
        store.mutate(function (s) { s.scoring.winnerId = b.dataset.win; });
        openScoringSheet();
      };
    });
    $('score-ok').onclick = function () {
      var winnerId = store.state.scoring.winnerId;
      var summary;
      store.mutate(function (s) { summary = E.resolveRound(s, winnerId); });
      vibrate(20);
      openAfterScoring(summary);
      render();
    };
    $('score-awe').onclick = function () {
      var s2 = store.state;
      var first = s2.order[0];
      openSheet('<div class="sheet-title">Awe cancels scoring</div>' +
        '<p class="sheet-sub">No winner, no draws, no Hurt Feelings this round. Who goes first next round?</p>' +
        '<div class="ritual-pick" style="justify-content:flex-start">' +
        s2.players.map(function (p) {
          return '<button class="chip-btn' + (p.id === first ? ' selected' : '') + '" data-af="' + p.id + '">' + esc(p.name) + '</button>';
        }).join('') + '</div><div style="height:14px"></div>' +
        '<button class="btn btn-primary" id="awe-ok">Start next round</button>');
      var sel = first;
      document.querySelectorAll('#sheet-body [data-af]').forEach(function (b) {
        b.onclick = function () {
          sel = b.dataset.af;
          document.querySelectorAll('#sheet-body [data-af]').forEach(function (x) { x.classList.remove('selected'); });
          b.classList.add('selected');
        };
      });
      $('awe-ok').onclick = function () {
        store.mutate(function (s) { E.cancelRound(s, sel); });
        closeSheet(); setTimeout(render, 250);
        toast('Round skipped — ' + E.playerById(store.state, sel).name + ' goes first');
      };
    };
  }

  function openAfterScoring(summary) {
    var st = store.state;
    if (summary.gameOver) {
      var winner = E.playerById(st, summary.winnerId);
      store.archive();
      openSheet('<div class="splash"><div class="trophy">🏆</div><h2>' + esc(winner.name) + ' wins!</h2>' +
        '<p>First to ' + E.WIN_ROUNDS + ' round wins. Saved to match history.</p>' +
        '<button class="btn btn-primary" id="gg-done">Done</button></div>');
      confetti(110);
      vibrate([30, 40, 30]);
      $('gg-done').onclick = function () { closeSheet(); showView('setup'); render(); };
      render();
      return;
    }
    var winnerP = E.playerById(st, summary.winnerId);
    var html = '<div class="sheet-title">Round ' + summary.round + ' — ' + esc(summary.winnerName) + ' wins</div>' +
      '<p class="sheet-sub">' + stars(winnerP.wins) + ' round wins</p>';

    html += '<p class="eyebrow">Each losing player draws a card</p><div id="draw-list">';
    summary.losers.forEach(function (pid) {
      var p = E.playerById(st, pid);
      html += '<div class="check-item" data-check><div class="check-box">✓</div>' +
        '<div class="check-text">' + esc(p.name) + ' draws<small>from the shared deck</small></div></div>';
    });
    html += '</div>';

    if (summary.hurtFeelings) {
      var hp = E.playerById(st, summary.hurtFeelings);
      html += '<div class="callout warn"><span class="co-title">💔 Hurt Feelings</span>' + esc(hp.name) +
        ' had the lowest score and may play <strong>one extra mood</strong> on their turn next round.</div>';
    }
    html += '<div class="callout good"><span class="co-title">Next round</span>' + esc(summary.winnerName) +
      ' takes the first turn (and holds the tiebreak). Boards stay in play.</div>' +
      '<button class="btn btn-primary" id="next-round">Start round ' + (summary.round + 1) + '</button>';

    openSheet(html);
    document.querySelectorAll('#sheet-body [data-check]').forEach(function (c) {
      c.onclick = function () { c.classList.toggle('done'); vibrate(8); };
    });
    $('next-round').onclick = function () {
      closeSheet(); setTimeout(function () { render(); toast('Round ' + store.state.round + ' — ' + E.playerById(store.state, E.activePid(store.state)).name + ' to play'); }, 250);
    };
  }

  function renderGameOver(el, st) {
    var last = st.rounds[st.rounds.length - 1];
    var w = last ? E.playerById(st, last.winnerId) : null;
    el.innerHTML = '<div class="card"><div class="splash"><div class="trophy">🏆</div>' +
      '<h2>' + esc(w ? w.name : 'Match over') + '</h2><p>The match has concluded.</p>' +
      '<button class="btn btn-primary" id="go-new">New match</button></div></div>';
    $('go-new').onclick = function () { store.abandon(); showView('setup'); render(); };
  }

  /* ================= CARDS REFERENCE ================= */

  var refQuery = '', refColor = 'all', refDie = 'all';

  function renderCards() {
    var el = $('view-cards');
    var list = C.search(refQuery);
    if (refColor !== 'all') list = list.filter(function (c) { return c.color === refColor; });
    if (refDie !== 'all') list = list.filter(function (c) { return c.die === 'black'; });

    var html = '<h2 class="view-title">Card reference</h2>' +
      '<p class="view-sub">' + C.all.length + ' cards, including the Love headliner. Tap any card for its effect summary.</p>' +
      '<div class="filter-bar"><div class="field"><input type="search" id="rf-q" placeholder="Search cards…" value="' + esc(refQuery) + '" autocomplete="off"></div></div>' +
      '<div class="chip-row">' +
      ['all', 'white', 'blue', 'black', 'red', 'green'].map(function (col) {
        return '<button class="fchip' + (refColor === col ? ' on' : '') + '" data-rcol="' + col + '">' + (col === 'all' ? 'All colors' : col[0].toUpperCase() + col.slice(1)) + '</button>';
      }).join('') +
      '<button class="fchip' + (refDie === 'black' ? ' on' : '') + '" data-rdie>Black die</button></div>' +
      '<p class="view-sub">' + list.length + ' cards</p><div id="ref-list">';

    list.forEach(function (c) {
      html += '<div class="ref-card" data-ref="' + c.id + '"><div class="ref-head">' +
        '<span class="dot dot-' + c.color + '"></span><span class="rn">' + esc(c.name) + '</span>' +
        '<span class="pv">' + c.value + '<span class="die-tag die-' + c.die + '">' + (c.die === 'white' ? 'fixed' : 'var') + '</span></span></div>' +
        '<div class="ref-meta"><span class="mtag">' + c.color + '</span><span class="mtag">' + c.rarity + '</span>' +
        (c.secondary != null ? '<span class="mtag">2nd ' + c.secondary + '</span>' : '') + '<span class="mtag">#' + c.id + '</span></div>' +
        '<div class="ref-summary">' + esc(c.summary) + '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;

    var q = $('rf-q');
    q.addEventListener('input', function () { refQuery = q.value; preserveFocus(renderCards, 'rf-q', q.value); });
    el.querySelectorAll('[data-rcol]').forEach(function (b) {
      b.onclick = function () { refColor = b.dataset.rcol; renderCards(); };
    });
    var db = el.querySelector('[data-rdie]');
    if (db) db.onclick = function () { refDie = refDie === 'black' ? 'all' : 'black'; renderCards(); };
    el.querySelectorAll('[data-ref]').forEach(function (rc) {
      rc.onclick = function () { openCardDetail(+rc.dataset.ref); };
    });
  }

  function openCardDetail(cardId) {
    var card = C.byId(cardId);
    if (!card) return;
    var html = '<div class="sheet-title">' + esc(card.name) + '</div>' +
      '<p class="sheet-sub"><span class="dot dot-' + card.color + '" style="display:inline-block;width:11px;height:11px;border-radius:50%"></span> ' +
      card.color + ' · ' + card.rarity + ' · <strong style="color:var(--text)">' + (card.die === 'white' ? 'Fixed' : 'Variable') + ' value ' + card.value + '</strong></p>' +
      '<div class="callout info">' + esc(card.summary) + '</div>';
    if (card.secondary != null) {
      html += '<div class="callout"><span class="co-title">Rotatable</span>Turn the card 180° to use its secondary value of ' + card.secondary + ' instead.</div>';
    }
    if (card.special) {
      html += '<div class="callout warn"><span class="co-title">Special card</span>' + esc(card.special === 'headliner' ? 'Headliner card — it has its own rules; see the card.' : 'Helper card — not part of the 133-card deck.') + '</div>';
    }
    html += '<div style="height:8px"></div><button class="btn btn-ghost" id="cd-close">Close</button>';
    openSheet(html);
    $('cd-close').onclick = closeSheet;
    vibrate(8);
  }

  /* ================= RULES ================= */

  var RULES_HTML = `
  <div class="rules-doc">
  <h3>The goal</h3>
  <p>Win <strong>3 rounds</strong> before anyone else. A round is won by having the <strong>highest total mood value</strong> when the round is scored.</p>

  <h3>Setup</h3>
  <ul>
    <li>All players <strong>share one deck and one discard pile</strong>. Shuffle it.</li>
    <li>Each player <strong>draws 5 cards</strong>.</li>
    <li><strong>Reveal the bottom card</strong> of the deck. Whoever <strong>most recently felt that emotion</strong> chooses who takes the first turn of round 1. (Use the <em>Reveal bottom card</em> ritual on the Setup tab.)</li>
  </ul>

  <h3>Rounds &amp; turns</h3>
  <ul>
    <li>Each round, the first player takes a turn, then everyone else in <strong>clockwise</strong> order.</li>
    <li>On your turn, <strong>play one card or pass</strong>. A played card goes face-up in front of you and becomes one of your <strong>moods</strong>.</li>
    <li>Cards in hand, deck, or discard pile are just <strong>cards</strong> — only cards in play are <strong>moods</strong>.</li>
    <li><strong>Moods stay in play between rounds</strong> unless an effect moves them. Your board builds all game.</li>
    <li>Only the active player acts on their turn — you never play cards on someone else's turn (though their moods can still affect yours).</li>
  </ul>

  <h3>Playing a card — the three effect types</h3>
  <ul>
    <li><strong>To play this card —</strong> a cost or requirement, paid <em>before</em> it enters play. If you can't pay, you can't play it (e.g. discard a card, or return some of your moods to hand).</li>
    <li><strong>While in play —</strong> a continuous effect for as long as the mood is on the table (often changes values).</li>
    <li><strong>After playing this mood —</strong> a one-shot effect resolved right after it enters play.</li>
  </ul>
  <p>Resolution order: pay costs → put the mood into play → apply continuous effects → resolve the after-playing effect → re-settle continuous effects until values are stable.</p>

  <h3>Card anatomy</h3>
  <ul>
    <li><strong>Value die (top-right):</strong> a <strong>white die</strong> means the value is <strong>fixed</strong>; a <strong>black die</strong> means it's <strong>variable</strong> — recheck it every time you score.</li>
    <li><strong>Secondary value (lower-left):</strong> some cards can switch to this value — <strong>rotate the card 180°</strong> so the active value sits top-right. Values of 7+ are shown as two dice added together.</li>
    <li><strong>Frame color:</strong> white, blue, black, red, or green — many effects care about color.</li>
    <li><strong>! icon:</strong> the card does something <em>while in play</em> (beyond changing its own value).</li>
    <li><strong>Suppressed:</strong> a suppressed mood is worth <strong>0</strong> (turn it sideways) but still counts as in play for color/value checks.</li>
  </ul>

  <h3>Scoring the round</h3>
  <ul>
    <li>After everyone has taken a turn, each player <strong>sums the current values of all their moods</strong>. Recheck every black die first.</li>
    <li><strong>Highest total wins.</strong> Tie? Whoever <strong>took their turn earliest</strong> this round wins the tie.</li>
    <li>Resolve <strong>after-scoring effects</strong> in turn order <em>before</em> anything else — Sneakiness can change the winner.</li>
  </ul>

  <h3>After scoring</h3>
  <ul>
    <li>If a player has won <strong>3 rounds, they win the game</strong>.</li>
    <li>Otherwise <strong>every player who lost draws one card</strong> — the built-in catch-up.</li>
    <li><strong>Hurt Feelings (3+ players only):</strong> the <strong>lowest-scoring</strong> player may play <strong>one extra mood</strong> on their turn next round. Tie for lowest? The one who <strong>took their turn latest</strong> gets it.</li>
    <li>The round winner <strong>goes first next round</strong> (and holds the tiebreak).</li>
  </ul>

  <h3>Handy terms</h3>
  <ul>
    <li><strong>Additional mood</strong> — permission to play an extra mood on your turn (default is one).</li>
    <li><strong>Discard</strong> — a card moving from a <em>hand</em> to the discard pile. Moods leaving play also land there.</li>
    <li><strong>Moodiest</strong> — the player with the most moods in play.</li>
    <li><strong>Becomes yours / give</strong> — ownership changes; if it later returns to a hand, it goes to the <em>new</em> owner's hand.</li>
  </ul>
  </div>`;

  function renderRules() {
    $('view-rules').innerHTML = '<h2 class="view-title">How to play</h2>' +
      '<p class="view-sub">The complete rules, condensed from the official extended rules.</p>' +
      '<div class="card">' + RULES_HTML + '</div>';
  }

  /* ================= HISTORY ================= */

  function renderHistory() {
    var el = $('view-history');
    var h = E.history();
    var done = h.filter(function (m) { return m.completed; });
    var wins = {};
    done.forEach(function (m) { if (m.winner) wins[m.winner] = (wins[m.winner] || 0) + 1; });
    var top = Object.keys(wins).sort(function (a, b) { return wins[b] - wins[a]; })[0];

    var html = '<h2 class="view-title">History</h2>' +
      '<p class="view-sub">Past matches, kept on this device.</p>' +
      '<div class="stat-grid">' +
      '<div class="stat-box"><div class="sv">' + done.length + '</div><div class="sl">matches won</div></div>' +
      '<div class="stat-box"><div class="sv">' + h.reduce(function (s, m) { return s + (m.rounds || 0); }, 0) + '</div><div class="sl">rounds played</div></div>' +
      '</div>';

    if (top) html += '<div class="callout good"><span class="co-title">Table champion</span>' + esc(top) + ' — ' + wins[top] + ' match ' + (wins[top] === 1 ? 'win' : 'wins') + '.</div>';

    if (!h.length) {
      html += '<div class="card" style="text-align:center;color:var(--text-dim)">No matches yet.<br>Finish a match and it will appear here.</div>';
    } else {
      html += '<div class="card tight">';
      h.forEach(function (m) {
        var d = new Date(m.date);
        html += '<div class="hist-row"><div class="hist-trophy">' + (m.completed ? '🏆' : '⏸') + '</div><div class="hist-main">' +
          '<div class="hn">' + (m.completed ? esc(m.winner || '—') + ' won' : 'Unfinished') + '</div>' +
          '<div class="hs">' + esc(m.players.map(function (p) { return p.name + ' ' + p.wins; }).join(' · ')) +
          ' · ' + m.rounds + ' rounds · ' + d.toLocaleDateString() + '</div></div></div>';
      });
      html += '</div><button class="btn btn-danger" id="clear-hist">Clear history</button>';
    }
    el.innerHTML = html;
    var cb = $('clear-hist');
    if (cb) cb.onclick = function () {
      confirmSheet('Clear history?', 'All recorded matches will be deleted from this device.', 'Clear', function () {
        E.clearHistory(); renderHistory();
      }, true);
    };
  }

  /* ================= boot ================= */

  global.MSUI = {
    showView: showView,
    render: render,
    renderCards: renderCards,
    renderRules: renderRules,
    get store() { return store; },
    toast: toast,
    closeSheet: closeSheet
  };
})(typeof window !== 'undefined' ? window : globalThis);
