/* Balloons: pre-rendered textures + balloon classes. No Graphics in the render loop. */
(function () {
  "use strict";
  var PALETTE = [0xff4d6d, 0xff9f1c, 0xffd166, 0x4ecdc4, 0x6a5cff, 0x3ec1ff, 0x7bdff2, 0xf72585];
  var BASE_R = 64; // textures are baked in this coordinate space...
  var TEX = 2;     // ...at 2x pixel density for crisp phones; sprite scales divide by TEX.

  function shade(hex, f) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return (r << 16) | (g << 8) | b;
  }

  // Body texture: balloon ellipse + knot + string baked into one sprite.
  // NOTE: generateTexture crops to content bounds by default, so pass an
  // explicit region matching the layout — otherwise anchors (computed from
  // W/H/bodyCX/bodyCY) silently misalign (white ring floating off the body).
  function bodyTexture(app, color) {
    var R = BASE_R, pad = 12, strLen = Math.round(R * 1.5);
    var W = Math.ceil(R * 2 + pad * 2), H = Math.ceil(R * 2 + pad * 2 + 12 + strLen);
    var cx = W / 2, cy = pad + R;
    var region = new PIXI.Rectangle(0, 0, W, H);
    var g = new PIXI.Graphics();
    // bottom rim: darker crescent peeking out below for roundness
    g.beginFill(shade(color, 0.7));
    g.drawEllipse(cx, cy + 4, R * 0.82, R);
    g.endFill();
    // main body
    g.beginFill(color);
    g.drawEllipse(cx, cy, R * 0.82, R);
    g.endFill();
    // gloss: crescent sheen hugging the upper-left curve — reads as shine on
    // a round surface and can never look detached like a floating oval could
    var rr = R * 0.58, a0 = Math.PI * 1.04, a1 = Math.PI * 1.46;
    g.lineStyle(Math.max(2, R * 0.11), 0xffffff, 0.32);
    g.arc(cx, cy, rr, a0, a1);
    g.beginFill(0xffffff, 0.32);
    g.drawCircle(cx + rr * Math.cos(a0), cy + rr * Math.sin(a0), R * 0.055);
    g.drawCircle(cx + rr * Math.cos(a1), cy + rr * Math.sin(a1), R * 0.055);
    g.endFill();
    // knot
    g.beginFill(shade(color, 0.8));
    g.moveTo(cx - 8, cy + R - 3);
    g.lineTo(cx + 8, cy + R - 3);
    g.lineTo(cx, cy + R + 9);
    g.lineTo(cx - 8, cy + R - 3);
    g.endFill();
    // string (curvy, baked)
    g.lineStyle(2, shade(color, 0.6), 0.85);
    g.moveTo(cx, cy + R + 9);
    g.bezierCurveTo(cx - 12, cy + R + 30, cx + 12, cy + R + 60, cx - 4, cy + R + 12 + strLen);
    var tex = app.renderer.generateTexture(g, { resolution: TEX, region: region });
    g.destroy();
    return { tex: tex, W: W, H: H, bodyCX: cx, bodyCY: cy };
  }

  function outlineTexture(app) {
    var R = BASE_R, pad = 12, strLen = Math.round(R * 1.5);
    var W = Math.ceil(R * 2 + pad * 2), H = Math.ceil(R * 2 + pad * 2 + 12 + strLen);
    var cx = W / 2, cy = pad + R;
    var g = new PIXI.Graphics();
    g.lineStyle(4, 0xffffff, 1);
    g.drawEllipse(cx, cy, R * 0.82 + 2, R + 2);
    var tex = app.renderer.generateTexture(g, { resolution: TEX, region: new PIXI.Rectangle(0, 0, W, H) });
    g.destroy();
    return { tex: tex, W: W, H: H, bodyCX: cx, bodyCY: cy };
  }

  function glowTexture(app) {
    var s = 128;
    var cv = document.createElement("canvas");
    cv.width = s; cv.height = s;
    var c = cv.getContext("2d");
    var grd = c.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.4, "rgba(255,255,255,0.35)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = grd;
    c.fillRect(0, 0, s, s);
    return PIXI.Texture.from(cv);
  }

  // Mask a photo into the balloon ellipse once, at boot. Returns null on failure.
  function photoTexture(app, photoTex, borderColor) {
    try {
      var R = BASE_R, pad = 12, strLen = Math.round(R * 1.5);
      var W = Math.ceil(R * 2 + pad * 2), H = Math.ceil(R * 2 + pad * 2 + 12 + strLen);
      var cx = W / 2, cy = pad + R;
      var rx = R * 0.82, ry = R;
      var con = new PIXI.Container();
      var img = new PIXI.Sprite(photoTex);
      var cover = Math.max((rx * 2) / photoTex.width, (ry * 2) / photoTex.height);
      img.width = photoTex.width * cover;
      img.height = photoTex.height * cover;
      img.x = cx - img.width / 2;
      img.y = cy - img.height / 2;
      var mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawEllipse(cx, cy, rx, ry);
      mask.endFill();
      con.addChild(mask);
      con.addChild(img);
      img.mask = mask;
      var edge = new PIXI.Graphics();
      edge.lineStyle(6, 0xffffff, 0.95);
      edge.drawEllipse(cx, cy, rx, ry);
      con.addChild(edge);
      var hl = new PIXI.Graphics();
      var hr = rx * 0.68, ha0 = Math.PI * 1.04, ha1 = Math.PI * 1.46;
      hl.lineStyle(Math.max(2, rx * 0.13), 0xffffff, 0.3);
      hl.arc(cx, cy, hr, ha0, ha1);
      hl.beginFill(0xffffff, 0.3);
      hl.drawCircle(cx + hr * Math.cos(ha0), cy + hr * Math.sin(ha0), rx * 0.065);
      hl.drawCircle(cx + hr * Math.cos(ha1), cy + hr * Math.sin(ha1), rx * 0.065);
      hl.endFill();
      con.addChild(hl);
      var knot = new PIXI.Graphics();
      knot.beginFill(borderColor);
      knot.moveTo(cx - 8, cy + ry - 3);
      knot.lineTo(cx + 8, cy + ry - 3);
      knot.lineTo(cx, cy + ry + 9);
      knot.lineTo(cx - 8, cy + ry - 3);
      knot.endFill();
      knot.lineStyle(2, shade(borderColor, 0.6), 0.85);
      knot.moveTo(cx, cy + ry + 9);
      knot.bezierCurveTo(cx - 12, cy + ry + 30, cx + 12, cy + ry + 60, cx - 4, cy + ry + 12 + strLen);
      con.addChild(knot);
      // Explicit region = full layout, so the anchor math (bodyCX/W) holds.
      // generateTexture otherwise crops to content bounds and every sprite
      // using these textures renders off-centre.
      var tex = app.renderer.generateTexture(con, { resolution: TEX, region: new PIXI.Rectangle(0, 0, W, H) });
      con.destroy({ children: true, texture: false, baseTexture: false });
      return { tex: tex, W: W, H: H, bodyCX: cx, bodyCY: cy };
    } catch (e) { return null; }
  }

  // --- Party balloon (the first one) ---
  function PartyBalloon(parent, body, outline, glowTex, x, startY, targetY, scale) {
    this.R = BASE_R * scale;
    this.scale = scale;
    var ss = scale / TEX; // texture pixels are TEX denser than world units
    this.root = new PIXI.Container();
    this.glow = new PIXI.Sprite(glowTex);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = PIXI.BLEND_MODES.ADD;
    this.glow.alpha = 0;
    this.glow.width = this.R * 4.4; this.glow.height = this.R * 4.4;
    this.body = new PIXI.Sprite(body.tex);
    this.body.scale.set(ss);
    this.body.anchor.set(body.bodyCX / body.W, body.bodyCY / body.H);
    this.line = new PIXI.Sprite(outline.tex);
    this.line.scale.set(ss);
    this.line.anchor.set(outline.bodyCX / outline.W, outline.bodyCY / outline.H);
    this.line.alpha = 0;
    this.root.addChild(this.glow);
    this.root.addChild(this.body);
    this.root.addChild(this.line);
    this.baseX = x; this.startY = startY; this.targetY = targetY;
    this.x = x; this.y = startY;
    this.riseT = 0; this.arrived = false;
    this.swayPhase = Math.random() * Math.PI * 2;
    this.arrivedAt = 0;
    parent.addChild(this.root);
    this.sync();
  }
  PartyBalloon.prototype.sync = function () {
    // Body/outline anchors centre on the balloon body, so the root
    // sits exactly at the body centre. Glow is centred there too.
    this.root.position.set(this.x, this.y);
    this.glow.position.set(0, 0);
  };
  PartyBalloon.prototype.bodyCenter = function () { return { x: this.x, y: this.y }; };
  PartyBalloon.prototype.hitRadius = function () { return Math.max(44, this.R * 1.4); };
  PartyBalloon.prototype.destroy = function () {
    if (this.root.parent) this.root.parent.removeChild(this.root);
    this.root.destroy({ children: true });
  };

  // --- Photo balloon (continuous risers) ---
  function PhotoBalloon(parent, texInfo, x, startY, scale, speed) {
    this.R = BASE_R * scale;
    this.scale = scale;
    this.root = new PIXI.Container();
    this.spr = new PIXI.Sprite(texInfo.tex);
    this.spr.scale.set(scale / TEX);
    this.spr.anchor.set(texInfo.bodyCX / texInfo.W, texInfo.bodyCY / texInfo.H);
    this.root.addChild(this.spr);
    this.x = x; this.y = startY;
    this.speed = speed;
    this.swayPhase = Math.random() * Math.PI * 2;
    this.swayAmp = 4 + Math.random() * 4;
    this.wiggle = 0;
    this.trail = Math.random() * 0.5;
    this.root.position.set(x, startY);
    parent.addChild(this.root);
  }
  PhotoBalloon.prototype.bodyCenter = function () { return { x: this.root.x, y: this.root.y }; };
  PhotoBalloon.prototype.hitRadius = function () { return Math.max(44, this.R * 1.4); };
  PhotoBalloon.prototype.destroy = function () {
    if (this.root.parent) this.root.parent.removeChild(this.root);
    this.root.destroy({ children: true });
  };

  window.Balloons = {
    PALETTE: PALETTE,
    BASE_R: BASE_R,
    TEX: TEX,
    shade: shade,
    bodyTexture: bodyTexture,
    outlineTexture: outlineTexture,
    glowTexture: glowTexture,
    photoTexture: photoTexture,
    PartyBalloon: PartyBalloon,
    PhotoBalloon: PhotoBalloon
  };
})();
