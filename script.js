(() => {
  "use strict";

  const canvas = document.querySelector("#rose");
  const ctx = canvas.getContext("2d", { alpha: true });
  const bloomButton = document.querySelector("#bloomButton");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const TAU = Math.PI * 2;
  const layerBlueprints = [
    { count: 3, radius: 3, length: 29, height: 58, drop: 18, width: 1.12, curl: 20 },
    { count: 4, radius: 10, length: 35, height: 55, drop: 23, width: 0.9, curl: 22 },
    { count: 5, radius: 20, length: 40, height: 51, drop: 28, width: 0.72, curl: 25 },
    { count: 6, radius: 33, length: 46, height: 45, drop: 34, width: 0.59, curl: 29 },
    { count: 8, radius: 48, length: 52, height: 36, drop: 40, width: 0.47, curl: 34 },
    { count: 10, radius: 67, length: 58, height: 25, drop: 45, width: 0.39, curl: 40 },
    { count: 12, radius: 88, length: 64, height: 12, drop: 49, width: 0.33, curl: 47 },
    { count: 15, radius: 109, length: 69, height: -4, drop: 50, width: 0.27, curl: 56 },
  ];

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    scale: 1,
    mobile: false,
    petals: [],
    sparkles: [],
    dust: [],
    stars: [],
    rotationX: -0.62,
    rotationY: 0.28,
    targetRotationX: -0.62,
    targetRotationY: 0.28,
    autoRotation: reduceMotion ? 0 : 0.0007,
    openness: reduceMotion ? 1 : 0.08,
    targetOpenness: 1,
    sparkBurst: 0,
    flash: 0,
    pointerDown: false,
    dragged: false,
    lastX: 0,
    lastY: 0,
    lastTime: performance.now(),
    lastDraw: 0,
    frameInterval: 1000 / 60,
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothstep = (min, max, value) => {
    const x = clamp((value - min) / (max - min), 0, 1);
    return x * x * (3 - 2 * x);
  };

  function petalPosition(petal, u, v, openness = state.openness) {
    const open = 0.18 + openness * 0.82;
    const widthProfile =
      0.055 +
      Math.pow(Math.sin(Math.PI * Math.min(0.9, u * 0.9)), 0.52) *
        (0.62 + u * 0.38);
    const angularWidth = petal.width * widthProfile * (0.22 + openness * 0.78);
    const theta =
      petal.angle +
      petal.twist * u * u +
      v * angularWidth +
      Math.sin(u * Math.PI) * petal.lean;

    const pinchedSide = v * v * (2.2 + petal.layer * 0.36) * u;
    const radius = petal.radius + petal.length * u * open - pinchedSide;
    const x = radius * Math.cos(theta);
    const z = radius * 0.78 * Math.sin(theta);

    const arch = Math.sin(Math.PI * u) * (16 - petal.layer * 0.72);
    const ridge =
      (1 - v * v) *
      Math.sin(Math.PI * u) *
      (5.5 + petal.layer * 0.66);
    const closingLift = (1 - openness) * petal.length * u * 0.82;
    const tipCurl = petal.curl * Math.pow(smoothstep(0.66, 1, u), 1.7) * openness;
    const edgeRuffle =
      Math.sin(v * Math.PI * 3.4 + petal.phase) *
      Math.pow(Math.abs(v), 2.4) *
      u *
      u *
      (1.4 + petal.layer * 0.65);
    const asymmetricFold =
      Math.sin(theta * 2.3 + petal.phase) * u * (0.7 + petal.layer * 0.18);

    const y =
      petal.height -
      petal.drop * u * openness +
      arch * openness +
      ridge +
      closingLift +
      tipCurl +
      edgeRuffle +
      asymmetricFold;

    return { x, y, z };
  }

  function rotatePoint(point) {
    const cosY = Math.cos(state.rotationY);
    const sinY = Math.sin(state.rotationY);
    const x1 = point.x * cosY - point.z * sinY;
    const z1 = point.x * sinY + point.z * cosY;

    const cosX = Math.cos(state.rotationX);
    const sinX = Math.sin(state.rotationX);
    return {
      x: x1,
      y: point.y * cosX - z1 * sinX,
      z: point.y * sinX + z1 * cosX,
    };
  }

  function projectPoint(point, centerX, centerY) {
    const rotated = rotatePoint(point);
    const perspective = 620 / (620 + rotated.z * state.scale);
    return {
      x: centerX + rotated.x * state.scale * perspective,
      y: centerY - rotated.y * state.scale * perspective,
      z: rotated.z * state.scale,
      perspective,
      rx: rotated.x,
      ry: rotated.y,
      rz: rotated.z,
    };
  }

  function buildGeometry() {
    const uSteps = state.mobile ? 7 : 10;
    const vSteps = state.mobile ? 4 : 6;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    state.petals = [];

    layerBlueprints.forEach((layer, layerIndex) => {
      for (let index = 0; index < layer.count; index += 1) {
        const variance = (Math.random() - 0.5) * 0.12;
        const petal = {
          ...layer,
          layer: layerIndex,
          angle: (index / layer.count) * TAU + layerIndex * goldenAngle + variance,
          twist: (Math.random() - 0.5) * (0.17 + layerIndex * 0.012),
          lean: (Math.random() - 0.5) * 0.045,
          phase: Math.random() * TAU,
          hue: 337 + layerIndex * 1.35 + (Math.random() - 0.5) * 5,
          saturation: 78 + Math.random() * 14,
          baseLight: 64 - layerIndex * 3.45 + Math.random() * 4,
          uSteps,
          vSteps,
          uv: [],
        };

        for (let ui = 0; ui <= uSteps; ui += 1) {
          for (let vi = 0; vi <= vSteps; vi += 1) {
            petal.uv.push({ u: ui / uSteps, v: (vi / vSteps) * 2 - 1 });
          }
        }
        state.petals.push(petal);
      }
    });

    const sparkleCount = state.mobile ? 2700 : 4700;
    state.sparkles = Array.from({ length: sparkleCount }, (_, index) => {
      const pick = Math.pow(Math.random(), 0.88);
      const petalIndex = Math.min(state.petals.length - 1, Math.floor(pick * state.petals.length));
      const petal = state.petals[petalIndex];
      const layerRatio = petal.layer / (layerBlueprints.length - 1);
      const bright = Math.random() < 0.055;
      const mix = clamp(layerRatio * 0.88 + Math.random() * 0.22, 0, 1);
      return {
        petalIndex,
        u: Math.pow(Math.random(), 0.76),
        v: Math.random() * 2 - 1,
        jitterX: (Math.random() - 0.5) * 2.4,
        jitterY: (Math.random() - 0.5) * 2.4,
        jitterZ: (Math.random() - 0.5) * 2.4,
        scatterX: (Math.random() - 0.5) * (290 + layerRatio * 120),
        scatterY: (Math.random() - 0.5) * 320,
        scatterZ: (Math.random() - 0.5) * 300,
        size: bright ? 1.45 + Math.random() * 1.2 : 0.32 + Math.random() * 0.92,
        alpha: bright ? 0.8 : 0.22 + Math.random() * 0.58,
        phase: Math.random() * TAU,
        delay: index / sparkleCount,
        r: Math.round(255 - mix * 21),
        g: Math.round(229 - mix * 151),
        b: Math.round(240 - mix * 92),
      };
    });

    const dustCount = state.mobile ? 125 : 220;
    state.dust = Array.from({ length: dustCount }, () => ({
      angle: Math.random() * TAU,
      radius: 145 + Math.pow(Math.random(), 0.55) * 180,
      height: (Math.random() - 0.5) * 300,
      depth: (Math.random() - 0.5) * 190,
      speed: (0.000035 + Math.random() * 0.0001) * (Math.random() < 0.5 ? -1 : 1),
      size: 0.25 + Math.random() * 0.95,
      alpha: 0.06 + Math.random() * 0.3,
      phase: Math.random() * TAU,
    }));

    const starCount = state.mobile ? 70 : 135;
    state.stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * state.width,
      y: Math.random() * state.height,
      size: 0.2 + Math.random() * 0.9,
      alpha: 0.035 + Math.random() * 0.26,
      phase: Math.random() * TAU,
    }));
  }

  function resize() {
    const wasMobile = state.mobile;
    state.width = innerWidth;
    state.height = innerHeight;
    state.mobile = state.width < 700;
    state.dpr = Math.min(devicePixelRatio || 1, state.mobile ? 1.75 : 2);
    state.frameInterval = state.mobile ? 1000 / 42 : 1000 / 60;

    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    state.scale = Math.min(state.width / 470, state.height / 660, 1.75);

    if (!state.petals.length || wasMobile !== state.mobile) {
      buildGeometry();
    } else {
      state.stars.forEach((star) => {
        star.x = Math.random() * state.width;
        star.y = Math.random() * state.height;
      });
    }
  }

  function drawStars(time) {
    for (const star of state.stars) {
      const pulse = reduceMotion ? 0.7 : 0.52 + Math.sin(time * 0.0012 + star.phase) * 0.48;
      ctx.fillStyle = `rgba(255, 207, 226, ${star.alpha * pulse})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, TAU);
      ctx.fill();
    }
  }

  function drawAura(centerX, centerY) {
    const radius = Math.min(state.width * 0.48, 390) * state.scale;
    const aura = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    aura.addColorStop(0, `rgba(255, 42, 116, ${0.11 + state.flash * 0.13})`);
    aura.addColorStop(0.26, "rgba(173, 24, 79, 0.065)");
    aura.addColorStop(0.64, "rgba(78, 8, 36, 0.028)");
    aura.addColorStop(1, "rgba(20, 2, 10, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, TAU);
    ctx.fill();
  }

  function smoothClosedPath(points) {
    const last = points[points.length - 1];
    const first = points[0];
    ctx.beginPath();
    ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const next = points[(index + 1) % points.length];
      ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    ctx.closePath();
  }

  function smoothOpenPath(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index];
      const next = points[index + 1];
      ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  function petalTrace(petal, v, samples, centerX, centerY) {
    const points = [];
    const pulse = 1 + state.flash * 0.028;
    for (let index = 0; index <= samples; index += 1) {
      const point = petalPosition(petal, index / samples, v);
      point.x *= pulse;
      point.y *= pulse;
      point.z *= pulse;
      points.push(projectPoint(point, centerX, centerY));
    }
    return points;
  }

  function drawBloom(centerX, centerY) {
    const samples = state.mobile ? 10 : 14;
    const renderedPetals = state.petals.map((petal) => {
      const left = petalTrace(petal, -1, samples, centerX, centerY);
      const right = petalTrace(petal, 1, samples, centerX, centerY);
      const center = petalTrace(petal, 0, samples, centerX, centerY);
      const boundary = [...left, ...right.slice().reverse()];
      const depth = center.reduce((sum, point) => sum + point.z, 0) / center.length;
      return { petal, left, right, center, boundary, depth };
    });

    renderedPetals.sort((left, right) => right.depth - left.depth);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const rendered of renderedPetals) {
      const { petal, boundary, center } = rendered;
      const base = center[0];
      const tip = center[center.length - 1];
      const facing = 0.5 + Math.cos(petal.angle - state.rotationY) * 0.5;
      const depthLight = clamp(1 - rendered.depth / 360, 0.68, 1.22);
      const baseLight = clamp(petal.baseLight * depthLight, 28, 72);
      const highlight = clamp(baseLight + 14 + facing * 9, 44, 86);

      const bodyGradient = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
      bodyGradient.addColorStop(0, `hsla(${petal.hue + 4}, ${petal.saturation}%, ${clamp(baseLight - 12, 22, 60)}%, 0.94)`);
      bodyGradient.addColorStop(0.46, `hsla(${petal.hue - 3}, ${petal.saturation + 4}%, ${highlight}%, 0.96)`);
      bodyGradient.addColorStop(0.78, `hsla(${petal.hue}, ${petal.saturation}%, ${clamp(baseLight + 9, 38, 77)}%, 0.94)`);
      bodyGradient.addColorStop(1, `hsla(${petal.hue + 5}, ${petal.saturation}%, ${clamp(baseLight - 1, 30, 68)}%, 0.9)`);

      smoothClosedPath(boundary);
      ctx.fillStyle = bodyGradient;
      ctx.fill();
      ctx.strokeStyle = `hsla(${petal.hue - 5}, 100%, 86%, ${0.13 + facing * 0.08})`;
      ctx.lineWidth = 0.55 + state.scale * 0.26;
      ctx.stroke();

      const innerLeft = petalTrace(petal, -0.25, samples, centerX, centerY).slice(1);
      const innerRight = petalTrace(petal, 0.18, samples, centerX, centerY).slice(1).reverse();
      const sheen = [...innerLeft, ...innerRight];
      const sheenGradient = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
      sheenGradient.addColorStop(0, "rgba(255,255,255,0)");
      sheenGradient.addColorStop(0.45, `rgba(255, 228, 239, ${0.04 + facing * 0.08})`);
      sheenGradient.addColorStop(0.82, `rgba(255, 245, 249, ${0.1 + facing * 0.1})`);
      sheenGradient.addColorStop(1, "rgba(255,255,255,0)");
      smoothClosedPath(sheen);
      ctx.fillStyle = sheenGradient;
      ctx.fill();

      smoothOpenPath(center.slice(1));
      ctx.strokeStyle = `rgba(255, 235, 243, ${0.06 + facing * 0.07})`;
      ctx.lineWidth = 0.45 + state.scale * 0.22;
      ctx.stroke();
    }
  }

  function drawSparkles(time, centerX, centerY) {
    const burst = Math.max(0, state.sparkBurst);
    const points = [];
    for (const sparkle of state.sparkles) {
      const petal = state.petals[sparkle.petalIndex];
      const point = petalPosition(petal, sparkle.u, sparkle.v);
      const localBurst = Math.max(0, burst - sparkle.delay * 0.32);
      const scatter = smoothstep(0, 1, Math.min(1, localBurst));
      point.x += sparkle.jitterX + sparkle.scatterX * scatter;
      point.y += sparkle.jitterY + sparkle.scatterY * scatter;
      point.z += sparkle.jitterZ + sparkle.scatterZ * scatter;

      const projected = projectPoint(point, centerX, centerY);
      points.push({ ...projected, sparkle });
    }

    points.sort((a, b) => b.z - a.z);
    ctx.globalCompositeOperation = "lighter";
    for (const point of points) {
      const sparkle = point.sparkle;
      const twinkle = reduceMotion ? 0.75 : 0.58 + Math.sin(time * 0.0022 + sparkle.phase) * 0.42;
      const depth = clamp(0.92 - point.z / 520, 0.45, 1.2);
      const alpha = sparkle.alpha * twinkle * depth;
      const size = Math.max(0.25, sparkle.size * state.scale * point.perspective);
      ctx.fillStyle = `rgba(${sparkle.r}, ${sparkle.g}, ${sparkle.b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawDust(time, centerX, centerY) {
    ctx.globalCompositeOperation = "lighter";
    for (const dust of state.dust) {
      const angle = dust.angle + (reduceMotion ? 0 : time * dust.speed);
      const point = {
        x: Math.cos(angle) * dust.radius,
        y: dust.height + Math.sin(time * 0.00042 + dust.phase) * 16,
        z: Math.sin(angle) * dust.radius * 0.38 + dust.depth,
      };
      const projected = projectPoint(point, centerX, centerY);
      const pulse = reduceMotion ? 0.65 : 0.52 + Math.sin(time * 0.0016 + dust.phase) * 0.48;
      ctx.fillStyle = `rgba(255, 121, 169, ${dust.alpha * pulse})`;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, dust.size * projected.perspective, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function render(time) {
    requestAnimationFrame(render);
    if (time - state.lastDraw < state.frameInterval) return;
    state.lastDraw = time;

    const delta = Math.min(34, time - state.lastTime);
    state.lastTime = time;
    const ease = 1 - Math.pow(0.001, delta / 1000);

    if (!state.pointerDown) state.targetRotationY += state.autoRotation * delta;
    state.rotationX += (state.targetRotationX - state.rotationX) * ease * 2.45;
    state.rotationY += (state.targetRotationY - state.rotationY) * ease * 2.45;
    state.openness += (state.targetOpenness - state.openness) * ease * 0.7;
    state.sparkBurst += (0 - state.sparkBurst) * ease * 0.82;
    state.flash *= Math.pow(0.982, delta);

    ctx.clearRect(0, 0, state.width, state.height);
    drawStars(time);

    const centerX = state.width / 2;
    const centerY = state.height * (state.mobile ? 0.505 : 0.53);
    drawAura(centerX, centerY);
    drawDust(time, centerX, centerY);
    drawBloom(centerX, centerY);
    drawSparkles(time, centerX, centerY);
  }

  function triggerBloom() {
    if (!reduceMotion) {
      state.openness = 0.16;
      state.targetOpenness = 1;
      state.sparkBurst = 1.08;
      state.flash = 1;
      state.autoRotation = 0.0017;
      clearTimeout(triggerBloom.timer);
      triggerBloom.timer = setTimeout(() => {
        state.autoRotation = 0.0007;
      }, 2100);
    }
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
    state.targetRotationX = clamp(state.targetRotationX + dy * 0.005, -1.05, -0.15);
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

