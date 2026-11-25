Option Explicit

' Antigravity Mission Board - Zero-Terminal Silent Windows Launcher
' Starts the local read-only server completely hidden (no CMD window)
' and opens http://127.0.0.1:3777 in your default browser.
' Pass --demo to launch with the built-in synthetic Demo Mode dataset.

Dim fso, shell, scriptDir, port, extraArgs, i, arg
Dim healthUrl, appUrl, serverEntry, webIndex, launchCmd, ready, attempt

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir

port = Trim(shell.ExpandEnvironmentStrings("%PORT%"))
If port = "" Or port = "%PORT%" Then
  port = "3777"
End If

extraArgs = ""
For i = 0 To WScript.Arguments.Count - 1
  arg = Trim(WScript.Arguments(i))
  If LCase(arg) = "--demo" Then
    extraArgs = extraArgs & " --demo"
  End If
Next

healthUrl = "http://127.0.0.1:" & port & "/api/health"
appUrl = "http://127.0.0.1:" & port

If Not IsServerHealthy(healthUrl) Then
  serverEntry = fso.BuildPath(scriptDir, "server\dist\server\src\index.js")
  webIndex = fso.BuildPath(scriptDir, "web\dist\index.html")

  ' First-run safety: install & build once if dist outputs are not present yet
  If (Not fso.FileExists(serverEntry)) Or (Not fso.FileExists(webIndex)) Then
    shell.Run "cmd /c npm run setup && npm run build", 1, True
  End If

  If Not fso.FileExists(serverEntry) Then
    MsgBox "Antigravity Mission Board could not find server build output." & vbCrLf & _
           "Please ensure Node.js 22.5+ is installed and run `npm run setup && npm run build`.", _
           vbExclamation, "Antigravity Mission Board"
    WScript.Quit 1
  End If

  ' Launch Node server completely hidden (windowStyle = 0, waitOnReturn = False)
  launchCmd = "node --no-warnings=ExperimentalWarning " & Chr(34) & serverEntry & Chr(34) & extraArgs
  shell.Run launchCmd, 0, False

  ready = False
  For attempt = 1 To 32
    WScript.Sleep 250
    If IsServerHealthy(healthUrl) Then
      ready = True
      Exit For
    End If
  Next
End If

' Open Mission Board in default browser
shell.Run appUrl, 1, False

Function IsServerHealthy(url)
  On Error Resume Next
  Dim http
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  http.SetTimeouts 400, 400, 400, 400
  http.Open "GET", url, False
  http.Send
  If Err.Number = 0 And http.Status = 200 Then
    IsServerHealthy = True
  Else
    IsServerHealthy = False
  End If
  Err.Clear
  On Error GoTo 0
End Function
