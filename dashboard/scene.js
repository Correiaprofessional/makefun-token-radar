// The 3D skyline: one vertical tower per board row, drawn with hand-written WebGL1.
// One program, one draw call: towers and a floor grid are baked into a single Float32Array.
// Plain script, no imports; exposes window.RADAR_SCENE.create(canvas, rows, onPick).
(function () {
  'use strict';

  var STRIDE = 11; // position 3, normal 3, colour 4, tower id 1
  var DEG = Math.PI / 180;

  var VERT = [
    'attribute vec3 aPos; attribute vec3 aNrm; attribute vec4 aCol; attribute float aId;',
    'uniform mat4 uVP;',
    'varying vec3 vP; varying vec3 vN; varying vec4 vC; varying float vId;',
    'void main() { vP = aPos; vN = aNrm; vC = aCol; vId = aId; gl_Position = uVP * vec4(aPos, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'uniform vec3 uEye; uniform float uFade; uniform float uTop; uniform float uHover;',
    'varying vec3 vP; varying vec3 vN; varying vec4 vC; varying float vId;',
    'void main() {',
    '  float d = distance(vP.xz, uEye.xz);',
    '  float fade = 1.0 - smoothstep(uFade * 0.45, uFade, d);',
    '  float a = vC.a * fade;',
    '  if (dot(vN, vN) < 0.25) { gl_FragColor = vec4(vC.rgb * a, a); return; }',
    '  a = vC.a * (0.35 + 0.65 * fade);',
    '  float lit = 0.5 + 0.5 * clamp(dot(normalize(vN), normalize(vec3(0.4, 0.8, 0.5))), 0.0, 1.0);',
    '  float g = mix(0.5, 1.0, clamp(vP.y / uTop, 0.0, 1.0));',
    '  vec3 c = vC.rgb * lit * g + (vN.y > 0.5 ? vec3(0.14) : vec3(0.0));',
    '  if (uHover > -0.5) c = abs(vId - uHover) < 0.5 ? mix(c, vec3(1.0), 0.2) : c * 0.8;',
    '  gl_FragColor = vec4(c * a, a);',
    '}'
  ].join('\n');

  // Column-major 4x4 helpers.
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far);
    return m;
  }

  function lookAt(e, t, up) {
    var zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2], zl = Math.hypot(zx, zy, zz);
    zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx, xl = Math.hypot(xx, xy, xz);
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  }

  function multiply(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  }

  // Point through a matrix, returning clip-space x, y, w.
  function transform(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[3] * x + m[7] * y + m[11] * z + m[15]];
  }

  function hex(h, a) {
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a];
  }

  function create(canvas, rows, onPick) {
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: true }) ||
        canvas.getContext('experimental-webgl', { antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (e) { gl = null; }
    if (!gl) return null;

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }
    var vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
    var prog = gl.createProgram();
    if (vs && fs) { gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); }
    if (!vs || !fs || !gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      gl.deleteProgram(prog);
      return null;
    }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    var U = {};
    ['uVP', 'uEye', 'uFade', 'uTop', 'uHover'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    var attrs = [['aPos', 3, 0], ['aNrm', 3, 3], ['aCol', 4, 6], ['aId', 1, 10]];
    attrs.forEach(function (a) {
      var loc = gl.getAttribLocation(prog, a[0]);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a[1], gl.FLOAT, false, STRIDE * 4, a[2] * 4);
    });
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var F = window.RADAR_FORMAT;
    var cam = { yaw: 30 * DEG, pitch: 40 * DEG, fit: 64 };
    var towers = [], count = 0, top = 1, hover = -1, vp = null, raf = 0, drag = null, dead = false;
    var width = 1, height = 1, dpr = 1;

    var vertices;
    // Only the head of the board becomes a skyline: past sixty towers a bar is thinner than a pixel,
    // so the picture stops reading as towers. The table below still carries every row.
    var SKYLINE_ROWS = 60;
    function bake(list) {
      list = list.slice(0, SKYLINE_ROWS);
      var n = list.length, maxV = 1;
      list.forEach(function (r) { if (r.implied_value_usd > maxV) maxV = r.implied_value_usd; });
      top = Math.min(30, Math.max(8, n * 0.5 + 6));
      var out = [], span = Math.max(n, 12);
      function quad(a, b, c, d, nx, ny, nz, col, id) {
        [a, b, c, a, c, d].forEach(function (p) { out.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], col[3], id); });
      }
      // Floor grid: thin flat quads, hairlines in the azure tone.
      var gx = Math.min(120, span / 2 + 18), gz = 56, lw = 0.05, grid = hex('#6ad7ff', 0.38), axis = hex('#2ee6a8', 0.5);
      for (var x = -Math.ceil(gx / 4) * 4; x <= gx; x += 4) quad([x - lw, -0.02, -gz], [x + lw, -0.02, -gz], [x + lw, -0.02, gz], [x - lw, -0.02, gz], 0, 0, 0, x === 0 ? axis : grid, -1);
      for (var z = -gz; z <= gz; z += 4) quad([-gx, -0.02, z - lw], [gx, -0.02, z - lw], [gx, -0.02, z + lw], [-gx, -0.02, z + lw], 0, 0, 0, z === 0 ? axis : grid, -1);
      towers = [];
      var hw = 0.36;
      list.forEach(function (r, i) {
        var tone = F.toneOf(r);
        var col = hex(F.TONES[tone], tone === 5 ? 0.8 : 1);
        var cx = (i - (n - 1) / 2), h = Math.max(0.25, Math.cbrt(Math.max(r.implied_value_usd, 0) / maxV) * top);
        towers.push({ slug: r.slug, x: cx, h: h, rank: r.rank, name: r.name, value: r.implied_value_usd, category: r.category || 'Uncategorised' });
        var x0 = cx - hw, x1 = cx + hw, z0 = -hw, z1 = hw;
        quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], 0, 0, 1, col, i);
        quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], 0, 0, -1, col, i);
        quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], 1, 0, 0, col, i);
        quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], -1, 0, 0, col, i);
        quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], 0, 1, 0, col, i);
      });
      vertices = new Float32Array(out);
      count = vertices.length / STRIDE;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      // Distance that fits the whole row across the canvas, or the tallest tower for short rows.
      var aspect = width / height, half = Math.max(n, 8) / 2 + 2;
      cam.fit = Math.max(half / (Math.tan(20 * DEG) * aspect) * 0.92, top * 3.4, 22);
      hover = -1;
      if (tip) hideTip();
    }

    function matrices(time) {
      var yaw = cam.yaw + (reduce || drag ? 0 : Math.sin(time / 6000 * 2 * Math.PI) * 1.2 * DEG);
      var d = cam.fit, cp = Math.cos(cam.pitch);
      var t = [0, top * 0.3, 0];
      var e = [t[0] + d * cp * Math.sin(yaw), t[1] + d * Math.sin(cam.pitch), t[2] + d * cp * Math.cos(yaw)];
      var proj = perspective(40 * DEG, width / height, 0.5, d * 6);
      return { vp: multiply(proj, lookAt(e, t, [0, 1, 0])), eye: e, dist: d };
    }

    function draw(time) {
      if (dead) return;
      var m = matrices(time || 0);
      vp = m.vp;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U.uVP, false, vp);
      gl.uniform3f(U.uEye, m.eye[0], m.eye[1], m.eye[2]);
      gl.uniform1f(U.uFade, Math.max(m.dist * 2.2, 60));
      gl.uniform1f(U.uTop, top);
      gl.uniform1f(U.uHover, hover);
      gl.drawArrays(gl.TRIANGLES, 0, count);
    }

    function loop(time) {
      draw(time);
      raf = requestAnimationFrame(loop);
    }
    function redraw() { if (reduce || !raf) draw(0); }

    function project(x, y) {
      var p = transform(vp, x, y, 0);
      return p[2] > 0 ? [(p[0] / p[2] * 0.5 + 0.5) * width, (1 - (p[1] / p[2] * 0.5 + 0.5)) * height] : null;
    }

    // Nearest tower within 14 CSS pixels of the pointer, measured to its base-to-top line on screen, or -1.
    function pick(px, py) {
      if (!vp) return -1;
      var best = -1, bd = 14;
      for (var i = 0; i < towers.length; i++) {
        var a = project(towers[i].x, 0), b = project(towers[i].x, towers[i].h);
        if (!a || !b) continue;
        var vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
        var t = l2 ? Math.min(1, Math.max(0, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0;
        var dd = Math.hypot(a[0] + vx * t - px, a[1] + vy * t - py);
        if (dd < bd) { bd = dd; best = i; }
      }
      return best;
    }

    function local(e) {
      var r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    // Tooltip: a plain DOM node moved with translate3d; 8px from the pointer, flipped near the viewport edge.
    var tip = document.createElement('div'), tipIn = document.createElement('div');
    tip.className = 'tip';
    tip.setAttribute('aria-hidden', 'true');
    tip.appendChild(tipIn);
    document.body.appendChild(tip);
    function showTip(i, cx, cy) {
      var t = towers[i];
      if (!t) return;
      if (tip.dataset.slug !== t.slug) {
        tip.dataset.slug = t.slug;
        tipIn.textContent = '';
        [['b', '#' + String(t.rank).padStart(3, '0') + '  ' + t.name], ['span', F.formatUsd(t.value) + ' \u00B7 ' + t.category]].forEach(function (p) {
          var n = document.createElement(p[0]);
          n.textContent = p[1];
          tipIn.appendChild(n);
        });
      }
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var x = cx + 8, y = cy + 8;
      if (x + w > window.innerWidth - 8) x = cx - 8 - w;
      if (y + h > window.innerHeight - 8) y = cy - 8 - h;
      tip.style.transform = 'translate3d(' + Math.max(x, 8) + 'px,' + Math.max(y, 8) + 'px,0)';
      tip.classList.add('on');
    }
    function hideTip() { tip.classList.remove('on'); delete tip.dataset.slug; }
    function setHover(i, cx, cy) {
      if (i !== hover) { hover = i; canvas.style.cursor = i >= 0 ? 'pointer' : 'grab'; }
      if (i >= 0) showTip(i, cx, cy); else hideTip();
      redraw();
    }

    function onDown(e) {
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      setHover(-1);
    }
    function onMove(e) {
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX; drag.y = e.clientY;
        cam.yaw -= dx * 0.006;
        cam.pitch = Math.min(70 * DEG, Math.max(5 * DEG, cam.pitch + dy * 0.005));
        redraw();
      } else {
        var p = local(e);
        setHover(pick(p[0], p[1]), e.clientX, e.clientY);
      }
    }
    function onUp(e) {
      if (!drag) return;
      var click = drag.moved < 5;
      drag = null;
      canvas.style.cursor = 'grab';
      if (click) {
        var p = local(e), i = pick(p[0], p[1]);
        if (i >= 0 && onPick) onPick(towers[i].slug);
      }
      redraw();
    }
    function onLeave() { if (!drag) setHover(-1); }

    // Keyboard parity: arrows walk the towers, Enter opens the labelled one.
    function focusTower(i) {
      i = Math.min(towers.length - 1, Math.max(0, i));
      var p = project(towers[i].x, towers[i].h), r = canvas.getBoundingClientRect();
      if (p) setHover(i, r.left + p[0], r.top + p[1]);
    }
    function onKey(e) {
      if (!towers.length) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); focusTower((hover < 0 ? 0 : hover) + (e.key === 'ArrowRight' ? 1 : -1) * (hover < 0 ? 0 : 1)); }
      else if (e.key === 'Enter' && hover >= 0 && onPick) { e.preventDefault(); onPick(towers[hover].slug); }
      else if (e.key === 'Escape') setHover(-1);
    }
    function onFocus() { if (hover < 0 && towers.length && canvas.matches(':focus-visible')) focusTower(0); }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(canvas.clientWidth, 1), h = Math.max(canvas.clientHeight, 1);
      width = w; height = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (vertices) bake(towersRows);
      redraw();
    }

    var towersRows = rows || [];
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    var events = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp], ['pointerleave', onLeave],
      ['keydown', onKey], ['focus', onFocus], ['blur', onLeave]];
    events.forEach(function (p) { canvas.addEventListener(p[0], p[1]); });
    var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize);
    width = Math.max(canvas.clientWidth, 1); height = Math.max(canvas.clientHeight, 1);
    resize();
    bake(towersRows);
    draw(0);
    if (!reduce) raf = requestAnimationFrame(loop);

    return {
      setRows: function (list) {
        towersRows = list || [];
        bake(towersRows);
        redraw();
      },
      dispose: function () {
        dead = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        events.forEach(function (p) { canvas.removeEventListener(p[0], p[1]); });
        tip.remove();
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    };
  }

  window.RADAR_SCENE = { create: create };
})();
