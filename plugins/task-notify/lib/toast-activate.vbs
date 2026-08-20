Option Explicit
Dim raw, action, i, colon, cut, fso, folder, path, stream, sh
raw = ""
For i = 0 To WScript.Arguments.Count - 1
  If raw <> "" Then raw = raw & " "
  raw = raw & WScript.Arguments(i)
Next
If InStr(1, raw, "allowed-once", 1) > 0 Then
  action = "allowed-once"
ElseIf InStr(1, raw, "rejected", 1) > 0 Then
  action = "rejected"
Else
  colon = InStr(raw, ":")
  If colon < 1 Then WScript.Quit 0
  action = Mid(raw, colon + 1)
  cut = InStr(action, "/")
  If cut > 0 Then action = Left(action, cut - 1)
  cut = InStr(action, "?")
  If cut > 0 Then action = Left(action, cut - 1)
  If action <> "allowed-once" And action <> "rejected" Then WScript.Quit 0
End If
Set sh = CreateObject("WScript.Shell")
folder = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\DeepSeek Harness")
path = folder & "\toast-click.txt"
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(folder) Then fso.CreateFolder folder
Set stream = fso.CreateTextFile(path, True)
stream.WriteLine action
stream.Close
