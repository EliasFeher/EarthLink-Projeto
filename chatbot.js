(() => {
    "use strict";
    // Se o chat ficar em outro endereço, defina window.EARTHLINK_CHAT_API antes deste script.
    const API = window.EARTHLINK_CHAT_API || "/api/chat";
    const ESPERA_MAX = 35000; // ms
    const BOAS_VINDAS = "Oi! Eu sou o Plankton, mascote da Earth Link. Pergunte sobre o BioPulse, nossa árvore líquida, as algas ou o simulador!";

    const abrir = document.createElement("button");
    abrir.type = "button";
    abrir.className = "chat-abrir";
    abrir.setAttribute("aria-label", "Abrir chat com o Plankton");
    abrir.setAttribute("aria-expanded", "false");
    abrir.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="currentColor"/></svg>';

    const painel = document.createElement("section");
    painel.className = "chat-painel";
    painel.hidden = true;
    painel.setAttribute("aria-label", "Chat com o Plankton");
    painel.innerHTML =
        '<header class="chat-topo"><strong>Plankton</strong><span>assistente da Earth Link</span>' +
        '<button type="button" class="chat-fechar" aria-label="Fechar chat">×</button></header>' +
        '<div class="chat-msgs" role="log" aria-live="polite"></div>' +
        '<form class="chat-form" autocomplete="off">' +
        '<input type="text" maxlength="500" placeholder="Digite sua pergunta" aria-label="Sua pergunta" required>' +
        '<button type="submit" class="botao botao-sm">Enviar</button></form>';
    document.body.append(abrir, painel);

    const msgs = painel.querySelector(".chat-msgs");
    const form = painel.querySelector(".chat-form");
    const input = form.querySelector("input");
    const enviar = form.querySelector("button");
    const historico = [];
    let ocupado = false;

    const limpa = t => t.replace(/\*\*?|__|^#+\s*/gm, "");
    const bolha = (texto, quem) => {
        const el = document.createElement("div");
        el.className = "chat-msg " + quem;
        el.textContent = texto;
        msgs.appendChild(el);
        msgs.scrollTop = msgs.scrollHeight;
        return el;
    };

    const perguntar = async texto => {
        if (ocupado || !texto) return;
        ocupado = true;
        enviar.disabled = true;
        bolha(texto, "eu");
        const espera = bolha("Plankton está pensando…", "bot pensando");
        const corpo = JSON.stringify({ mensagem: texto, historico: historico.slice(-20) });
        let resposta;
        // até 2 tentativas: cobre uma falha momentânea de rede
        for (let tentativa = 1; tentativa <= 2 && !resposta; tentativa++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), ESPERA_MAX);
            try {
                const r = await fetch(API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: corpo,
                    signal: ctrl.signal
                });
                const d = await r.json().catch(() => ({}));
                if (d.resposta) {
                    resposta = limpa(d.resposta);
                    if (r.ok) historico.push({ role: "user", text: texto }, { role: "model", text: resposta });
                } else if (r.status < 500 || tentativa === 2) {
                    resposta = "Desculpe, não consegui responder agora. Tente de novo em instantes.";
                }
            } catch (_) {
                if (tentativa === 2) resposta = "Estou sem conexão com o servidor agora. Confira sua internet e tente de novo.";
            } finally {
                clearTimeout(timer);
            }
        }
        espera.className = "chat-msg bot";
        espera.textContent = resposta;
        msgs.scrollTop = msgs.scrollHeight;
        ocupado = false;
        enviar.disabled = false;
        input.focus();
    };

    const alternar = aberto => {
        painel.hidden = !aberto;
        abrir.setAttribute("aria-expanded", aberto);
        if (aberto) input.focus(); else abrir.focus();
    };
    abrir.addEventListener("click", () => alternar(painel.hidden));
    painel.querySelector(".chat-fechar").addEventListener("click", () => alternar(false));
    addEventListener("keydown", e => e.key === "Escape" && !painel.hidden && alternar(false));

    form.addEventListener("submit", e => {
        e.preventDefault();
        const t = input.value.trim();
        input.value = "";
        perguntar(t);
    });

    bolha(BOAS_VINDAS, "bot");
})();
