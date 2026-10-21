# pip install flask flask-cors google-genai python-dotenv
import os
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv
 
#Carrega  as variaveis de ambiente (.env)
load_dotenv()
 
app = Flask(__name__)
CORS(app)
 
# Validação e carregamento
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise Exception("GEMINI_API_KEY não encontrada no arquivo .env")
 
# Cliente do Gemini
client = genai.Client(api_key=API_KEY)
 
# Instrução do sistema (personalidade bot)
SYSTEM_PROMPT = """
Você é um assistente escolar chamado FiapSchool bot.
 
Regras:
- Responda sempre em inglês
- Seja amigável
- Explique de forma simples
- Use respostas curtas e resumidas. Lembre-se: você é um assistente e não o professor
- Indique continuidade de estudos
- Oriente sempre de forma que o aluno deva pensar
- Use exemplos práticos
- Nunca invente informações. Se não tem um respota diga simplesmente " NÃO TENHO AS INFORMAÇÕES NECESSÁRIAS "
- Incentive o aluno a estudar
"""
 
# Histórico de conversas (mantido na memória do servidor)
history = []
 
 
@app.route("/")
def home():
    """Renderiza a página HTML do chat"""
    return render_template("index.hmtl")
 
 
@app.route("/chat", methods=["POST"])
def chat():
    """Recebe a mensagem do cliente, atualiza o histórico e chama o Gemini."""
    try:
        data = request.get_json()
        pergunta = data.get("mensagem")
 
        if not pergunta:
            return jsonify ({"erro: Mensagem vazia"}),400
        
        #1. adicionha a pergunta ao histórico
        history.append({
            "role": "user",
            "parts": [{"text": pergunta}]
        })
 
        #2. Chama a API do Gemini enviando o histórico completio + Systme prompt
        response = client.models.generate_content(
            model = "gemini-2.5-flash",
            contents=history,
            config=types.GenerateContentConfig(
                system_instructions=SYSTEM_PROMPT
            )
        )
 
        resposta = response.text
 
        #3. Adiciona a resposta da IA ao histórico
        history.append({
            "role": "model",
            "parts": [{"text": resposta}]
        })
 
        return jsonify({
            "respota": resposta
        })
 
    except Exception as erro:
        print("ERRO", erro)
        return jsonify({
            "erro": str(erro),
            "resposta": "Desculpe. ocorreu um erro ao conversar com o Gemini."  
        }), 500
 
 
if __name__ == "__main__":
    app.run(debug=True)    