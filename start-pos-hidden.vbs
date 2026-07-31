' Internal helper for start-pos.bat — relaunches it with window style 0 (hidden).
' Not meant to be run directly; start-pos.bat calls this to hide its own console.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir
sh.Run "cmd /c """ & scriptDir & "\start-pos.bat"" hidden", 0, False
