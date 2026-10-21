# pip install flask flask-cors google-genai python-dotenv
import os
import time
from collections import defaultdict, deque

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from google import genai
from google.genai import types

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=None)
CORS(app)

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise Exception("GEMINI_API_KEY não encontrada no arquivo .env")

client = genai.Client(api_key=API_KEY)
MODELO = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")

MAX_MENSAGEM = 500      # caracteres por mensagem
MAX_HISTORICO = 20      # mensagens anteriores enviadas ao modelo
LIMITE_POR_MINUTO = 15  # requisições por IP

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
- Quando fizer sentido, indique a seção do site (O reator, Simulador, Gráficos, Modelo 3D, Relatório, FAQ, Contato).
- Nunca diga que é o personagem original da Nickelodeon; você é só o mascote do projeto, uma homenagem escolar.

Informações do projeto:
- O Earth Link é um reator de algas inspirado nos microrganismos que sustentam os ecossistemas oceânicos
  e produzem boa parte do oxigênio que respiramos. É um projeto educativo/escolar.
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
- Modelo 3D: o Plankton em 3D, que dá para girar arrastando. O modelo 3D do reator foi feito no Tinkercad.
- Encomendas: preencher o formulário da seção Contato (nome, e-mail, aparência, uso, tamanho e detalhes).
  O aplicativo de e-mail abre com a mensagem pronta para enviar. Opções de aparência: pequeno e compacto, maior
  para produção ampliada, personalizado, ou ainda indefinido. Usos: escolar/educativo, pesquisa, cultivo de algas, outro.
  Tamanhos: pequeno, médio, grande ou ajuda para escolher. Não há preços nem prazos divulgados no site.
- Contato: rm13469@fiap.com.br
"""

config = types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT)

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


@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:arquivo>")
def estaticos(arquivo):
    if arquivo not in ("style.css", "script.js", "chatbot.css", "chatbot.js"):
        return "", 404
    return send_from_directory(BASE_DIR, arquivo)


@app.route("/chat", methods=["POST"])
def chat():
    """Recebe a mensagem e o histórico do navegador e responde com o Gemini."""
    if limite_excedido(request.remote_addr):
        return jsonify({"resposta": "Calma! Muitas perguntas seguidas. Tente de novo em instantes."}), 429

    dados = request.get_json(silent=True) or {}
    pergunta = str(dados.get("mensagem", "")).strip()
    if not pergunta:
        return jsonify({"resposta": "Escreva uma mensagem para eu poder ajudar."}), 400
    pergunta = pergunta[:MAX_MENSAGEM]

    # O histórico fica no navegador (cada visitante tem o seu).
    historico = []
    for item in (dados.get("historico") or [])[-MAX_HISTORICO:]:
        papel = "model" if item.get("role") == "model" else "user"
        texto = str(item.get("text", ""))[:MAX_MENSAGEM * 4]
        if texto:
            historico.append({"role": papel, "parts": [{"text": texto}]})
    historico.append({"role": "user", "parts": [{"text": pergunta}]})

    try:
        resposta = client.models.generate_content(
            model=MODELO, contents=historico, config=config
        )
        texto = (resposta.text or "").strip()
        if not texto:
            texto = "Não tenho as informações necessárias sobre isso."
        return jsonify({"resposta": texto})
    except Exception as erro:
        print("ERRO", erro)
        return jsonify({
            "resposta": "Desculpe, ocorreu um erro ao conversar com o Gemini. Tente novamente."
        }), 500


if __name__ == "__main__":
    app.run(debug=True)
