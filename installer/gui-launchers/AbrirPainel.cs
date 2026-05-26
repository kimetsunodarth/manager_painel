// Launcher GUI: abre o Ananim Manager Painel no navegador (http://localhost:8890/)
// Compilar: csc /target:winexe /out:Ananim-Abrir-Painel.exe AbrirPainel.cs
using System;
using System.Diagnostics;

class Program
{
    [STAThread]
    static void Main()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "http://localhost:8890/",
                UseShellExecute = true
            });
        }
        catch (Exception) { }
    }
}
