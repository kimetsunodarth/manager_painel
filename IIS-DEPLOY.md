# Implantação no IIS com padrões de segurança

> ⚠️ **Documento obsoleto (identificado em 2026-09-04).** Descreve hospedagem via **iisnode** —
> o mecanismo real usado hoje é **HttpPlatformHandler + backend empacotado como `.exe`** (via
> `pkg`), sem depender de Node.js instalado no servidor. Ver **`README.md`** ("Build e deploy") e
> `Setup-IIS.ps1` / `installer/`. Mantido aqui só como histórico até decisão de reescrever ou remover.

Este documento descreve como executar o **Ananim Huawei Painel** no **IIS (Internet Information Services)** usando **iisnode**, com as configurações de segurança recomendadas.

---

## Pré-requisitos

1. **Windows Server** ou **Windows** com IIS instalado.
2. **Node.js LTS** instalado (ex.: `C:\Program Files\nodejs\node.exe`).
3. **iisnode** – módulo IIS para hospedar aplicações Node.js.
4. **URL Rewrite Module** para IIS.
5. **.NET Framework** (já presente na maioria das instalações IIS).

---

## 1. Instalar componentes

### 1.1 Habilitar IIS

No **Painel de Controle** → **Programas** → **Ativar ou desativar recursos do Windows** (ou `optionalfeatures`):

- Marque **Serviços de Informações da Internet (IIS)**.
- Expanda e marque:
  - **Ferramentas de Gerenciamento da Web** → **Console de Gerenciamento do IIS**
  - **Desenvolvimento de Aplicativos** → **Extensibilidade .NET** (se usar integração)
- Ou via PowerShell (como Administrador):
  ```powershell
  Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole
  Enable-WindowsOptionalFeature -Online -FeatureName IIS-ASPNET45
  ```

### 1.2 Instalar URL Rewrite Module

- Download: https://www.iis.net/downloads/microsoft/url-rewrite  
- Instale e reinicie o IIS se solicitado.

### 1.3 Instalar iisnode

- Download: https://github.com/Azure/iisnode/releases  
- Escolha a versão adequada (ex.: **iisnode-full-v0.2.21-x64.msi** para x64).
- Instale. O handler **iisnode** ficará disponível no IIS.

### 1.4 Node.js

- Instale a partir de https://nodejs.org/ (LTS) no caminho padrão (`C:\Program Files\nodejs`).
- O `web.config` usa `%ProgramFiles%\nodejs\node.exe`; se o Node estiver em outro caminho, edite a linha `nodeProcessCommandLine` no `web.config`.

---

## 2. Configuração automática (script ou exe)

Você pode configurar o IIS de forma automática:

- **Setup-IIS.bat** – Execute **como Administrador** na pasta raiz do projeto. Cria o pool, o site, permissões e roda `npm install` no backend.
- **Setup-IIS.exe** – Pode ser gerado a partir do script (veja **GERAR-EXE-IIS.md**). Execute como Administrador na pasta do projeto.

Para **gerar o Setup-IIS.exe**, use um dos métodos em **GERAR-EXE-IIS.md** (por exemplo, o script **Gerar-Setup-IIS-Exe.ps1** com o módulo ps2exe).

## 3. Publicar o projeto no servidor

1. Copie a pasta completa do projeto (ex.: `huawei-cloud-panel`) para o servidor (ex.: `C:\inetpub\ananim-panel` ou outro caminho de sua escolha).

2. **Arquivo .env**  
   - Copie `.env.example` para `.env` na **raiz** do projeto (mesmo nível que `web.config`).
   - Preencha todas as variáveis:
     - Credenciais Huawei (RAMO_AK, RAMO_SK, etc.).
     - **SESSION_SECRET** – obrigatório em produção (gere um valor forte).
     - **NODE_ENV=production** – pode ser definido no .env ou no App Pool (veja abaixo).
   - Exemplo de geração de SESSION_SECRET:
     ```powershell
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```

3. **Dependências Node**  
   Na pasta **backend** do projeto:
   ```powershell
   cd C:\inetpub\ananim-panel\backend
   npm install --production
   ```

4. **Estrutura esperada na raiz do site:**
   ```
   C:\inetpub\ananim-panel\
   ├── web.config          # Configuração IIS/iisnode
   ├── .env                # Variáveis de ambiente (não versionar)
   ├── backend\
   │   ├── server.js
   │   ├── node_modules\
   │   └── ...
   ├── frontend\
   │   ├── index.html
   │   ├── logo.png
   │   ├── style.css
   │   └── app.js
   └── ...
   ```

---

## 4. Criar o site no IIS (manual)

1. Abra **Gerenciador do IIS** (inetmgr).

2. **Pool de aplicativos**
   - Clique em **Pools de Aplicativos** → **Adicionar Pool de Aplicativos**.
   - Nome: ex. `AnanimPanel`.
   - **Não** marque "Iniciar pool de aplicativos imediatamente" se quiser configurar antes.
   - Versão do .NET CLR: **Sem código gerenciado**.
   - Modo de pipeline: **Integrado**.
   - Clique em **OK**.
   - Clique com o botão direito no pool → **Configurações avançadas**:
     - **Identidade**: use uma conta dedicada (ex.: `IIS AppPool\AnanimPanel`) ou uma conta de serviço com permissão mínima na pasta do site.
     - **Reinício periódico**: opcional (ex.: 1740 min para reinício em horário de baixo uso).

3. **Site**
   - Clique com o botão direito em **Sites** → **Adicionar Site**.
   - Nome do site: ex. `Ananim Huawei Painel`.
   - Pool de aplicativos: `AnanimPanel`.
   - Caminho físico: `C:\inetpub\ananim-panel` (ou o caminho onde você copiou o projeto).
   - Associação: inicialmente apenas **http**, porta 80 (ou outra). Depois adicione **https** (veja seção 5).

4. **Permissões na pasta**
   - Na pasta física do site, propriedades → Segurança:
   - A conta do App Pool (ex.: `IIS AppPool\AnanimPanel`) deve ter:
     - **Leitura e execução**, **Listar conteúdo**, **Leitura**.
   - **Não** conceda gravação na pasta inteira; se precisar gravar (users.json, actionLog.json, agendamentos.json), conceda gravação **apenas** na pasta `backend` ou apenas nos arquivos .json que o app atualiza.

5. **Variáveis de ambiente do App Pool (opcional)**  
   Para forçar produção:
   - No PowerShell (Admin):
     ```powershell
     Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter "system.applicationHost/applicationPools/add[@name='AnanimPanel']/environmentVariables" -name "." -value @{name='NODE_ENV';value='production'}
     ```
   - Ou defina **NODE_ENV=production** no arquivo **.env** na raiz do projeto (recomendado).

---

## 5. Segurança já aplicada no projeto

- **web.config**
  - **hiddenSegments**: bloqueia acesso direto a `node_modules`, `.env`, `users.json`, `actionLog.json`, `agendamentos.json`, pasta `iisnode`.
  - **fileExtensions**: bloqueia acesso a arquivos `.env`.
  - **Block iisnode debug**: regra de rewrite retorna 404 para caminhos de debug do iisnode.
  - **iisnode**: `debuggingEnabled="false"`, `devErrorsEnabled="false"`, `nodeEnv="production"`.
  - **customHeaders**: remove `X-Powered-By`.

- **Aplicação (backend)**
  - Rate limit no login, política de senha, Helmet, CORS configurável, SESSION_SECRET obrigatório em produção, cookie seguro (secure em produção), retenção do log 90 dias. Ver **SEGURANCA.md**.

- **IIS (server.js)**
  - Quando executado sob iisnode (`process.env.IISNODE_VERSION`), o app escuta em **127.0.0.1** (apenas localhost), não em 0.0.0.0.

---

## 6. HTTPS (obrigatório em produção)

1. **Obter certificado**
   - Use um certificado SSL/TLS (autoridade certificadora ou certificado interno da empresa).
   - Instale o certificado no **Armazenamento de certificados do computador** (ou do usuário do App Pool, conforme sua política).

2. **Associação HTTPS no site**
   - No IIS: selecione o site → **Associações**.
   - **Adicionar**: tipo **https**, porta **443**, certificado SSL selecionado.
   - Mantenha **http** apenas se quiser redirecionar para HTTPS (veja abaixo).

3. **Redirecionar HTTP → HTTPS**
   - Com **URL Rewrite** instalado, na raiz do site abra **URL Rewrite** → **Adicionar regra** → **Regra em branco**.
   - Nome: `Redirect to HTTPS`.
   - Condição: `{HTTPS}` **não é** `on`.
   - Ação: Redirecionar, URL `https://{HTTP_HOST}{REQUEST_URI}`, tipo **Permanente (301)**.
   - Assim, todo acesso por http será redirecionado para https.

4. **.env em produção**
   - Defina **CORS_ORIGIN** com a URL pública do painel (ex.: `https://painel.seudominio.com`).
   - O cookie de sessão já é enviado com `secure: true` quando `NODE_ENV=production`.

---

## 7. Verificação e testes

1. Reinicie o site ou o pool no IIS.
2. Acesse pelo navegador: `http://localhost` (ou a porta configurada) ou `https://...` se já tiver HTTPS.
3. Deve aparecer a **tela de login** (tema escuro, logo). Faça login com **admin** / **admin123** e altere a senha em **Usuários**.
4. Confira os logs do iisnode em: `C:\inetpub\ananim-panel\iisnode\` (se a pasta existir e tiver permissão de gravação para o App Pool). Em caso de erro 500, verifique os logs e o **Log de Eventos do Windows** (origem **iisnode**).

---

## 8. Checklist de segurança (resumo)

| Item | Verificação |
|------|-------------|
| .env | Existe na raiz, com SESSION_SECRET forte e NODE_ENV=production. Não versionado. |
| HTTPS | Associação https no site e redirecionamento HTTP → HTTPS. |
| App Pool | Identidade com menos privilégios (ex.: IIS AppPool\AnanimPanel). |
| Permissões | Pasta do site: leitura para o App Pool; gravação só onde necessário (backend ou arquivos .json). |
| web.config | hiddenSegments e fileExtensions bloqueando .env e pastas sensíveis. |
| iisnode | debuggingEnabled e devErrorsEnabled = false. |
| Aplicação | Rate limit, política de senha, CORS_ORIGIN em produção (ver SEGURANCA.md). |

---

## 9. Referências

- **README.md** – visão geral do projeto e configuração.
- **SEGURANCA.md** – segurança da aplicação e melhorias implementadas.
- **.env.example** – variáveis de ambiente.
- iisnode: https://github.com/Azure/iisnode  
- URL Rewrite: https://www.iis.net/downloads/microsoft/url-rewrite  

Uso interno.
