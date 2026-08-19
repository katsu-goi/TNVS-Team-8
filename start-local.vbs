Set WshShell = CreateObject("WScript.Shell")
Set FileSystem = CreateObject("Scripting.FileSystemObject")
Workspace = FileSystem.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run chr(34) & Workspace & "\start-local.bat" & chr(34), 0, False
