/* Confetti: pooled ParticleContainer, zero allocations per frame. */
(function () {
  "use strict";
  var COLORS = [0xffd166, 0xff9f1c, 0xff4d6d, 0xfff3d6, 0xff6f91, 0xffc300, 0xffffff, 0xffb703];

  function shapeTextures(app) {
    var out = [];
    var defs = [
      function (g) { g.beginFill(0xffffff); g.drawRect(-5, -3, 10, 6); g.endFill(); },
      function (g) { g.beginFill(0xffffff); g.drawCircle(0, 0, 4); g.endFill(); },
      function (g) { g.beginFill(0xffffff); g.drawRect(-2, -6, 4, 12); g.endFill(); }
    ];
    for (var i = 0; i < defs.length; i++) {
      var g = new PIXI.Graphics();
      defs[i](g);
      out.push(app.renderer.generateTexture(g, { resolution: 1 }));
      g.destroy();
    }
    return out;
  }

  function Confetti(parent, app, max) {
    this.max = max;
    // Explicit buffers: exactly what update() drives (position/rotation/
    // scale/tint/alpha). Unknown keys are ignored by older Pixi versions.
    this.container = new PIXI.ParticleContainer(max, { scale: true, position: true, rotation: true, tint: true, alpha: true });
    parent.addChild(this.container);
    this.shapes = shapeTextures(app);
    this.pool = [];
    var i, s;
    for (i = 0; i < max; i++) {
      s = new PIXI.Sprite(this.shapes[i % this.shapes.length]);
      s.anchor.set(0.5);
      s.visible = false;
      // Park off-screen: ParticleContainer uploads every child each frame
      // regardless of `visible`, so an invisible sprite at (0,0) would still
      // paint a stray white pile in the top-left corner.
      s.position.set(0, -100);
      this.container.addChild(s);
      this.pool.push({
        spr: s, active: false,
        x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0,
        life: 0, maxLife: 1, sway: 0, swaySpeed: 0
      });
    }
    this.cursor = 0;
  }

  Confetti.prototype.spawn = function (x, y, n, spread, up) {
    var lim = this._cap || this.pool.length;
    var made = 0;
    for (var k = 0; k < lim && made < n; k++) {
      this.cursor = (this.cursor + 1) % lim;
      var p = this.pool[this.cursor];
      if (p.active) continue;
      p.active = true; made++;
      p.x = x + (Math.random() - 0.5) * 30;
      p.y = y + (Math.random() - 0.5) * 16;
      var a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      var sp = up * (0.5 + Math.random() * 0.8);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.rot = Math.random() * Math.PI * 2;
      p.vr = (Math.random() - 0.5) * 12;
      p.maxLife = 2.2 + Math.random() * 1.6;
      p.life = 0;
      p.sway = Math.random() * Math.PI * 2;
      p.swaySpeed = 2 + Math.random() * 4;
      p.spr.visible = true;
      p.spr.tint = COLORS[(Math.random() * COLORS.length) | 0];
      p.spr.scale.set(0.7 + Math.random() * 0.7);
      p.spr.alpha = 1;
    }
  };

  Confetti.prototype.burst = function (W, H, big) {
    var n = big ? 20 : 10;
    this.spawn(W * 0.12, H + 6, n, 1.1, H * 0.75);
    this.spawn(W * 0.5, H + 6, n + 4, 1.1, H * 0.8);
    this.spawn(W * 0.88, H + 6, n, 1.1, H * 0.75);
    this.spawn(W * 0.5, H * 0.55, big ? 24 : 12, Math.PI * 2, H * 0.35);
  };

  // Gentle ambient drizzle from the top during celebration. Capped by the pool.
  Confetti.prototype.drizzle = function (W, H, n) {
    var lim = this._cap || this.pool.length;
    var made = 0;
    for (var k = 0; k < lim && made < n; k++) {
      this.cursor = (this.cursor + 1) % lim;
      var p = this.pool[this.cursor];
      if (p.active) continue;
      p.active = true; made++;
      p.x = Math.random() * W;
      p.y = -12 - Math.random() * 20;
      p.vx = (Math.random() - 0.5) * 30;
      p.vy = H * (0.05 + Math.random() * 0.05);
      p.rot = Math.random() * Math.PI * 2;
      p.vr = (Math.random() - 0.5) * 8;
      p.maxLife = 6 + Math.random() * 3;
      p.life = 0;
      p.sway = Math.random() * Math.PI * 2;
      p.swaySpeed = 1.5 + Math.random() * 2.5;
      p.spr.visible = true;
      p.spr.tint = COLORS[(Math.random() * COLORS.length) | 0];
      p.spr.scale.set(0.6 + Math.random() * 0.6);
      p.spr.alpha = 0.9;
    }
  };

  Confetti.prototype.update = function (dt, W, H, drift) {
    var g = H * 0.55; // gravity px/s^2
    for (var i = 0; i < this.pool.length; i++) {
      var p = this.pool[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife || p.y > H + 24) {
        p.active = false;
        p.spr.visible = false;
        p.spr.position.set(0, -100); // park off-screen (see constructor note)
        continue;
      }
      p.vy += g * dt;
      p.vx *= (1 - 0.35 * dt);
      p.vy *= (1 - 0.12 * dt);
      p.sway += p.swaySpeed * dt;
      p.x += (p.vx + Math.sin(p.sway) * (drift ? 26 : 0)) * dt;
      p.y += p.vy * dt;
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      p.rot += p.vr * dt;
      var fade = 1;
      var remain = p.maxLife - p.life;
      if (remain < 0.6) fade = remain / 0.6;
      p.spr.position.set(p.x, p.y);
      p.spr.rotation = p.rot;
      p.spr.alpha = fade < 0 ? 0 : fade;
    }
  };

  Confetti.prototype.setMax = function (n) {
    // Low tier: permanently park the tail of the pool.
    for (var i = n; i < this.pool.length; i++) {
      this.pool[i].active = false;
      this.pool[i].spr.visible = false;
      this.pool[i].spr.position.set(0, -100);
    }
    this._cap = n;
  };

  window.Confetti = { Confetti: Confetti };
})();
