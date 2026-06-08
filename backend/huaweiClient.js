const fetch = require("node-fetch");
const { signRequest } = require("./huaweiSigner");

const IAM_BASE = "https://iam.myhuaweicloud.com";
const LIST_PROJECTS_URI = "/v3/auth/projects";

async function listProjects(ak, sk) {
  const url = IAM_BASE + LIST_PROJECTS_URI;
  const headers = signRequest("GET", url, Buffer.alloc(0), ak, sk);

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

module.exports = { listProjects };
