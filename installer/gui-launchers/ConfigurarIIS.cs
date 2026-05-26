// Launcher GUI: executa Configurar-IIS.bat na pasta onde este exe esta (pasta de instalacao)
// Compilar: csc /target:winexe /out:Ananim-Configurar-IIS.exe ConfigurarIIS.cs
using System;
using System.Diagnostics;
using System.IO;

class Program
{
    [STAThread]
    static void Main()
    {
        try
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string batPath = Path.Combine(appDir, "Configurar-IIS.bat");
            if (!File.Exists(batPath))
                return;
            Process.Start(new ProcessStartInfo
            {
                FileName = batPath,
                WorkingDirectory = appDir,
                UseShellExecute = true
            });
        }
        catch (Exception) { }
    }
}
