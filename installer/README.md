# Instalador IIS – Huawei Cloud Panel

## Gerar o instalador .exe (Inno Setup)

1. **Pacote** (na raiz do projeto):
   ```powershell
   .\build-package-iis.ps1
   ```

2. **Compilar o instalador** (Inno Setup 6 instalado):
   ```powershell
   .\installer\compile-installer-iis.ps1
   ```
   Ou, de dentro de `installer`:
   ```powershell
   .\compile-installer-iis.ps1
   ```

3. Saída: **installer/Output/Huawei-Cloud-Panel-IIS-Setup-1.0.0.exe**

## Conteúdo do instalador

- Copia o conteúdo de **package-iis** para a pasta escolhida (ex.: `C:\Program Files\Huawei Cloud Panel`)
- Opção de configurar o site no IIS (porta 8088)
- Opção de instalar HttpPlatformHandler
- Atalhos: abrir aplicação, Configurar IIS, instruções (CONFIG-README)

Após instalar, coloque **config.enc** e **key.bin** na pasta do app (gerados com `npm run encrypt-config` no backend).
