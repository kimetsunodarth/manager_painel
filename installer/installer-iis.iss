; Instalador Huawei Cloud Panel para IIS
; Instala o executavel da API, frontend estatico e web.config (codigo nao exposto).
; Requer: IIS instalado, HttpPlatformHandler.
; Gere o pacote antes: .\build-package-iis.ps1 (na raiz do projeto)

#define MyAppName "Huawei Cloud Panel"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Ananim"
#define MyAppURL "https://github.com/"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
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
OutputBaseFilename=Huawei-Cloud-Panel-IIS-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "configiis"; Description: "Configurar site no IIS ao final da instalacao (app pool + site na porta 8088)"; GroupDescription: "IIS:"; Flags: checkedonce
Name: "installhandler"; Description: "Instalar HttpPlatformHandler (obrigatorio para o site funcionar)"; GroupDescription: "IIS:"

[Files]
; Pacote gerado por build-package-iis.ps1 na raiz: exe, public, web.config, logs, script
Source: "..\package-iis\Huawei-Cloud-Panel-API.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-iis\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\package-iis\web.config"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-iis\Setup-IIS.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-iis\Configurar-IIS.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-iis\Run-IIS-Setup-Now.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-iis\Gerar-SESSION_SECRET.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-iis\logs\*"; DestDir: "{app}\logs"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "..\package-iis\logo.enc"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\package-iis\Descriptografar-Logs.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Dirs]
Name: "{app}\logs"; Permissions: users-modify

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "http://localhost:8088/"; Comment: "Abrir aplicacao no navegador"
Name: "{group}\Configurar IIS (criar site huawei-cloud-panel)"; Filename: "{app}\Configurar-IIS.bat"; Comment: "Cria o site na porta 8088 no IIS"
Name: "{group}\Gerar SESSION_SECRET"; Filename: "{app}\Gerar-SESSION_SECRET.bat"; Comment: "Gera valor aleatorio para configuracao"
Name: "{group}\Descriptografar logs"; Filename: "{app}\Descriptografar-Logs.exe"; Comment: "Descriptografa app.log.enc e startup-error.log.enc (use pelo prompt: Descriptografar-Logs.exe arquivo.log.enc saida.txt)"

[Run]
Filename: "{app}\Configurar-IIS.bat"; Description: "Abrir configuracao do IIS (se o site nao foi criado)"; Flags: postinstall nowait skipifsilent unchecked

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  AppDir, Ps1Path, Params, PowerShellExe: String;
begin
  if CurStep = ssPostInstall then
  begin
    { Executa o Setup-IIS.ps1 diretamente ao final da instalacao se o usuario marcou a tarefa }
    if not WizardIsTaskSelected('configiis') then
      Exit;
    AppDir := ExpandConstant('{app}');
    Ps1Path := AppDir + '\Setup-IIS.ps1';
    { Usar caminho completo do PowerShell para garantir execucao no contexto do instalador (admin) }
    PowerShellExe := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
    Params := '-ExecutionPolicy Bypass -NoProfile -File "' + Ps1Path + '" -AppPath "' + AppDir + '"';
    if Exec(PowerShellExe, Params, AppDir, SW_SHOW, ewWaitUntilTerminated, ResultCode) then
      Log('Setup-IIS.ps1 executado. Codigo: ' + IntToStr(ResultCode))
    else
      Log('Falha ao executar Setup-IIS.ps1. Verifique se o PowerShell esta em ' + PowerShellExe);
  end;
end;
