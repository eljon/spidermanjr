(() => {
  'use strict';

  const STORAGE_KEY = 'spidermanjr.collection.v1';
  const SOUND_KEY = 'spidermanjr.sound';
  const MAX_ITEMS = 48;
  const WAIT_BEFORE_GRAB_MS = 2000;
  const THUMB_W = 360;
  const THUMB_H = 450;
  const VIDEO_THUMB_TIMEOUT_MS = 4000;

  const $ = (sel) => document.querySelector(sel);
  const els = {
    stage: $('#stage'),
    empty: $('#empty'),
    status: $('#status'),
    shelf: $('#shelf'),
    list: $('#shelf-items'),
    shelfEmpty: $('#shelf-empty'),
    count: $('#count'),
    captureInput: $('#capture-input'),
    emptyHint: $('#empty-hint'),
    webLayer: $('#web-layer'),
    strandA: $('#strand-a'),
    strandB: $('#strand-b'),
    thwip: $('#thwip'),
    soundBtn: $('#sound-toggle'),
    viewer: $('#viewer'),
    viewerImg: $('#viewer-img'),
    viewerVideo: $('#viewer-video'),
    viewerCap: $('#viewer-cap'),
    viewerRemove: $('#viewer-remove'),
    viewerClose: $('#viewer-close'),
  };

  const state = {
    busy: false,
    items: loadItems(),
    sound: loadSound(),
    viewingId: null,
  };

  // ---------- Storage ----------

  function loadItems() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed)
        ? parsed.filter((it) => it && typeof it.src === 'string' && it.src.startsWith('data:image/'))
        : [];
    } catch {
      return [];
    }
  }

  function saveItems() {
    let items = state.items.slice(0, MAX_ITEMS);
    // If storage is full, drop the oldest catches until it fits.
    for (;;) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        return;
      } catch {
        if (items.length <= 1) return;
        items = items.slice(0, -1);
      }
    }
  }

  // Videos are too big for localStorage, so their files live in IndexedDB keyed by item id.
  const mediaStore = (() => {
    let dbPromise = null;

    function open() {
      if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
          const req = indexedDB.open('spidermanjr', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('media');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return dbPromise;
    }

    async function run(mode, fn) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('media', mode);
        const req = fn(tx.objectStore('media'));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }

    const safe = (p) => p.catch(() => undefined);
    return {
      put: (id, blob) => safe(run('readwrite', (st) => st.put(blob, id))),
      get: (id) => safe(run('readonly', (st) => st.get(id))),
      remove: (id) => safe(run('readwrite', (st) => st.delete(id))),
    };
  })();

  function loadSound() {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  // ---------- Helpers ----------

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpPt = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInCubic = (t) => t * t * t;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const quadBezier = (p0, p1, p2, t) => ({
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  });
  const pad = (n) => String(n).padStart(2, '0');
  const tiltFor = (n) => ((n * 37) % 9) - 4;

  function tween(duration, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / duration);
        onFrame(t);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  function setStatus(text, alert = false) {
    els.status.textContent = text;
    els.status.classList.toggle('alert', alert);
  }

  function setControlsEnabled(enabled) {
    els.captureInput.disabled = !enabled;
  }

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      /* not supported */
    }
  }

  // ---------- Generated SVG shapes ----------

  // A classic web splat: spokes plus sagging rings between them.
  const SPLAT_D = (() => {
    const jitter = [0.08, -0.12, 0.05, 0.14, -0.06, 0.1, -0.1, 0.03, -0.04];
    const n = jitter.length;
    const R = 48;
    const angles = jitter.map((j, i) => (i / n) * Math.PI * 2 + j);
    let d = '';
    for (const a of angles) {
      d += `M0 0L${(Math.cos(a) * R).toFixed(1)} ${(Math.sin(a) * R).toFixed(1)}`;
    }
    for (const ring of [13, 25, 37]) {
      for (let i = 0; i < n; i++) {
        const a1 = angles[i];
        const a2 = i + 1 < n ? angles[i + 1] : angles[0] + Math.PI * 2;
        const mid = (a1 + a2) / 2;
        const c = ring * 0.78;
        d +=
          `M${(Math.cos(a1) * ring).toFixed(1)} ${(Math.sin(a1) * ring).toFixed(1)}` +
          `Q${(Math.cos(mid) * c).toFixed(1)} ${(Math.sin(mid) * c).toFixed(1)} ` +
          `${(Math.cos(a2) * ring).toFixed(1)} ${(Math.sin(a2) * ring).toFixed(1)}`;
      }
    }
    return d;
  })();

  // Zigzag "spidey sense" lines radiating from around the photo.
  const SENSE_D = (() => {
    const degs = [-150, -125, -100, -80, -55, -30, 150, 125, 30, 55];
    let d = '';
    for (const deg of degs) {
      const a = (deg * Math.PI) / 180;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const px = -uy;
      const py = ux;
      const sx = 50 + ux * 40;
      const sy = 50 + uy * 44;
      d += `M${sx.toFixed(1)} ${sy.toFixed(1)}`;
      for (let k = 1; k <= 4; k++) {
        const side = k % 2 ? 1.6 : -1.6;
        const x = sx + ux * k * 2.4 + px * side;
        const y = sy + uy * k * 2.4 + py * side;
        d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    return d;
  })();

  // ---------- Sound (synthesized, no audio files) ----------

  const sfx = (() => {
    let ctx = null;

    function ensure() {
      if (!state.sound) return null;
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          ctx = new AC();
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch {
        return null;
      }
      return ctx;
    }

    function thwip() {
      const c = ensure();
      if (!c) return;
      const len = 0.24;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 3;
      const t = c.currentTime;
      bp.frequency.setValueAtTime(5000, t);
      bp.frequency.exponentialRampToValueAtTime(600, t + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1.2, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(bp).connect(g).connect(c.destination);
      src.start(t);
      src.stop(t + len);
    }

    function thud() {
      const c = ensure();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(170, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    }

    return { unlock: ensure, thwip, thud };
  })();

  // ---------- Shelf ----------

  function makeSlot(item) {
    const li = document.createElement('li');
    li.className = 'slot';
    li.dataset.id = item.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = item.type === 'video' ? 'polaroid is-video' : 'polaroid';
    btn.style.setProperty('--tilt', `${tiltFor(item.n)}deg`);
    btn.setAttribute('aria-label', `Open ${item.type === 'video' ? 'video' : 'photo'} number ${item.n}`);
    const ph = document.createElement('span');
    ph.className = 'ph';
    const img = document.createElement('img');
    img.alt = '';
    img.src = item.src;
    ph.append(img);
    const cap = document.createElement('span');
    cap.className = 'cap';
    cap.textContent = `No. ${pad(item.n)}`;
    btn.append(ph, cap);
    li.append(btn);
    return li;
  }

  function renderShelf() {
    els.list.replaceChildren(...state.items.map(makeSlot));
    els.shelfEmpty.hidden = state.items.length > 0;
    els.count.textContent = String(state.items.length);
  }

  function nextNumber() {
    return state.items.reduce((max, it) => Math.max(max, it.n || 0), 0) + 1;
  }

  // ---------- Photo handling ----------

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = url;
    });
  }

  // Resolves once the video has a frame ready to draw.
  function loadVideo(url) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onloadeddata = () => resolve(video);
      video.onerror = () => reject(new Error('Could not load video'));
      video.src = url;
      video.load();
    });
  }

  // Center-crop to the polaroid's 4:5 window, matching object-fit: cover on the card.
  function makeThumb(source, srcW, srcH) {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1c1c24';
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    if (srcW && srcH) {
      const s = Math.max(THUMB_W / srcW, THUMB_H / srcH);
      const w = srcW * s;
      const h = srcH * s;
      ctx.drawImage(source, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
    }
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  // Grab a frame a little way into the clip (the very first frame is often black).
  async function makeVideoThumb(video) {
    const frameAt = Math.min(0.5, (video.duration || 0) / 2);
    if (frameAt > 0) {
      await Promise.race([
        new Promise((r) => {
          video.onseeked = r;
          video.currentTime = frameAt;
        }),
        wait(VIDEO_THUMB_TIMEOUT_MS),
      ]);
    }
    try {
      return makeThumb(video, video.videoWidth, video.videoHeight);
    } catch {
      return makeThumb(null, 0, 0);
    }
  }

  const isVideoFile = (file) =>
    file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm|3gp|mkv)$/i.test(file.name || '');

  function createCard(src, n, isVideo) {
    const fig = document.createElement('figure');
    fig.className = 'polaroid card enter';
    const media = isVideo
      ? '<video muted autoplay loop playsinline></video>'
      : '<img alt="Your photo">';
    fig.innerHTML =
      `<div class="ph">${media}</div>` +
      '<figcaption class="cap"></figcaption>' +
      `<svg class="sense" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${SENSE_D}"/></svg>` +
      `<svg class="splat" viewBox="-50 -50 100 100" aria-hidden="true"><path d="${SPLAT_D}"/></svg>`;
    if (isVideo) {
      const video = fig.querySelector('video');
      video.muted = true;
      video.src = src;
      video.play().catch(() => {});
    } else {
      fig.querySelector('img').src = src;
    }
    fig.querySelector('.cap').textContent = `No. ${pad(n)}`;
    return fig;
  }

  async function handleFile(file) {
    if (!file || state.busy) return;
    state.busy = true;
    setControlsEnabled(false);

    const isVideo = isVideoFile(file);
    const kind = isVideo ? 'video' : 'photo';
    const url = URL.createObjectURL(file);
    let thumb;
    try {
      if (isVideo) {
        thumb = await makeVideoThumb(await loadVideo(url));
      } else {
        const img = await loadImage(url);
        thumb = makeThumb(img, img.naturalWidth, img.naturalHeight);
      }
    } catch {
      URL.revokeObjectURL(url);
      setStatus(`Hmm, that ${kind} couldn't be opened. Try again.`, true);
      state.busy = false;
      setControlsEnabled(true);
      return;
    }

    const n = nextNumber();
    const item = { id: `${Date.now()}-${n}`, n, src: thumb, type: kind };
    const saved = isVideo ? mediaStore.put(item.id, file) : Promise.resolve();
    const card = createCard(url, n, isVideo);
    els.empty.hidden = true;
    els.stage.append(card);
    setStatus(isVideo ? 'Great clip! Hold still...' : 'Nice shot! Hold still...');

    await wait(WAIT_BEFORE_GRAB_MS - 700);
    card.classList.add('tingle');
    setStatus('Spidey sense tingling!', true);
    vibrate([15, 40, 15]);
    await wait(700);
    card.classList.remove('tingle');

    await webGrab(card, item);
    await saved;

    URL.revokeObjectURL(url);
    els.empty.hidden = false;
    els.emptyHint.textContent = 'Got it! Take another one for your shelf.';
    setStatus(`Caught No. ${pad(n)}! It's on your shelf.`);
    state.busy = false;
    setControlsEnabled(true);
  }

  // ---------- Web drawing ----------

  // Strand from a (off-screen shooter) to b (the photo). sag bows it downward when slack.
  function drawWeb(a, b, sag = 0) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 + sag;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 2.5;
    const ny = (dx / len) * 2.5;
    els.strandA.setAttribute('d', `M${a.x} ${a.y}Q${mx} ${my} ${b.x} ${b.y}`);
    els.strandB.setAttribute('d', `M${a.x + nx} ${a.y + ny}Q${mx - nx} ${my - ny + sag * 0.3} ${b.x} ${b.y}`);
  }

  function clearWeb() {
    els.strandA.removeAttribute('d');
    els.strandB.removeAttribute('d');
  }

  function showThwip(y) {
    els.thwip.style.top = `${Math.max(8, y - 60)}px`;
    els.thwip.classList.remove('show');
    void els.thwip.offsetWidth; // restart the animation
    els.thwip.classList.add('show');
  }

  // ---------- The grab ----------

  async function webGrab(card, item) {
    // Reserve the landing spot at the front of the shelf.
    const pending = makeSlot(item);
    pending.classList.add('pending');
    els.list.prepend(pending);
    els.list.scrollLeft = 0;
    els.shelfEmpty.hidden = true;

    // Lift the card out of the layout so it can fly anywhere on screen.
    card.classList.remove('enter', 'tingle');
    const r = card.getBoundingClientRect();
    const W = r.width;
    const H = r.height;
    card.style.setProperty('--w', `${W}px`);
    card.style.left = `${r.left}px`;
    card.style.top = `${r.top}px`;
    card.classList.add('flying');
    document.body.append(card);

    const c0 = { x: r.left + W / 2, y: r.top + H / 2 };
    const anchorLocal = { x: W * 0.12, y: -H * 0.2 }; // where the web sticks, relative to the card center
    const vw = window.innerWidth;
    const shooter = { x: vw + 14, y: Math.max(30, r.top - H * 0.12) };
    const pose = { x: c0.x, y: c0.y, s: 1, rot: 0 };

    const apply = () => {
      card.style.transform =
        `translate(${pose.x - c0.x}px, ${pose.y - c0.y}px) rotate(${pose.rot}deg) scale(${pose.s})`;
    };
    const anchor = () => {
      const rad = (pose.rot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const lx = anchorLocal.x * pose.s;
      const ly = anchorLocal.y * pose.s;
      return { x: pose.x + lx * cos - ly * sin, y: pose.y + lx * sin + ly * cos };
    };

    // 1. Shoot: the strand races in from the right edge.
    setStatus('THWIP!', true);
    showThwip(shooter.y);
    sfx.thwip();
    await tween(240, (t) => drawWeb(shooter, lerpPt(shooter, anchor(), easeOutCubic(t))));

    // 2. Impact: splat sticks and the photo gets tugged toward the shooter.
    card.classList.add('hit');
    vibrate(30);
    const dir = { x: shooter.x - c0.x, y: shooter.y - c0.y };
    const dirLen = Math.hypot(dir.x, dir.y) || 1;
    await tween(260, (t) => {
      const k = easeOutBack(t);
      pose.x = c0.x + (dir.x / dirLen) * 22 * k;
      pose.y = c0.y + (dir.y / dirLen) * 22 * k;
      pose.rot = 6 * k;
      apply();
      drawWeb(shooter, anchor());
    });

    // 3. Pull: swing up and back onto the shelf, shrinking into the reserved slot.
    const slotRect = pending.getBoundingClientRect();
    const target = { x: slotRect.left + slotRect.width / 2, y: slotRect.top + slotRect.height / 2 };
    const targetScale = slotRect.width / W;
    const targetRot = tiltFor(item.n);
    const p0 = { x: pose.x, y: pose.y };
    const r0 = pose.rot;
    const ctrl = {
      x: Math.min(vw * 0.98, Math.max(p0.x, target.x) + vw * 0.38),
      y: Math.min(p0.y, target.y) - 40,
    };
    await tween(950, (t) => {
      const e = easeInOutCubic(t);
      const p = quadBezier(p0, ctrl, target, e);
      pose.x = p.x;
      pose.y = p.y;
      pose.s = lerp(1, targetScale, easeInOutCubic(Math.min(1, t * 1.1)));
      pose.rot = lerp(r0, targetRot, e) + 16 * Math.sin(Math.PI * e);
      apply();
      drawWeb(shooter, anchor());
    });

    // 4. Land: small bounce on the shelf while the web lets go and zips back.
    card.classList.add('landed');
    sfx.thud();
    vibrate(15);
    const release = anchor();
    await Promise.all([
      tween(220, (t) => {
        pose.s = targetScale * (1 + 0.12 * Math.sin(Math.PI * t));
        apply();
      }),
      tween(280, (t) => drawWeb(shooter, lerpPt(release, shooter, easeInCubic(t)), 40 * (1 - t))),
    ]);
    clearWeb();

    // Hand off to the real shelf item, which sits exactly where the card landed.
    state.items.unshift(item);
    for (const old of state.items.splice(MAX_ITEMS)) mediaStore.remove(old.id);
    saveItems();
    renderShelf();
    card.remove();
    els.count.classList.remove('bump');
    void els.count.offsetWidth;
    els.count.classList.add('bump');
  }

  // ---------- Viewer ----------

  async function openViewer(id) {
    const item = state.items.find((it) => it.id === id);
    if (!item) return;
    state.viewingId = id;
    const label = `${item.type === 'video' ? 'Video' : 'Photo'} number ${item.n}`;
    els.viewerImg.src = item.src;
    els.viewerImg.alt = label;
    els.viewerImg.hidden = false;
    els.viewerVideo.hidden = true;
    els.viewerCap.textContent = `No. ${pad(item.n)}`;
    if (typeof els.viewer.showModal === 'function') els.viewer.showModal();
    else els.viewer.setAttribute('open', '');

    if (item.type !== 'video') return;
    const blob = await mediaStore.get(id);
    if (!blob || state.viewingId !== id) return;
    els.viewerVideo.src = URL.createObjectURL(blob);
    els.viewerVideo.setAttribute('aria-label', label);
    els.viewerVideo.hidden = false;
    els.viewerImg.hidden = true;
    els.viewerVideo.play().catch(() => {});
  }

  function closeViewer() {
    state.viewingId = null;
    els.viewerVideo.pause();
    if (els.viewerVideo.src) {
      URL.revokeObjectURL(els.viewerVideo.src);
      els.viewerVideo.removeAttribute('src');
      els.viewerVideo.load();
    }
    if (typeof els.viewer.close === 'function') els.viewer.close();
    else els.viewer.removeAttribute('open');
  }

  // ---------- Wiring ----------

  els.captureInput.addEventListener('change', () => {
    const file = els.captureInput.files && els.captureInput.files[0];
    els.captureInput.value = '';
    handleFile(file);
  });

  // Audio must be unlocked by a user gesture (tapping a button counts).
  document.addEventListener('pointerdown', () => sfx.unlock(), { passive: true });

  function syncSoundButton() {
    els.soundBtn.setAttribute('aria-pressed', String(state.sound));
    els.soundBtn.setAttribute('aria-label', state.sound ? 'Sound on' : 'Sound off');
  }
  els.soundBtn.addEventListener('click', () => {
    state.sound = !state.sound;
    try {
      localStorage.setItem(SOUND_KEY, state.sound ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    syncSoundButton();
  });

  els.list.addEventListener('click', (e) => {
    const slot = e.target.closest('.slot');
    if (slot && !slot.classList.contains('pending')) openViewer(slot.dataset.id);
  });
  els.viewerClose.addEventListener('click', closeViewer);
  els.viewerRemove.addEventListener('click', () => {
    mediaStore.remove(state.viewingId);
    state.items = state.items.filter((it) => it.id !== state.viewingId);
    saveItems();
    renderShelf();
    closeViewer();
  });
  els.viewer.addEventListener('close', () => {
    if (state.viewingId) closeViewer();
  });
  els.viewer.addEventListener('click', (e) => {
    if (e.target === els.viewer) closeViewer();
  });

  syncSoundButton();
  renderShelf();
})();
