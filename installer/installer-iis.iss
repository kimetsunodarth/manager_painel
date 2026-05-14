; Instalador Ananim Manager Painel para IIS (backend + frontend, como huawei-cloud-panel)
; Instala backend Node, frontend (public/), web.config HttpPlatformHandler e scripts.
; O site no IIS executa o Node que serve /api e o frontend; nao precisa do backend na pasta do projeto.
; Requer: IIS, HttpPlatformHandler, Node.js, URL Rewrite. Gere o pacote: .\installer\build-package-iis.ps1
; Compile com: iscc /DPackageDir=package-iis-tmp installer-iis.iss (se o pacote estiver em package-iis-tmp)

#ifndef PackageDir
#define PackageDir "package-iis"
#endif
#define MyAppName "Ananim Manager Painel"
#ifndef MyAppVersion
  #define MyAppVersion "1.2.28"
#endif
#define MyAppId "C3D4E5F6-A7B8-9012-CDEF-123456789012"
#define MyAppPublisher "Ananim"
#define MyAppURL "https://github.com/"

[Setup]
AppId={{C3D4E5F6-A7B8-9012-CDEF-123456789012}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.\Output
OutputBaseFilename=Ananim-Manager-Painel-IIS-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "installurlrewrite"; Description: "Instalar modulo URL Rewrite no IIS (necessario para rotas SPA, ex.: /clientes)"; GroupDescription: "IIS:"; Flags: checkedonce
Name: "configiis"; Description: "Configurar site no IIS ao final da instalacao (app pool + site na porta 8890)"; GroupDescription: "IIS:"; Flags: checkedonce

[Files]
; Pacote gerado por build-package-iis.ps1: APENAS exe + public + lib + logs + scripts (NAO inclui config, data, iisnode, node_modules)
; Em upgrades, evitar sobrescrever config/dados do cliente.
Source: ".\{#PackageDir}\*"; DestDir: "{app}"; Excludes: "config\*;config.enc;.encryption_key;key.bin"; Flags: ignoreversion recursesubdirs createallsubdirs overwritereadonly

; Config e chaves só na primeira instalação (não sobrescrever em atualização).
Source: ".\{#PackageDir}\config\*"; DestDir: "{app}\config"; Flags: ignoreversion recursesubdirs createallsubdirs onlyifdoesntexist
Source: ".\{#PackageDir}\config.enc"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist
Source: ".\{#PackageDir}\.encryption_key"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist

[Dirs]
; logs, data e config/ sao criados com permissoes para o App Pool IIS poder escrever
Name: "{app}\logs"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\data"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\config"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\config\clients"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\config\hana-clients"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\config\sql-clients"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\config\control-center"; Permissions: users-modify; Flags: uninsneveruninstall

[Icons]
Name: "{group}\Abrir Painel"; Filename: "{app}\Ananim-Abrir-Painel.exe"; Comment: "Abre o painel no navegador (http://localhost:8890/)"
Name: "{group}\Configurar IIS (criar site ananim-manager-painel)"; Filename: "{app}\Ananim-Configurar-IIS.exe"; Comment: "Cria o site na porta 8890 no IIS"
Name: "{group}\Instrucoes de configuracao"; Filename: "{app}\CONFIG-README.txt"; Comment: "Configuracao .env e requisitos"

[Run]
Filename: "{app}\Configurar-IIS.bat"; Description: "Abrir configuracao do IIS (se o site nao foi criado)"; Flags: postinstall nowait skipifsilent unchecked

[Code]
const
  URL_REWRITE_MSI = 'https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi';

var
  UpdateModePage: TWizardPage;
  RbUpdate: TNewRadioButton;
  RbClean: TNewRadioButton;

function ExtractExePath(const UninstallString: String): String;
var
  s: String;
  p: Integer;
begin
  s := Trim(UninstallString);
  if s = '' then
  begin
    Result := '';
    exit;
  end;

  // Pode vir com aspas: "C:\...\unins000.exe" /SILENT ...
  if (Length(s) >= 2) and (s[1] = '"') then
  begin
    p := Pos('"', Copy(s, 2, Length(s) - 1));
    if p > 0 then
      Result := Copy(s, 2, p - 1)
    else
      Result := '';
    exit;
  end;

  // Sem aspas: pega até o primeiro espaço (fallback)
  p := Pos(' ', s);
  if p > 0 then
    Result := Copy(s, 1, p - 1)
  else
    Result := s;
end;

function GetInstalledUninstallStringRaw(): String;
var
  key, s: String;
begin
  // Inno Setup registra o uninstall em ...\Uninstall\<AppId>_is1
  key := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{' + '{#MyAppId}' + '}_is1';
  if RegQueryStringValue(HKLM, key, 'UninstallString', s) then
    Result := s
  else if RegQueryStringValue(HKCU, key, 'UninstallString', s) then
    Result := s
  else
    Result := '';
end;

function GetInstalledUninstallString(): String;
var
  s, exePath: String;
begin
  s := GetInstalledUninstallStringRaw();
  if s = '' then
  begin
    Result := '';
    exit;
  end;

  exePath := ExtractExePath(s);
  if (exePath <> '') and FileExists(exePath) then
    Result := s
  else
    Result := '';
end;

procedure CleanupStaleUninstallKey();
var
  keyHKLM, keyHKCU, s, exePath: String;
begin
  keyHKLM := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{' + '{#MyAppId}' + '}_is1';
  keyHKCU := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{' + '{#MyAppId}' + '}_is1';

  // Se existir um registro mas o unins*.exe sumiu, isso faz o Setup reclamar que a versão antiga não foi encontrada.
  if RegQueryStringValue(HKLM, keyHKLM, 'UninstallString', s) then
  begin
    exePath := ExtractExePath(s);
    if (exePath <> '') and (not FileExists(exePath)) then
      RegDeleteKeyIncludingSubkeys(HKLM, keyHKLM);
  end;
  if RegQueryStringValue(HKCU, keyHKCU, 'UninstallString', s) then
  begin
    exePath := ExtractExePath(s);
    if (exePath <> '') and (not FileExists(exePath)) then
      RegDeleteKeyIncludingSubkeys(HKCU, keyHKCU);
  end;
end;

function IsUpdateOnlySelected(): Boolean;
begin
  Result := (RbUpdate <> nil) and RbUpdate.Checked;
end;

function InitializeSetup(): Boolean;
begin
  // Limpa registro "fantasma" de instalação anterior (uninstaller removido manualmente).
  CleanupStaleUninstallKey();
  Result := True;
end;

procedure InitializeWizard();
var
  uninstallStr: String;
begin
  uninstallStr := GetInstalledUninstallString();
  if uninstallStr = '' then exit;

  // Página de modo de instalação quando já existe uma instalação.
  UpdateModePage := CreateCustomPage(wpSelectDir, 'Modo de instalação', 'Escolha como deseja proceder com a instalação.');

  RbUpdate := TNewRadioButton.Create(UpdateModePage);
  RbUpdate.Parent := UpdateModePage.Surface;
  RbUpdate.Left := ScaleX(0);
  RbUpdate.Top := ScaleY(8);
  RbUpdate.Width := UpdateModePage.SurfaceWidth;
  RbUpdate.Caption := 'Atualizar (recomendado) — mantém config.enc, .encryption_key e dados em \data';
  RbUpdate.Checked := True;

  RbClean := TNewRadioButton.Create(UpdateModePage);
  RbClean.Parent := UpdateModePage.Surface;
  RbClean.Left := ScaleX(0);
  RbClean.Top := RbUpdate.Top + ScaleY(26);
  RbClean.Width := UpdateModePage.SurfaceWidth;
  RbClean.Caption := 'Reinstalação limpa — remove a instalação anterior antes de instalar';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  uninstallStr, params: String;
  resultCode: Integer;
begin
  Result := '';
  uninstallStr := GetInstalledUninstallString();
  if uninstallStr = '' then exit;

  // Atualização: não desinstala; apenas sobrescreve arquivos do pacote.
  if IsUpdateOnlySelected() then exit;

  // Reinstalação limpa: roda o uninstaller da versão anterior antes de copiar arquivos.
  params := '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART';
  if not Exec(uninstallStr, params, '', SW_HIDE, ewWaitUntilTerminated, resultCode) then
    Result := 'Falha ao executar o desinstalador da versão anterior.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  AppDir, Ps1Path, Params, PowerShellExe, TmpDir, MsiPath: String;
begin
  if CurStep = ssPostInstall then
  begin
    if WizardIsTaskSelected('installurlrewrite') then
    begin
      TmpDir := ExpandConstant('{tmp}');
      MsiPath := TmpDir + '\rewrite_amd64_en-US.msi';
      Log('Baixando URL Rewrite Module...');
      Params := '-ExecutionPolicy Bypass -NoProfile -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri ''' + URL_REWRITE_MSI + ''' -OutFile ''' + MsiPath + ''' -UseBasicParsing } catch { exit 1 }"';
      PowerShellExe := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
      if Exec(PowerShellExe, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0) and FileExists(MsiPath) then
      begin
        Log('Instalando URL Rewrite Module (msiexec /quiet)...');
        if Exec('msiexec.exe', '/i "' + MsiPath + '" /quiet /norestart', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
          Log('URL Rewrite instalado. Codigo: ' + IntToStr(ResultCode))
        else
          Log('Falha ao executar msiexec para URL Rewrite.');
        DeleteFile(MsiPath);
      end
      else
        Log('Falha ao baixar URL Rewrite. Instale manualmente: https://www.iis.net/downloads/microsoft/url-rewrite');
    end;

    if WizardIsTaskSelected('configiis') then
    begin
      AppDir := ExpandConstant('{app}');
      Ps1Path := AppDir + '\Setup-IIS.ps1';
      PowerShellExe := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
      Params := '-ExecutionPolicy Bypass -NoProfile -File "' + Ps1Path + '" -AppPath "' + AppDir + '"';
      if Exec(PowerShellExe, Params, AppDir, SW_SHOW, ewWaitUntilTerminated, ResultCode) then
        Log('Setup-IIS.ps1 executado. Codigo: ' + IntToStr(ResultCode))
      else
        Log('Falha ao executar Setup-IIS.ps1. Execute Configurar-IIS.bat como Administrador.');
    end;
  end;
end;
