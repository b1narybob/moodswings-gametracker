/* Mood Swings — match engine.
 * Framework-free, fully serializable state. Implements the official rules:
 * shared turn order, one mood (or pass) per turn, persistent boards across
 * rounds, black-die rechecks at scoring, earliest-turn tiebreaks, losers draw,
 * Hurt Feelings (3+ players, lowest score, latest-turn tiebreak), winner goes
 * first next round, first to 3 round wins takes the match.
 */
(function (global) {
  'use strict';

  var WIN_ROUNDS = 3;
  var UNDO_CAP = 60;

  function uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- state ---------------- */

  function newMatch(names, firstId) {
    var players = names.map(function (n, i) {
      return { id: 'p' + i + '_' + Date.now().toString(36), name: n, wins: 0, board: [] };
    });
    var first = players[0];
    players.forEach(function (p) { if (p.id === firstId) first = p; });
    // clockwise order starting with the first player
    var fi = players.indexOf(first);
    var order = players.map(function (p) { return p.id; });
    order = order.slice(fi).concat(order.slice(0, fi));
    var st = {
      v: 1,
      players: players,
      round: 1,
      order: order,
      turnPos: 0,
      turnSeq: 0,
      turnDoneAt: {},     // pid -> sequence number when their turn ended
      playsMade: {},      // pid -> moods played this turn
      extraPlays: {},     // pid -> extra plays granted this turn
      hurtFeelings: null, // pid holding Hurt Feelings this round
      phase: 'play',
      scoring: null,      // computed snapshot while confirming scoring
      rounds: [],         // finished rounds: {n, winnerId, scores}
      startedAt: Date.now()
    };
    players.forEach(function (p) { st.playsMade[p.id] = 0; st.extraPlays[p.id] = 0; });
    return st;
  }

  function playerById(st, pid) {
    for (var i = 0; i < st.players.length; i++) if (st.players[i].id === pid) return st.players[i];
    return null;
  }

  function activePid(st) { return st.order[st.turnPos]; }

  /* ---------------- scoring ---------------- */

  function moodValue(m) { return m.suppressed ? 0 : m.value; }

  function scoreOf(pl) {
    return pl.board.reduce(function (s, m) { return s + moodValue(m); }, 0);
  }

  function scoresOf(st) {
    var out = {};
    st.players.forEach(function (p) { out[p.id] = scoreOf(p); });
    return out;
  }

  function orderIndex(st, pid) { return st.order.indexOf(pid); }

  // Highest score wins; tie -> earliest turn this round (lowest order index).
  function computeWinner(st, scores) {
    var best = null, bestScore = -Infinity;
    st.order.forEach(function (pid) {
      var s = scores[pid];
      if (s > bestScore) { bestScore = s; best = pid; }
    });
    return { winnerId: best, score: bestScore, tied: st.players.filter(function (p) { return scores[p.id] === bestScore; }).length > 1 };
  }

  // Lowest scorer gets Hurt Feelings; tie -> latest turn this round.
  function computeHurtFeelings(st, scores) {
    if (st.players.length < 3) return null;
    var low = Infinity;
    st.players.forEach(function (p) { if (scores[p.id] < low) low = scores[p.id]; });
    var cands = st.players.filter(function (p) { return scores[p.id] === low; });
    cands.sort(function (a, b) { return orderIndex(st, b.id) - orderIndex(st, a.id); });
    return cands[0].id;
  }

  /* ---------------- turn flow ---------------- */

  function playsAllowed(st, pid) {
    // Hurt Feelings arrives via extraPlays when the new round starts (see newRound),
    // so it must not be added a second time here.
    return 1 + (st.extraPlays[pid] || 0);
  }

  function canAct(st, pid) {
    return st.phase === 'play' && activePid(st) === pid && st.playsMade[pid] < playsAllowed(st, pid);
  }

  function playMood(st, pid, card, opts) {
    opts = opts || {};
    if (!canAct(st, pid)) throw new Error('not your turn / no plays left');
    var pl = playerById(st, pid);
    var mood = {
      uid: uid(),
      cardId: card.id,
      name: card.name,
      color: card.color,
      dieColor: card.die,
      baseValue: card.value,
      secondary: card.secondary == null ? null : card.secondary,
      value: opts.value != null ? opts.value : card.value,
      rotated: !!opts.rotated,
      suppressed: !!opts.suppressed
    };
    pl.board.push(mood);
    st.playsMade[pid] += 1;
    return mood;
  }

  function grantExtraPlay(st, pid) { st.extraPlays[pid] = (st.extraPlays[pid] || 0) + 1; }

  function endTurn(st, pid) {
    if (st.phase !== 'play' || activePid(st) !== pid) throw new Error('not your turn');
    st.turnDoneAt[pid] = ++st.turnSeq;
    st.turnPos += 1;
    if (st.turnPos >= st.order.length) {
      // round of turns complete -> scoring
      var scores = scoresOf(st);
      var w = computeWinner(st, scores);
      st.phase = 'scoring';
      st.scoring = {
        scores: scores,
        winnerId: w.winnerId,
        tied: w.tied,
        blackDice: collectBlackDice(st)
      };
    }
  }

  function collectBlackDice(st) {
    var out = [];
    st.players.forEach(function (p) {
      p.board.forEach(function (m) {
        if (m.dieColor === 'black') out.push({ pid: p.id, pname: p.name, uid: m.uid, name: m.name, value: m.value });
      });
    });
    return out;
  }

  /* ---------------- round resolution ---------------- */

  function setMoodValue(st, moodUid, value) {
    var m = findMood(st, moodUid);
    if (m) m.value = value;
  }
  function setMoodRotated(st, moodUid, rotated) {
    var m = findMood(st, moodUid);
    if (!m) return;
    m.rotated = rotated;
    if (rotated && m.secondary != null) m.value = m.secondary;
    else if (!rotated) m.value = m.baseValue;
  }
  function setMoodSuppressed(st, moodUid, suppressed) {
    var m = findMood(st, moodUid);
    if (m) m.suppressed = suppressed;
  }
  function removeMood(st, moodUid) {
    st.players.forEach(function (p) {
      p.board = p.board.filter(function (m) { return m.uid !== moodUid; });
    });
  }
  function findMood(st, moodUid) {
    for (var i = 0; i < st.players.length; i++) {
      var b = st.players[i].board;
      for (var j = 0; j < b.length; j++) if (b[j].uid === moodUid) return b[j];
    }
    return null;
  }

  // winnerId may differ from computed (after-scoring effects like Sneakiness).
  function resolveRound(st, winnerId) {
    if (st.phase !== 'scoring') throw new Error('not in scoring');
    var scores = scoresOf(st); // recompute after any black-die rechecks
    var winner = playerById(st, winnerId);
    winner.wins += 1;
    var gameOver = winner.wins >= WIN_ROUNDS;
    var hurt = computeHurtFeelings(st, scores);
    var losers = st.players.filter(function (p) { return p.id !== winnerId; }).map(function (p) { return p.id; });

    st.rounds.push({ n: st.round, winnerId: winnerId, scores: scores });

    var summary = {
      round: st.round,
      winnerId: winnerId,
      winnerName: winner.name,
      scores: scores,
      gameOver: gameOver,
      losers: losers,
      hurtFeelings: hurt
    };

    if (gameOver) {
      st.phase = 'gameover';
      st.scoring = null;
      return summary;
    }

    // next round: winner goes first, boards persist, per-turn state resets
    var order = st.players.map(function (p) { return p.id; });
    var wi = order.indexOf(winnerId);
    st.order = order.slice(wi).concat(order.slice(0, wi));
    st.turnPos = 0;
    st.turnSeq = 0;
    st.turnDoneAt = {};
    st.playsMade = {};
    st.extraPlays = {};
    st.players.forEach(function (p) { st.playsMade[p.id] = 0; st.extraPlays[p.id] = 0; });
    st.hurtFeelings = hurt;
    if (hurt) st.extraPlays[hurt] = 1;
    st.round += 1;
    st.phase = 'play';
    st.scoring = null;
    return summary;
  }

  // Awe: scoring is cancelled entirely — no winner, no draws, no Hurt
  // Feelings. Next round begins with the chosen first player.
  function cancelRound(st, firstPid) {
    st.rounds.push({ n: st.round, winnerId: null, scores: scoresOf(st), cancelled: true });
    var order = st.players.map(function (p) { return p.id; });
    var fi = Math.max(0, order.indexOf(firstPid));
    st.order = order.slice(fi).concat(order.slice(0, fi));
    st.turnPos = 0;
    st.turnSeq = 0;
    st.turnDoneAt = {};
    st.playsMade = {};
    st.extraPlays = {};
    st.players.forEach(function (p) { st.playsMade[p.id] = 0; st.extraPlays[p.id] = 0; });
    st.hurtFeelings = null;
    st.round += 1;
    st.phase = 'play';
    st.scoring = null;
  }

  /* ---------------- store: undo + persistence ---------------- */

  var LS_MATCH = 'mswings.match.v1';
  var LS_HISTORY = 'mswings.history.v1';
  var LS_NAMES = 'mswings.names.v1';

  function Store() {
    this.state = null;
    this.undoStack = [];
  }
  Store.prototype._snapshot = function () {
    this.undoStack.push(JSON.stringify(this.state));
    if (this.undoStack.length > UNDO_CAP) this.undoStack.shift();
  };
  Store.prototype.mutate = function (fn) {
    if (!this.state) return;
    this._snapshot();
    fn(this.state);
    this.save();
  };
  Store.prototype.undo = function () {
    var prev = this.undoStack.pop();
    if (!prev || !this.state) return false;
    this.state = JSON.parse(prev);
    this.save();
    return true;
  };
  Store.prototype.canUndo = function () { return this.undoStack.length > 0; };
  Store.prototype.start = function (names, firstId) {
    this.state = newMatch(names, firstId);
    this.undoStack = [];
    this.save();
    rememberNames(names);
  };
  Store.prototype.save = function () {
    try {
      if (this.state && this.state.phase !== 'gameover') {
        localStorage.setItem(LS_MATCH, JSON.stringify({ state: this.state, savedAt: Date.now() }));
      } else {
        localStorage.removeItem(LS_MATCH);
      }
    } catch (e) { /* storage unavailable */ }
  };
  Store.prototype.loadSaved = function () {
    try {
      var raw = localStorage.getItem(LS_MATCH);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.state || data.state.v !== 1) return null;
      return data;
    } catch (e) { return null; }
  };
  Store.prototype.resume = function (data) {
    this.state = data.state;
    this.undoStack = [];
    this.save();
  };
  Store.prototype.abandon = function () {
    this.state = null;
    this.undoStack = [];
    try { localStorage.removeItem(LS_MATCH); } catch (e) {}
  };
  Store.prototype.archive = function () {
    // completed (or abandoned) match -> history
    if (!this.state) return;
    try {
      var h = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      var st = this.state;
      h.unshift({
        date: Date.now(),
        players: st.players.map(function (p) { return { name: p.name, wins: p.wins }; }),
        rounds: st.rounds.length,
        winner: st.phase === 'gameover' ? playerById(st, st.rounds[st.rounds.length - 1].winnerId).name : null,
        completed: st.phase === 'gameover'
      });
      localStorage.setItem(LS_HISTORY, JSON.stringify(h.slice(0, 100)));
    } catch (e) {}
    this.abandon();
  };

  function rememberNames(names) {
    try {
      var known = JSON.parse(localStorage.getItem(LS_NAMES) || '[]');
      names.forEach(function (n) {
        n = (n || '').trim();
        if (n && known.indexOf(n) === -1) known.push(n);
      });
      localStorage.setItem(LS_NAMES, JSON.stringify(known.slice(-12)));
    } catch (e) {}
  }
  function knownNames() {
    try { return JSON.parse(localStorage.getItem(LS_NAMES) || '[]'); } catch (e) { return []; }
  }
  function history() {
    try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch (e) { return []; }
  }
  function clearHistory() {
    try { localStorage.removeItem(LS_HISTORY); } catch (e) {}
  }

  global.MSEngine = {
    WIN_ROUNDS: WIN_ROUNDS,
    newMatch: newMatch,
    playerById: playerById,
    activePid: activePid,
    scoreOf: scoreOf,
    scoresOf: scoresOf,
    computeWinner: computeWinner,
    computeHurtFeelings: computeHurtFeelings,
    playsAllowed: playsAllowed,
    canAct: canAct,
    playMood: playMood,
    grantExtraPlay: grantExtraPlay,
    endTurn: endTurn,
    setMoodValue: setMoodValue,
    setMoodRotated: setMoodRotated,
    setMoodSuppressed: setMoodSuppressed,
    removeMood: removeMood,
    findMood: findMood,
    resolveRound: resolveRound,
    cancelRound: cancelRound,
    Store: Store,
    knownNames: knownNames,
    history: history,
    clearHistory: clearHistory
  };
})(typeof window !== 'undefined' ? window : globalThis);
