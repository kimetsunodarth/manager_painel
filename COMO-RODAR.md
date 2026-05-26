# Como rodar o Ananim Huawei Painel

O painel precisa do **backend (Node.js)** rodando. O frontend é servido pelo próprio backend; use sempre **http://localhost:5000** no navegador (não abra `index.html` por file://).

---

## Opção 1: Node.js (recomendado)

1. **Instale o Node.js**  
   https://nodejs.org/ — versão LTS.

2. **Configure o .env**  
   Na raiz do projeto (`huawei-cloud-panel`), copie `.env.example` para `.env` e preencha as credenciais (RAMO_AK, RAMO_SK, etc.). Veja README.md.

3. **Inicie o backend**  
   Na pasta **`backend`**:
   ```bash
   npm install
   npm start
   ```
   Ou, na raiz do projeto, use **`INICIAR.bat`** ou **`INICIAR.ps1`** (eles entram em `backend` e rodam `npm start`).

4. **Abra o painel**  
   No navegador acesse **http://localhost:5000**.  
   Login inicial: **admin** / **admin123**.

---

## Opção 2: Python (legado)

Se existir `backend/app.py` e você preferir Python:

1. Na pasta **`backend`**: `setup.bat` e depois `run.bat`.
2. Acesse **http://localhost:5000** (se o app Python servir o frontend na mesma porta) ou abra o frontend conforme indicado pelo projeto.

---

## Resumo

| Passo | Ação |
|-------|------|
| 1 | Copiar `.env.example` → `.env` e preencher AK/SK (e SESSION_SECRET em produção). |
| 2 | Na pasta `backend`: `npm install` e `npm start`. |
| 3 | Abrir **http://localhost:5000** no navegador e fazer login (admin / admin123). |

A API fica em **http://localhost:5000**. Se aparecer "Erro de conexão" no login, confira se o backend está rodando e se você está acessando pela URL acima (não por file://).
