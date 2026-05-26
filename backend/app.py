# -*- coding: utf-8 -*-
"""API Flask do painel Huawei Cloud: contas e listagem de projetos."""
import os
from flask import Flask, jsonify, request
from flask_cors import CORS

from config import get_credentials, get_accounts_for_api, ACCOUNTS
from huawei_client import list_projects

app = Flask(__name__)
CORS(app)


@app.route("/api/accounts", methods=["GET"])
def api_accounts():
    """Lista as contas configuradas (id, nome, regiões). Não expõe AK/SK."""
    return jsonify(get_accounts_for_api())


@app.route("/api/projects", methods=["POST"])
def api_projects():
    """
    Lista projetos de uma conta.
    Body JSON: { "accountId": "ramo_sistemas" } (região não é necessária para IAM global).
    """
    data = request.get_json() or {}
    account_id = (data.get("accountId") or "").strip()
    if not account_id:
        return jsonify({"error": "accountId é obrigatório"}), 400

    creds = get_credentials(account_id)
    if not creds:
        return jsonify({"error": "Conta não encontrada ou credenciais não configuradas"}), 400

    ak, sk = creds
    try:
        result = list_projects(ak, sk)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "Huawei Cloud Panel API",
        "endpoints": {
            "GET /api/accounts": "Lista contas configuradas",
            "POST /api/projects": "Body: { \"accountId\": \"<id>\" } — Lista projetos IAM",
        },
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG", "0") == "1")
