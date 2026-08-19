Set WshShell = CreateObject("WScript.Shell")
Set FileSystem = CreateObject("Scripting.FileSystemObject")
ScriptDirectory = FileSystem.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run chr(34) & ScriptDirectory & "\run_backend.bat" & chr(34), 0, False
