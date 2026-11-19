(() => {
  "use strict";

  /* ================= setup ================= */
  const GAME_W = 480,
    GAME_H = 720;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const levelEl = document.getElementById("level");
  const livesEl = document.getElementById("lives");
  const comboEl = document.getElementById("combo");
  const trophyEl = document.getElementById("trophy");
  const homeUI = document.getElementById("homeUI");
  const settingsUI = document.getElementById("settingsUI");
  const pauseUI = document.getElementById("pauseUI");
  const overUI = document.getElementById("overUI");
  const playBtn = document.getElementById("playBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsClose = document.getElementById("settingsClose");
  const soundSwitch = document.getElementById("soundSwitch");
  const resumeBtn = document.getElementById("resumeBtn");
  const restartBtn = document.getElementById("restartBtn");
  const homeBtn = document.getElementById("homeBtn");
  const againBtn = document.getElementById("againBtn");
  const homeBtn2 = document.getElementById("homeBtn2");
  const homeBest = document.getElementById("homeBest");
  const overScore = document.getElementById("overScore");
  const overBestEl = document.getElementById("overBest");
  const overTrophyEl = document.getElementById("overTrophy");
  const newBestBadge = document.getElementById("newBestBadge");
  const soundBtn = document.getElementById("soundBtn");
  const pauseBtn = document.getElementById("pauseBtn");

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  /* roundRect polyfill (older browsers) */
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  /* storage (may be unavailable in sandboxed iframes) */
  function loadStr(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : v;
    } catch (e) {
      return d;
    }
  }
  function save(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  }

  /* ================= audio ================= */
  let AC = null,
    muted = loadStr("bricksMuted", "0") === "1";
  function ac() {
    if (!AC) {
      try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {}
    }
    if (AC && AC.state === "suspended") AC.resume();
    return AC;
  }
  function beep(f, d = 0.06, type = "square", v = 0.12, slideTo = 0) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo)
      o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + d + 0.02);
  }
  const SFX = {
    brick: (row) => beep(320 + row * 45, 0.06, "square", 0.09),
    tough: () => beep(230, 0.05, "triangle", 0.1),
    paddle: () => beep(190, 0.06, "square", 0.11),
    wall: () => beep(150, 0.04, "triangle", 0.07),
    power: () => {
      beep(520, 0.07, "sine", 0.13);
      setTimeout(() => beep(780, 0.09, "sine", 0.13), 70);
    },
    lose: () => beep(280, 0.4, "sawtooth", 0.13, 60),
    laser: () => beep(900, 0.05, "sawtooth", 0.05, 1300),
    over: () => {
      beep(220, 0.25, "square", 0.11, 110);
      setTimeout(() => beep(110, 0.5, "square", 0.11, 55), 220);
    },
    clear: () =>
      [523, 659, 784, 1046].forEach((f, i) =>
        setTimeout(() => beep(f, 0.12, "sine", 0.12), i * 90),
      ),
    bonus: () => {
      beep(660, 0.08, "sine", 0.14);
      setTimeout(() => beep(990, 0.12, "sine", 0.14), 80);
    },
    advanced: () =>
      [523, 784, 1046, 1318].forEach((f, i) =>
        setTimeout(() => beep(f, 0.14, "square", 0.1), i * 80),
      ),
    win: () =>
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
        setTimeout(() => beep(f, 0.16, "sine", 0.13), i * 110),
      ),
  };

  /* ================= state ================= */
  const S = {
    state: "menu",
    score: 0,
    best: +loadStr("bricksBest", "0") || 0,
    prevBest: 0,
    seed: 1, // ✅ session seed — প্রতি গেমে নতুন pattern
    level: 1,
    lives: 3,
    shake: 0,
    levelupT: 0,
    lastBonus: 0,
    newBest: false,
    brickCount: 0,
    advIdx: 0,
    banner: null,
    flash: 0,
    trophies: 0,
    trophyT: 0,
  };

  // ✅ PADDLE উপরে তোলা হয়েছে (আঙুলের জন্য জায়গা)
  const PADDLE_Y_OFFSET = 130; // ← টিউন করতে পারো: 110 / 130 / 150
  const paddle = {
    x: GAME_W / 2,
    y: GAME_H - PADDLE_Y_OFFSET,
    w: 96,
    baseW: 96,
    h: 14,
  };

  let balls = [],
    bricks = [],
    powerups = [],
    lasers = [],
    particles = [];
  const effects = {
    wide: 0,
    slow: 0,
    laser: 0,
    fireball: 0,
    mega: 0,
    megapaddle: 0,
  };
  const keys = { left: false, right: false };
  let pointerX = null,
    laserCd = 0,
    megaCd = 0,
    T = 0,
    pausedFrom = "play";
  let floaters = [];
  const SLOWF = 0.62;
  const BALL_CAP = 8;
  const stars = [];
  for (let i = 0; i < 42; i++)
    stars.push({
      x: Math.random() * GAME_W,
      y: Math.random() * GAME_H,
      r: rand(0.6, 1.8),
      spd: rand(4, 14),
      ph: rand(0, 6.28),
    });

  /* ================= bricks / levels ================= */
  const COLS = 9,
    BRICK_TOP = 64,
    BRICK_H = 22,
    BRICK_GAP = 5,
    FIELD_PAD = 14;
  const BRICK_W = (GAME_W - FIELD_PAD * 2 - (COLS - 1) * BRICK_GAP) / COLS;
  const PATTERN_POOL = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const TROPHY_EVERY = 8;
  const TROPHY_BONUS = 2000;
  const ROW_COLORS = [
    "#ff6b6b",
    "#ffb84d",
    "#ffe14d",
    "#7ee787",
    "#4dd2ff",
    "#7aa8ff",
    "#c792ea",
    "#ff8ad8",
  ];

  function patternCell(p, r, c, rows) {
    const mid = (COLS - 1) / 2;
    switch (p) {
      case 0:
        return true;
      case 1:
        return (
          Math.abs(c - mid) <= mid * (1 - r / Math.max(rows - 1, 1)) + 0.51
        );
      case 2:
        return (r + c) % 2 === 0;
      case 3:
        return c <= 2 || c >= COLS - 3;
      case 4:
        return (
          Math.abs(c - mid) / mid +
            Math.abs(r - (rows - 1) / 2) / Math.max((rows - 1) / 2, 1) <=
          1.3
        );
      case 5:
        return (c + r) % 4 < 2;
      case 6:
        return c % 2 === 0;
      case 7: {
        const dx = Math.abs(c - mid) / mid;
        const dy = Math.abs(r - (rows - 1) / 2) / Math.max((rows - 1) / 2, 1);
        return Math.abs(dx - dy) < 0.34;
      }
      default:
        return r === 0 || r === rows - 1 || c === 0 || c === COLS - 1;
    }
  }

  // ✅ session seed + level মিলিয়ে প্রতি গেমে আলাদা random stream
  function levelRng(lv) {
    let s = ((S.seed >>> 0) ^ (lv * 2654435761) ^ 0x9e3779b9) >>> 0;
    return function () {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  }

  function buildLevel(lv) {
    bricks = [];
    const rng = levelRng(lv);
    let rows = Math.min(6 + Math.floor((lv - 1) / 2), 12);
    if (lv > 1 && rng() < 0.35) rows = Math.min(rows + 1, 13);

    // ✅ প্রতিবার random pattern family বেছে নাও
    const pattern =
      PATTERN_POOL[
        (Math.floor(rng() * PATTERN_POOL.length) + lv) % PATTERN_POOL.length
      ];

    const mirror = rng() < 0.5;
    const shift = Math.floor(rng() * COLS);
    const cap = lv >= 17 ? 4 : lv >= 5 ? 3 : lv >= 2 ? 2 : 1;
    const colorOff = Math.floor(rng() * 8);
    const cells = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const cc = ((mirror ? COLS - 1 - c : c) + shift) % COLS;
        row.push(patternCell(pattern, r, cc, rows));
      }
      cells.push(row);
    }
    if (lv > 1) {
      const flips = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < flips; i++) {
        const fr = Math.floor(rng() * rows),
          fc = Math.floor(rng() * COLS);
        cells[fr][fc] = !cells[fr][fc];
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!cells[r][c]) continue;
        const t = r / Math.max(rows - 1, 1);
        const hp = Math.min(1 + (t < 0.2 ? 2 : t < 0.5 ? 1 : 0), cap);
        bricks.push({
          x: FIELD_PAD + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W,
          h: BRICK_H,
          hp,
          maxHp: hp,
          row: r,
          ci: (r + colorOff) % 8,
          pts: 50 + (rows - r) * 10,
        });
      }
    }
  }

  /* ================= balls ================= */
  function ballSpeedForLevel(lv) {
    return Math.min(330 + (lv - 1) * 20, 560);
  }
  function serveBall() {
    balls = [
      {
        x: paddle.x,
        y: paddle.y - 9,
        px: paddle.x,
        py: paddle.y - 9,
        r: 7,
        vx: 0,
        vy: 0,
        speed: ballSpeedForLevel(S.level),
      },
    ];
    S.state = "serve";
  }
  function launch() {
    const b = balls[0];
    if (!b) return;
    const ang = rand(-0.3, 0.3);
    b.vx = Math.sin(ang) * b.speed;
    b.vy = -Math.cos(ang) * b.speed;
    S.state = "play";
  }
  function setBallSpeed(b) {
    const target = b.speed * (effects.slow > 0 ? SLOWF : 1);
    const m = Math.hypot(b.vx, b.vy) || 1;
    const f = target / m;
    b.vx *= f;
    b.vy *= f;
  }
  function fixAngle(b) {
    const m = Math.hypot(b.vx, b.vy);
    if (!m) return;
    const minVy = 0.18 * m,
      minVx = 0.06 * m;
    if (Math.abs(b.vy) < minVy) {
      b.vy = (b.vy < 0 ? -1 : 1) * minVy;
      b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(Math.max(m * m - b.vy * b.vy, 0));
    } else if (Math.abs(b.vx) < minVx) {
      b.vx = (b.vx < 0 ? -1 : 1) * minVx;
      b.vy = (b.vy < 0 ? -1 : 1) * Math.sqrt(Math.max(m * m - b.vx * b.vx, 0));
    }
  }

  /* ================= power-ups ================= */
  const POWER_COLORS = {
    wide: "#22d3ee",
    multi: "#f472b6",
    laser: "#fb923c",
    slow: "#a78bfa",
    life: "#4ade80",
  };
  const POWER_LETTER = {
    wide: "W",
    multi: "M",
    laser: "L",
    slow: "S",
    life: "+",
  };
  const POWER_TABLE = [
    ["wide", 25],
    ["multi", 22],
    ["laser", 20],
    ["slow", 18],
    ["life", 8],
  ];
  function pickPower() {
    const total = POWER_TABLE.reduce((s, e) => s + e[1], 0);
    let r = Math.random() * total;
    for (const [name, w] of POWER_TABLE) {
      r -= w;
      if (r <= 0) return name;
    }
    return "wide";
  }
  function applySlow(on) {
    for (const b of balls) {
      const target = on ? b.speed * SLOWF : b.speed;
      const m = Math.hypot(b.vx, b.vy) || 1;
      const f = target / m;
      b.vx *= f;
      b.vy *= f;
    }
  }
  function multiBall() {
    const src = balls[0];
    if (!src) return;
    const m = Math.hypot(src.vx, src.vy);
    const ang = Math.atan2(src.vy, src.vx);
    for (const off of [-0.6, 0.6]) {
      if (balls.length >= BALL_CAP) break;
      const a = ang + off;
      balls.push({
        x: src.x,
        y: src.y,
        px: src.x,
        py: src.y,
        r: 7,
        vx: Math.cos(a) * m,
        vy: Math.sin(a) * m,
        speed: src.speed,
      });
    }
  }
  function spawnBonusBall(n, bx, by) {
    const sp = ballSpeedForLevel(S.level) * (effects.slow > 0 ? SLOWF : 1);
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      if (balls.length >= BALL_CAP) break;
      const x = bx != null ? bx : balls[0] ? balls[0].x : paddle.x;
      const y = by != null ? by : balls[0] ? balls[0].y : paddle.y - 24;
      const a = rand(-2.5, -0.6);
      balls.push({
        x,
        y,
        px: x,
        py: y,
        r: 7,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        speed: ballSpeedForLevel(S.level),
      });
      spawned++;
    }
    return spawned;
  }
  function banner(main, sub, color, small) {
    S.banner = {
      main,
      sub,
      color,
      t: 0,
      dur: small ? 1.05 : 1.8,
      small: !!small,
    };
  }
  function floater(x, y, str, c) {
    floaters.push({ x, y, text: str, life: 0.8, max: 0.8, c });
  }
  function applyPower(t) {
    SFX.power();
    if (t === "wide") effects.wide = 12;
    else if (t === "slow") {
      if (effects.slow <= 0) applySlow(true);
      effects.slow = 10;
    } else if (t === "multi") multiBall();
    else if (t === "laser") effects.laser = 8;
    else if (t === "life") {
      S.lives = Math.min(S.lives + 1, 5);
      syncLives();
    }
  }

  /* ================= combo milestones ================= */
  const ADV_POOL = ["fireball", "megalaser", "blitz", "megapaddle"];
  const ADV_INFO = {
    fireball: {
      title: "ADVANCED: FIREBALL!",
      sub: "Ball brick pierce kore jabe!",
    },
    megalaser: {
      title: "ADVANCED: MEGA LASER!",
      sub: "Automatic double laser",
    },
    blitz: { title: "ADVANCED: BALL BLITZ!", sub: "+3 bonus ball ek sathe!" },
    megapaddle: {
      title: "ADVANCED: MEGA PADDLE!",
      sub: "Bishal paddle — sob catch!",
    },
  };
  function triggerAdvanced(name, x, y) {
    if (name === "fireball") effects.fireball = 7;
    else if (name === "megalaser") effects.mega = 7;
    else if (name === "blitz") spawnBonusBall(3, x, y);
    else if (name === "megapaddle") effects.megapaddle = 10;
    const info = ADV_INFO[name];
    banner(info.title, info.sub, "#fbbf24");
    S.flash = 0.35;
    SFX.advanced();
    for (let i = 0; i < 26; i++) {
      particles.push({
        x: GAME_W / 2,
        y: 340,
        vx: rand(-320, 320),
        vy: rand(-360, 40),
        life: rand(0.4, 0.9),
        max: 0.9,
        c: ["#fbbf24", "#f472b6", "#4ade80", "#38bdf8"][i % 4],
      });
    }
  }
  function brickMilestone(k) {
    S.brickCount++;
    syncCombo();
    const c = S.brickCount;
    const bx = k.x + k.w / 2,
      by = k.y + k.h / 2;
    if (c % 10 === 0) {
      spawnBonusBall(1, bx, by);
      triggerAdvanced(ADV_POOL[S.advIdx++ % ADV_POOL.length], bx, by);
    } else if (c % 3 === 0) {
      const spawned = spawnBonusBall(1, bx, by);
      if (spawned > 0) banner("+1 BONUS BALL!", "+100 points", "#67e8f9", true);
      else banner("BALLS FULL!", "+250 points", "#67e8f9", true);
      addScore(spawned > 0 ? 100 : 250);
      floater(bx, by - 16, spawned > 0 ? "+100" : "+250", "#fbbf24");
      S.flash = 0.18;
      SFX.bonus();
    }
  }

  /* ================= scoring / flow ================= */
  function addScore(n) {
    S.score += n;
    if (S.score > S.best) {
      S.best = S.score;
      save("bricksBest", String(S.best));
    }
    syncHud();
  }
  function spawnParticles(k) {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: k.x + Math.random() * k.w,
        y: k.y + Math.random() * k.h,
        vx: rand(-160, 160),
        vy: rand(-220, 40),
        life: rand(0.25, 0.5),
        max: 0.5,
        c: ROW_COLORS[k.ci],
      });
    }
    if (particles.length > 240) particles.splice(0, particles.length - 240);
  }
  function maybeDrop(k) {
    if (Math.random() < 0.24)
      powerups.push({
        x: k.x + k.w / 2,
        y: k.y + k.h / 2,
        type: pickPower(),
        t: 0,
      });
  }
  function damageBrick(k, dmg = 1) {
    k.hp -= dmg;
    k.flash = 0.12;
    if (k.hp <= 0) {
      addScore(k.pts);
      floater(k.x + k.w / 2, k.y, "+" + k.pts, "#e2e8f0");
      spawnParticles(k);
      maybeDrop(k);
      SFX.brick(k.row);
      brickMilestone(k);
      if (bricks.length && bricks.every((b) => b.hp <= 0)) levelCleared();
    } else {
      SFX.tough();
    }
  }
  function levelCleared() {
    S.lastBonus = 500 + S.level * 200;
    addScore(S.lastBonus);
    S.state = "levelup";
    S.levelupT = 2.2;
    powerups = [];
    lasers = [];
    floaters = [];
    S.banner = null;
    S.flash = 0;
    effects.wide =
      effects.slow =
      effects.laser =
      effects.fireball =
      effects.mega =
      effects.megapaddle =
        0;
    SFX.clear();
  }
  function loseLife() {
    S.lives--;
    syncLives();
    SFX.lose();
    S.shake = 0.5;
    powerups = [];
    lasers = [];
    effects.wide =
      effects.slow =
      effects.laser =
      effects.fireball =
      effects.mega =
      effects.megapaddle =
        0;
    if (S.lives <= 0) gameOver();
    else serveBall();
  }
  function gameOver() {
    S.state = "gameover";
    S.newBest = S.score > 0 && S.score > S.prevBest;
    overScore.textContent = S.score.toLocaleString();
    overBestEl.textContent = "BEST " + S.best.toLocaleString();
    newBestBadge.classList.toggle("hidden", !S.newBest);
    overTrophyEl.classList.toggle("hidden", S.trophies <= 0);
    overTrophyEl.textContent = "🏆 TROPHY × " + S.trophies;
    syncOverlays();
    SFX.over();
  }
  function nextLevel() {
    S.level++;
    // ✅ প্রতিটা level-এ আরও ভ্যারাইটি (চাইলে বাদ দিতে পারো)
    S.seed = (S.seed ^ ((S.level * 2246822519) >>> 0)) >>> 0;
    if (S.seed === 0) S.seed = 1;
    buildLevel(S.level);
    serveBall();
    syncHud();
  }
  function awardTrophy() {
    S.trophies++;
    addScore(TROPHY_BONUS);
    syncTrophy();
    S.state = "trophy";
    S.trophyT = 3;
    balls = [];
    powerups = [];
    lasers = [];
    floaters = [];
    S.banner = null;
    S.flash = 0;
    SFX.win();
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: rand(30, GAME_W - 30),
        y: rand(100, 420),
        vx: rand(-260, 260),
        vy: rand(-420, 60),
        life: rand(0.8, 1.8),
        max: 1.8,
        c: ["#fbbf24", "#4ade80", "#f472b6", "#38bdf8", "#f87171"][i % 5],
      });
    }
  }
  function startGame() {
    // ✅ প্রতি নতুন গেমে নতুন random seed → নতুন pattern
    S.seed = (Math.random() * 0xffffffff) >>> 0;
    if (S.seed === 0) S.seed = 1;

    S.score = 0;
    S.lives = 3;
    S.level = 1;
    S.newBest = false;
    S.prevBest = S.best;
    S.brickCount = 0;
    S.advIdx = 0;
    S.banner = null;
    S.flash = 0;
    S.trophies = 0;
    S.trophyT = 0;
    powerups = [];
    lasers = [];
    particles = [];
    floaters = [];
    effects.wide =
      effects.slow =
      effects.laser =
      effects.fireball =
      effects.mega =
      effects.megapaddle =
        0;
    paddle.w = paddle.baseW;
    buildLevel(1);
    serveBall();
    syncHud();
    syncLives();
    syncCombo();
    syncTrophy();
    settingsVisible = false;
    syncOverlays();
  }
  function goHome() {
    // ✅ মেনু থেকে ফিরে এলে preview-ও নতুন pattern দেখাবে
    S.seed = (Math.random() * 0xffffffff) >>> 0;
    if (S.seed === 0) S.seed = 1;

    S.state = "menu";
    S.score = 0;
    S.level = 1;
    S.lives = 3;
    S.trophies = 0;
    S.brickCount = 0;
    S.advIdx = 0;
    S.banner = null;
    S.flash = 0;
    balls = [];
    powerups = [];
    lasers = [];
    floaters = [];
    particles = [];
    effects.wide =
      effects.slow =
      effects.laser =
      effects.fireball =
      effects.mega =
      effects.megapaddle =
        0;
    paddle.w = paddle.baseW;
    settingsVisible = false;
    pauseBtn.textContent = "⏸";
    buildLevel(1);
    homeBest.innerHTML =
      S.best > 0 ? "BEST <b>" + S.best.toLocaleString() + "</b>" : "";
    syncHud();
    syncLives();
    syncCombo();
    syncTrophy();
    syncOverlays();
  }

  /* ================= update ================= */
  function updatePaddle(dt) {
    const spd = 600;
    let dx = 0;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    if (dx) {
      paddle.x += dx * spd * dt;
      pointerX = null;
    } else if (pointerX != null) paddle.x = pointerX;
    const targetW =
      effects.megapaddle > 0 ? 190 : effects.wide > 0 ? 150 : paddle.baseW;
    paddle.w += (targetW - paddle.w) * Math.min(1, dt * 10);
    paddle.x = clamp(paddle.x, paddle.w / 2 + 6, GAME_W - paddle.w / 2 - 6);
  }
  function updateEffects(dt) {
    const wasSlow = effects.slow > 0;
    for (const k in effects) effects[k] = Math.max(0, effects[k] - dt);
    if (wasSlow && effects.slow <= 0) applySlow(false);
    laserCd = Math.max(0, laserCd - dt);
    if (effects.mega > 0) {
      megaCd -= dt;
      if (megaCd <= 0) {
        fireLaser(0.15);
        megaCd = 0.15;
      }
    } else megaCd = 0;
  }
  function hitBricks(b) {
    for (const k of bricks) {
      if (k.hp <= 0) continue;
      if (
        b.x + b.r < k.x ||
        b.x - b.r > k.x + k.w ||
        b.y + b.r < k.y ||
        b.y - b.r > k.y + k.h
      )
        continue;
      const cx = k.x + k.w / 2,
        cy = k.y + k.h / 2;
      const ox = k.w / 2 + b.r - Math.abs(b.x - cx);
      const oy = k.h / 2 + b.r - Math.abs(b.y - cy);
      if (ox <= 0 || oy <= 0) continue;
      b.speed = Math.min(b.speed + 2.5, ballSpeedForLevel(S.level) + 150);
      setBallSpeed(b);
      if (effects.fireball > 0) {
        damageBrick(k, 99);
        return;
      }
      if (ox < oy) {
        b.vx = b.x < cx ? -Math.abs(b.vx) : Math.abs(b.vx);
        b.x += b.x < cx ? -ox : ox;
      } else {
        b.vy = b.y < cy ? -Math.abs(b.vy) : Math.abs(b.vy);
        b.y += b.y < cy ? -oy : oy;
      }
      damageBrick(k);
      return;
    }
  }
  function updateBalls(dt) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      const sp = Math.hypot(b.vx, b.vy);
      const steps = Math.max(1, Math.ceil((sp * dt) / 8));
      const sdt = dt / steps;
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        b.px = b.x;
        b.py = b.y;
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        if (b.x < b.r + 4) {
          b.x = b.r + 4;
          b.vx = Math.abs(b.vx);
          SFX.wall();
        }
        if (b.x > GAME_W - b.r - 4) {
          b.x = GAME_W - b.r - 4;
          b.vx = -Math.abs(b.vx);
          SFX.wall();
        }
        if (b.y < b.r + 4) {
          b.y = b.r + 4;
          b.vy = Math.abs(b.vy);
          SFX.wall();
        }
        if (
          b.vy > 0 &&
          b.y + b.r >= paddle.y &&
          b.y - b.r <= paddle.y + paddle.h &&
          b.x >= paddle.x - paddle.w / 2 - b.r &&
          b.x <= paddle.x + paddle.w / 2 + b.r
        ) {
          b.y = paddle.y - b.r;
          const rel = clamp((b.x - paddle.x) / (paddle.w / 2), -1, 1);
          const ang = rel * (Math.PI / 3);
          b.vx = Math.sin(ang) * b.speed;
          b.vy = -Math.cos(ang) * b.speed;
          if (effects.slow > 0) {
            b.vx *= SLOWF;
            b.vy *= SLOWF;
          }
          SFX.paddle();
        }
        hitBricks(b);
        if (b.y - b.r > GAME_H) dead = true;
      }
      fixAngle(b);
      if (dead) {
        balls.splice(i, 1);
        if (balls.length === 0) loseLife();
      }
    }
  }
  function fireLaser(cd) {
    cd = cd || 0.22;
    if (laserCd > 0) return;
    laserCd = cd;
    const off = paddle.w / 2 - 8;
    lasers.push(
      { x: paddle.x - off, y: paddle.y - 6 },
      { x: paddle.x + off, y: paddle.y - 6 },
    );
    SFX.laser();
  }
  function updateLasers(dt) {
    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      l.y -= 700 * dt;
      let hit = false;
      for (const k of bricks) {
        if (k.hp <= 0) continue;
        if (
          l.x + 2 < k.x ||
          l.x - 2 > k.x + k.w ||
          l.y < k.y ||
          l.y + 16 > k.y + k.h
        )
          continue;
        damageBrick(k);
        hit = true;
        break;
      }
      if (hit || l.y + 16 < 0) lasers.splice(i, 1);
    }
  }
  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += 150 * dt;
      p.t += dt;
      if (p.y > GAME_H + 20) {
        powerups.splice(i, 1);
        continue;
      }
      if (
        p.y + 9 >= paddle.y &&
        p.y - 9 <= paddle.y + paddle.h &&
        p.x > paddle.x - paddle.w / 2 - 16 &&
        p.x < paddle.x + paddle.w / 2 + 16
      ) {
        applyPower(p.type);
        powerups.splice(i, 1);
      }
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y -= 42 * dt;
      f.life -= dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }
  function update(dt) {
    T += dt;
    S.shake = Math.max(0, S.shake - dt * 1.6);
    S.flash = Math.max(0, S.flash - dt);
    if (S.banner) {
      S.banner.t += dt;
      if (S.banner.t >= S.banner.dur) S.banner = null;
    }
    updateParticles(dt);
    updateFloaters(dt);
    for (const k of bricks)
      if (k.flash > 0) k.flash = Math.max(0, k.flash - dt);
    switch (S.state) {
      case "play":
        updatePaddle(dt);
        updateEffects(dt);
        updateBalls(dt);
        updateLasers(dt);
        updatePowerups(dt);
        break;
      case "serve":
        updatePaddle(dt);
        updateEffects(dt);
        if (balls[0]) {
          balls[0].x = paddle.x;
          balls[0].y = paddle.y - balls[0].r - 2;
          balls[0].px = balls[0].x;
          balls[0].py = balls[0].y;
        }
        break;
      case "levelup":
        S.levelupT -= dt;
        if (S.levelupT <= 0) {
          if (S.level % TROPHY_EVERY === 0) awardTrophy();
          else nextLevel();
        }
        break;
      case "trophy":
        S.trophyT -= dt;
        if (S.trophyT <= 0) nextLevel();
        break;
    }
  }

  /* ================= render ================= */
  let viewScale = 1,
    bgGrad = null;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = Math.max(stage.clientWidth, 50);
    const availH = Math.max(stage.clientHeight, 50);
    const scale = Math.min(availW / GAME_W, availH / GAME_H);
    viewScale = scale * dpr;
    canvas.style.width = Math.floor(GAME_W * scale) + "px";
    canvas.style.height = Math.floor(GAME_H * scale) + "px";
    canvas.width = Math.floor(GAME_W * viewScale);
    canvas.height = Math.floor(GAME_H * viewScale);
  }
  function text(str, x, y, size, color, weight = "bold", alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = weight + " " + size + "px system-ui,'Segoe UI',sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }
  function dim(a) {
    ctx.fillStyle = "rgba(2,6,23," + a + ")";
    ctx.fillRect(0, 0, GAME_W, GAME_H);
  }
  function drawBackground() {
    if (!bgGrad) {
      bgGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
      bgGrad.addColorStop(0, "#0d1526");
      bgGrad.addColorStop(1, "#0a1020");
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    for (const s of stars) {
      const yy = (s.y + T * s.spd) % GAME_H;
      const a = 0.22 + 0.18 * Math.sin(T * 2 + s.ph);
      ctx.fillStyle = "rgba(148,163,184," + a.toFixed(3) + ")";
      ctx.fillRect(s.x, yy, s.r, s.r);
    }

    // ✅ নিচের touch zone hint (paddle উপরে তোলার কারণে)
    const tzTop = paddle.y + paddle.h + 10;
    if (tzTop < GAME_H - 20) {
      const g = ctx.createLinearGradient(0, tzTop, 0, GAME_H);
      g.addColorStop(0, "rgba(56,189,248,0.06)");
      g.addColorStop(1, "rgba(56,189,248,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, tzTop, GAME_W, GAME_H - tzTop);
      ctx.fillStyle = "rgba(124,138,165,0.35)";
      ctx.font = "600 10px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("◀   drag here to move   ▶", GAME_W / 2, GAME_H - 14);
    }

    ctx.strokeStyle = "rgba(56,189,248,0.22)";
    ctx.lineWidth = 2;
    rr(3, 3, GAME_W - 6, GAME_H - 6, 12);
    ctx.stroke();
  }
  function drawBricks() {
    for (const k of bricks) {
      if (k.hp <= 0) continue;
      ctx.fillStyle = ROW_COLORS[k.ci];
      rr(k.x, k.y, k.w, k.h, 4);
      ctx.fill();
      const dmg = k.maxHp - k.hp;
      if (dmg > 0) {
        ctx.fillStyle = "rgba(2,6,23," + 0.3 * dmg + ")";
        rr(k.x, k.y, k.w, k.h, 4);
        ctx.fill();
      }
      if (k.flash > 0) {
        ctx.fillStyle =
          "rgba(255,255,255," + ((k.flash / 0.12) * 0.75).toFixed(3) + ")";
        rr(k.x, k.y, k.w, k.h, 4);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(k.x + 3, k.y + 2, k.w - 6, 3);
    }
  }
  function drawPowerups() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of powerups) {
      const bob = Math.sin(p.t * 6) * 1.5;
      const x = p.x - 20,
        y = p.y - 9 + bob;
      ctx.fillStyle = POWER_COLORS[p.type];
      rr(x, y, 40, 18, 9);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.5;
      rr(x, y, 40, 18, 9);
      ctx.stroke();
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 12px system-ui,sans-serif";
      ctx.fillText(POWER_LETTER[p.type], p.x, p.y + bob + 0.5);
    }
  }
  function drawLasers() {
    ctx.fillStyle = "#fdba74";
    for (const l of lasers) {
      ctx.save();
      ctx.shadowColor = "#fb923c";
      ctx.shadowBlur = 8;
      ctx.fillRect(l.x - 2, l.y, 4, 16);
      ctx.restore();
    }
  }
  function drawPaddle() {
    const px = paddle.x - paddle.w / 2;
    ctx.save();
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 12;
    const g = ctx.createLinearGradient(px, 0, px + paddle.w, 0);
    g.addColorStop(0, "#0ea5e9");
    g.addColorStop(0.5, "#67e8f9");
    g.addColorStop(1, "#0ea5e9");
    ctx.fillStyle = g;
    rr(px, paddle.y, paddle.w, paddle.h, 7);
    ctx.fill();
    ctx.restore();
    if (effects.megapaddle > 0) {
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      rr(px - 2, paddle.y - 2, paddle.w + 4, paddle.h + 4, 9);
      ctx.stroke();
    }
    if (effects.laser > 0 || effects.mega > 0) {
      ctx.fillStyle = effects.mega > 0 ? "#facc15" : "#fb923c";
      ctx.fillRect(px + 5, paddle.y - 7, 6, 9);
      ctx.fillRect(px + paddle.w - 11, paddle.y - 7, 6, 9);
    }
  }
  function drawBalls() {
    const fire = effects.fireball > 0;
    for (const b of balls) {
      ctx.save();
      ctx.shadowColor = fire ? "#f97316" : "#67e8f9";
      ctx.shadowBlur = fire ? 22 : 16;
      ctx.fillStyle = fire ? "#fdba74" : "#f0fdff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + (fire ? 1.5 : 0), 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
  function drawFloaters() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.c;
      ctx.font = "bold 13px system-ui,sans-serif";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  function drawBanner() {
    if (!S.banner) return;
    const p = S.banner.t / S.banner.dur;
    const alpha = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
    const small = !!S.banner.small;
    const pop = 1 + Math.max(0, (small ? 0.22 : 0.35) - p) * 1.4;
    ctx.save();
    ctx.translate(GAME_W / 2, small ? 132 : 300);
    ctx.scale(pop, pop);
    text(
      S.banner.main,
      0,
      0,
      small ? 19 : 30,
      S.banner.color,
      "bold",
      Math.max(0, alpha),
    );
    if (S.banner.sub)
      text(
        S.banner.sub,
        0,
        small ? 24 : 30,
        small ? 12 : 14,
        "#e2e8f0",
        "bold",
        Math.max(0, alpha),
      );
    ctx.restore();
  }
  function drawEffectChips() {
    const chips = [];
    if (effects.wide > 0) chips.push(["WIDE", effects.wide, "#22d3ee"]);
    if (effects.slow > 0) chips.push(["SLOW", effects.slow, "#a78bfa"]);
    if (effects.laser > 0) chips.push(["LASER", effects.laser, "#fb923c"]);
    if (effects.fireball > 0) chips.push(["FIRE", effects.fireball, "#ef4444"]);
    if (effects.mega > 0) chips.push(["MEGA", effects.mega, "#facc15"]);
    if (effects.megapaddle > 0)
      chips.push(["PAD+", effects.megapaddle, "#4ade80"]);
    let cx = 12;
    ctx.textBaseline = "middle";
    for (const [name, t, col] of chips) {
      ctx.fillStyle = "rgba(15,23,42,0.62)";
      rr(cx, 10, 64, 20, 10);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      rr(cx, 10, 64, 20, 10);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = "bold 9px system-ui,sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(name, cx + 7, 21);
      ctx.textAlign = "right";
      ctx.fillText(Math.ceil(t) + "s", cx + 58, 21);
      cx += 70;
    }
  }
  function drawOverlay() {
    const pulse = 0.55 + 0.45 * Math.sin(T * 4);
    if (S.state === "menu") {
      dim(0.45);
    } else if (S.state === "serve") {
      // ✅ paddle উপরে তোলা, launch hint-ও paddle-এর নিচে
      text(
        "TAP / SPACE — LAUNCH",
        GAME_W / 2,
        paddle.y + 34,
        11,
        "#7c8aa5",
        "800",
        0.35 + 0.65 * pulse,
      );
    } else if (S.state === "levelup") {
      dim(0.55);
      text("LEVEL " + S.level + " CLEAR", GAME_W / 2, 316, 32, "#67e8f9");
      text(
        "BONUS +" + S.lastBonus.toLocaleString(),
        GAME_W / 2,
        360,
        16,
        "#fbbf24",
      );
      text(
        S.level % TROPHY_EVERY === 0
          ? "🏆 TROPHY ASHTECHE…"
          : "NEXT LEVEL LOADING…",
        GAME_W / 2,
        402,
        12,
        "#7c8aa5",
        "800",
        pulse,
      );
    } else if (S.state === "trophy") {
      dim(0.65);
      text("🏆", GAME_W / 2, 240, 76, "#fbbf24");
      text("TROPHY " + S.trophies + "!", GAME_W / 2, 338, 42, "#fbbf24");
      text(
        "Level " + S.level + " clear — Shabash!",
        GAME_W / 2,
        390,
        15,
        "#cbd5e1",
      );
      text(
        "BONUS +" + TROPHY_BONUS.toLocaleString(),
        GAME_W / 2,
        422,
        15,
        "#4ade80",
      );
      text(
        "Next level ashteche…",
        GAME_W / 2,
        536,
        11,
        "#7c8aa5",
        "800",
        pulse,
      );
    } else if (S.state === "paused") {
      dim(0.55);
    } else if (S.state === "gameover") {
      dim(0.6);
    }
  }
  function render() {
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    drawBackground();
    ctx.save();
    if (S.shake > 0)
      ctx.translate(rand(-1, 1) * S.shake * 8, rand(-1, 1) * S.shake * 8);
    drawBricks();
    drawPowerups();
    drawLasers();
    drawPaddle();
    drawBalls();
    drawParticles();
    drawFloaters();
    ctx.restore();
    if (S.state === "play" || S.state === "serve") {
      drawEffectChips();
      if (S.flash > 0) {
        ctx.fillStyle = "rgba(255,255,255," + (S.flash * 0.5).toFixed(3) + ")";
        ctx.fillRect(0, 0, GAME_W, GAME_H);
      }
      drawBanner();
    }
    drawOverlay();
  }

  /* ================= HUD ================= */
  function syncHud() {
    scoreEl.textContent = S.score.toLocaleString();
    bestEl.textContent = S.best.toLocaleString();
    levelEl.textContent = S.level;
  }
  function syncTrophy() {
    trophyEl.textContent = "🏆 " + S.trophies;
  }
  function syncCombo() {
    comboEl.textContent =
      (S.brickCount % 3) + "/3 · " + (S.brickCount % 10) + "/10";
  }
  function syncLives() {
    const shown = Math.max(3, S.lives);
    let html = "";
    for (let i = 0; i < shown; i++) {
      html +=
        '<span class="' +
        (i < S.lives ? "on" : "off") +
        '">' +
        (i < S.lives ? "♥" : "♡") +
        "</span>";
    }
    livesEl.innerHTML = html;
  }
  function toggleMute() {
    muted = !muted;
    save("bricksMuted", muted ? "1" : "0");
    soundBtn.textContent = muted ? "🔇" : "🔊";
    syncSoundSwitch();
  }
  function syncSoundSwitch() {
    soundSwitch.textContent = muted ? "🔇 OFF" : "🔊 ON";
    soundSwitch.classList.toggle("off", muted);
  }
  function togglePause() {
    if (S.state === "play" || S.state === "serve") {
      pausedFrom = S.state;
      S.state = "paused";
      pauseBtn.textContent = "▶";
    } else if (S.state === "paused") {
      S.state = pausedFrom;
      pauseBtn.textContent = "⏸";
    }
    syncOverlays();
  }
  let settingsVisible = false;
  function syncOverlays() {
    homeUI.classList.toggle(
      "hidden",
      !(S.state === "menu" && !settingsVisible),
    );
    settingsUI.classList.toggle("hidden", !settingsVisible);
    pauseUI.classList.toggle("hidden", S.state !== "paused");
    overUI.classList.toggle("hidden", S.state !== "gameover");
  }

  /* ================= input ================= */
  function primaryAction() {
    switch (S.state) {
      case "menu":
        if (!settingsVisible) startGame();
        break;
      case "serve":
        launch();
        break;
      case "play":
        if (effects.laser > 0) fireLaser();
        break;
      case "paused":
        togglePause();
        break;
      case "gameover":
        startGame();
        break;
      case "trophy":
        nextLevel();
        break;
    }
  }
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    if (r.width > 0)
      pointerX = clamp(((e.clientX - r.left) / r.width) * GAME_W, 0, GAME_W);
  });
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ac();
    const r = canvas.getBoundingClientRect();
    if (r.width > 0)
      pointerX = clamp(((e.clientX - r.left) / r.width) * GAME_W, 0, GAME_W);
    primaryAction();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      keys.left = true;
      e.preventDefault();
    }
    if (e.code === "ArrowRight" || e.code === "KeyD") {
      keys.right = true;
      e.preventDefault();
    }
    if (e.code === "ArrowUp" || e.code === "ArrowDown") e.preventDefault();
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      ac();
      primaryAction();
    }
    if (e.code === "KeyP") togglePause();
    if (e.code === "KeyM") toggleMute();
    if (e.code === "Escape" && settingsVisible) {
      settingsVisible = false;
      syncOverlays();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  });
  soundBtn.addEventListener("click", () => {
    toggleMute();
    soundBtn.blur();
  });
  pauseBtn.addEventListener("click", () => {
    togglePause();
    pauseBtn.blur();
  });
  playBtn.addEventListener("click", () => {
    ac();
    startGame();
    playBtn.blur();
  });
  settingsBtn.addEventListener("click", () => {
    settingsVisible = true;
    syncOverlays();
  });
  settingsClose.addEventListener("click", () => {
    settingsVisible = false;
    syncOverlays();
    settingsClose.blur();
  });
  soundSwitch.addEventListener("click", () => toggleMute());
  resumeBtn.addEventListener("click", () => togglePause());
  restartBtn.addEventListener("click", () => startGame());
  homeBtn.addEventListener("click", () => goHome());
  againBtn.addEventListener("click", () => startGame());
  homeBtn2.addEventListener("click", () => goHome());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (S.state === "play" || S.state === "serve"))
      togglePause();
  });
  window.addEventListener("blur", () => {
    if (S.state === "play" || S.state === "serve") togglePause();
  });
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  try {
    new ResizeObserver(resize).observe(stage);
  } catch (e) {}

  /* ================= loop & init ================= */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  soundBtn.textContent = muted ? "🔇" : "🔊";
  syncSoundSwitch();
  goHome();
  resize();
  requestAnimationFrame(frame);
})();
