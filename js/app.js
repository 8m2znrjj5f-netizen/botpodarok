/* ==========================================================================
   Подарок · мини-приложение Telegram
   Сердце из формулы, живой счётчик времени, телеграм-интеграция
   ========================================================================== */

(() => {
  "use strict";

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const haptic = (style = "light") => {
    try {
      tg?.HapticFeedback?.impactOccurred(style);
    } catch (_) {
      /* не в Telegram — просто без вибрации */
    }
  };

  /* ======================================================================
     1. Telegram WebApp
     ====================================================================== */

  function initTelegram() {
    const setVH = () => {
      const height =
        (tg && (tg.viewportStableHeight || tg.viewportHeight)) || window.innerHeight;
      if (height > 0) {
        document.documentElement.style.setProperty("--vh", `${height / 100}px`);
      }
    };

    setVH();
    window.addEventListener("resize", setVH, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(setVH, 250));

    if (!tg) return;

    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor?.("#1B1030");
      tg.setBackgroundColor?.("#1B1030");
      tg.disableVerticalSwipes?.();
      tg.MainButton?.hide?.();
    } catch (_) {
      /* старые версии клиента — не критично */
    }

    tg.onEvent?.("viewportChanged", setVH);
  }

  /* ======================================================================
     2. Счётчик «время вместе» с 26.10.2025
     ====================================================================== */

  const START = new Date("2025-10-26T00:00:00+03:00");
  const counter = {
    days: document.getElementById("days"),
    hours: document.getElementById("hours"),
    minutes: document.getElementById("minutes"),
    seconds: document.getElementById("seconds"),
    foot: document.getElementById("counterFoot"),
  };

  const pad = (n, len = 2) => String(n).padStart(len, "0");

  function plural(n, forms) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return forms[2];
    if (last > 1 && last < 5) return forms[1];
    if (last === 1) return forms[0];
    return forms[2];
  }

  function calendarParts(from, to) {
    let years = to.getFullYear() - from.getFullYear();
    let months = to.getMonth() - from.getMonth();
    let days = to.getDate() - from.getDate();

    if (days < 0) {
      months -= 1;
      const daysInPrevMonth = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
      days += daysInPrevMonth;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) };
  }

  function humanElapsed(from, to) {
    const { years, months, days } = calendarParts(from, to);
    const parts = [];
    if (years > 0) parts.push(`${years} ${plural(years, ["год", "года", "лет"])}`);
    if (months > 0) parts.push(`${months} ${plural(months, ["месяц", "месяца", "месяцев"])}`);
    if (days > 0 || parts.length === 0) {
      parts.push(`${days} ${plural(days, ["день", "дня", "дней"])}`);
    }
    if (parts.length > 1) {
      return `${parts.slice(0, -1).join(" ")} и ${parts[parts.length - 1]}`;
    }
    return parts[0];
  }

  function renderCounter() {
    if (!counter.days) return;

    const now = new Date();
    let diff = now.getTime() - START.getTime();

    if (diff < 0) {
      counter.days.textContent = "0";
      counter.hours.textContent = "00";
      counter.minutes.textContent = "00";
      counter.seconds.textContent = "00";
      counter.foot.textContent = "отсчёт начнётся 26.10.2025 ❤️";
      setTimeout(renderCounter, 1000);
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    counter.days.textContent = String(days);
    counter.hours.textContent = pad(hours);
    counter.minutes.textContent = pad(minutes);
    counter.seconds.textContent = pad(seconds);

    const human = humanElapsed(START, now);
    counter.foot.innerHTML = `уже <b>${human}</b> вместе — и это только начало`;

    /* выравниваем тик по границе секунды, чтобы не «дрожал» */
    const delay = 1000 - (diff % 1000) + 15;
    setTimeout(renderCounter, delay);
  }

  /* ======================================================================
     3. Сердце из формулы: (x² + y² − 1)³ − x²y³ = 0
     ====================================================================== */

  function initHeart() {
    const canvas = document.getElementById("heart");
    if (!canvas) return;

    const stage = document.getElementById("heartStage") || canvas.parentElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const COLORS = [
      [244, 114, 182], // розовое свечение
      [249, 168, 212], // светло-розовый
      [253, 230, 138], // золото
      [245, 233, 255], // текст
    ];

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let sparkles = [];
    let rafId = 0;
    let running = false;
    let lastTs = 0;
    const startedAt = performance.now();

    const sprites = COLORS.map(makeSprite);

    function makeSprite(rgb) {
      const size = 64;
      const sprite = document.createElement("canvas");
      sprite.width = size;
      sprite.height = size;
      const g = sprite.getContext("2d");
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
      grad.addColorStop(0.3, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`);
      grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      return sprite;
    }

    // Неявное уравнение сердца
    function heartF(x, y) {
      const a = x * x + y * y - 1;
      return a * a * a - x * x * y * y * y;
    }

    // Радиус границы сердца в направлении theta (f < 0 внутри)
    function boundaryRadius(theta) {
      const cx = Math.cos(theta);
      const sy = Math.sin(theta);
      let lo = 0;
      let hi = 1.9;
      if (heartF(hi * cx, hi * sy) < 0) return hi;
      for (let i = 0; i < 26; i += 1) {
        const mid = (lo + hi) / 2;
        if (heartF(mid * cx, mid * sy) < 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }

    function sampleHeart() {
      const points = [];
      const edgeCount = 620;

      for (let i = 0; i < edgeCount; i += 1) {
        const theta = (i / edgeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.06;
        const radius = boundaryRadius(theta) * (0.945 + Math.random() * 0.055);
        points.push({
          x: Math.cos(theta) * radius,
          y: Math.sin(theta) * radius,
          edge: true,
        });
      }

      let inside = 0;
      let guard = 0;
      while (inside < 300 && guard < 60000) {
        guard += 1;
        const x = (Math.random() * 2 - 1) * 1.25;
        const y = (Math.random() * 2 - 1) * 1.35;
        if (heartF(x, y) < 0) {
          points.push({ x, y, edge: false });
          inside += 1;
        }
      }
      return points;
    }

    function buildTargets() {
      const points = sampleHeart();

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const w = Math.max(0.001, maxX - minX);
      const h = Math.max(0.001, maxY - minY);
      const scale = Math.min((width * 0.86) / w, (height * 0.86) / h);

      const centerX = width / 2;
      const centerY = height / 2;

      return points.map((p) => {
        const screenX = centerX + (p.x - cx) * scale;
        const screenY = centerY - (p.y - cy) * scale;

        const goldChance = p.y > 0.35 ? 0.5 : 0.12;
        let colorIndex = 0;
        if (Math.random() < goldChance) colorIndex = 2;
        else if (Math.random() < 0.22) colorIndex = 1;
        else if (Math.random() < 0.06) colorIndex = 3;

        const core = p.edge ? 2.4 + Math.random() * 3.4 : 1.7 + Math.random() * 2.4;

        return {
          x: centerX + (Math.random() - 0.5) * width * 0.9,
          y: centerY + (Math.random() - 0.5) * height * 0.9,
          vx: 0,
          vy: 0,
          baseTx: screenX,
          baseTy: screenY,
          size: core,
          sprite: sprites[colorIndex],
          phase: Math.random() * Math.PI * 2,
          twinkle: 0.6 + Math.random() * 0.4,
          edge: p.edge,
        };
      });
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      particles = buildTargets();
      sparkles = [];

      if (reduceMotion) drawFrame(performance.now());
    }

    function beat(now) {
      const period = 1200;
      const t = (((now - startedAt) % period) + period) % period / period;
      const first = Math.exp(-Math.pow(t / 0.055, 2));
      const second = 0.6 * Math.exp(-Math.pow((t - 0.2) / 0.06, 2));
      return Math.min(1.2, first + second);
    }

    function drawFrame(now) {
      ctx.clearRect(0, 0, width, height);

      const pulse = reduceMotion ? 1 : 1 + 0.032 * beat(now);

      // мягкое свечение позади сердца
      const halo = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        Math.min(width, height) * 0.52
      );
      halo.addColorStop(0, "rgba(244,114,182,0.22)");
      halo.addColorStop(0.55, "rgba(244,114,182,0.07)");
      halo.addColorStop(1, "rgba(244,114,182,0)");
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = "lighter";

      const centerX = width / 2;
      const centerY = height / 2;

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];

        const sway = reduceMotion ? 0 : Math.sin(now * 0.0009 + p.phase) * 1.4;
        const targetX = centerX + (p.baseTx - centerX) * pulse + sway;
        const targetY = centerY + (p.baseTy - centerY) * pulse + Math.cos(now * 0.0007 + p.phase) * 1.2;

        p.vx += (targetX - p.x) * 0.055;
        p.vy += (targetY - p.y) * 0.055;
        p.vx *= 0.86;
        p.vy *= 0.86;
        p.x += p.vx;
        p.y += p.vy;

        const twinkle = reduceMotion
          ? 1
          : p.twinkle + 0.4 * Math.sin(now * 0.002 + p.phase * 3);
        const size = p.size * (1 + 0.18 * beat(now));

        ctx.globalAlpha = Math.max(0.18, Math.min(1, twinkle)) * (p.edge ? 0.95 : 0.7);
        ctx.drawImage(p.sprite, p.x - size, p.y - size, size * 2, size * 2);
      }

      // искры после «взрыва»
      for (let i = sparkles.length - 1; i >= 0; i -= 1) {
        const s = sparkles[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.045;
        s.vx *= 0.985;
        s.life -= 0.022;
        if (s.life <= 0) {
          sparkles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, s.life) * 0.9;
        const size = s.size * (0.6 + s.life);
        ctx.drawImage(s.sprite, s.x - size, s.y - size, size * 2, size * 2);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    function loop(now) {
      if (!running) return;
      const dt = lastTs ? Math.min(40, now - lastTs) : 16.7;
      lastTs = now;

      // физика считается в drawFrame; при сильном лаге просто рисуем
      drawFrame(now);
      rafId = requestAnimationFrame(loop);
    }

    function start() {
      if (running || reduceMotion) return;
      running = true;
      lastTs = 0;
      rafId = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }

    function burst(clientX, clientY) {
      if (reduceMotion) return;
      const rect = canvas.getBoundingClientRect();
      const bx = (clientX ?? rect.left + rect.width / 2) - rect.left;
      const by = (clientY ?? rect.top + rect.height / 2) - rect.top;

      particles.forEach((p) => {
        const dx = p.x - bx;
        const dy = p.y - by;
        const dist = Math.hypot(dx, dy) || 1;
        const power = Math.max(0, 1 - dist / 260) * 11 + 1.5;
        p.vx += (dx / dist) * power;
        p.vy += (dy / dist) * power;
      });

      for (let i = 0; i < 26; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 5;
        sparkles.push({
          x: bx,
          y: by,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          size: 1.8 + Math.random() * 3.2,
          life: 1,
          sprite: sprites[Math.random() < 0.5 ? 2 : 3],
        });
      }

      haptic("medium");
      start();
    }

    canvas.addEventListener("pointerdown", (event) => {
      burst(event.clientX, event.clientY);
    });

    document.querySelectorAll("[data-burst]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rect = canvas.getBoundingClientRect();
        burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
    });

    // пауза, когда сердце вне экрана или вкладка скрыта
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) start();
            else stop();
          });
        },
        { threshold: 0.05 }
      );
      io.observe(canvas);
    } else {
      start();
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });

    if ("ResizeObserver" in window) {
      let resizeTimer = 0;
      const ro = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 120);
      });
      ro.observe(stage);
    } else {
      window.addEventListener("resize", resize);
    }

    resize();
  }

  /* ======================================================================
     4. Появление секций при скролле
     ====================================================================== */

  function initReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (!("IntersectionObserver" in window) || reduceMotion) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    items.forEach((el) => io.observe(el));
  }

  /* ======================================================================
     5. Фото: лайтбокс
     ====================================================================== */

  function initPhoto() {
    const card = document.getElementById("photoCard");
    const box = document.getElementById("lightbox");
    const closeBtn = document.getElementById("lightboxClose");
    if (!card || !box) return;

    let closeTimer = 0;

    const open = () => {
      clearTimeout(closeTimer);
      box.hidden = false;
      document.body.classList.add("is-locked");
      requestAnimationFrame(() => box.classList.add("is-open"));
      haptic("light");
    };

    const close = () => {
      box.classList.remove("is-open");
      document.body.classList.remove("is-locked");
      closeTimer = setTimeout(() => {
        box.hidden = true;
      }, 240);
      haptic("light");
    };

    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "Открыть фото");

    box.addEventListener("click", (event) => {
      if (event.target === box) close();
    });
    closeBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !box.hidden) close();
    });
  }

  /* ======================================================================
     6. Летающие сердечки
     ====================================================================== */

  function initFloaties() {
    const holder = document.getElementById("floaties");
    if (!holder || reduceMotion) return;

    const chars = ["❤", "♡", "✦", "✧"];
    const count = 12;

    for (let i = 0; i < count; i += 1) {
      const el = document.createElement("span");
      el.className = "floaty" + (Math.random() < 0.3 ? " floaty--gold" : "");
      el.textContent = chars[Math.floor(Math.random() * chars.length)];
      el.style.left = `${Math.random() * 100}%`;
      el.style.fontSize = `${9 + Math.random() * 11}px`;
      el.style.animationDuration = `${14 + Math.random() * 14}s`;
      el.style.animationDelay = `${-Math.random() * 24}s`;
      el.style.setProperty("--drift", `${(Math.random() * 2 - 1) * 6}vw`);
      el.style.setProperty("--spin", `${(Math.random() * 2 - 1) * 24}deg`);
      holder.appendChild(el);
    }
  }

  /* ======================================================================
     7. Полоса прогресса прокрутки
     ====================================================================== */

  function initProgress() {
    const bar = document.getElementById("progress");
    if (!bar) return;

    let ticking = false;

    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.width = `${ratio * 100}%`;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
  }

  /* ======================================================================
     Запуск
     ====================================================================== */

  initTelegram();
  renderCounter();
  initHeart();
  initReveal();
  initPhoto();
  initFloaties();
  initProgress();
})();
