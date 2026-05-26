# -*- coding: utf-8 -*-
"""Configuração das contas Huawei Cloud (AK/SK e regiões)."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Carrega .env na raiz do projeto (huawei-cloud-panel) ou no diretório atual
root = Path(__file__).resolve().parent.parent
load_dotenv(root / ".env")
load_dotenv()  # fallback cwd

# Regiões oficiais Huawei Cloud
REGION_SAO_PAULO = "sa-brazil-1"
REGION_SANTIAGO = "la-south-2"

# Definição das 4 contas: id, nome, regiões, variáveis env AK/SK
ACCOUNTS = [
    {
        "id": "ramo_sistemas",
        "name": "RAMO_SISTEMAS",
        "regions": [
            {"id": REGION_SAO_PAULO, "name": "São Paulo"},
            {"id": REGION_SANTIAGO, "name": "Santiago"},
        ],
        "ak_env": "RAMO_AK",
        "sk_env": "RAMO_SK",
    },
    {
        "id": "ananimcloud",
        "name": "ANANIMCLOUD",
        "regions": [
            {"id": REGION_SAO_PAULO, "name": "São Paulo"},
        ],
        "ak_env": "ANANIM_AK",
        "sk_env": "ANANIM_SK",
    },
    {
        "id": "rsdone",
        "name": "RSDONE",
        "regions": [
            {"id": REGION_SANTIAGO, "name": "Santiago"},
        ],
        "ak_env": "RSDONE_AK",
        "sk_env": "RSDONE_SK",
    },
    {
        "id": "moove_ramosistemas",
        "name": "MOOVE_RAMOSISTEMAS",
        "regions": [
            {"id": REGION_SAO_PAULO, "name": "São Paulo"},
        ],
        "ak_env": "MOOVE_AK",
        "sk_env": "MOOVE_SK",
    },
]


def get_credentials(account_id: str):
    """Retorna (ak, sk) para um account_id ou None se não configurado."""
    for acc in ACCOUNTS:
        if acc["id"] == account_id:
            ak = os.getenv(acc["ak_env"])
            sk = os.getenv(acc["sk_env"])
            if ak and sk:
                return ak, sk
            return None
    return None


def get_accounts_for_api():
    """Lista contas para a API (sem expor SK)."""
    return [
        {
            "id": a["id"],
            "name": a["name"],
            "regions": a["regions"],
        }
        for a in ACCOUNTS
    ]
