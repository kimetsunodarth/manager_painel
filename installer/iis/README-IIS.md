# Opções de implantação da API no IIS

O projeto oferece **duas formas** de publicar a API no IIS, no mesmo estilo dos projetos **huawei-cloud-panel** e **adds-password-reset**:

## 1. iisnode (padrão – raiz do projeto)

- **Arquivos:** `web.config` e `Setup-IIS.ps1` na **raiz** do projeto.
- **Requisitos:** IIS, **URL Rewrite Module**, **iisnode** e **Node.js** instalados no servidor.
- **Uso:** Execute `Configurar-IIS.bat` como Administrador na pasta raiz. O site será criado na porta **8890** (nome: `ananim-manager-painel`).
- **URL da API:** `http://localhost:8890/api/`

## 2. HttpPlatformHandler (Node.js, sem iisnode)

- **Arquivos:** `installer/iis/web.config` (este diretório).
- **Requisitos:** IIS, **HttpPlatformHandler** ([download](https://www.iis.net/downloads/microsoft/httpplatformhandler)) e **Node.js** no servidor. Não é necessário iisnode nem URL Rewrite.
- **Uso:**
  1. Copie `installer/iis/web.config` para a **raiz** do projeto, substituindo o `web.config` existente.
  2. Crie a pasta `logs` na raiz (para `api-stdout.log`).
  3. Execute o mesmo `Setup-IIS.ps1` da raiz (ou crie o site manualmente no IIS apontando a raiz do projeto).
- Se o Node.js estiver em outro caminho, edite no `web.config` o valor de `processPath` (ex.: `D:\Node\node.exe`).

Em ambos os casos, a API usa a porta definida pelo IIS (`HTTP_PLATFORM_PORT` ou `PORT`) e escuta apenas em `127.0.0.1`. Configure o `.env` na pasta `backend/` (ou use config.enc) antes de acessar. Documentação completa: **IIS-DEPLOY.md** na raiz do projeto.
