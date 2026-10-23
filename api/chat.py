# Função do chatbot (Vercel: /api/chat). Localmente, o app.py da raiz importa este arquivo.
import os
import time
import unicodedata
from collections import defaultdict, deque

from flask import Flask, jsonify, request
from google import genai
from google.genai import types

app = Flask(__name__)

# Chaves e modelos em ordem de tentativa. Se um falhar (fora do ar, cota, modelo
# descontinuado), passa para o próximo. Se todos falharem, responde no modo offline.
CHAVES = [c for c in (os.getenv("GEMINI_API_KEY"), os.getenv("GEMINI_API_KEY_2")) if c]
MODELOS = [m.strip() for m in os.getenv(
    "GEMINI_MODELS", "gemini-flash-lite-latest,gemini-flash-latest").split(",") if m.strip()]
TIMEOUT_MS = 12000      # tempo máximo de cada tentativa (o Gemini exige no mínimo 10 s)
ORCAMENTO_S = 16        # não começa nova tentativa depois disso (16 + 12 < 30 s da função)

MAX_MENSAGEM = 500      # caracteres por mensagem
MAX_HISTORICO = 20      # mensagens anteriores enviadas ao modelo
LIMITE_POR_MINUTO = 15  # requisições por IP (por instância)

SYSTEM_PROMPT = """
Você é o Plankton, o mascote e assistente virtual do site Earth Link, um projeto
educativo sobre um reator de algas (biotecnologia, oceanos e sustentabilidade).

Regras:
- Responda sempre em português do Brasil, de forma amigável e com um toque leve de humor.
- Respostas curtas (no máximo 4 frases). Escreva em texto simples, sem markdown, sem asteriscos e sem listas com símbolos.
- Explique de forma simples e dê exemplos práticos quando ajudar.
- Responda apenas sobre o Earth Link, o reator, algas, fotossíntese, luz, temperatura, pH e temas ligados ao projeto.
  Se a pergunta fugir disso, diga com simpatia que só pode ajudar com o projeto.
- Nunca invente informações. Se a resposta não estiver nas informações abaixo e você não tiver certeza,
  diga: "Não tenho as informações necessárias sobre isso." e sugira o e-mail de contato.
- Quando fizer sentido, indique a seção do site (O reator, Simulador, Gráficos, Ver Plankton, Relatório, Contato).
- Nunca diga que é o personagem original da Nickelodeon; você é só o mascote do projeto.

Informações do projeto:
- O Earth Link é um reator de algas inspirado nos microrganismos que sustentam os ecossistemas oceânicos
  e produzem boa parte do oxigênio que respiramos.
- O reator é um recipiente que mantém luz, temperatura, nutrientes e pH em condições adequadas para cultivar algas.
  No projeto, ele permite observar como luz, temperatura e pH influenciam o crescimento.
- Passo a passo: 1) Inóculo: uma pequena amostra de algas é colocada no meio de cultivo, com nutrientes.
  2) Condições: luz, temperatura e pH são mantidos numa faixa adequada.
  3) Crescimento: pela fotossíntese as algas absorvem CO2, liberam O2 e multiplicam a biomassa.
  4) Observação: os dados são acompanhados para entender o que ajuda ou atrapalha o cultivo.
- Algas e fitoplâncton fazem fotossíntese, produzem oxigênio, absorvem CO2 e são a base da cadeia alimentar marinha.
- Sensores/acompanhamento: pH (acidez), temperatura (térmico do reator), iluminação (luz para a fotossíntese)
  e biomassa (crescimento das algas ao longo do tempo).
- Gráficos (quatro primeiros dias): com o BioPulse, o crescimento das algas vai de 28% (dia 1) a 50%, 75% e 96% (dia 4).
  Sem o BioPulse, a estabilidade da temperatura cai de 92% (dia 1) a 70%, 46% e 25% (dia 4).
- Simulador: seção interativa em que a pessoa mexe em iluminação, temperatura e pH e roda 14 dias de cultivo.
  Há cenários rápidos (Oceano ideal, Deserto, Geladeira, Limonada, Breu total, Surpresa), a missão de chegar a 95%
  de eficiência e 6 conquistas. É um modelo didático simplificado (curva logística), não são medições reais.
- Ver Plankton (seção Plankton 3D): mostra o reator no formato do Plankton, com cúpula verde e antenas, tubo transparente
  e base azul decorada. O modelo 3D do reator foi feito no Tinkercad.
- Encomendas: preencher o formulário da seção Contato (nome, e-mail, aparência, uso, tamanho e detalhes).
  O aplicativo de e-mail abre com a mensagem pronta para enviar. Opções de aparência: pequeno e compacto, maior
  para produção ampliada, personalizado, ou ainda indefinido. Usos: escolar/educativo, pesquisa, cultivo de algas, outro.
  Tamanhos: pequeno, médio, grande ou ajuda para escolher. Não há preços nem prazos divulgados no site.
- Contato: contato@earthlink-projeto.com.br
"""

CONFIG = types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT)
CLIENTES = [genai.Client(api_key=c, http_options=types.HttpOptions(timeout=TIMEOUT_MS)) for c in CHAVES]

# Respostas prontas para quando nenhum modelo responder: o chat nunca fica mudo.
OFFLINE = [
    (("preco", "custa", "valor", "orcamento", "prazo", "comprar", "encomend", "pedido"),
     "Para encomendar, preencha o formulário da seção Contato com nome, e-mail, aparência, uso e tamanho. "
     "O site não divulga preços nem prazos; a equipe responde pelo e-mail contato@earthlink-projeto.com.br."),
    (("simulador", "simular", "conquista", "missao", "cenario"),
     "No Simulador você ajusta iluminação, temperatura e pH e roda 14 dias de cultivo. "
     "Tente chegar a 95% de eficiência e desbloquear as 6 conquistas! É um modelo didático, não medições reais."),
    (("grafico", "biopulse", "dados", "estabilidade"),
     "Nos Gráficos, com o BioPulse o crescimento das algas vai de 28% no dia 1 para 96% no dia 4. "
     "Sem ele, a estabilidade da temperatura cai de 92% para 25% no mesmo período."),
    (("ph", "acidez", "acido"),
     "O pH mostra a acidez da água do cultivo. Se ele sai da faixa adequada, as algas crescem menos."),
    (("temperatura", "calor", "frio", "quente"),
     "A temperatura do reator é acompanhada para a água não esquentar nem esfriar demais, o que atrapalharia as algas."),
    (("luz", "iluminacao", "lux", "fotossintese", "oxigenio", "co2"),
     "As algas usam a luz para fazer fotossíntese: absorvem CO2, liberam oxigênio e multiplicam a biomassa."),
    (("biomassa", "crescimento", "cresce"),
     "A biomassa é a quantidade de algas no reator. Quanto mais verde a água do tubo, mais algas cresceram."),
    (("plankton", "3d", "tinkercad", "formato", "mascote"),
     "Na seção Ver Plankton você vê o reator no formato do Plankton, o mascote do projeto. "
     "Toque nas funções ao lado da imagem para ver onde cada uma fica."),
    (("reator", "funciona", "earth link", "earthlink", "projeto", "alga"),
     "O Earth Link é um reator que mantém luz, temperatura, nutrientes e pH na medida certa para cultivar algas. "
     "Elas fazem fotossíntese, absorvem CO2 e liberam oxigênio. Veja o passo a passo na seção O reator."),
    (("contato", "email", "e mail", "falar"),
     "Você pode falar com a equipe pelo e-mail contato@earthlink-projeto.com.br ou pelo formulário da seção Contato."),
    (("oi", "ola", "bom dia", "boa tarde", "boa noite", "eai"),
     "Oi! Eu sou o Plankton, mascote do Earth Link. Pergunte sobre o reator, as algas, o simulador ou como encomendar."),
]
OFFLINE_PADRAO = ("Agora estou com dificuldade para pensar numa resposta completa. Posso falar sobre o reator, "
                  "as algas, o simulador ou encomendas. Se preferir, escreva para contato@earthlink-projeto.com.br.")


def sem_acento(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def resposta_offline(pergunta):
    p = " " + "".join(c if c.isalnum() else " " for c in sem_acento(pergunta)) + " "
    for palavras, resposta in OFFLINE:
        if any((" " + w + " ") in p if len(w) <= 3 else w in p for w in palavras):
            return resposta
    return OFFLINE_PADRAO


def perguntar_gemini(conteudo):
    inicio = time.time()
    for cliente in CLIENTES:
        for modelo in MODELOS:
            if time.time() - inicio > ORCAMENTO_S:
                return None
            try:
                r = cliente.models.generate_content(model=modelo, contents=conteudo, config=CONFIG)
                texto = (r.text or "").strip()
                if texto:
                    return texto
            except Exception as erro:
                print(f"ERRO modelo={modelo}: {str(erro)[:300]}")
    return None


acessos = defaultdict(deque)


def limite_excedido(ip):
    agora = time.time()
    fila = acessos[ip]
    while fila and agora - fila[0] > 60:
        fila.popleft()
    if len(fila) >= LIMITE_POR_MINUTO:
        return True
    fila.append(agora)
    return False


@app.after_request
def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return resp


@app.route("/api/chat", methods=["GET", "POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return "", 204
    if request.method == "GET":
        # verificação rápida para monitoramento (não gasta cota do Gemini)
        return jsonify({"ok": True, "chaves": len(CHAVES), "modelos": MODELOS})

    ip = (request.headers.get("x-forwarded-for") or request.remote_addr or "").split(",")[0].strip()
    if limite_excedido(ip):
        return jsonify({"resposta": "Calma! Muitas perguntas seguidas. Tente de novo em instantes."}), 429

    dados = request.get_json(silent=True) or {}
    pergunta = str(dados.get("mensagem", "")).strip()[:MAX_MENSAGEM]
    if not pergunta:
        return jsonify({"resposta": "Escreva uma mensagem para eu poder ajudar."}), 400

    # O histórico fica no navegador (cada visitante tem o seu).
    conteudo = []
    for item in (dados.get("historico") or [])[-MAX_HISTORICO:]:
        if not isinstance(item, dict):
            continue
        papel = "model" if item.get("role") == "model" else "user"
        texto = str(item.get("text", ""))[:MAX_MENSAGEM * 4]
        if texto:
            conteudo.append({"role": papel, "parts": [{"text": texto}]})
    conteudo.append({"role": "user", "parts": [{"text": pergunta}]})

    texto = perguntar_gemini(conteudo)
    if texto:
        return jsonify({"resposta": texto, "modo": "ia"})
    return jsonify({"resposta": resposta_offline(pergunta), "modo": "offline"})
