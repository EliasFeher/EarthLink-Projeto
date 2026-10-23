(() => {
    "use strict";
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    // A animação é a atração principal do site: ela roda mesmo se o sistema pedir "menos movimento".
    // Quem preferir pode pausar tudo no botão "Pausar animações".
    const reduce = false;
    const root = document.documentElement;

    /* ---------- Navbar, progresso, voltar ao topo ---------- */
    const progress = $("#progress"), topo = $("#topo");
    const links = $$(".nav-links a");
    const onScroll = () => {
        const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
        progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
        topo.classList.toggle("show", y > 700);
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const menuBtn = $("#menuBtn"), navLinks = $("#navLinks");
    const setMenu = open => {
        navLinks.classList.toggle("open", open);
        menuBtn.setAttribute("aria-expanded", open);
    };
    menuBtn.addEventListener("click", () => setMenu(!navLinks.classList.contains("open")));
    links.forEach(a => a.addEventListener("click", () => setMenu(false)));
    addEventListener("keydown", e => e.key === "Escape" && setMenu(false));

    const secObs = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    }), { rootMargin: "-45% 0px -50% 0px" });
    $$("main section[id]").forEach(s => secObs.observe(s));

    /* ---------- Reveal + contadores ---------- */
    const countUp = el => {
        const target = +el.dataset.count, suffix = el.dataset.suffix || "";
        if (reduce) { el.textContent = target + suffix; return; }
        const t0 = performance.now(), dur = 1500;
        const tick = t => {
            const p = Math.min((t - t0) / dur, 1), eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased) + suffix;
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    };
    const revObs = new IntersectionObserver(es => es.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        $$("[data-count]", e.target).forEach(countUp);
        revObs.unobserve(e.target);
    }), { threshold: 0.15 });
    $$(".reveal").forEach(el => revObs.observe(el));

    /* ---------- Simulador (mini-jogo) ---------- */
    const luz = $("#luz"), temp = $("#temp"), ph = $("#ph");
    const cv = $("#grafico-sim"), tk = $("#tanque"), cf = $("#confete"), card = $("#simCard");
    const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
    const fLuz = l => { const x = l / 75; return x * Math.exp(1 - x); }; // ótimo em 75%, excesso inibe
    const fTemp = t => gauss(t, 26, 5.5);
    const fPh = p => gauss(p, 8, 1.1);
    const eficiencia = () => Math.min(1, fLuz(+luz.value) * fTemp(+temp.value) * fPh(+ph.value));
    const biomass = (e, d) => {
        const K = e * 100, r = 0.15 + e * 0.85, B0 = 5;
        return K <= B0 ? B0 * Math.exp(-(B0 - K + 1) * 0.04 * d) : K / (1 + ((K - B0) / B0) * Math.exp(-r * d));
    };
    const fillRange = el => el.style.setProperty("--fill", ((el.value - el.min) / (el.max - el.min)) * 100 + "%");
    const lerp = (a, b, t) => a + (b - a) * t;
    const fit = c => {
        const dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
        return [x, w, h];
    };
    const rrect = (x, a, b, w, h, r) => {
        x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
        x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
    };

    let shown = 0, target = 0, dayNow = 14, playing = false, playT0 = 0, looping = false, simVisible = false, prevPct = 0;
    const cells = [], bubbles = [], confetti = [];

    /* gráfico */
    const drawChart = () => {
        const [cx, w, h] = fit(cv);
        const pad = { l: 40, r: 14, t: 14, b: 28 }, pw = w - pad.l - pad.r, ph_ = h - pad.t - pad.b;
        cx.font = "700 11px Inter, sans-serif"; cx.fillStyle = "#6a684f"; cx.strokeStyle = "rgba(70,90,60,.22)"; cx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = pad.t + (ph_ * i) / 4;
            cx.beginPath(); cx.moveTo(pad.l, y); cx.lineTo(w - pad.r, y); cx.stroke();
            cx.textAlign = "right"; cx.fillText(100 - i * 25 + "%", pad.l - 6, y + 4);
        }
        cx.textAlign = "center";
        for (let d = 0; d <= 14; d += 2) { const gx = pad.l + (pw * d) / 14; cx.beginPath(); cx.moveTo(gx, pad.t); cx.lineTo(gx, h - pad.b); cx.stroke(); }
        for (let d = 0; d <= 14; d += 2) cx.fillText("D" + d, pad.l + (pw * d) / 14, h - 8);
        const pts = [];
        for (let i = 0; i <= 100; i++) {
            const d = (i / 100) * 14;
            pts.push([pad.l + (pw * d) / 14, pad.t + ph_ * (1 - Math.min(biomass(shown, d), 100) / 100)]);
        }
        const upto = Math.max(1, Math.round((dayNow / 14) * 100));
        const path = n => { cx.beginPath(); pts.slice(0, n + 1).forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y))); };
        path(100); cx.strokeStyle = "rgba(47,122,31,.4)"; cx.setLineDash([5, 6]); cx.lineWidth = 2; cx.stroke(); cx.setLineDash([]);
        const g = cx.createLinearGradient(0, pad.t, 0, h - pad.b);
        g.addColorStop(0, "rgba(95,179,54,.42)"); g.addColorStop(1, "rgba(95,179,54,0)");
        path(upto); cx.lineTo(pts[upto][0], h - pad.b); cx.lineTo(pad.l, h - pad.b); cx.closePath(); cx.fillStyle = g; cx.fill();
        path(upto); cx.strokeStyle = "#2f7a1f"; cx.lineWidth = 4; cx.lineJoin = "round"; cx.lineCap = "round"; cx.stroke();
        const [lx, ly] = pts[upto];
        cx.strokeStyle = "rgba(40,50,30,.45)"; cx.lineWidth = 1; cx.setLineDash([3, 4]);
        cx.beginPath(); cx.moveTo(lx, pad.t); cx.lineTo(lx, h - pad.b); cx.stroke(); cx.setLineDash([]);
        cx.fillStyle = "#ffd23f"; cx.strokeStyle = "#14451e"; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(lx, ly, 7, 0, 6.283); cx.fill(); cx.stroke();
    };

    /* tanque do reator */
    const phHue = p => {
        const k = [[5, 0], [6, 30], [7, 110], [8, 170], [9, 215], [11, 285]];
        for (let i = 1; i < k.length; i++) if (p <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (p - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
        return 285;
    };
    const drawTank = t => {
        const [x, w, h] = fit(tk);
        const e = shown, dens = Math.min(1, biomass(e, dayNow) / 100), sick = e < 0.2;
        const x0 = w * 0.24, x1 = w * 0.76, top = 40, bot = h - 20, ly0 = top + 28;
        // lâmpada + feixes (chapados)
        x.fillStyle = "#3a5a55"; rrect(x, w * 0.36, 8, w * 0.28, 16, 5); x.fill();
        const L = +luz.value / 100;
        x.fillStyle = `rgba(255,225,120,${0.06 + L * 0.9})`; rrect(x, w * 0.4, 20, w * 0.2, 5, 2); x.fill();
        if (L > 0) {
            const bg = x.createLinearGradient(0, 24, 0, bot);
            bg.addColorStop(0, `rgba(255,230,140,${0.32 * L})`); bg.addColorStop(1, "rgba(255,230,140,0)");
            x.fillStyle = bg; x.beginPath(); x.moveTo(w * 0.4, 25); x.lineTo(w * 0.6, 25); x.lineTo(x1 - 6, bot); x.lineTo(x0 + 6, bot); x.closePath(); x.fill();
        }
        // líquido
        x.save(); rrect(x, x0, top, x1 - x0, bot - top, 24); x.clip();
        x.fillStyle = "#0b2a30"; x.fillRect(x0, top, x1 - x0, bot - top);
        const hue = sick ? 32 : lerp(52, 128, Math.min(1, dens * 1.15));
        x.fillStyle = `hsl(${hue} ${sick ? 38 : 62}% ${sick ? 30 : lerp(55, 26, dens)}%)`;
        x.beginPath(); x.moveTo(x0, bot);
        for (let px = x0; px <= x1; px += 4) x.lineTo(px, ly0 + Math.sin(px / 14 + t / 450) * 3);
        x.lineTo(x1, bot); x.closePath(); x.fill();
        // algas
        const want = Math.round(95 * dens);
        while (cells.length < want) cells.push({ nx: Math.random(), ny: Math.random(), ph: Math.random() * 6.28, r: 2 + Math.random() * 2.6 });
        while (cells.length > want) cells.pop();
        x.fillStyle = sick ? "#6b4a22" : "#2f7a1f";
        for (const c of cells) {
            if (!reduce) { c.nx += Math.sin(t / 900 + c.ph) * 0.0009; c.ny += Math.cos(t / 1100 + c.ph) * 0.0008 + (sick ? 0.0012 : 0); }
            c.nx = Math.min(0.96, Math.max(0.04, c.nx)); c.ny = Math.min(0.97, Math.max(0.04, c.ny));
            x.beginPath(); x.arc(x0 + c.nx * (x1 - x0), ly0 + 6 + c.ny * (bot - ly0 - 8), c.r, 0, 6.283); x.fill();
        }
        // bolhas
        if (!reduce && !sick && Math.random() < 0.05 + e * 0.35) bubbles.push({ nx: 0.12 + Math.random() * 0.76, y: bot - 6, v: 0.8 + Math.random() * 1.4, r: 2 + Math.random() * 4 });
        x.fillStyle = "rgba(233,248,244,.35)"; x.strokeStyle = "rgba(233,248,244,.8)"; x.lineWidth = 1.5;
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i]; b.y -= b.v;
            if (b.y < ly0 + 4) { bubbles.splice(i, 1); continue; }
            x.beginPath(); x.arc(x0 + b.nx * (x1 - x0) + Math.sin(b.y / 12) * 3, b.y, b.r, 0, 6.283); x.fill(); x.stroke();
        }
        x.restore();
        // vidro
        x.strokeStyle = "#7fd1b4"; x.lineWidth = 3; rrect(x, x0, top, x1 - x0, bot - top, 24); x.stroke();
        x.fillStyle = "rgba(255,255,255,.1)"; rrect(x, x0 + 8, top + 14, 7, (bot - top) * 0.55, 4); x.fill();
        x.fillStyle = "#3a5a55"; rrect(x, x0 + 14, top - 8, x1 - x0 - 28, 12, 4); x.fill();
        // termômetro
        const tv = +temp.value, frac = (tv - 10) / 30, tx = w * 0.9, ty0 = top + 22, ty1 = bot - 30;
        x.fillStyle = "rgba(255,255,255,.12)"; rrect(x, tx - 6, ty0, 12, ty1 - ty0, 6); x.fill();
        const col = `hsl(${215 - frac * 215} 85% 55%)`;
        x.fillStyle = col; x.beginPath(); x.arc(tx, ty1 + 10, 11, 0, 6.283); x.fill();
        rrect(x, tx - 4, ty1 - (ty1 - ty0) * frac, 8, (ty1 - ty0) * frac + 4, 4); x.fill();
        x.fillStyle = "#e9f8f4"; x.font = "700 11px Inter, sans-serif"; x.textAlign = "center";
        x.fillText(tv + " °C", tx, ty0 - 8);
        // medidor de pH (papel de tornassol)
        const pv = +ph.value, sx = w * 0.1;
        x.fillStyle = `hsl(${phHue(pv)} 80% 52%)`; x.strokeStyle = "#e9f8f4"; x.lineWidth = 2.5;
        x.beginPath(); x.arc(sx, top + 70, 14, 0, 6.283); x.fill(); x.stroke();
        x.fillStyle = "#e9f8f4"; x.fillText("pH " + pv.toFixed(1).replace(".", ","), sx, top + 100);
        x.fillStyle = "#9cbdb8"; x.font = "600 10px Inter, sans-serif"; x.fillText("Dia " + Math.floor(dayNow), w / 2, h - 4);
    };

    /* confete */
    const burst = () => {
        if (reduce) return;
        for (let i = 0; i < 130; i++) confetti.push({
            x: card.clientWidth * (0.2 + Math.random() * 0.6), y: card.clientHeight * 0.25,
            vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 11 - 3, s: 5 + Math.random() * 6,
            c: ["#a2f05e", "#ffd23f", "#4cc9f0", "#ff6b6b", "#fff"][i % 5], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 0
        });
        startLoop();
    };
    const drawConfetti = () => {
        const [x] = fit(cf);
        for (let i = confetti.length - 1; i >= 0; i--) {
            const p = confetti[i]; p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life++;
            if (p.life > 150 || p.y > card.clientHeight + 20) { confetti.splice(i, 1); continue; }
            x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.fillStyle = p.c; x.globalAlpha = Math.min(1, (150 - p.life) / 40);
            x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore();
        }
    };

    /* Plankton reage */
    const face = {
        body: $("#faceBody"), hood: $("#faceHood"), brow: $("#faceBrow"), mouth: $("#faceMouth"), pupil: $("#facePupil"), el: $("#face"),
        msg: $("#plkMsg"), hint: $("#plkHint")
    };
    const setFace = (pct, lf, tf, pf) => {
        let b1, b2, mouth, fill, pr, msg, cls;
        if (pct >= 95) { b1 = 40; b2 = 38; mouth = "M32 79Q50 99 68 79Q50 87 32 79z"; fill = true; pr = 7; msg = "MUAHAHA! Perfeito! O plano está funcionando!"; cls = "happy"; }
        else if (pct >= 80) { b1 = 41; b2 = 41; mouth = "M34 80Q50 94 66 80Q50 86 34 80z"; fill = true; pr = 6.5; msg = "Quase lá! Só mais um ajustezinho..."; cls = "happy"; }
        else if (pct >= 55) { b1 = 40; b2 = 46; mouth = "M36 83Q50 88 64 81"; fill = false; pr = 6; msg = "Dá pro gasto, mas a Karen está rindo de mim."; cls = ""; }
        else if (pct >= 25) { b1 = 46; b2 = 40; mouth = "M36 87Q50 80 64 87"; fill = false; pr = 5; msg = "Ai, ai... as algas estão sofrendo!"; cls = ""; }
        else { b1 = 36; b2 = 56; mouth = "M33 89Q50 73 67 89Q50 83 33 89z"; fill = true; pr = 3; msg = "DESASTRE! Alguém chama a Karen!"; cls = "sad"; }
        face.hood.setAttribute("points", `18,16 82,16 82,${b2} 18,${b1}`);
        face.brow.setAttribute("d", `M18 ${b1} L82 ${b2}`);
        face.mouth.setAttribute("d", mouth);
        face.mouth.setAttribute("fill", fill ? "#14451e" : "none"); face.pupil.setAttribute("r", pr);
        const pe = pct / 100;
        face.body.setAttribute("fill", `hsl(${72 + 30 * pe} ${25 + 25 * pe}% 44%)`);
        face.el.className.baseVal = "face " + cls;
        face.msg.textContent = msg;
        const worst = Math.min(lf, tf, pf);
        const l = +luz.value, t = +temp.value, p = +ph.value;
        let hint = "Tudo no ponto ideal.";
        if (worst < 0.92) {
            if (worst === lf) hint = l < 75 ? (l < 35 ? "Tá escuro! Acende a luz!" : "☀Dá pra ter um pouco mais de luz.") : "Luz demais! Óculos escuros nas algas!";
            else if (worst === tf) hint = t < 26 ? (t < 20 ? "Que frio! As algas estão congelando!" : "Um pouquinho mais quente ajudaria.") : (t > 32 ? "Que calor! Virou sopa de algas!" : "Está um pouco quente.");
            else hint = p < 8 ? (p < 7 ? "Ácido demais! Parece limonada!" : "O pH está um pouco baixo.") : (p > 9 ? "Básico demais! Parece sabão!" : "O pH está um pouco alto.");
        }
        face.hint.textContent = hint;
    };

    /* conquistas */
    const unlocked = new Set();
    const toast = $("#toast");
    let toastT;
    const showToast = txt => {
        toast.textContent = txt; toast.classList.add("show");
        clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove("show"), 2800);
    };
    const NOMES = { perfeito: "Conquista: Cultivo perfeito!", gelo: "Conquista: Congelou!", fogo: "Conquista: Fervendo!", breu: "Conquista: Breu total!", acido: "Conquista: Limonada!", sabao: "Conquista: Sabão!" };
    const unlock = k => {
        if (unlocked.has(k)) return;
        unlocked.add(k);
        $(`.badge[data-k="${k}"]`).classList.add("on");
        $("#achCount").textContent = unlocked.size + "/6";
        showToast(NOMES[k]);
    };

    /* atualização */
    const tag = $("#simTag"), stars = $$("#stars i");
    const update = () => {
        [luz, temp, ph].forEach(fillRange);
        $("#luzOut").textContent = luz.value + "%";
        $("#tempOut").textContent = temp.value + " °C";
        $("#phOut").textContent = (+ph.value).toFixed(1).replace(".", ",");
        target = eficiencia();
        const pct = Math.round(target * 100);
        const [cls, txt] = pct >= 80 ? ["otimo", "Ótimo"] : pct >= 55 ? ["bom", "Bom"] : pct >= 25 ? ["atencao", "Atenção"] : ["critico", "Crítico"];
        tag.className = "tag " + cls; tag.textContent = txt;
        [50, 80, 95].forEach((m, i) => stars[i].classList.toggle("on", pct >= m));
        setFace(pct, fLuz(+luz.value), fTemp(+temp.value), fPh(+ph.value));
        if (pct >= 95 && prevPct < 95) { burst(); unlock("perfeito"); }
        prevPct = pct;
        if (+temp.value <= 12) unlock("gelo");
        if (+temp.value >= 38) unlock("fogo");
        if (+luz.value === 0) unlock("breu");
        if (+ph.value <= 5.5) unlock("acido");
        if (+ph.value >= 10.5) unlock("sabao");
        if (reduce) { shown = target; drawAll(); } else startLoop();
    };
    const drawAll = t => {
        $("#simScore").textContent = Math.round(shown * 100) + "%";
        $("#dayTag").textContent = "Dia " + Math.floor(dayNow);
        drawChart(); drawTank(t || 0); drawConfetti();
    };
    const tick = t => {
        shown += (target - shown) * 0.14;
        if (Math.abs(target - shown) < 0.002) shown = target;
        if (playing) {
            dayNow = Math.min(14, ((t - playT0) / 6500) * 14);
            if (dayNow >= 14) { playing = false; $("#playBtn").textContent = "Rodar 14 dias"; }
        }
        drawAll(t);
        looping = false;
        if (simVisible && !reduce) startLoop();
    };
    const startLoop = () => { if (!looping && !reduce) { looping = true; requestAnimationFrame(tick); } };

    [luz, temp, ph].forEach(el => el.addEventListener("input", () => { if (!playing) dayNow = 14; update(); }));
    $$(".chip").forEach(b => b.addEventListener("click", () => {
        let v;
        if (b.dataset.p === "rand") v = [Math.round(Math.random() * 100), 10 + Math.round(Math.random() * 30), (5 + Math.random() * 6).toFixed(1)];
        else v = b.dataset.p.split(",");
        [luz.value, temp.value, ph.value] = v;
        dayNow = 14; playing = false; $("#playBtn").textContent = "Rodar 14 dias";
        update();
    }));
    $("#playBtn").addEventListener("click", () => {
        if (reduce) { dayNow = 14; drawAll(); return; }
        playing = true; dayNow = 0; playT0 = performance.now(); $("#playBtn").textContent = "Crescendo…";
        startLoop();
    });
    new IntersectionObserver(([en]) => { simVisible = en.isIntersecting; if (simVisible) startLoop(); }).observe(card);
    addEventListener("resize", () => drawAll());
    shown = 0; update();

    /* ---------- Plankton do hero: cena animada em estilo de desenho (12 quadros/s) ---------- */
    (() => {
        const svg = $("#heroSvg");
        if (!svg) return;
        const g = id => document.getElementById(id);
        const rig = g("plkRig"), shadow = g("pShadow"), boilT = g("boilT");
        const armL = g("armL"), armR = g("armR"), handL = g("handL"), handR = g("handR");
        const antLp = g("antLp"), antLc = g("antLc"), antRp = g("antRp"), antRc = g("antRc");
        const iris = g("hIris"), pupil = g("hPupil"), hood = g("hHood"), hoodLine = g("hHoodLine");
        const lower = g("hLower"), lowerLine = g("hLowerLine"), blink = g("hBlink");
        const fala = g("fala"), t1 = g("fala1"), t2 = g("fala2");
        const mouths = ["smirk", "flat", "open", "o", "laugh1", "laugh2"].reduce((o, k) => (o[k] = g("m_" + k), o), {});

        const FPS = 12, LOOP = 14, SPEED = 0.55; // SPEED < 1 deixa a cena mais lenta
        const lerp = (a, b, k) => a + (b - a) * k;
        const clamp01 = k => Math.min(1, Math.max(0, k));
        const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

        // roteiro: pose principal em cada momento (interpolada com ease entre as marcas)
        // [Lhx,Lhy,Lcx,Lcy, Rhx,Rhy,Rcx,Rcy, pálpebraE,pálpebraD, apertar, olharX,olharY, giro, acena,esfrega,risada]
        const IDLE = [50, 228, 66, 262, 262, 266, 232, 288, 198, 226, 0, 0.3, 0.2, 0, 1, 0, 0];
        const PLOT = [128, 298, 92, 320, 158, 298, 196, 320, 206, 238, 0, 0.9, 0.15, 0, 0, 1, 0];
        const POINT = [112, 304, 70, 298, 304, 246, 238, 264, 198, 226, 0, 1, 0, 3, 0, 0, 0];
        const LAUGH = [118, 302, 74, 306, 168, 302, 212, 306, 214, 232, 1, 0, 0, -4, 0, 0, 1];
        const KEYS = [[0, IDLE], [4.6, IDLE], [5.1, PLOT], [7.7, PLOT], [8.2, POINT], [9.9, POINT], [10.4, LAUGH], [12.6, LAUGH], [13.3, IDLE], [LOOP, IDLE]];
        const pose = t => {
            for (let i = 1; i < KEYS.length; i++) {
                if (t <= KEYS[i][0]) {
                    const [t0, a] = KEYS[i - 1], [t1_, b] = KEYS[i];
                    const k = ease(clamp01((t - t0) / (t1_ - t0)));
                    return a.map((v, n) => lerp(v, b[n], k));
                }
            }
            return IDLE;
        };

        // pulinho clássico: antecipação → impulso → ar → aterrissagem achatada → balanço
        const jump = t => {
            if (t < 2.6) return { dy: 0, sx: 1, sy: 1 };
            if (t < 3.2) { const k = ease((t - 2.6) / 0.6); return { dy: 5 * k, sx: 1 + 0.12 * k, sy: 1 - 0.16 * k }; }
            if (t < 3.4) { const k = (t - 3.2) / 0.2; return { dy: lerp(5, -10, k), sx: lerp(1.12, 0.9, k), sy: lerp(0.84, 1.14, k) }; }
            if (t < 4.1) { const k = (t - 3.4) / 0.7; return { dy: -10 - 44 * Math.sin(Math.PI * k), sx: lerp(0.9, 0.96, k), sy: lerp(1.14, 1.06, k) }; }
            if (t < 4.25) { const k = (t - 4.1) / 0.15; return { dy: lerp(-10, 0, k), sx: 1.18, sy: 0.8 }; }
            if (t < 4.9) {
                const k = (t - 4.25) / 0.65, d = Math.exp(-5 * k) * Math.cos(k * 18);
                return { dy: 0, sx: 1 + 0.18 * d, sy: 1 - 0.2 * d };
            }
            return { dy: 0, sx: 1, sy: 1 };
        };

        // falas sincronizadas com a cena
        const FALAS = [
            { t0: 5.2, t1: 7.6, l: ["Meu plano genial:", "algas pelo planeta!"] },
            { t0: 8.3, t1: 9.9, l: ["Luz, pH, calor...", "tudo sob controle."] },
            { t0: 10.5, t1: 12.5, l: ["MUAHAHAHA!", "O mundo será verde!"] }
        ];
        const BLINKS = [1.9, 6.2, 12.9];
        const VISEMES = ["open", "o", "smirk", "open", "open", "o", "smirk", "o"];

        // antenas: mola de 2ª ordem (movimento secundário)
        const ant = [{ a: 0, v: 0, ph: 0, sg: 1 }, { a: 0, v: 0, ph: 1.7, sg: -1 }];
        const REST = [{ bx: 126, by: 186, vx: -30, vy: -66, p: antLp, c: antLc }, { bx: 160, by: 186, vx: 32, vy: -70, p: antRp, c: antRc }];
        let prevDy = 0, prevVy = 0, prevRot = 0;
        const rot2 = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

        const ptr = { x: 0, y: 0, at: -99 };
        addEventListener("pointermove", e => {
            const r = svg.getBoundingClientRect();
            const dx = e.clientX - (r.left + r.width * 0.33), dy = e.clientY - (r.top + r.height * 0.5);
            const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 280);
            ptr.x = (dx / d) * k; ptr.y = (dy / d) * k; ptr.at = performance.now();
        }, { passive: true });

        let lastFrame = -1, faceOff = true;
        const render = (tt, idx) => {
            const t = tt;                                    // já vem quantizado "em dois" (12 quadros/s)
            const p = pose(t);
            let [Lhx, Lhy, Lcx, Lcy, Rhx, Rhy, Rcx, Rcy, hL, hR, sq, lx, ly, rot, wave, rub, laugh] = p;
            const J = jump(t);
            let dy = J.dy, sx = J.sx, sy = J.sy;
            const br = Math.sin(t * 2.4) * 0.012;
            sy += br; sx -= br * 0.8;
            dy -= Math.abs(Math.sin(t * Math.PI * 4.5)) * 10 * laugh;
            sy += 0.05 * Math.sin(t * Math.PI * 9) * laugh; sx -= 0.04 * Math.sin(t * Math.PI * 9) * laugh;

            const w = t * 9;
            Lhx += wave * 10 * Math.sin(w); Lhy += wave * 5 * Math.cos(w); Lcy += wave * 3 * Math.sin(w);
            const rw = t * 22;
            Lhx += rub * 6 * Math.sin(rw); Lhy += rub * 3 * Math.cos(rw);
            Rhx -= rub * 6 * Math.sin(rw); Rhy += rub * 3 * Math.cos(rw);
            Lhy += laugh * 3 * Math.sin(t * Math.PI * 9); Rhy += laugh * 3 * Math.sin(t * Math.PI * 9);
            Rhy += (1 - rub - laugh) * 2 * Math.sin(t * 3);

            rig.setAttribute("transform", `translate(0 ${dy.toFixed(2)}) translate(143 392) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-143 -392)`);
            const lift = clamp01(-dy / 60);
            shadow.setAttribute("rx", (58 * (1 - lift * 0.4)).toFixed(1));
            shadow.setAttribute("opacity", (0.35 * (1 - lift * 0.5)).toFixed(2));

            // braços
            armL.setAttribute("d", `M92 282Q${Lcx.toFixed(1)} ${Lcy.toFixed(1)} ${Lhx.toFixed(1)} ${Lhy.toFixed(1)}`);
            handL.setAttribute("cx", Lhx.toFixed(1)); handL.setAttribute("cy", Lhy.toFixed(1));
            armR.setAttribute("d", `M196 282Q${Rcx.toFixed(1)} ${Rcy.toFixed(1)} ${Rhx.toFixed(1)} ${Rhy.toFixed(1)}`);
            handR.setAttribute("cx", Rhx.toFixed(1)); handR.setAttribute("cy", Rhy.toFixed(1));

            // antenas (física da mola)
            const dt = 1 / FPS, vy = (dy - prevDy) / dt, ay = (vy - prevVy) / dt, rv = (rot - prevRot) / dt;
            prevDy = dy; prevVy = vy; prevRot = rot;
            ant.forEach((s, i) => {
                const drive = Math.max(-40, Math.min(40, -ay * 0.02 * s.sg - rv * 0.12));
                const target = 0.07 * Math.sin(t * 2.1 + s.ph) + laugh * 0.35 * Math.sin(t * Math.PI * 9 + s.ph * 2);
                for (let n = 0; n < 4; n++) {
                    const h = dt / 4;
                    const acc = -130 * (s.a - target) - 7.5 * s.v + drive;
                    s.v += acc * h; s.a += s.v * h;
                }
                s.a = Math.max(-0.8, Math.min(0.8, s.a));
                const r = REST[i], ang = s.a * s.sg;
                const [tx, ty] = rot2(r.vx, r.vy, ang), [cx, cy] = rot2(r.vx * 0.5, r.vy * 0.5, ang * 0.35);
                r.p.setAttribute("d", `M${r.bx} ${r.by}Q${(r.bx + cx).toFixed(1)} ${(r.by + cy).toFixed(1)} ${(r.bx + tx).toFixed(1)} ${(r.by + ty).toFixed(1)}`);
                r.c.setAttribute("cx", (r.bx + tx).toFixed(1)); r.c.setAttribute("cy", (r.by + ty).toFixed(1));
            });

            // olho: pálpebra, apertar, piscar, olhar
            const hl = hL + sq * 10, hr = hR + sq * 10, lw = 276 - sq * 30;
            hood.setAttribute("points", `90,170 200,170 200,${hr.toFixed(1)} 90,${hl.toFixed(1)}`);
            hoodLine.setAttribute("d", `M90 ${hl.toFixed(1)} 200 ${hr.toFixed(1)}`);
            lower.setAttribute("points", `90,290 200,290 200,${(lw - 2).toFixed(1)} 90,${lw.toFixed(1)}`);
            lowerLine.setAttribute("d", `M90 ${lw.toFixed(1)} 200 ${(lw - 2).toFixed(1)}`);
            const bl = BLINKS.some(b => t >= b && t < b + 0.1) ? 1 : BLINKS.some(b => t >= b - 0.05 && t < b) ? 0.5 : 0.001;
            blink.setAttribute("transform", `translate(0 170) scale(1 ${bl}) translate(0 -170)`);
            const near = performance.now() - ptr.at < 2500;
            const ox = lx * 8 + (near ? ptr.x * 6 : 0), oy = ly * 5 + (near ? ptr.y * 4 : 0);
            iris.setAttribute("transform", `translate(${ox.toFixed(1)} ${oy.toFixed(1)})`);
            pupil.setAttribute("r", (12 - laugh * 3 - rub * 2).toFixed(1));

            // fala e boca
            const fl = FALAS.find(f => t >= f.t0 && t < f.t1);
            let m = laugh > 0.5 ? (idx % 2 ? "laugh1" : "laugh2") : (t > 13 ? "flat" : "smirk");
            if (fl) {
                const n = Math.floor((t - fl.t0) * 26), a = fl.l[0], b = fl.l[1];
                t1.textContent = a.slice(0, n); t2.textContent = b.slice(0, Math.max(0, n - a.length));
                if (laugh <= 0.5 && n < a.length + b.length) m = VISEMES[idx % VISEMES.length];
            }
            if (!!fl === faceOff) { faceOff = !fl; fala.classList.toggle("off", faceOff); }
            for (const k in mouths) mouths[k].setAttribute("display", k === m ? "inline" : "none");

            boilT.setAttribute("seed", String(1 + (idx % 3)));  // tremida do traço
        };

        let visible = true, t0 = performance.now();
        const tick = now => {
            if (!visible) return;
            if (root.classList.contains("sem-anim")) { t0 += 16.7; requestAnimationFrame(tick); return; }
            const idx = Math.floor(((now - t0) / 1000) * FPS), tt = ((idx * SPEED) / FPS + 1.8) % LOOP; // começa perto do 1º pulo
            if (idx !== lastFrame) { lastFrame = idx; render(tt, idx); }
            requestAnimationFrame(tick);
        };
        if (reduce) { svg.classList.add("parado"); render(0.5, 0); return; }
        new IntersectionObserver(([e]) => {
            const was = visible; visible = e.isIntersecting;
            if (visible && !was) { t0 = performance.now() - ((lastFrame / FPS) * 1000 || 0); requestAnimationFrame(tick); }
        }).observe(svg);
        requestAnimationFrame(tick);
    })();

    /* ---------- Funções do reator: seta na foto ---------- */
    // x/y = posição na foto (em %); lado = para onde a caixa de texto abre.
    const SENSORES = {
        ph:   { x: 37, y: 69, lado: "esq", titulo: "Sensor de pH", texto: "Fica mergulhado na água do tubo e mede a acidez do cultivo. Se o pH sai da faixa, as algas crescem menos." },
        temp: { x: 68, y: 49, lado: "dir", titulo: "Temperatura", texto: "Fica na parede do tubo e acompanha o calor do reator, para a água não esquentar nem esfriar demais." },
        luz:  { x: 50, y: 38, lado: "dir", titulo: "Iluminação", texto: "Fica na cúpula, por onde chega a luz que as algas usam para fazer fotossíntese." },
        bio:  { x: 33, y: 47, lado: "esq", titulo: "Biomassa", texto: "Observada dentro do tubo transparente: quanto mais verde a água, mais algas cresceram." }
    };
    const marcador = $("#marcador"), botoesSensor = $$("[data-sensor]");
    if (marcador) botoesSensor.forEach(btn => btn.addEventListener("click", () => {
        const ativo = btn.getAttribute("aria-pressed") === "true";
        botoesSensor.forEach(b => b.setAttribute("aria-pressed", "false"));
        if (ativo) { marcador.hidden = true; return; }
        const s = SENSORES[btn.dataset.sensor];
        btn.setAttribute("aria-pressed", "true");
        marcador.style.setProperty("--x", s.x + "%");
        marcador.style.setProperty("--y", s.y + "%");
        marcador.className = "marcador " + s.lado;
        $("strong", marcador).textContent = s.titulo;
        $("p", marcador).textContent = s.texto;
        // reinicia a animação de entrada
        marcador.hidden = true; void marcador.offsetWidth; marcador.hidden = false;
    }));

    /* ---------- Botão: pausar animações ---------- */
    const animBtn = $("#animBtn");
    if (animBtn) animBtn.addEventListener("click", () => {
        const off = root.classList.toggle("sem-anim");
        animBtn.textContent = off ? "Retomar animações" : "Pausar animações";
        animBtn.setAttribute("aria-pressed", off);
    });

    /* ---------- Formulário ---------- */
    const form = $("#formContato"), status = $("#formStatus");
    const DESTINO = "contato@earthlink-projeto.com.br";
    form.addEventListener("submit", e => {
        e.preventDefault();
        const v = id => $("#" + id).value.trim();
        const corpo =
            `Nome: ${v("nome")}\n` +
            `E-mail para resposta: ${v("email")}\n` +
            `Aparência desejada: ${v("aparencia")}\n` +
            `Uso do reator: ${v("uso")}\n` +
            `Tamanho desejado: ${v("tamanho")}\n` +
            `Dúvidas ou detalhes: ${v("mensagem") || "(nenhum)"}`;
        const url = `mailto:${DESTINO}?subject=${encodeURIComponent("Interesse em encomendar um reator de algas")}&body=${encodeURIComponent(corpo)}`;
        status.textContent = "Abrindo seu aplicativo de e-mail…";
        location.href = url;
        setTimeout(() => (status.textContent = `Se nada abriu, escreva para ${DESTINO}.`), 2500);
    });
})();
