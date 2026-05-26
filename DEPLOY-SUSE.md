# Huawei Cloud Panel no SUSE Linux

O processo completo de instalação no Linux está documentado em **[DEPLOY-LINUX.md](DEPLOY-LINUX.md)**.

No **openSUSE / SUSE Linux Enterprise**, instale o Node.js com:

```bash
sudo zypper refresh
sudo zypper install nodejs18   # ou nodejs20, conforme disponível no repositório
node -v
```

Em seguida siga o guia [DEPLOY-LINUX.md](DEPLOY-LINUX.md): estrutura do projeto, `.env`, `npm install`, `npm start`, systemd e Nginx (opcional).
