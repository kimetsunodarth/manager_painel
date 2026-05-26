# Instalar Python no Windows

O projeto precisa do **Python 3** para o backend. Siga **uma** das opções abaixo.

---

## Opção 1: Microsoft Store (mais simples)

1. Pressione **Win + S**, digite **Microsoft Store** e abra.
2. Na busca, digite **Python 3.12** (ou **Python 3.11**).
3. Clique em **Obter/Instalar** no app **Python 3.12** da Microsoft.
4. **Feche o PowerShell** e abra de novo.
5. Volte na pasta `backend` e execute:
   ```powershell
   .\setup.ps1
   ```
   Se der erro de execução de script, use:
   ```powershell
   .\setup.bat
   ```

---

## Opção 2: Site oficial (recomendado para desenvolvimento)

1. Acesse: **https://www.python.org/downloads/**
2. Clique em **Download Python 3.x.x** (botão amarelo).
3. Execute o instalador baixado.
4. **Importante:** na primeira tela, **marque a caixa:**
   - **"Add python.exe to PATH"**
5. Clique em **Install Now** e conclua a instalação.
6. **Feche o PowerShell** e abra um novo.
7. Na pasta `backend`, execute:
   ```powershell
   .\setup.bat
   ```
   (ou `.\setup.ps1`).

---

## Depois de instalar

No PowerShell, na pasta `backend`:

```powershell
.\setup.bat
.\run.bat
```

Se aparecer **"Running on http://127.0.0.1:5000"**, está certo. Abra então o arquivo `frontend\index.html` no navegador.
