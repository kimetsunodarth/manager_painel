# -*- coding: utf-8 -*-
"""
Assinatura AK/SK para APIs Huawei Cloud (conforme documentação oficial).
Algoritmo: Canonical Request -> String to Sign -> HMAC-SHA256 -> Authorization header.
"""
import hashlib
import hmac
from datetime import datetime, timezone
from urllib.parse import urlparse


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().lower()


def _ensure_trailing_slash(uri_path: str) -> str:
    if not uri_path.endswith("/"):
        return uri_path + "/"
    return uri_path


def sign_request(method: str, url: str, body: bytes, ak: str, sk: str) -> dict:
    """
    Assina uma requisição HTTP para Huawei Cloud (AK/SK).
    Retorna um dicionário de headers a serem adicionados (X-Sdk-Date, Authorization).
    """
    parsed = urlparse(url)
    host = parsed.netloc
    path = parsed.path or "/"
    query = parsed.query

    # URI para assinatura deve terminar com /
    canonical_uri = _ensure_trailing_slash(path)
    canonical_query = query if query else ""

    # X-Sdk-Date em UTC: YYYYMMDDTHHMMSSZ
    now = datetime.now(timezone.utc)
    sdk_date = now.strftime("%Y%m%dT%H%M%SZ")

    content_type = "application/json;charset=utf8"

    # Cabeçalhos canônicos (lowercase, trim, ordenados)
    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-sdk-date:{sdk_date}\n"
    )
    signed_headers = "content-type;host;x-sdk-date"

    # Payload hash (body vazio para GET)
    payload = body if body else b""
    payload_hash = _sha256_hex(payload)

    # Canonical Request
    canonical_request = (
        f"{method}\n"
        f"{canonical_uri}\n"
        f"{canonical_query}\n"
        f"{canonical_headers}\n"
        f"{signed_headers}\n"
        f"{payload_hash}"
    )

    # Hashed Canonical Request
    hashed_canonical = _sha256_hex(canonical_request.encode("utf-8"))

    # String to Sign
    string_to_sign = (
        "SDK-HMAC-SHA256\n"
        f"{sdk_date}\n"
        f"{hashed_canonical}"
    )

    # Signature = HexEncode(HMAC-SHA256(SK, string_to_sign))
    signature_binary = hmac.new(
        sk.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    signature = signature_binary.hex().lower()

    authorization = (
        f"SDK-HMAC-SHA256 Access={ak}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    return {
        "X-Sdk-Date": sdk_date,
        "Content-Type": content_type,
        "Host": host,
        "Authorization": authorization,
    }
