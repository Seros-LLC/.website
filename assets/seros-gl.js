/* ==========================================================================
   seros-gl.js — two WebGL layers for the Seros home page

   The brand is a printed one: laid paper, ink navy, a steel-engraved figure.
   So neither of these effects is a glow. They are printing effects.

   1. The plate. A guilloche field — the interference pattern engine-turned
      into banknotes, share certificates and passports — drawn behind the
      hero in steel and sky, turning slowly enough that you notice it only
      if you look. Mounts into [data-plate].

   2. The impression. The engraving in the hero is re-printed every frame:
      two ink plates very slightly out of register, cross-hatching that
      deepens in the shadows, paper grain, and a rake light that moves with
      the pointer so the sheet catches the light as you read. Mounts onto
      [data-impression] and uses the <img> inside it as its plate.

   Both are optional. No WebGL, a failed shader, a reader who asked for less
   motion, or this file never loading all leave the page exactly as it is.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------- plumbing */
  function context(canvas) {
    var opts = { alpha: true, antialias: false, depth: false, stencil: false,
                 premultipliedAlpha: false, powerPreference: 'low-power' };
    var gl = null;
    try {
      gl = canvas.getContext('webgl2', opts) ||
           canvas.getContext('webgl', opts) ||
           canvas.getContext('experimental-webgl', opts);
    } catch (e) { gl = null; }
    return gl;
  }

  function build(gl, fsBody) {
    var vs = 'attribute vec2 aQuad;\nvarying vec2 vUV;\n' +
             'void main(){ vUV = aQuad * 0.5 + 0.5; gl_Position = vec4(aQuad, 0.0, 1.0); }';
    // No fwidth anywhere: the line widths below are worked out analytically,
    // so the same shader source compiles on WebGL1 and WebGL2 alike.
    var head = 'precision highp float;\nvarying vec2 vUV;\n';
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) || 'compile failed');
      }
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, head + fsBody));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || 'link failed');
    }
    gl.useProgram(p);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var a = gl.getAttribLocation(p, 'aQuad');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    return p;
  }

  // Every rule these canvases depend on is set here, in JavaScript, on
  // purpose. /assets/* is served `immutable` for a year under an unversioned
  // filename, so a returning reader can arrive with a year-old stylesheet and
  // today's markup. A layer that needed a new CSS rule to be positioned would
  // then land in the document flow and shove the page apart. This one cannot.
  function place(host, canvas, extra) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;' +
      'display:block;pointer-events:none;opacity:0;' + (extra || '');
  }

  function reveal(canvas, seconds) {
    window.requestAnimationFrame(function () {
      canvas.style.transition = 'opacity ' + seconds + 's ease';
      canvas.style.opacity = '1';
    });
  }

  function brandColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var m = /^#([0-9a-f]{6})$/i.exec(v);
    if (!m) return fallback;
    var n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // One shared clock and one shared pointer, so the two layers agree about
  // where the light is coming from.
  var t0 = performance.now();
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', function (e) {
    pointer.tx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    pointer.ty = -(e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
  }, { passive: true });

  // A shared loop: one requestAnimationFrame for the whole page, not one per
  // layer, and none at all while nothing is on screen.
  var layers = [];
  var ticking = false;
  function tick() {
    var live = false;
    pointer.x += (pointer.tx - pointer.x) * 0.055;
    pointer.y += (pointer.ty - pointer.y) * 0.055;
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].visible) { layers[i].draw(); live = true; }
    }
    if (!live || reduced) { ticking = false; return; }
    window.requestAnimationFrame(tick);
  }
  function wake() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(tick);
  }
  function register(layer, watch) {
    layer.visible = true;
    layers.push(layer);
    if (window.IntersectionObserver) {
      layer.visible = false;
      new IntersectionObserver(function (es) {
        layer.visible = es[0].isIntersecting;
        if (layer.visible) wake();
      }, { threshold: 0 }).observe(watch);
    }
    if (window.ResizeObserver) {
      new ResizeObserver(function () { layer.resize(); wake(); }).observe(watch);
    } else {
      window.addEventListener('resize', function () { layer.resize(); wake(); }, { passive: true });
    }
    wake();
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) wake();
  });

  /* ------------------------------------------------------------ 1. plate */
  var PLATE_FS = [
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform vec2 uPointer;',
    'uniform vec3 uSteel, uSky, uInk;',

    // One engine-turned rosette: concentric line work whose radius is
    // modulated by a rose curve. Two of them, laid over each other at
    // different pitches, is what makes the moire a guilloche. `px` is one
    // screen pixel in scene units, which is how each line gets exactly one
    // pixel of softness without asking the GPU for derivatives.
    'float rosette(vec2 p, float petals, float pitch, float depth, float phase, float px) {',
    '  float r = max(length(p), 0.04);',
    '  float a = atan(p.y, p.x);',
    '  float bulge = 0.35 + 0.65 * r;',
    '  float rr = r + depth * sin(a * petals + phase) * bulge;',
    '  float v = rr * pitch + phase * 0.5;',
    '  float w = pitch * px * (1.0 + depth * petals * bulge / r) * 0.9 + 0.0008;',
    '  float line = 1.0 - smoothstep(0.0, w, abs(sin(v)) - 0.02);',
    // Where the engraving is finer than the screen can hold, let it go rather
    // than let it crawl.
    '  return line * (1.0 - smoothstep(0.45, 1.10, w));',
    '}',

    'void main() {',
    '  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
    '  p += uPointer * 0.012;',
    '  float t = uTime;',

    '  float px = 2.0 / uRes.y;',
    // Three rosettes struck on nearly the same centre — the one the figure
    // stands on — at different pitches, so their moire is the ornament.
    // On a narrow screen the hero stacks, so the medallion moves to the
    // middle instead of hugging an edge that is no longer there.
    '  float wide = smoothstep(0.95, 1.35, uRes.x / uRes.y);',
    '  vec2 c = mix(vec2(0.00, 0.34), vec2(0.44, 0.00), wide);',
    '  float g1 = rosette((p - c) * 1.00, 9.0, 70.0, 0.024,  t * 0.045, px);',
    '  float g2 = rosette((p - c - vec2(0.05, 0.04)) * 1.35, 6.0, 46.0, 0.020, -t * 0.032, px * 1.35);',
    '  float g3 = rosette((p - c + vec2(0.03, 0.03)) * 0.62, 14.0, 104.0, 0.012,  t * 0.021, px * 0.62);',

    // Straight-line ruling under the rosettes, the way a certificate border
    // has a plain ground behind the ornament.
    '  float rule = sin((p.x * 0.9 + p.y * 0.35) * 210.0 + t * 0.06);',
    '  float rw = 210.0 * px * 0.97 + 0.0008;',
    '  float g4 = (1.0 - smoothstep(0.0, rw, abs(rule) - 0.05)) * (1.0 - smoothstep(0.45, 1.10, rw));',

    '  vec3 col = uSteel * (g1 * 0.42 + g2 * 0.30);',
    '  col += uSky * g3 * 0.34;',
    '  col += uInk * g4 * 0.07;',
    '  float ink = g1 * 0.42 + g2 * 0.30 + g3 * 0.34 + g4 * 0.07;',

    // Hand the frame back to the paper: the plate is strongest under the
    // figure on the right and fades out well before the type on the left.
    '  vec2 q = (gl_FragCoord.xy / uRes);',
    '  float band = mix(1.0, smoothstep(0.30, 0.74, q.x), wide);',
    '  float soft = smoothstep(0.80, 0.08, length((p - c) * vec2(0.90, 1.15)));',
    '  float mask = band * soft;',

    '  float a = clamp(ink * mask * mix(0.20, 0.34, wide), 0.0, 1.0);',
    '  if (a < 0.002) discard;',
    '  gl_FragColor = vec4(col / max(ink, 0.0001), a);',
    '}'
  ].join('\n');

  function mountPlate() {
    var host = document.querySelector('[data-plate]');
    if (!host) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'gl-plate';
    canvas.setAttribute('aria-hidden', 'true');
    var gl = context(canvas);
    if (!gl) return;
    var prog;
    try { prog = build(gl, PLATE_FS); } catch (e) { return; }

    var u = {};
    ['uRes','uTime','uPointer','uSteel','uSky','uInk'].forEach(function (n) {
      u[n] = gl.getUniformLocation(prog, n);
    });
    var steel = brandColor('--seros-steel', [0.376, 0.541, 0.804]);
    var sky = brandColor('--seros-sky', [0.722, 0.855, 1.0]);
    var ink = brandColor('--seros-ink', [0.157, 0.188, 0.325]);

    place(host, canvas, 'z-index:-1');
    host.style.isolation = 'isolate';
    host.insertBefore(canvas, host.firstChild);
    host.classList.add('gl-plate-live');
    reveal(canvas, 1.4);

    var layer = {
      resize: function () {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = Math.max(1, Math.round(host.clientWidth * dpr));
        var h = Math.max(1, Math.round(host.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w; canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
      },
      draw: function () {
        layer.resize();
        gl.useProgram(prog);
        gl.uniform2f(u.uRes, canvas.width, canvas.height);
        gl.uniform1f(u.uTime, reduced ? 8.0 : (performance.now() - t0) * 0.001);
        gl.uniform2f(u.uPointer, pointer.x, pointer.y);
        gl.uniform3f(u.uSteel, steel[0], steel[1], steel[2]);
        gl.uniform3f(u.uSky, sky[0], sky[1], sky[2]);
        gl.uniform3f(u.uInk, ink[0], ink[1], ink[2]);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
    layer.resize();
    register(layer, host);
  }

  /* ------------------------------------------------------- 2. impression */
  var PRINT_FS = [
    'uniform sampler2D uPlate;',
    'uniform vec2 uRes, uPointer;',
    'uniform float uTime, uPress;',
    'uniform vec3 uInk, uSteel, uPaper;',

    'float hash(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'float darkness(vec2 uv) {',
    '  vec4 c = texture2D(uPlate, uv);',
    '  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));',
    '  return (1.0 - lum) * c.a;',
    '}',

    'void main() {',
    '  vec2 uv = vUV;',
    '  vec2 px = 1.0 / uRes;',
    '  float t = uTime;',

    // The sheet is never perfectly flat: a slow, sub-pixel breath.
    '  vec2 breathe = vec2(sin(t * 0.21 + uv.y * 3.0), cos(t * 0.17 + uv.x * 2.4)) * px * 0.8;',
    '  uv += breathe;',

    // Two plates, a hair out of register, drifting with the pointer. This is
    // the whole trick: it reads as a real two-colour print, not a filter.
    '  vec2 off = (uPointer * 1.6 + vec2(0.35, -0.25)) * px * 1.5;',
    '  float dInk = darkness(uv - off);',
    '  float dSteel = darkness(uv + off);',
    '  float a = max(texture2D(uPlate, uv - off).a, texture2D(uPlate, uv + off).a);',

    // Rake light: a fake normal from the plate gradient, lit from wherever
    // the pointer is, so the engraving catches the light as you read.
    '  float gx = darkness(uv + vec2(px.x, 0.0)) - darkness(uv - vec2(px.x, 0.0));',
    '  float gy = darkness(uv + vec2(0.0, px.y)) - darkness(uv - vec2(0.0, px.y));',
    '  vec3 N = normalize(vec3(-gx * 2.4, -gy * 2.4, 1.0));',
    '  vec3 L = normalize(vec3(uPointer.x * 0.7 - 0.35, uPointer.y * 0.7 + 0.55, 0.85));',
    '  float rake = pow(max(dot(N, L), 0.0), 3.0);',

    // Cross-hatching, deepening only where the engraving is already dark, so
    // the highlights of the figure stay clean paper.
    '  float ang = 0.62 + uPointer.x * 0.05;',
    '  vec2 dir = vec2(cos(ang), sin(ang));',
    '  float h1 = sin(dot(uv * uRes, dir) * 0.55 + t * 0.18);',
    '  float h2 = sin(dot(uv * uRes, vec2(-dir.y, dir.x)) * 0.55 - t * 0.11);',
    '  float hatch = smoothstep(0.25, 0.85, dInk) * (h1 * 0.5 + 0.5) * 0.10;',
    '  hatch += smoothstep(0.55, 0.95, dInk) * (h2 * 0.5 + 0.5) * 0.07;',

    '  float d = clamp(dInk + hatch * uPress, 0.0, 1.0);',

    // Ink laid down: navy from the first plate, a steel ghost from the
    // second, then the rake light lifting the raised edges of the line.
    '  vec3 col = mix(uPaper, uInk, d);',
    '  col = mix(col, uSteel, clamp(dSteel - dInk, 0.0, 1.0) * 0.55);',
    '  col += vec3(0.55, 0.58, 0.66) * rake * d * 0.30;',

    // Paper: fibre grain, and a faint warm tooth that does not move.
    '  float grain = hash(floor(gl_FragCoord.xy) + floor(t * 6.0) * 0.37) - 0.5;',
    '  col += grain * 0.030;',
    '  col += (hash(floor(gl_FragCoord.xy * 0.5)) - 0.5) * 0.022;',

    '  a = clamp(a * (0.25 + 0.75 * smoothstep(0.0, 0.10, d + 0.06)), 0.0, 1.0);',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);',
    '}'
  ].join('\n');

  function mountImpression() {
    var host = document.querySelector('[data-impression]');
    if (!host) return;
    var img = host.querySelector('img');
    if (!img) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'gl-print';
    canvas.setAttribute('aria-hidden', 'true');
    var gl = context(canvas);
    if (!gl) return;
    var prog;
    try { prog = build(gl, PRINT_FS); } catch (e) { return; }

    var u = {};
    ['uPlate','uRes','uPointer','uTime','uPress','uInk','uSteel','uPaper']
      .forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });

    var inkC = brandColor('--seros-ink', [0.157, 0.188, 0.325]);
    var steelC = brandColor('--seros-steel', [0.376, 0.541, 0.804]);
    var paperC = brandColor('--seros-paper', [0.929, 0.906, 0.871]);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    var loaded = false;
    function uploadPlate() {
      if (!img.naturalWidth) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      } catch (e) { return; }
      loaded = true;
      host.classList.add('gl-print-live');   // only now is the <img> replaced
      img.style.visibility = 'hidden';
      reveal(canvas, 0.9);
      wake();
    }

    place(host, canvas, 'filter:drop-shadow(0 22px 34px rgba(40,48,83,.20))');
    host.appendChild(canvas);

    var layer = {
      resize: function () {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (w > 1 && h > 1 && (canvas.width !== w || canvas.height !== h)) {
          canvas.width = w; canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
      },
      draw: function () {
        if (!loaded) return;
        layer.resize();
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(u.uPlate, 0);
        gl.uniform2f(u.uRes, canvas.width, canvas.height);
        gl.uniform2f(u.uPointer, pointer.x, pointer.y);
        gl.uniform1f(u.uTime, reduced ? 8.0 : (performance.now() - t0) * 0.001);
        gl.uniform1f(u.uPress, 1.0);
        gl.uniform3f(u.uInk, inkC[0], inkC[1], inkC[2]);
        gl.uniform3f(u.uSteel, steelC[0], steelC[1], steelC[2]);
        gl.uniform3f(u.uPaper, paperC[0], paperC[1], paperC[2]);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };

    if (img.complete) { uploadPlate(); } else { img.addEventListener('load', uploadPlate); }
    layer.resize();
    register(layer, host);
  }

  function start() {
    try { mountPlate(); } catch (e) { /* the page is fine without it */ }
    try { mountImpression(); } catch (e) { /* likewise */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
