(() => {
  "use strict";

  const canvas = document.querySelector("#rose");
  const ctx = canvas.getContext("2d", { alpha: true });
  const bloomButton = document.querySelector("#bloomButton");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    scale: 1,
    particles: [],
    stars: [],
    rotationX: -0.28,
    rotationY: 0,
    targetRotationX: -0.28,
    targetRotationY: 0,
    autoRotation: reduceMotion ? 0 : 0.0015,
    pointerDown: false,
    dragged: false,
    lastX: 0,
    lastY: 0,
    burst: 1.85,
    bloomPulse: 0,
    lastTime: performance.now(),
  };

  const palette = [
    [255, 244, 247],
    [255, 211, 224],
    [255, 157, 188],
    [255, 94, 142],
    [214, 43, 96],
    [118, 20, 59],
  ];

  const randomGaussian = () => {
    const u = Math.max(Math.random(), 1e-7);
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  function rosePoint(index, count) {
    const seed = Math.random();
    const isCore = seed < 0.19;
    let x;
    let y;
    let z;
    let tone;

    if (isCore) {
      const t = Math.random() * Math.PI * 10;
      const s = Math.pow(Math.random(), 0.72);
      const radius = 7 + s * 39 + 7 * Math.sin(t * 1.7);
      x = radius * Math.cos(t);
      z = radius * 0.72 * Math.sin(t);
      y = 69 - s * 86 + 15 * Math.sin(t * 1.7) * (1 - s);
      tone = 1 + Math.floor(Math.random() * 3);
    } else {
      const layer = Math.min(7, Math.floor(Math.pow(Math.random(), 0.82) * 8));
      const petalCounts = [3, 4, 5, 6, 7, 8, 10, 12];
      const petalCount = petalCounts[layer];
      const petal = Math.floor(Math.random() * petalCount);
      const across = Math.random() * 2 - 1;
      const growth = Math.pow(Math.random(), 0.78);
      const baseRadius = 11 + layer * 12.5;
      const length = 31 + layer * 4.2;
      const petalWidth = (Math.PI * 1.18) / petalCount;
      const roundness = 0.24 + 0.76 * Math.pow(Math.sin(Math.PI * Math.min(growth, 0.94)), 0.46);
      const offset = across * petalWidth * roundness;
      const theta = (petal / petalCount) * Math.PI * 2 + layer * 0.54 + offset;
      const radius = baseRadius + growth * length - across * across * (3 + layer * 0.45);

      x = radius * Math.cos(theta);
      z = radius * 0.76 * Math.sin(theta);

      const arch = Math.sin(Math.PI * growth) * (29 - layer * 1.4);
      const centralVein = (1 - across * across) * (8 + layer * 0.8);
      const tip = Math.max(0, growth - 0.69);
      const curledEdge = tip * tip * (125 + layer * 10);
      const ruffle = Math.sin(across * Math.PI * 3 + layer * 0.9) * growth * (2.5 + layer * 0.45);
      y = 67 - layer * 11.4 - growth * (27 + layer * 1.7) + arch + centralVein + curledEdge + ruffle;

      z += across * (2.5 + layer * 0.65) * Math.sin(theta);
      tone = Math.min(5, Math.floor(layer * 0.5 + Math.random() * 1.8));
    }

    const fuzz = 1.1;
    x += randomGaussian() * fuzz;
    y += randomGaussian() * fuzz;
    z += randomGaussian() * fuzz;

    const color = palette[tone];
    const phase = Math.random() * Math.PI * 2;
    const delay = index / count;
    return {
      x,
      y,
      z,
      homeX: x,
      homeY: y,
      homeZ: z,
      scatterX: randomGaussian() * 235,
      scatterY: randomGaussian() * 225,
      scatterZ: randomGaussian() * 210,
      r: color[0],
      g: color[1],
      b: color[2],
      size: 0.48 + Math.random() * 1.28,
      alpha: 0.24 + Math.random() * 0.64,
      phase,
      delay,
    };
  }

  function buildScene() {
    const mobile = state.width < 700;
    const count = mobile ? 6200 : 11200;
    state.particles = Array.from({ length: count }, (_, index) => rosePoint(index, count));

    const starCount = mobile ? 80 : 150;
    state.stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * state.width,
      y: Math.random() * state.height,
      size: Math.random() * 1.1 + 0.2,
      alpha: Math.random() * 0.35 + 0.04,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function resize() {
    const oldWidth = state.width;
    state.width = innerWidth;
    state.height = innerHeight;
    state.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const fitByWidth = state.width / 455;
    const fitByHeight = state.height / 660;
    state.scale = Math.min(fitByWidth, fitByHeight, 1.65);

    if (!state.particles.length || (oldWidth < 700) !== (state.width < 700)) {
      buildScene();
    } else {
      state.stars.forEach((star) => {
        star.x = Math.random() * state.width;
        star.y = Math.random() * state.height;
      });
    }
  }

  function rotatePoint(x, y, z) {
    const cosY = Math.cos(state.rotationY);
    const sinY = Math.sin(state.rotationY);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;

    const cosX = Math.cos(state.rotationX);
    const sinX = Math.sin(state.rotationX);
    return {
      x: x1,
      y: y * cosX - z1 * sinX,
      z: y * sinX + z1 * cosX,
    };
  }

  function drawStars(time) {
    for (const star of state.stars) {
      const twinkle = 0.55 + Math.sin(time * 0.0013 + star.phase) * 0.45;
      ctx.fillStyle = `rgba(255, 210, 229, ${star.alpha * twinkle})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGlow(centerX, centerY) {
    const radius = Math.min(state.width * 0.45, 310) * state.scale;
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    glow.addColorStop(0, `rgba(255, 67, 130, ${0.11 + state.bloomPulse * 0.08})`);
    glow.addColorStop(0.45, "rgba(132, 21, 65, 0.055)");
    glow.addColorStop(1, "rgba(30, 5, 16, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function render(time) {
    const delta = Math.min(32, time - state.lastTime);
    state.lastTime = time;
    const ease = 1 - Math.pow(0.001, delta / 1000);

    if (!state.pointerDown) {
      state.targetRotationY += state.autoRotation * delta;
    }
    state.rotationX += (state.targetRotationX - state.rotationX) * ease * 2.7;
    state.rotationY += (state.targetRotationY - state.rotationY) * ease * 2.7;
    state.burst += (0 - state.burst) * ease * 0.78;
    state.bloomPulse *= Math.pow(0.985, delta);

    ctx.clearRect(0, 0, state.width, state.height);
    drawStars(time);

    const centerX = state.width / 2;
    const centerY = state.height * (state.width < 600 ? 0.49 : 0.515);
    drawGlow(centerX, centerY);

    const points = [];
    const breathing = reduceMotion ? 1 : 1 + Math.sin(time * 0.00135) * 0.018;
    const scatterAmount = Math.max(0, state.burst);

    for (const particle of state.particles) {
      const localScatter = Math.max(0, scatterAmount - particle.delay * 0.48);
      const scatterEase = Math.min(1, localScatter);
      const homeEase = scatterEase * scatterEase * (3 - 2 * scatterEase);
      const shimmer = reduceMotion ? 0 : Math.sin(time * 0.0017 + particle.phase) * 0.7;

      const x = (particle.homeX * breathing + particle.scatterX * homeEase) * state.scale;
      const y = (particle.homeY * breathing + particle.scatterY * homeEase) * state.scale;
      const z = (particle.homeZ * breathing + particle.scatterZ * homeEase) * state.scale;
      const rotated = rotatePoint(x, y, z);
      const perspective = 560 / (560 + rotated.z);

      points.push({
        x: centerX + rotated.x * perspective,
        y: centerY - rotated.y * perspective,
        z: rotated.z,
        size: Math.max(0.45, particle.size * state.scale * perspective + shimmer * 0.08),
        color: particle,
        alpha: particle.alpha * (0.62 + perspective * 0.34),
      });
    }

    points.sort((a, b) => b.z - a.z);
    ctx.globalCompositeOperation = "lighter";
    for (const point of points) {
      const depthLight = Math.max(0.4, Math.min(1.15, 0.92 - point.z / 380));
      const alpha = Math.min(0.94, point.alpha * depthLight);
      ctx.fillStyle = `rgba(${point.color.r}, ${point.color.g}, ${point.color.b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    requestAnimationFrame(render);
  }

  function triggerBloom() {
    state.burst = 1.12;
    state.bloomPulse = 1;
    state.autoRotation = reduceMotion ? 0 : 0.0023;
    clearTimeout(triggerBloom.timer);
    triggerBloom.timer = setTimeout(() => {
      state.autoRotation = reduceMotion ? 0 : 0.0015;
    }, 1800);
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
    state.targetRotationY += dx * 0.008;
    state.targetRotationX = Math.max(-0.75, Math.min(0.55, state.targetRotationX + dy * 0.006));
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

