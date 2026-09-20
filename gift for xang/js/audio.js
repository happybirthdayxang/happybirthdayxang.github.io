/* Audio: pop, whoosh, music-box loop, mute. Web Audio only, no sound files required. */
(function () {
  "use strict";
  var ctx = null, master = null, musicGain = null, started = false;
  var muted = false, fileMusic = null, schedulerTimer = null, nextNoteTime = 0, melodyStep = 0;
  try { muted = localStorage.getItem("bb_mute") === "1"; } catch (e) {}

  // Happy Birthday (public domain) in C major: [midi, beats]
  var MELODY = [
    [67, .75], [67, .25], [69, 1], [67, 1], [72, 1], [71, 2],
    [67, .75], [67, .25], [69, 1], [67, 1], [74, 1], [72, 2],
    [67, .75], [67, .25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
    [77, .75], [77, .25], [76, 1], [72, 1], [74, 1], [72, 2]
  ];
  var BEAT = 60 / 70; // ~70BPM

  function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(master);
      return true;
    } catch (e) { return false; }
  }
  function resume() { if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} } }

  function pop() {
    if (muted || !ensure()) return;
    resume();
    try {
      var t = ctx.currentTime;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(220, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.14);
      // tiny noise transient
      var len = Math.floor(ctx.sampleRate * 0.03);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var ng = ctx.createGain(); ng.gain.value = 0.25;
      src.connect(ng); ng.connect(master); src.start(t);
    } catch (e) {}
  }

  function whoosh() {
    if (muted || !ensure()) return;
    resume();
    try {
      var t = ctx.currentTime, dur = 0.5;
      var len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(3000, t + dur * 0.5);
      bp.frequency.exponentialRampToValueAtTime(500, t + dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur);
    } catch (e) {}
  }

  function playNote(midi, t) {
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = "sine"; o1.frequency.value = midiHz(midi);
    o2.type = "triangle"; o2.frequency.value = midiHz(midi) * 2;
    var g2 = ctx.createGain(); g2.gain.value = 0.15;
    // music-box: fast attack, short decay
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(musicGain);
    o1.start(t); o2.start(t); o1.stop(t + 1.2); o2.stop(t + 1.2);
  }

  function schedule() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + 0.35) {
      var n = MELODY[melodyStep % MELODY.length];
      playNote(n[0], nextNoteTime);
      nextNoteTime += n[1] * BEAT;
      melodyStep++;
    }
  }

  function startProcedural() {
    if (schedulerTimer || !ctx) return;
    nextNoteTime = ctx.currentTime + 0.1;
    melodyStep = 0;
    schedulerTimer = setInterval(schedule, 120);
    try { musicGain.gain.cancelScheduledValues(ctx.currentTime); } catch (e) {}
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.8);
  }

  function startMusic() {
    if (started) { resume(); return; }
    started = true;
    if (!ensure()) return;
    resume();
    var src = (window.CONFIG && window.CONFIG.music) || "";
    if (src) {
      // Try the owner's file; fall back to procedural on any error. Works on file://.
      try {
        var el = new Audio();
        el.loop = true;
        el.preload = "auto";
        el.volume = 0;
        var ok = false;
        var fade = function () {
          if (muted) return;
          var v = 0;
          var iv = setInterval(function () {
            v += 0.08;
            if (v >= 0.7) { v = 0.7; clearInterval(iv); }
            try { el.volume = v; } catch (e) { clearInterval(iv); }
          }, 80);
        };
        el.addEventListener("canplay", function onPlay() {
          el.removeEventListener("canplay", onPlay);
          ok = true;
          fileMusic = el;
          try { el.muted = muted; el.play().catch(function () {}); } catch (e) {}
          fade();
        });
        el.addEventListener("error", function () {
          if (!ok) { try { el.remove(); } catch (e) {} startProcedural(); }
        });
        el.src = src;
        try { el.load(); } catch (e) { startProcedural(); }
        // If the file never resolves within 2.5s, fall back so music is never missing.
        setTimeout(function () { if (!ok && !schedulerTimer) startProcedural(); }, 2500);
        return;
      } catch (e) { /* fall through to procedural */ }
    }
    startProcedural();
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem("bb_mute", muted ? "1" : "0"); } catch (e) {}
    try { if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime); } catch (e) {}
    try { if (fileMusic) fileMusic.muted = muted; } catch (e) {}
    return muted;
  }

  window.AppAudio = {
    unlock: function () { if (ensure()) { resume(); startMusic(); } },
    pop: pop,
    whoosh: whoosh,
    setMuted: setMuted,
    isMuted: function () { return muted; }
  };
})();
