(() => {
  "use strict";

  const canvas = document.querySelector("#rose");
  const bloomButton = document.querySelector("#bloomButton");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });

  if (!gl) {
    const message = document.createElement("p");
    message.className = "webgl-message";
    message.textContent = "当前浏览器无法显示粒子花束，请换用最新版浏览器。";
    document.querySelector(".stage").append(message);
    return;
  }

  const vertexShaderSource = `
    precision highp float;

    attribute vec3 a_position;
    attribute vec4 a_color;
    attribute float a_size;
    attribute float a_seed;
    attribute vec3 a_scatter;
    attribute float a_delay;
    attribute float a_kind;

    uniform vec2 u_resolution;
    uniform vec2 u_center;
    uniform float u_scale;
    uniform float u_dpr;
    uniform float u_time;
    uniform float u_rotation_x;
    uniform float u_rotation_y;
    uniform float u_burst;
    uniform float u_flash;
    uniform float u_pass;

    varying vec4 v_color;
    varying float v_kind;

    void main() {
      float scatterAmount = clamp(u_burst - a_delay * 0.38, 0.0, 1.0);
      scatterAmount = scatterAmount * scatterAmount * (3.0 - 2.0 * scatterAmount);
      vec3 position = a_position + a_scatter * scatterAmount;

      float breathing = 1.0 + sin(u_time * 0.72 + a_seed * 6.28318) * 0.0038;
      position *= breathing;

      float cy = cos(u_rotation_y);
      float sy = sin(u_rotation_y);
      position = vec3(
        position.x * cy - position.z * sy,
        position.y,
        position.x * sy + position.z * cy
      );

      float cx = cos(u_rotation_x);
      float sx = sin(u_rotation_x);
      position = vec3(
        position.x,
        position.y * cx - position.z * sx,
        position.y * sx + position.z * cx
      );

      float perspective = 730.0 / (730.0 + position.z * u_scale);
      vec2 pixel = vec2(
        u_center.x + position.x * u_scale * perspective,
        u_center.y - position.y * u_scale * perspective
      );
      vec2 clip = vec2(
        pixel.x / u_resolution.x * 2.0 - 1.0,
        1.0 - pixel.y / u_resolution.y * 2.0
      );

      gl_Position = vec4(clip, clamp(position.z / 650.0, -0.95, 0.95), 1.0);
      float twinkle = 0.83 + 0.17 * sin(u_time * 1.9 + a_seed * 19.0);
      gl_PointSize = max(1.0, a_size * u_dpr * perspective * twinkle * (1.0 + u_flash * 0.12));
      v_color = vec4(a_color.rgb * (1.0 + u_flash * 0.12), a_color.a * twinkle);
      v_kind = a_kind;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    varying vec4 v_color;
    varying float v_kind;
    uniform float u_pass;

    void main() {
      if (u_pass < 0.5 && v_kind > 0.5) discard;
      if (u_pass > 0.5 && u_pass < 1.5 && abs(v_kind - 2.0) > 0.25) discard;
      if (u_pass > 1.5 && abs(v_kind - 1.0) > 0.25) discard;
      vec2 uv = gl_PointCoord - vec2(0.5);
      float distanceToCenter = length(uv);
      if (distanceToCenter > 0.5) discard;
      float softness = smoothstep(0.5, 0.12, distanceToCenter);
      gl_FragColor = vec4(v_color.rgb, v_color.a * softness);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
    }
    return shader;
  }

  function createProgram() {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
    }
    return program;
  }

  const program = createProgram();
  const attributes = {
    position: gl.getAttribLocation(program, "a_position"),
    color: gl.getAttribLocation(program, "a_color"),
    size: gl.getAttribLocation(program, "a_size"),
    seed: gl.getAttribLocation(program, "a_seed"),
    scatter: gl.getAttribLocation(program, "a_scatter"),
    delay: gl.getAttribLocation(program, "a_delay"),
    kind: gl.getAttribLocation(program, "a_kind"),
  };
  const uniforms = {
    resolution: gl.getUniformLocation(program, "u_resolution"),
    center: gl.getUniformLocation(program, "u_center"),
    scale: gl.getUniformLocation(program, "u_scale"),
    dpr: gl.getUniformLocation(program, "u_dpr"),
    time: gl.getUniformLocation(program, "u_time"),
    rotationX: gl.getUniformLocation(program, "u_rotation_x"),
    rotationY: gl.getUniformLocation(program, "u_rotation_y"),
    burst: gl.getUniformLocation(program, "u_burst"),
    flash: gl.getUniformLocation(program, "u_flash"),
    pass: gl.getUniformLocation(program, "u_pass"),
  };

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    scale: 1,
    mobile: false,
    pointCount: 0,
    randomState: 20260825,
    rotationX: -0.09,
    rotationY: 0.08,
    targetRotationX: -0.09,
    targetRotationY: 0.08,
    autoRotation: reduceMotion ? 0 : 0.000045,
    burst: reduceMotion ? 0 : 1.45,
    flash: 0,
    pointerDown: false,
    dragged: false,
    lastX: 0,
    lastY: 0,
    lastTime: performance.now(),
    buffers: [],
  };

  let geometry;

  function random() {
    state.randomState += 0x6d2b79f5;
    let value = state.randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function gaussian() {
    const u = Math.max(random(), 1e-7);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * random());
  }

  function resetGeometry() {
    geometry = {
      positions: [],
      colors: [],
      sizes: [],
      seeds: [],
      scatters: [],
      delays: [],
      kinds: [],
    };
    state.randomState = state.mobile ? 20260825 : 20260826;
  }

  function addPoint(x, y, z, color, size, alpha, scatterRadius = 320, delay = random(), kind = 0) {
    geometry.positions.push(x, y, z);
    geometry.colors.push(color[0], color[1], color[2], alpha);
    geometry.sizes.push(size);
    geometry.seeds.push(random());

    let sx = gaussian();
    let sy = gaussian();
    let sz = gaussian();
    const length = Math.hypot(sx, sy, sz) || 1;
    const magnitude = scatterRadius * (0.36 + random() * 0.64);
    sx = (sx / length) * magnitude;
    sy = (sy / length) * magnitude;
    sz = (sz / length) * magnitude;
    geometry.scatters.push(sx, sy, sz);
    geometry.delays.push(delay);
    geometry.kinds.push(kind);
  }

  function rotateLocal(x, y, z, tiltX, tiltY, roll) {
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const x1 = x * cr - y * sr;
    const y1 = x * sr + y * cr;

    const cx = Math.cos(tiltX);
    const sx = Math.sin(tiltX);
    const y2 = y1 * cx - z * sx;
    const z2 = y1 * sx + z * cx;

    const cy = Math.cos(tiltY);
    const sy = Math.sin(tiltY);
    return {
      x: x1 * cy - z2 * sy,
      y: y2,
      z: x1 * sy + z2 * cy,
    };
  }

  function generateRose(config) {
    const layerCounts = [3, 4, 5, 7, 9, 12, 15];
    const samplesPerPetal = state.mobile ? 34 : 48;
    const scale = config.size / 50;

    layerCounts.forEach((petalCount, layer) => {
      const layerRatio = layer / (layerCounts.length - 1);
      for (let petalIndex = 0; petalIndex < petalCount; petalIndex += 1) {
        const centerAngle =
          (petalIndex / petalCount) * Math.PI * 2 +
          layer * 0.59 +
          (random() - 0.5) * 0.14;
        const twist = (random() - 0.5) * 0.18;

        for (let sample = 0; sample < samplesPerPetal; sample += 1) {
          const u = Math.pow(random(), 0.72);
          const v = random() * 2 - 1;
          const widthProfile = 0.08 + Math.pow(Math.sin(Math.PI * Math.min(0.94, u)), 0.58) * 0.92;
          const theta =
            centerAngle +
            v * (Math.PI / petalCount) * 1.26 * widthProfile +
            twist * u * u;
          const baseRadius = layer * 5.2;
          const petalLength = 8.5 + layer * 1.52;
          const radius = (baseRadius + petalLength * u) * (1 - v * v * 0.055);
          const localX = Math.cos(theta) * radius * scale;
          const localY = Math.sin(theta) * radius * scale;
          const ridge = (1 - v * v) * Math.sin(Math.PI * u) * (2.2 + layer * 0.34);
          const localZ =
            (13 - layer * 1.72 + ridge - u * 1.8 + gaussian() * 0.42) * scale;
          const rotated = rotateLocal(
            localX,
            localY,
            localZ,
            config.tiltX,
            config.tiltY,
            config.roll,
          );

          let lightness = 0.48 + layerRatio * 0.35 + (1 - Math.abs(v)) * 0.1;
          lightness += (random() - 0.5) * 0.1;
          const crimson = random() < 0.055 + (1 - layerRatio) * 0.025;
          const color = crimson
            ? [1, 0.16 + random() * 0.11, 0.31 + random() * 0.12]
            : [
                1,
                0.22 + lightness * 0.62,
                0.39 + lightness * 0.55,
              ];
          const edgeGlow = Math.pow(Math.abs(v), 2.8);
          addPoint(
            config.x + rotated.x + gaussian() * 0.42,
            config.y + rotated.y + gaussian() * 0.42,
            config.z + rotated.z + gaussian() * 0.3,
            color,
            1.55 + random() * 2.35 + edgeGlow * 0.95,
            0.58 + random() * 0.32 + edgeGlow * 0.08,
            310,
            random(),
            2,
          );
        }
      }
    });

    const coreCount = state.mobile ? 210 : 300;
    for (let index = 0; index < coreCount; index += 1) {
      const progress = index / coreCount;
      const angle = progress * Math.PI * 10.5 + random() * 0.28;
      const radius = (2.2 + progress * 21) * scale;
      const local = rotateLocal(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        (13.5 - progress * 6 + gaussian() * 0.7) * scale,
        config.tiltX,
        config.tiltY,
        config.roll,
      );
      addPoint(
        config.x + local.x,
        config.y + local.y,
        config.z + local.z,
        [1, 0.19 + progress * 0.28, 0.32 + progress * 0.28],
        1.85 + random() * 2.6,
        0.66 + random() * 0.3,
        330,
        random(),
        1,
      );
    }

    const haloCount = state.mobile ? 390 : 560;
    for (let index = 0; index < haloCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = config.size * (0.58 + Math.pow(random(), 0.62) * 0.55);
      const local = rotateLocal(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        gaussian() * config.size * 0.2,
        config.tiltX,
        config.tiltY,
        config.roll,
      );
      addPoint(
        config.x + local.x + gaussian() * 3.2,
        config.y + local.y + gaussian() * 3.2,
        config.z + local.z + gaussian() * 2.3,
        [1, 0.78 + random() * 0.18, 0.83 + random() * 0.14],
        0.75 + random() * 1.75,
        0.09 + random() * 0.25,
        360,
      );
    }
  }

  function generateLeaf(config) {
    const count = state.mobile ? 610 : 880;
    const cos = Math.cos(config.angle);
    const sin = Math.sin(config.angle);
    for (let index = 0; index < count; index += 1) {
      const along = random() * 2 - 1;
      const across = random() * 2 - 1;
      const widthProfile = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(along), 1.6)), 0.62);
      const localX = along * config.length * 0.5;
      const localY = across * config.width * 0.5 * widthProfile;
      const x = config.x + localX * cos - localY * sin;
      const y = config.y + localX * sin + localY * cos;
      const z = config.z + (1 - across * across) * 5 + gaussian() * 1.6;
      const vein = 1 - Math.abs(across);
      addPoint(
        x,
        y,
        z,
        [
          0.54 + vein * 0.2 + random() * 0.08,
          0.57 + vein * 0.2 + random() * 0.08,
          0.5 + vein * 0.15 + random() * 0.07,
        ],
        1.05 + random() * 1.85,
        0.42 + random() * 0.42,
        350,
        random(),
        2,
      );
    }

    for (let index = 0; index < 90; index += 1) {
      const along = index / 89 * 2 - 1;
      const localX = along * config.length * 0.5;
      addPoint(
        config.x + localX * cos + gaussian() * 0.55,
        config.y + localX * sin + gaussian() * 0.55,
        config.z + 5.5,
        [0.83, 0.85, 0.76],
        1.1 + random() * 1.15,
        0.52 + random() * 0.28,
        340,
        random(),
        2,
      );
    }
  }

  function generateStem(from, to, thickness = 3, count = 160) {
    for (let index = 0; index < count; index += 1) {
      const t = random();
      const curve = Math.sin(t * Math.PI) * (random() - 0.5) * 7;
      addPoint(
        from.x + (to.x - from.x) * t + gaussian() * thickness + curve,
        from.y + (to.y - from.y) * t + gaussian() * thickness * 0.42,
        from.z + (to.z - from.z) * t + gaussian() * thickness,
        random() < 0.55 ? [0.42, 0.18, 0.23] : [0.34, 0.35, 0.24],
        0.65 + random() * 1.15,
        0.16 + random() * 0.36,
        330,
      );
    }
  }

  function generateWrapperPanel(apex, left, right, depth) {
    const count = state.mobile ? 470 : 690;
    for (let index = 0; index < count; index += 1) {
      const root = Math.sqrt(random());
      const split = random();
      const a = 1 - root;
      const b = root * (1 - split);
      const c = root * split;
      const edge = Math.min(a, b, c);
      addPoint(
        apex.x * a + left.x * b + right.x * c + gaussian() * 1.2,
        apex.y * a + left.y * b + right.y * c + gaussian() * 1.2,
        depth + gaussian() * 2.2,
        edge < 0.035 ? [1, 0.96, 0.98] : [0.88, 0.86, 0.82],
        0.8 + random() * 1.45,
        edge < 0.035 ? 0.5 + random() * 0.3 : 0.08 + random() * 0.16,
        360,
        random(),
        2,
      );
    }
  }

  function generateRibbon() {
    const loopCount = state.mobile ? 780 : 1100;
    [-1, 1].forEach((side) => {
      for (let index = 0; index < loopCount; index += 1) {
        const angle = random() * Math.PI * 2;
        const centerX = side * 31;
        const x = centerX + Math.cos(angle) * 31 + gaussian() * 2.2;
        const y = -79 + Math.sin(angle) * 18 + gaussian() * 1.8;
        const z = -8 + Math.sin(angle * 2) * 5 + gaussian() * 1.8;
        addPoint(
          x,
          y,
          z,
          [1, 0.9 + random() * 0.08, 0.93 + random() * 0.06],
          1.05 + random() * 1.85,
          0.55 + random() * 0.32,
          380,
          random(),
          2,
        );
      }
    });

    for (let index = 0; index < 620; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.pow(random(), 0.5) * 12;
      addPoint(
        Math.cos(angle) * radius,
        -80 + Math.sin(angle) * radius * 0.68,
        -16 + gaussian() * 4,
        [1, 0.88 + random() * 0.11, 0.92 + random() * 0.07],
        1.15 + random() * 1.9,
        0.62 + random() * 0.32,
        390,
        random(),
        2,
      );
    }

    [-1, 1].forEach((side) => {
      for (let index = 0; index < 460; index += 1) {
        const t = random();
        const x = side * (t * 42 - t * t * 18) + gaussian() * 2.3;
        const y = -88 - t * 78 + Math.sin(t * Math.PI) * 9 + gaussian() * 1.5;
        addPoint(
          x,
          y,
          -1 + gaussian() * 2.5,
          [0.95, 0.83 + random() * 0.12, 0.88 + random() * 0.1],
          0.95 + random() * 1.65,
          0.45 + random() * 0.35,
          380,
          random(),
          2,
        );
      }
    });
  }

  function generateCube() {
    const x = 205;
    const yBottom = -190;
    const yTop = 225;
    const z = 170;
    const corners = [
      [-x, yBottom, -z], [x, yBottom, -z], [x, yTop, -z], [-x, yTop, -z],
      [-x, yBottom, z], [x, yBottom, z], [x, yTop, z], [-x, yTop, z],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    edges.forEach(([startIndex, endIndex]) => {
      const start = corners[startIndex];
      const end = corners[endIndex];
      const distance = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
      const steps = Math.ceil(distance / 3.3);
      for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        addPoint(
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
          start[2] + (end[2] - start[2]) * t,
          [0.82, 0.86, 0.9],
          1.35 + random() * 0.9,
          0.49 + random() * 0.29,
          440,
          index / steps,
        );
      }
    });
  }

  function generateAmbientDust() {
    const count = state.mobile ? 1500 : 2400;
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 160 + Math.pow(random(), 0.55) * 185;
      addPoint(
        Math.cos(angle) * radius + gaussian() * 16,
        (random() - 0.45) * 410,
        Math.sin(angle) * radius * 0.55 + gaussian() * 30,
        random() < 0.72 ? [1, 0.57, 0.68] : [0.75, 0.77, 0.69],
        0.35 + random() * 1.1,
        0.025 + random() * 0.11,
        440,
      );
    }
  }

  function buildBouquet() {
    resetGeometry();
    generateCube();
    generateAmbientDust();

    const roses = [
      { x: -108, y: 73, z: 30, size: 43, tiltX: 0.08, tiltY: -0.24, roll: -0.1 },
      { x: -55, y: 69, z: -5, size: 53, tiltX: -0.06, tiltY: -0.1, roll: 0.18 },
      { x: 2, y: 73, z: -25, size: 57, tiltX: 0.04, tiltY: 0.02, roll: -0.12 },
      { x: 61, y: 72, z: -4, size: 52, tiltX: -0.04, tiltY: 0.12, roll: 0.1 },
      { x: 112, y: 81, z: 30, size: 43, tiltX: 0.08, tiltY: 0.24, roll: -0.16 },
      { x: -82, y: 126, z: 9, size: 49, tiltX: 0.04, tiltY: -0.15, roll: -0.08 },
      { x: -28, y: 127, z: -27, size: 55, tiltX: -0.05, tiltY: -0.06, roll: 0.12 },
      { x: 34, y: 129, z: -29, size: 55, tiltX: 0.02, tiltY: 0.06, roll: -0.16 },
      { x: 89, y: 129, z: 8, size: 48, tiltX: 0.06, tiltY: 0.17, roll: 0.16 },
      { x: -51, y: 178, z: 21, size: 45, tiltX: -0.07, tiltY: -0.1, roll: -0.05 },
      { x: 4, y: 184, z: -3, size: 50, tiltX: 0.02, tiltY: 0, roll: 0.14 },
      { x: 60, y: 177, z: 22, size: 44, tiltX: -0.05, tiltY: 0.13, roll: -0.12 },
    ];

    roses.forEach((rose) => generateStem(
      { x: rose.x * 0.62, y: rose.y - rose.size * 0.35, z: rose.z + 16 },
      { x: rose.x * 0.08, y: -175, z: 18 + rose.z * 0.12 },
      2.4,
      state.mobile ? 125 : 180,
    ));

    [
      { x: -136, y: 72, z: 36, length: 105, width: 35, angle: 2.56 },
      { x: 137, y: 75, z: 38, length: 102, width: 34, angle: 0.57 },
      { x: -122, y: 119, z: 23, length: 89, width: 30, angle: 2.78 },
      { x: 123, y: 122, z: 24, length: 91, width: 30, angle: 0.38 },
      { x: -83, y: 34, z: 1, length: 82, width: 27, angle: 2.24 },
      { x: 83, y: 34, z: 3, length: 82, width: 27, angle: 0.9 },
      { x: -142, y: 158, z: 52, length: 72, width: 25, angle: 2.94 },
      { x: 142, y: 159, z: 54, length: 72, width: 25, angle: 0.22 },
      { x: -65, y: 8, z: 29, length: 74, width: 24, angle: 1.92 },
      { x: 66, y: 8, z: 31, length: 74, width: 24, angle: 1.22 },
    ].forEach(generateLeaf);

    generateWrapperPanel({ x: 0, y: -119 }, { x: -139, y: 45 }, { x: -27, y: 38 }, 38);
    generateWrapperPanel({ x: 0, y: -121 }, { x: 29, y: 41 }, { x: 139, y: 47 }, 41);
    generateWrapperPanel({ x: -8, y: -125 }, { x: -100, y: 18 }, { x: 22, y: 42 }, -5);
    generateWrapperPanel({ x: 8, y: -124 }, { x: -18, y: 43 }, { x: 101, y: 20 }, -8);
    generateRibbon();

    for (let index = 0; index < (state.mobile ? 1300 : 1900); index += 1) {
      const t = random();
      addPoint(
        gaussian() * (8 + t * 4),
        -82 - t * 108 + gaussian() * 2.1,
        12 + gaussian() * 9,
        random() < 0.58 ? [0.48, 0.16, 0.22] : [0.34, 0.29, 0.2],
        0.65 + random() * 1.2,
        0.13 + random() * 0.33,
        350,
      );
    }

    roses.forEach(generateRose);
    uploadGeometry();
  }

  function bindAttribute(name, values, size) {
    const buffer = gl.createBuffer();
    state.buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(attributes[name]);
    gl.vertexAttribPointer(attributes[name], size, gl.FLOAT, false, 0, 0);
  }

  function uploadGeometry() {
    state.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    state.buffers = [];
    gl.useProgram(program);
    bindAttribute("position", geometry.positions, 3);
    bindAttribute("color", geometry.colors, 4);
    bindAttribute("size", geometry.sizes, 1);
    bindAttribute("seed", geometry.seeds, 1);
    bindAttribute("scatter", geometry.scatters, 3);
    bindAttribute("delay", geometry.delays, 1);
    bindAttribute("kind", geometry.kinds, 1);
    state.pointCount = geometry.sizes.length;
  }

  function resize() {
    const wasMobile = state.mobile;
    state.width = innerWidth;
    state.height = innerHeight;
    state.mobile = state.width < 700;
    state.dpr = Math.min(devicePixelRatio || 1, state.mobile ? 1.75 : 2);
    state.scale = Math.min(state.width / 450, state.height / 700, 1.82);

    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);

    if (!state.pointCount || wasMobile !== state.mobile) buildBouquet();
  }

  function render(time) {
    const delta = Math.min(34, time - state.lastTime);
    state.lastTime = time;
    const ease = 1 - Math.pow(0.001, delta / 1000);

    if (!state.pointerDown) state.targetRotationY += state.autoRotation * delta;
    state.rotationX += (state.targetRotationX - state.rotationX) * ease * 2.2;
    state.rotationY += (state.targetRotationY - state.rotationY) * ease * 2.2;
    state.burst += (0 - state.burst) * ease * 0.72;
    state.flash *= Math.pow(0.982, delta);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(program);

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(
      uniforms.center,
      canvas.width * 0.5,
      canvas.height * (state.mobile ? 0.525 : 0.55),
    );
    gl.uniform1f(uniforms.scale, state.scale * state.dpr);
    gl.uniform1f(uniforms.dpr, state.dpr);
    gl.uniform1f(uniforms.time, reduceMotion ? 0 : time * 0.001);
    gl.uniform1f(uniforms.rotationX, state.rotationX);
    gl.uniform1f(uniforms.rotationY, state.rotationY);
    gl.uniform1f(uniforms.burst, state.burst);
    gl.uniform1f(uniforms.flash, state.flash);
    gl.uniform1f(uniforms.pass, 0);
    gl.drawArrays(gl.POINTS, 0, state.pointCount);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(uniforms.pass, 1);
    gl.drawArrays(gl.POINTS, 0, state.pointCount);

    gl.uniform1f(uniforms.pass, 2);
    gl.drawArrays(gl.POINTS, 0, state.pointCount);

    requestAnimationFrame(render);
  }

  function triggerBloom() {
    if (reduceMotion) return;
    state.burst = 1.08;
    state.flash = 1;
    state.autoRotation = 0.00022;
    clearTimeout(triggerBloom.timer);
    triggerBloom.timer = setTimeout(() => {
      state.autoRotation = 0.000045;
    }, 2300);
  }

  function pointerStart(event) {
    state.pointerDown = true;
    state.dragged = false;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event) {
    if (!state.pointerDown) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.dragged = true;
    state.targetRotationY += dx * 0.007;
    state.targetRotationX = Math.max(-0.58, Math.min(0.48, state.targetRotationX + dy * 0.005));
    state.lastX = event.clientX;
    state.lastY = event.clientY;
  }

  function pointerEnd(event) {
    if (!state.pointerDown) return;
    state.pointerDown = false;
    canvas.releasePointerCapture?.(event.pointerId);
    if (!state.dragged) triggerBloom();
  }

  addEventListener("resize", resize, { passive: true });
  canvas.addEventListener("pointerdown", pointerStart);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerEnd);
  canvas.addEventListener("pointercancel", pointerEnd);
  bloomButton.addEventListener("click", triggerBloom);
  document.querySelector("#year").textContent = new Date().getFullYear();

  resize();
  requestAnimationFrame(render);
})();

