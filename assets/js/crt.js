'use strict';

// CRT aperture-grille overlay. Static: renders on load and resize only.
// The R/G/B stripe tile is generated in the shader, so no texture download.
(() => {
  const canvas = document.querySelector('[data-is="crt"]');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
  if (!gl) return;

  const TILE_PX = 6;      // CSS px per R-G-B triad
  const BULGE = -0.2;     // barrel distortion; pixels outside the bulge are transparent

  const vs = 'attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
  const fs = `
    precision mediump float;
    varying vec2 uv;
    uniform vec2 res;
    uniform float tile, bulge;
    void main() {
      vec2 c = uv - 0.5;
      vec2 b = uv + c * dot(c, c) * bulge;
      if (b.x < 0.0 || b.x > 1.0 || b.y < 0.0 || b.y > 1.0) { gl_FragColor = vec4(0.0); return; }
      vec2 px = b * res;
      float f = fract(px.x / tile) * 3.0;
      vec3 mask = vec3(step(f, 1.0), step(1.0, f) * step(f, 2.0), step(2.0, f));
      mask = mix(vec3(0.25), vec3(1.0), mask);
      float row = smoothstep(0.0, 0.25, abs(fract(px.y / tile) - 0.5) * 2.0);
      mask *= mix(1.0, 0.7, 1.0 - row);
      gl_FragColor = vec4(mask, 1.0);
    }`;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'res');
  const uTile = gl.getUniformLocation(prog, 'tile');
  gl.uniform1f(gl.getUniformLocation(prog, 'bulge'), BULGE);

  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTile, TILE_PX * dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let queued = false;
  addEventListener('resize', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; draw(); });
  }, { passive: true });
  draw();
  canvas.dataset.gl = '';
})();
