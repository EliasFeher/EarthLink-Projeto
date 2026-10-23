# Servidor local para testar: python app.py  ->  http://127.0.0.1:5000
# Em produção (Vercel) este arquivo não é usado: o site é estático e o chat roda em api/chat.py.
import os

from dotenv import load_dotenv

load_dotenv()

from flask import send_from_directory  # noqa: E402

from api.chat import app  # noqa: E402

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLICOS = ("style.css", "script.js", "chatbot.css", "chatbot.js", "img/plankton-reator.png")


@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:arquivo>")
def estaticos(arquivo):
    if arquivo not in PUBLICOS:
        return "", 404
    return send_from_directory(BASE_DIR, arquivo)


if __name__ == "__main__":
    app.run(debug=True)
