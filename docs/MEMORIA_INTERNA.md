# Memória Interna do Projeto

Última atualização: 2026-06-11

## Status da última tarefa

### Tarefa
Edição de usuário em tela cheia + carregamento automático do projeto vinculado na Home do cliente — versão v1.2.58.

### Contexto

Após a v1.2.55, o usuário pediu:
1. Ajustar o layout ao clicar em **Editar usuário**, pois o modal não estava renderizando bem.
2. Fazer o cliente entrar na **Home** com a conta/projeto já carregados automaticamente, sem precisar selecionar conta, projeto e clicar em carregar.

### O que foi corrigido

#### 1) Modal de editar usuário (`Usuarios.tsx`)

**Problema**: o modal ainda ficava fora do padrão do painel e sujeito a recorte visual dentro da página. Mesmo com os ajustes anteriores, o usuário queria que a edição abrisse em tela cheia.

**Solução aplicada**:
- Renderização via `createPortal(..., document.body)` para escapar da árvore/layout da página
- Overlay full-screen com `z-[100]` e backdrop escuro
- Painel de edição ocupando toda a viewport
- Header, conteúdo rolável e footer fixos
- Mantido fechamento por backdrop e botão de fechar
- Seções internas preservadas com o visual dark padrão do painel

#### 2) Home do cliente com projeto carregado automaticamente (`Home.tsx`)

**Problema**: mesmo com `visibleProjects` já atribuído ao usuário, o cliente ainda precisava escolher conta, projeto e clicar em `Carregar`.

**Solução aplicada**:
- Ao abrir a Home como `client`, o frontend procura o primeiro projeto vinculado em `visibleProjects`
- A conta correspondente é selecionada automaticamente
- O projeto correspondente é selecionado automaticamente
- A listagem de ECS é carregada sem ação manual do usuário

#### 3) Sincronização da sessão local (`App.tsx` / `useUser.ts`)

**Problema**: após refresh ou reentrada na aplicação, o frontend podia ficar com `localStorage.user` desatualizado em relação ao backend.

**Solução aplicada**:
- `PrivateRoute` agora atualiza `localStorage.user` com a resposta de `GET /auth/me`
- `useUser.ts` passou a tipar `visibleProjects`, permissões ECS Huawei e preferências do usuário

### Ações executadas (v1.2.58)

1. **`frontend/src/pages/Usuarios.tsx`** — ajuste estrutural do modal de edição
2. **`frontend/src/pages/Home.tsx`** — autoload da conta/projeto do cliente na Home
3. **`frontend/src/App.tsx`** — sincronização do usuário com `/auth/me`
4. **`frontend/src/hooks/useUser.ts`** — tipagem ampliada da sessão local
5. Modal de edição convertido para full-screen com portal no `document.body`
6. Removida a barra de filtro da Home quando o projeto do cliente já carrega automaticamente
7. Versão `1.2.57` → `1.2.58` em `VERSION`, `package.json`, `frontend/package.json`, `backend/package.json`, `installer/installer-iis.iss`

### Arquivos alterados (v1.2.58)

- `frontend/src/pages/Usuarios.tsx`
- `frontend/src/pages/Home.tsx`
- `frontend/src/App.tsx`
- `frontend/src/hooks/useUser.ts`
- `CHANGELOG.md`
- `VERSION`, `package.json`, `frontend/package.json`, `backend/package.json`, `installer/installer-iis.iss`
- `docs/MEMORIA_INTERNA.md`

### Validação

- Backend exe: ✓ `npm run build:backend:exe` — gerado `backend/dist/Ananim-Manager-Painel-API.exe`
- Build frontend: ✓ `npm run build` em `frontend/` após ajuste full-screen
- Pacote IIS: ✓ `npm run build:iis:package` — fallback em `installer/package-iis-tmp` porque `package-iis` estava em uso
- Instalador final validado: ✓ `installer/Output/Ananim-Manager-Painel-IIS-Setup-1.2.58-fullscreen.exe`
- SHA256: `EC57C0FCA8FB09B077CA508B94B43AEDF3E7186BFC9DAF66A9E7ED6556C87D70`

## Última ação executada

Geração e validação do instalador `Ananim-Manager-Painel-IIS-Setup-1.2.58-fullscreen.exe`.

---

## Histórico v1.2.54 (referência)

**Arredondamento 30 min + e-mails SMTP:**
- `extensionBilling.js` — `computeSessionBilling()`, smtp, alertEmails, roundingMinutes padrão 30
- `emailNotifier.js` *(novo)* — templates HTML, envio SMTP fire-and-forget
- `huawei.js` — emailNotifier integrado; 3 novos endpoints SMTP
- `scheduleRunner.js` — emailNotifier integrado
- `client.ts` — SmtpConfig, métodos API SMTP
- `TarifaHorasExtras.tsx` — UI SMTP + destinatários
- `extension-billing.json` — roundingMinutes:30, SMTP sem senha

**Instalador v1.2.54**: `Ananim-Manager-Painel-IIS-Setup-1.2.54.exe` — 15,6 MB
SHA256: `4CAD1E4E91D223AF3A88230CFE4367DD194579107C27FEDD3B64F9DAC34DB463`

---

## Pendências / riscos

- `build-package-iis.ps1` ainda tem bug no nome do exe — pacote montado manualmente
- Senha SMTP não mascarada no GET `/billing-config` — aceitável para ferramenta admin interna
- `nodemailer` v8 + pkg: warning `Cannot resolve 'mod'` é falso positivo

## Última ação executada

Geração e validação do instalador `Ananim-Manager-Painel-IIS-Setup-1.2.55.exe`.
