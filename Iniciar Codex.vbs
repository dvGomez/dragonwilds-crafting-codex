' Abre o Códex de Criação (overlay). Atalho padrão dentro do jogo: F8
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir & "\app"
sh.Run """" & dir & "\app\node_modules\electron\dist\electron.exe"" .", 0, False
