# Launchers GUI (exe) — Ananim Manager Painel

Estes são os fontes C# dos **dois exe GUI** incluídos no instalador IIS. Eles são compilados automaticamente pelo **compile-installer-iis.ps1** (que usa `csc.exe` do .NET Framework) e copiados para **package-iis/** antes de o Inno Setup gerar o instalador.

## O que faz cada exe

| Arquivo fonte | Exe gerado | Função |
|---------------|------------|--------|
| **AbrirPainel.cs** | **Ananim-Abrir-Painel.exe** | Abre o painel no navegador padrão em `http://localhost:8890/`. Launcher sem janela de console; ideal para atalho "Abrir Painel" no menu Iniciar. |
| **ConfigurarIIS.cs** | **Ananim-Configurar-IIS.exe** | Executa o **Configurar-IIS.bat** na mesma pasta onde o exe está (pasta de instalação). Assim o usuário pode (re)configurar o site no IIS (criar App Pool, site na porta 8890) sem abrir o .bat manualmente. Deve ser executado como Administrador quando necessário. |

## Compilação manual

Se quiser gerar os exe manualmente (na pasta `installer/gui-launchers/`):

```cmd
cd installer\gui-launchers
%windir%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /out:Ananim-Abrir-Painel.exe AbrirPainel.cs
%windir%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /out:Ananim-Configurar-IIS.exe ConfigurarIIS.cs
```

`/target:winexe` faz com que os exe não abram janela de console (somente GUI/comportamento silencioso).

## Documentação para o usuário final

A descrição de cada exe para quem instala o painel está em:

- **CONFIG-README.txt** (gerado no pacote e na pasta de instalação)
- **installer/README.md** (seção "O que faz cada exe")
