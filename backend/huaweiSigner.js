/**
 * Assinatura AK/SK para APIs Huawei Cloud (mesmo algoritmo do Python).
 */
const crypto = require("crypto");

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toLowerCase();
}

function ensureTrailingSlash(path) {
  return path.endsWith("/") ? path : path + "/";
}

function signRequest(method, url, body, ak, sk) {
  const u = new URL(url);
  const host = u.host;
  const path = u.pathname || "/";
  const query = u.search ? u.search.slice(1) : "";

  const canonicalUri = ensureTrailingSlash(path);
  const canonicalQuery = query;

  const now = new Date();
  const sdkDate = now.toISOString().replace(/-/g, "").replace(/:/g, "").replace(/\.\d{3}Z/, "Z");
  const contentType = "application/json;charset=utf8";

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-sdk-date:${sdkDate}\n`;
  const signedHeaders = "content-type;host;x-sdk-date";

  const payload = body || Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);

  const canonicalRequest =
    `${method}\n` +
    `${canonicalUri}\n` +
    `${canonicalQuery}\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`;

  const hashedCanonical = sha256Hex(Buffer.from(canonicalRequest, "utf8"));
  const stringToSign = `SDK-HMAC-SHA256\n${sdkDate}\n${hashedCanonical}`;

  const signature = crypto
    .createHmac("sha256", sk)
    .update(stringToSign, "utf8")
    .digest("hex")
    .toLowerCase();

  const authorization = `SDK-HMAC-SHA256 Access=${ak}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "X-Sdk-Date": sdkDate,
    "Content-Type": contentType,
    Host: host,
    Authorization: authorization,
  };
}

module.exports = { signRequest };
