# -*- coding: utf-8 -*-
"""Cliente para listar projetos IAM na Huawei Cloud usando AK/SK."""
import requests
from huawei_signer import sign_request

IAM_BASE = "https://iam.myhuaweicloud.com"
LIST_PROJECTS_URI = "/v3/auth/projects"


def list_projects(ak: str, sk: str) -> dict:
    """
    Lista projetos acessíveis ao usuário IAM (KeystoneListAuthProjects).
    Retorna o JSON da resposta ou levanta em caso de erro HTTP.
    """
    url = IAM_BASE + LIST_PROJECTS_URI
    method = "GET"
    body = b""

    headers = sign_request(method, url, body, ak, sk)

    resp = requests.request(
        method,
        url,
        headers=headers,
        data=body,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()
