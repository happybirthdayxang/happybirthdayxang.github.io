/* Main: Pixi bootstrap, scene state machine, resize, quality tiers. */
(function () {
  "use strict";
  var C = window.CONFIG || {};
  var NAME = C.name || "Friend";
  var GREETING = (C.greeting || "Happy Birthday, {name}!").split("{name}").join(NAME);
  var LETTER_DELAY = typeof C.letterDelayMs === "number" ? C.letterDelayMs : 7000;
  var HUE_A = (C.theme && C.theme.hueA) || 335;
  var HUE_B = (C.theme && C.theme.hueB) || 35;

  // --- easings (own tweening, no GSAP) ---
  function easeOutCubic(k) { return 1 - Math.pow(1 - k, 3); }
  function easeOutQuad(k) { return 1 - (1 - k) * (1 - k); }
  function easeInOutSine(k) { return -(Math.cos(Math.PI * k) - 1) / 2; }
  function easeOutBack(k) { var c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
  function linear(k) { return k; }

  var reducedMotion = false;
  try { reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var lowTier = false;
  try { lowTier = (navigator.hardwareConcurrency || 8) <= 4; } catch (e) {}

  // --- DOM refs + static text (all strings from config.js) ---
  var $ = function (id) { return document.getElementById(id); };
  var greetingEl = $("greeting"), letterBtn = $("letterBtn"), muteBtn = $("muteBtn");
  var backdrop = $("backdrop"), card = $("letterCard");
  // --- letter content: LETTER file on http(s), config fallback on file:// ---
  // LETTER format (plain text, non-coder friendly):
  //   first line = card heading (only when 2+ content lines remain),
  //   last line starting with -/—/~ = signature, every other line = a paragraph.
  var letterData = null;
  function parseLetter(text) {
    var lines = String(text || "").split(/\r?\n/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    if (lines.length === 0) return null;
    var signature = "";
    if (/^[-—~]/.test(lines[lines.length - 1])) signature = lines.pop();
    if (lines.length === 0) return null;
    var title = "", paragraphs = lines;
    if (lines.length >= 2) { title = lines[0]; paragraphs = lines.slice(1); }
    if (paragraphs.length === 0) return null;
    return { title: title, paragraphs: paragraphs, signature: signature };
  }
  function renderLetter() {
    var d = letterData || {};
    $("letterTitle").textContent = d.title || C.letterTitle || "A little note for you";
    var body = $("letterBody");
    while (body.firstChild) body.removeChild(body.firstChild);
    (d.paragraphs || C.letterParagraphs || []).forEach(function (p) {
      var el = document.createElement("p");
      el.textContent = p;
      body.appendChild(el);
    });
    $("letterSig").textContent = ("signature" in d) ? d.signature : (C.signature || "");
  }
  renderLetter();
  // fetch() is skipped on file:// (it always fails there and would log a
  // console error) — the config fallback above already matches the file.
  try {
    if (window.location && window.location.protocol !== "file:") {
      fetch("LETTER").then(function (r) {
        if (!r.ok) throw new Error("letter " + r.status);
        return r.text();
      }).then(function (t) {
        var parsed = parseLetter(t);
        if (parsed) {
          letterData = parsed;
          if (letterOpen) renderLetter();
        }
      }).catch(function () { /* config fallback stays */ });
    }
  } catch (e) {}
  try { document.title = C.tabTitle || "\uD83C\uDF88"; } catch (e) {}

  // --- mute button ---
  function paintMute() {
    var m = window.AppAudio.isMuted();
    muteBtn.textContent = m ? "\uD83D\uDD07" : "\uD83D\uDD0A";
    muteBtn.setAttribute("aria-pressed", m ? "true" : "false");
    muteBtn.setAttribute("aria-label", m ? "Unmute sound" : "Mute sound");
  }
  muteBtn.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
    window.AppAudio.setMuted(!window.AppAudio.isMuted());
    paintMute();
  });
  paintMute();

  // --- Pixi boot (black screen immediately) ---
  var W = 0, H = 0;
  function measure() {
    W = window.innerWidth || document.documentElement.clientWidth || 360;
    H = window.innerHeight || document.documentElement.clientHeight || 640;
  }
  measure();
  var dpr = 1;
  try { dpr = Math.min(window.devicePixelRatio || 1, lowTier ? 1.5 : 2); } catch (e) {}
  var app = new PIXI.Application({
    width: W, height: H,
    backgroundColor: 0x000000,
    resolution: dpr,
    autoDensity: true,
    antialias: true
  });
  $("stage").appendChild(app.view);

  var world = new PIXI.Container();
  app.stage.addChild(world);

  // Background: black sprite + pre-rendered colourful gradient, cross-faded on celebration.
  // Hue midpoint goes the SHORT way around the wheel (through 0°), otherwise
  // pink→gold would pass through teal.
  function hueMid(a, b) {
    var d = (((b - a) % 360) + 540) % 360 - 180;
    return (((a + d / 2) % 360) + 360) % 360;
  }
  // Single baked backdrop: sunset gradient + darkened corners in ONE canvas
  // texture (one fullscreen sprite). Separate vignette/shimmer overlays would
  // each cost a fullscreen overdraw pass on fill-rate-bound phones.
  function gradientTexture(hueA, hueB) {
    var cv = document.createElement("canvas");
    cv.width = 96; cv.height = 160;
    var c = cv.getContext("2d");
    var g = c.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, "hsl(" + hueA + ",88%,46%)");
    g.addColorStop(0.55, "hsl(" + Math.round(hueMid(hueA, hueB)) + ",85%,38%)");
    g.addColorStop(1, "hsl(" + hueB + ",90%,34%)");
    c.fillStyle = g;
    c.fillRect(0, 0, 96, 160);
    var v = c.createRadialGradient(48, 80, 44, 48, 80, 112);
    v.addColorStop(0, "rgba(40,8,24,0)");
    v.addColorStop(1, "rgba(40,8,24,0.42)");
    c.fillStyle = v;
    c.fillRect(0, 0, 96, 160);
    return PIXI.Texture.from(cv);
  }
  var bgBlack = new PIXI.Sprite(PIXI.Texture.WHITE);
  bgBlack.tint = 0x000000;
  var bgColor = new PIXI.Sprite(gradientTexture(HUE_A, HUE_B));
  bgColor.alpha = 0;
  world.addChild(bgBlack);
  world.addChild(bgColor);
  function layoutBg() {
    [bgBlack, bgColor].forEach(function (s) {
      s.width = W + 2; s.height = H + 2;
      s.position.set(-1, -1);
    });
  }
  layoutBg();

  // Pre-rendered shared textures (boot only — never in the ticker).
  var bodies = window.Balloons.PALETTE.map(function (col) {
    return window.Balloons.bodyTexture(app, col);
  });
  var outline = window.Balloons.outlineTexture(app);
  var glowTex = window.Balloons.glowTexture(app);
  // Star sparkle texture: layered 4-point star, baked once.
  var starTex = (function () {
    var s = 48;
    var cv = document.createElement("canvas");
    cv.width = s; cv.height = s;
    var c = cv.getContext("2d");
    function star(r, alpha) {
      c.beginPath();
      c.moveTo(s / 2, s / 2 - r);
      c.quadraticCurveTo(s / 2, s / 2, s / 2 + r, s / 2);
      c.quadraticCurveTo(s / 2, s / 2, s / 2, s / 2 + r);
      c.quadraticCurveTo(s / 2, s / 2, s / 2 - r, s / 2);
      c.quadraticCurveTo(s / 2, s / 2, s / 2, s / 2 - r);
      c.closePath();
      c.fillStyle = "rgba(255,250,235," + alpha + ")";
      c.fill();
    }
    star(22, 0.35);
    star(13, 0.95);
    return PIXI.Texture.from(cv);
  })();
  var ringTex = (function () {
    var g = new PIXI.Graphics();
    g.lineStyle(6, 0xffffff, 1);
    g.drawCircle(0, 0, 40);
    // Explicit region so the frame stays centred on the anchor.
    var t = app.renderer.generateTexture(g, { resolution: 1, region: new PIXI.Rectangle(-46, -46, 92, 92) });
    g.destroy();
    return t;
  })();

  var balloonLayer = new PIXI.Container();
  var fxLayer = new PIXI.Container();
  world.addChild(balloonLayer);
  world.addChild(fxLayer);

  var confetti = new window.Confetti.Confetti(fxLayer, app, 120);

  // Sparkles: tiny glow sprites, pooled. Each picks a round or star texture.
  var sparkles = [];
  (function () {
    for (var i = 0; i < 14; i++) {
      var s = new PIXI.Sprite(i % 3 === 2 ? starTex : glowTex);
      s.anchor.set(0.5);
      s.blendMode = PIXI.BLEND_MODES.ADD;
      s.visible = false;
      fxLayer.addChild(s);
      sparkles.push({ spr: s, t: Math.random() * 10, x: 0, y: 0, size: 20 });
    }
  })();
  function sparkleBurst(x, y, n) {
    if (lowTier || reducedMotion) return;
    var placed = 0;
    for (var i = 0; i < sparkles.length && placed < n; i++) {
      var sp = sparkles[(Math.random() * sparkles.length) | 0];
      sp.x = x + (Math.random() - 0.5) * 60;
      sp.y = y + (Math.random() - 0.5) * 60;
      sp.size = 14 + Math.random() * 26;
      sp.t = 0;
      sp.spr.visible = true;
      placed++;
    }
  }

  // Bokeh: slow warm light dots rising through the celebration backdrop.
  var bokeh = [];
  (function () {
    var tints = [0xffd9a0, 0xffb703, 0xfff3d6, 0xff9f1c];
    for (var i = 0; i < 10; i++) {
      var s = new PIXI.Sprite(glowTex);
      s.anchor.set(0.5);
      s.blendMode = PIXI.BLEND_MODES.ADD;
      s.tint = tints[i % tints.length];
      s.visible = false;
      fxLayer.addChild(s);
      bokeh.push({
        spr: s, x: 0, y: 0, size: 40 + Math.random() * 70,
        speed: 12 + Math.random() * 22, phase: Math.random() * Math.PI * 2, on: false
      });
    }
  })();
  function seedBokeh() {
    for (var i = 0; i < bokeh.length; i++) {
      var b = bokeh[i];
      b.x = Math.random() * W;
      b.y = Math.random() * H;
      b.on = true;
      b.spr.visible = true;
    }
  }

  // Firework rockets: 2 reusable glow sprites that rise and detonate into
  // the confetti pool. No allocation after boot.
  var rockets = [];
  (function () {
    for (var i = 0; i < 2; i++) {
      var s = new PIXI.Sprite(glowTex);
      s.anchor.set(0.5);
      s.blendMode = PIXI.BLEND_MODES.ADD;
      s.tint = 0xffe9a8;
      s.visible = false;
      fxLayer.addChild(s);
      rockets.push({ spr: s, active: false, x: 0, y: 0, vy: 0, targetY: 0, trail: 0 });
    }
  })();
  function launchFirework() {
    for (var i = 0; i < rockets.length; i++) {
      var r = rockets[i];
      if (r.active) continue;
      r.active = true;
      r.x = W * (0.15 + Math.random() * 0.7);
      r.y = H + 10;
      r.vy = -(H * 0.55);
      r.targetY = H * (0.18 + Math.random() * 0.3);
      r.trail = 0;
      r.spr.visible = true;
      r.spr.width = 26; r.spr.height = 26;
      try { window.AppAudio.whoosh(); } catch (e) {}
      return;
    }
  }
  function updateRockets(dt) {
    for (var i = 0; i < rockets.length; i++) {
      var r = rockets[i];
      if (!r.active) continue;
      r.y += r.vy * dt;
      r.trail -= dt;
      if (r.trail <= 0) {
        sparkleBurst(r.x, r.y, 1);
        r.trail = 0.12;
      }
      r.spr.position.set(r.x, r.y);
      if (r.y <= r.targetY) {
        r.active = false;
        r.spr.visible = false;
        confetti.spawn(r.x, r.y, lowTier ? 8 : 14, Math.PI * 2, H * 0.28);
        sparkleBurst(r.x, r.y, 5);
        try { window.AppAudio.pop(); } catch (e) {}
      }
    }
  }

  // Tiny hsl→hex for the balloon tint shimmer (integers only, no garbage).
  function hslHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    var r = Math.round(f(0) * 255), g = Math.round(f(8) * 255), b = Math.round(f(4) * 255);
    return (r << 16) | (g << 8) | b;
  }

  // --- photo balloons: solid colour risers (pictures live only in the gallery) ---
  var MEM_DIR = C.memoriesFolder || "assets/memories";
  var MEM_COUNT = C.memoriesCount || 0;
  var IMG_EXTS = ["png", "jpg", "jpeg", "gif"];
  var VID_EXTS = ["mp4", "webm"];
  function memURL(i, ext) { return MEM_DIR + "/" + i + "." + ext; }
  function probeURL(url, isVideo) {
    return new Promise(function (res) {
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; res(false); } }, 6000);
      var ok = function () { if (done) return; done = true; clearTimeout(to); res(true); };
      var no = function () { if (done) return; done = true; clearTimeout(to); res(false); };
      try {
        if (isVideo) {
          var v = document.createElement("video");
          v.preload = "metadata";
          v.addEventListener("loadedmetadata", ok);
          v.addEventListener("error", no);
          v.src = url;
        } else {
          var im = new Image();
          im.onload = ok;
          im.onerror = no;
          im.src = url;
        }
      } catch (e) { no(); }
    });
  }

  // --- tiny tween list (event-time allocations only, never per frame) ---
  var tweens = [];
  function tween(dur, ease, update, done) {
    tweens.push({ t: 0, dur: dur, ease: ease, update: update, done: done || null });
  }
  function stepTweens(dt) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      tw.t += dt;
      var k = tw.t >= tw.dur ? 1 : tw.t / tw.dur;
      try { tw.update(tw.ease(k), k); } catch (e) {}
      if (k >= 1) {
        tweens.splice(i, 1);
        if (tw.done) { try { tw.done(); } catch (e) {} }
      }
    }
  }

  // --- scene state ---
  var state = "black"; // black, rising, glowing, celebration
  var party = null;
  var photoBalloons = [];
  var time = 0;
  var elapsed = 0;
  var celebrated = false;
  var letterOpen = false;
  var letterTimer = null;
  var photoTimer = 0;
  var drizzleTimer = 0;
  var fountainTimer = 2;
  var fountainSide = 0;
  var fireworkTimer = 4;
  var hoverBalloon = false;
  var canHover = false;
  try { canHover = window.matchMedia("(hover: hover)").matches; } catch (e) {}

  function radiusForScreen() {
    return Math.max(34, Math.min(64, Math.min(W, H) * 0.13));
  }

  function spawnParty() {
    var R = radiusForScreen();
    var scale = R / window.Balloons.BASE_R;
    var x = R * 1.5 + Math.random() * Math.max(1, W - R * 3);
    var colorIdx = (Math.random() * bodies.length) | 0;
    party = new window.Balloons.PartyBalloon(
      balloonLayer, bodies[colorIdx], outline, glowTex,
      x, H + R * 3, H * 0.42, scale
    );
    state = "rising";
  }

  function popRing(x, y, maxR) {
    var ring = new PIXI.Sprite(ringTex);
    ring.anchor.set(0.5);
    ring.position.set(x, y);
    var s0 = (party ? party.R : 50) / 40;
    fxLayer.addChild(ring);
    tween(0.35, easeOutCubic, function (e) {
      var s = s0 + e * (maxR / 40 - s0);
      ring.scale.set(Math.max(0.01, s));
      ring.alpha = 1 - e;
    }, function () {
      fxLayer.removeChild(ring);
      ring.destroy();
    });
  }

  function doPop() {
    if (!party || state === "celebration") return;
    // First user gesture: unlock audio + start music.
    try { window.AppAudio.unlock(); } catch (e) {}
    try { window.AppAudio.pop(); } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {}
    var c = party.bodyCenter();
    var pr = party.R;
    popRing(c.x, c.y, pr * 2.4);
    // Second delayed ring for a double shockwave (no allocation, one sprite).
    setTimeout(function () { popRing(c.x, c.y, pr * 3.4); }, 120);
    try {
      if (!reducedMotion) {
        var flash = $("flash");
        flash.style.transition = "none";
        flash.style.opacity = "0.45";
        void flash.offsetWidth;
        flash.style.transition = "opacity .45s ease-out";
        flash.style.opacity = "0";
      }
    } catch (e) {}
    var dead = party;
    party = null;
    state = "popped";
    // scale to 1.15 + fade over 0.18s, then remove
    var root = dead.root, s0 = dead.scale;
    tween(0.18, easeOutQuad, function (e) {
      root.scale.set(1 + e * 0.15);
      root.alpha = 1 - e;
    }, function () { dead.destroy(); });
    enterCelebration(c);
  }

  function enterCelebration(at) {
    state = "celebration";
    celebrated = true;
    try { window.AppAudio.whoosh(); } catch (e) {}
    if (!reducedMotion) {
      confetti.burst(W, H, !lowTier);
    }
    // background fade to colour
    tween(1.2, easeInOutSine, function (e) { bgColor.alpha = e; });
    // DOM greeting
    greetingEl.textContent = GREETING;
    greetingEl.classList.remove("hidden");
    // force reflow so the animation restarts cleanly
    void greetingEl.offsetWidth;
    greetingEl.classList.add("show");
    try {
      document.title = GREETING;
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", "#ff4d6d");
    } catch (e) {}
    letterBtn.classList.remove("hidden");
    void letterBtn.offsetWidth;
    letterBtn.classList.add("show");
    photoTimer = 1.0; // first photo balloon ~1s after greeting
    drizzleTimer = 0.5;
    if (!lowTier && !reducedMotion) seedBokeh();
    try {
      clearTimeout(letterTimer);
      letterTimer = setTimeout(openLetter, LETTER_DELAY);
    } catch (e) {}
    if (at) sparkleBurst(at.x, at.y, 6);
  }

  // --- photo balloons ---
  function spawnPhotoBalloon() {
    var R = radiusForScreen() * (0.85 + Math.random() * 0.3);
    var scale = R / window.Balloons.BASE_R;
    var x = R * 1.5 + Math.random() * Math.max(1, W - R * 3);
    var texInfo = bodies[(Math.random() * bodies.length) | 0];
    var b = new window.Balloons.PhotoBalloon(
      balloonLayer, texInfo, x, H + R * 3, scale, H * (0.10 + Math.random() * 0.06)
    );
    photoBalloons.push(b);
    if (photoBalloons.length > 12) {
      var old = photoBalloons.shift();
      try { old.destroy(); } catch (e) {}
    }
  }

  // --- letter ---
  var videoOpen = false;
  var videoEl = $("memoriesVideo");
  function openLetter() {
    if (letterOpen || !celebrated) return;
    letterOpen = true;
    renderLetter();
    backdrop.classList.remove("hidden");
    card.classList.remove("hidden");
    void card.offsetWidth;
    backdrop.classList.add("show");
    card.classList.add("show");
    try { app.ticker.maxFPS = 10; } catch (e) {} // low rate while reading
  }
  function closeLetter() {
    if (!letterOpen) return;
    letterOpen = false;
    backdrop.classList.remove("show");
    card.classList.remove("show");
    setTimeout(function () {
      if (!letterOpen) { backdrop.classList.add("hidden"); card.classList.add("hidden"); }
    }, 380);
    try { app.ticker.maxFPS = lowTier ? 30 : 0; } catch (e) {}
  }
  letterBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); openLetter(); });
  $("closeLetter").addEventListener("pointerdown", function (e) { e.stopPropagation(); closeLetter(); });
  backdrop.addEventListener("pointerdown", function () { closeLetter(); });
  // --- memories gallery overlay (opens above the letter) ---
  // Numbered files 1.png, 2.mp4 … in MEM_DIR. The playlist is probed once on
  // first open (never at boot, so first paint stays instant).
  var videoBackdrop = $("videoBackdrop"), videoCard = $("videoCard"), videoFallback = $("videoFallback");
  var memImg = $("memoriesImg"), galPrev = $("galPrev"), galNext = $("galNext"), galCount = $("galCount");
  var playlist = null; // [{type:"image"|"video", url}] or [] when empty
  var galleryIdx = 0;
  var galErrs = 0;
  function probeSlot(idx) {
    // Images first (cheap), then video metadata. Resolves null when missing.
    var chain = Promise.resolve(null);
    IMG_EXTS.forEach(function (ext) {
      chain = chain.then(function (hit) {
        if (hit) return hit;
        return probeURL(memURL(idx, ext), false).then(function (ok) {
          return ok ? { type: "image", url: memURL(idx, ext) } : null;
        });
      });
    });
    VID_EXTS.forEach(function (ext) {
      chain = chain.then(function (hit) {
        if (hit) return hit;
        return probeURL(memURL(idx, ext), true).then(function (ok) {
          return ok ? { type: "video", url: memURL(idx, ext) } : null;
        });
      });
    });
    return chain;
  }
  function buildPlaylist() {
    var list = [], i = 1;
    function next() {
      if (i > MEM_COUNT) return Promise.resolve(list);
      var idx = i++;
      return probeSlot(idx).then(function (hit) {
        if (hit) list.push(hit);
        return next();
      });
    }
    return next();
  }
  function showGalleryItem() {
    var item = playlist[galleryIdx];
    try { videoEl.pause(); } catch (e) {}
    if (!item) return;
    if (item.type === "image") {
      try { videoEl.removeAttribute("src"); videoEl.load(); } catch (e) {}
      videoEl.classList.add("hidden");
      memImg.classList.remove("hidden");
      if (memImg.getAttribute("src") !== item.url) memImg.setAttribute("src", item.url);
    } else {
      memImg.classList.add("hidden");
      try { memImg.removeAttribute("src"); } catch (e) {}
      videoEl.classList.remove("hidden");
      videoEl.querySelectorAll("source").forEach(function (s) { s.remove(); });
      var source = document.createElement("source");
      source.src = item.url;
      videoEl.appendChild(source);
      try { videoEl.load(); } catch (e) {}
    }
    var multi = playlist.length > 1;
    galPrev.classList.toggle("hidden", !multi);
    galNext.classList.toggle("hidden", !multi);
    galCount.classList.toggle("hidden", !multi);
    if (multi) galCount.textContent = (galleryIdx + 1) + " / " + playlist.length;
    // Quietly warm the neighbours' cache.
    [galleryIdx + 1, galleryIdx - 1].forEach(function (n) {
      var nb = playlist[(n + playlist.length) % playlist.length];
      if (nb && nb.type === "image") { try { new Image().src = nb.url; } catch (e) {} }
    });
  }
  function stepGallery(d) {
    if (!playlist || playlist.length < 2) return;
    galleryIdx = (galleryIdx + d + playlist.length) % playlist.length;
    showGalleryItem();
  }
  function openMemories() {
    if (videoOpen || !letterOpen) return;
    videoOpen = true;
    galErrs = 0;
    videoFallback.classList.add("hidden");
    videoBackdrop.classList.remove("hidden");
    videoCard.classList.remove("hidden");
    void videoCard.offsetWidth;
    videoBackdrop.classList.add("show");
    videoCard.classList.add("show");
    if (playlist) {
      showGalleryItem();
    } else {
      galCount.classList.add("hidden");
      buildPlaylist().then(function (list) {
        playlist = list;
        if (!videoOpen) return;
        if (list.length === 0) {
          videoEl.classList.add("hidden");
          memImg.classList.add("hidden");
          galPrev.classList.add("hidden");
          galNext.classList.add("hidden");
          videoFallback.classList.remove("hidden");
        } else {
          galleryIdx = 0;
          showGalleryItem();
        }
      });
    }
  }
  function closeMemories() {
    if (!videoOpen) return;
    videoOpen = false;
    try { videoEl.pause(); } catch (e) {}
    try { videoEl.removeAttribute("src"); videoEl.load(); } catch (e) {}
    try { memImg.removeAttribute("src"); } catch (e) {}
    videoBackdrop.classList.remove("show");
    videoCard.classList.remove("show");
    setTimeout(function () {
      if (!videoOpen) { videoBackdrop.classList.add("hidden"); videoCard.classList.add("hidden"); }
    }, 320);
  }
  $("memoriesBtn").addEventListener("pointerdown", function (e) { e.stopPropagation(); openMemories(); });
  $("closeVideo").addEventListener("pointerdown", function (e) { e.stopPropagation(); closeMemories(); });
  // If a probed video still fails at play time, skip ahead instead of a dead
  // player; give up to the friendly note if everything fails.
  videoEl.addEventListener("error", function () {
    if (!videoOpen || !playlist || playlist.length === 0) return;
    galErrs++;
    if (galErrs > playlist.length) {
      videoEl.classList.add("hidden");
      memImg.classList.add("hidden");
      galPrev.classList.add("hidden");
      galNext.classList.add("hidden");
      galCount.classList.add("hidden");
      videoFallback.classList.remove("hidden");
      return;
    }
    if (playlist.length > 1) stepGallery(1);
  }, true);
  videoBackdrop.addEventListener("pointerdown", function () { closeMemories(); });
  galPrev.addEventListener("pointerdown", function (e) { e.stopPropagation(); stepGallery(-1); });
  galNext.addEventListener("pointerdown", function (e) { e.stopPropagation(); stepGallery(1); });
  // Swipe through memories on touch.
  (function () {
    var sx = 0, sy = 0, tracking = false;
    var stage = $("memStage");
    stage.addEventListener("pointerdown", function (e) {
      tracking = true; sx = e.clientX; sy = e.clientY;
    });
    stage.addEventListener("pointerup", function (e) {
      if (!tracking) return;
      tracking = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) stepGallery(dx < 0 ? 1 : -1);
    });
    stage.addEventListener("pointercancel", function () { tracking = false; });
  })();
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (videoOpen) closeMemories();
      else closeLetter();
    } else if (videoOpen && e.key === "ArrowRight") {
      stepGallery(1);
    } else if (videoOpen && e.key === "ArrowLeft") {
      stepGallery(-1);
    }
    if ((e.key === "Enter" || e.key === " ") && party && !letterOpen) {
      e.preventDefault();
      doPop();
    }
  });

  // --- input: pointerdown hit test (manual circles, instant) ---
  function toLocal(e) {
    var r = app.view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  $("stage").addEventListener("pointerdown", function (e) {
    var p = toLocal(e);
    // topmost photo balloon first
    for (var i = photoBalloons.length - 1; i >= 0; i--) {
      var b = photoBalloons[i];
      var c = b.bodyCenter();
      var dx = p.x - c.x, dy = p.y - c.y;
      var hr = b.hitRadius();
      if (dx * dx + dy * dy <= hr * hr) {
        // wiggle + sparkle (cheap)
        b.wiggle = 1;
        sparkleBurst(c.x, c.y, 3);
        try { window.AppAudio.pop(); } catch (err) {}
        return;
      }
    }
    if (party) {
      var pc = party.bodyCenter();
      var ddx = p.x - pc.x, ddy = p.y - pc.y;
      var phr = party.hitRadius();
      if (ddx * ddx + ddy * ddy <= phr * phr) {
        doPop();
        return;
      }
    }
  });
  if (canHover) {
    document.addEventListener("pointermove", function (e) {
      if (!party || state !== "glowing") { hoverBalloon = false; return; }
      var r = app.view.getBoundingClientRect();
      var dx = (e.clientX - r.left) - party.x, dy = (e.clientY - r.top) - party.y;
      var hr = party.hitRadius();
      hoverBalloon = (dx * dx + dy * dy <= hr * hr);
    });
  }

  // --- resize / orientation ---
  var resizeTo = null;
  function onResize() {
    measure();
    try { app.renderer.resize(W, H); } catch (e) {}
    layoutBg();
    if (party) {
      var R = radiusForScreen();
      party.baseX = Math.min(Math.max(party.baseX, R * 1.5), Math.max(R * 1.5, W - R * 1.5));
      party.targetY = H * 0.42;
    }
    photoBalloons.forEach(function (b) {
      b.x = Math.min(Math.max(b.x, 40), Math.max(40, W - 40));
    });
  }
  window.addEventListener("resize", function () {
    if (resizeTo) return;
    resizeTo = requestAnimationFrame(function () { resizeTo = null; onResize(); });
  });
  window.addEventListener("orientationchange", function () {
    setTimeout(onResize, 120);
  });

  // --- visibility: pause entirely when hidden ---
  document.addEventListener("visibilitychange", function () {
    try {
      if (document.hidden) app.ticker.stop();
      else if (!letterOpen) app.ticker.start();
      else app.ticker.start(); // letter-open low rate still needs ticks
    } catch (e) {}
  });

  // --- quality auto-tier: avg frame time over first 2s ---
  var frameAcc = 0, frameN = 0, tierDecided = lowTier;
  if (lowTier) applyLowTier();
  function applyLowTier() {
    lowTier = true;
    try { app.ticker.maxFPS = 30; } catch (e) {}
    confetti.setMax(50);
  }

  // --- main loop ---
  var started = false;
  app.ticker.add(function () {
    var dt = Math.min(0.05, app.ticker.deltaMS / 1000);
    time += dt;
    elapsed += dt;

    if (!tierDecided && elapsed < 2.0) {
      frameAcc += app.ticker.deltaMS;
      frameN++;
    } else if (!tierDecided) {
      tierDecided = true;
      if (frameN > 0 && frameAcc / frameN > 22) applyLowTier();
    }

    stepTweens(dt);

    // Scene 0 → 1: stillness, then spawn
    if (!started && elapsed > 0.6) {
      started = true;
      spawnParty();
    }

    // Party balloon rise + glow
    if (party) {
      var R = party.R;
      if (state === "rising") {
        party.riseT += dt / 5.0;
        var k = Math.min(1, party.riseT);
        var e = reducedMotion ? linear(k) : easeInOutSine(k); // gentle launch, soft arrival
        party.y = party.startY + (party.targetY - party.startY) * e;
        if (!reducedMotion && !lowTier) {
          party.x = party.baseX + Math.sin(time * 2.1 + party.swayPhase) * 5;
        }
        party.sync();
        if (k >= 1) {
          state = "glowing";
          party.arrived = true;
          party.arrivedAt = time;
          // outline 0→1 over 0.4s
          tween(0.4, linear, function (ee) { if (party) party.line.alpha = ee; });
        }
      } else if (state === "glowing") {
        if (!reducedMotion && !lowTier) {
          party.x = party.baseX + Math.sin(time * 2.1 + party.swayPhase) * 5;
          var hint = 0;
          if (time - party.arrivedAt > 2) {
            var cyc = (time - party.arrivedAt - 2) % 2.5;
            if (cyc < 0.6) hint = Math.sin((cyc / 0.6) * Math.PI) * -10;
          }
          party.y = party.targetY + Math.sin(time * 1.4 + party.swayPhase) * 8 + hint;
          var pulse = (Math.sin(time * (Math.PI * 2 / 1.2)) + 1) / 2; // 1.2s period
          party.glow.alpha = 0.35 + pulse * 0.35 + (hoverBalloon ? 0.15 : 0);
          var s = 1 + pulse * 0.03 + (hoverBalloon ? 0.02 : 0);
          party.root.scale.set(s);
          // Festive tint shimmer across pink→gold (free uniform multiply).
          party.body.tint = hslHex(335 - pulse * 45, 85, 62);
        } else {
          party.glow.alpha = 0.4;
          party.x = party.baseX;
          party.y = party.targetY;
          party.sync();
          return;
        }
        party.sync();
      }
    }

    // Celebration: bokeh, fountains, fireworks, photo risers, sparkles, confetti drift + drizzle
    if (state === "celebration") {
      var overlaysOpen = letterOpen || videoOpen;
      if (!reducedMotion) {
        var bk;
        // Bokeh runs on both tiers (10 additive sprites — cheaper than the
        // burst the low tier already allows); sparkles stay high-tier only.
        if (!lowTier) {
          for (var bi = 0; bi < bokeh.length; bi++) {
            bk = bokeh[bi];
            if (!bk.on) continue;
            bk.y -= bk.speed * dt;
            bk.x += Math.sin(time * 0.7 + bk.phase) * 8 * dt;
            if (bk.y < -bk.size) { bk.y = H + bk.size; bk.x = Math.random() * W; }
            bk.spr.position.set(bk.x, bk.y);
            bk.spr.width = bk.size; bk.spr.height = bk.size;
            bk.spr.alpha = 0.10 + (Math.sin(time * 0.9 + bk.phase) + 1) / 2 * 0.10;
          }
        } else if (bokeh.length && !bokeh[0].on) {
          seedBokeh();
          for (var bl = 0; bl < bokeh.length; bl++) {
            bokeh[bl].spr.alpha = 0.08;
            bokeh[bl].spr.width = bokeh[bl].size;
            bokeh[bl].spr.height = bokeh[bl].size;
            bokeh[bl].spr.position.set(bokeh[bl].x, bokeh[bl].y);
          }
        }
        if (!overlaysOpen) {
          drizzleTimer -= dt;
          if (drizzleTimer <= 0) {
            confetti.drizzle(W, H, lowTier ? 1 : 2);
            drizzleTimer = lowTier ? 0.7 : 0.45;
          }
          // Corner fountains alternate sides every few seconds (pool-capped).
          fountainTimer -= dt;
          if (fountainTimer <= 0) {
            fountainSide = 1 - fountainSide;
            confetti.spawn(fountainSide ? W * 0.08 : W * 0.92, H + 6, lowTier ? 6 : 10, 0.8, H * 0.6);
            fountainTimer = lowTier ? 4 : 3;
          }
          // Firework rockets launch periodically; in-flight ones always finish.
          fireworkTimer -= dt;
          if (fireworkTimer <= 0) {
            launchFirework();
            fireworkTimer = 5 + Math.random() * 2;
          }
        }
        updateRockets(dt);
      }
      photoTimer -= dt;
      if (photoTimer <= 0) {
        spawnPhotoBalloon();
        photoTimer = 2 + Math.random() * 1.2; // every ~2–3s
      }
      for (var i = photoBalloons.length - 1; i >= 0; i--) {
        var b = photoBalloons[i];
        b.y -= b.speed * dt;
        if (!reducedMotion && !lowTier) {
          b.x += Math.sin(time * 1.6 + b.swayPhase) * b.swayAmp * dt;
        }
        if (b.wiggle > 0) {
          b.wiggle = Math.max(0, b.wiggle - dt * 2.4);
          var w = Math.sin(b.wiggle * Math.PI * 3) * 0.12 * b.wiggle;
          b.root.scale.set(1 + w);
          b.root.rotation = w * 0.6 + (!reducedMotion ? Math.sin(time * 1.2 + b.swayPhase) * 0.05 : 0);
        } else {
          b.root.scale.set(1);
          b.root.rotation = reducedMotion ? 0 : Math.sin(time * 1.2 + b.swayPhase) * 0.05;
        }
        // Sparkle ribbon trailing from the knot (high tier, celebration only).
        if (!lowTier && !reducedMotion && !overlaysOpen) {
          b.trail -= dt;
          if (b.trail <= 0) {
            var kc = b.bodyCenter();
            sparkleBurst(kc.x, kc.y + b.R * 1.1, 1);
            b.trail = 0.35 + Math.random() * 0.3;
          }
        }
        b.root.position.set(b.x, b.y);
        if (b.y < -b.R * 4) {
          // recycle off the top
          b.y = H + b.R * 3;
          b.x = b.R * 1.5 + Math.random() * Math.max(1, W - b.R * 3);
        }
      }
      // sparkles twinkle
      if (!lowTier && !reducedMotion) {
        for (var j = 0; j < sparkles.length; j++) {
          var sp = sparkles[j];
          if (!sp.spr.visible) {
            if (Math.random() < 0.006) {
              sp.x = Math.random() * W;
              sp.y = Math.random() * H * 0.7;
              sp.size = 12 + Math.random() * 22;
              sp.t = 0;
              sp.spr.visible = true;
            }
            continue;
          }
          sp.t += dt;
          var life = 1.4;
          var a = sp.t >= life ? 0 : Math.sin((sp.t / life) * Math.PI) * 0.7;
          sp.spr.alpha = a;
          sp.spr.width = sp.size; sp.spr.height = sp.size;
          sp.spr.position.set(sp.x, sp.y);
          if (sp.t >= life) sp.spr.visible = false;
        }
      }
    }

    confetti.update(dt, W, H, !lowTier && !reducedMotion && state === "celebration");
  });
})();
