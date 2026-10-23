Option Explicit
On Error Resume Next
Dim fs, folder, app, doc, names, expected, i, j, name, pdfPath, titleShape, result, pageCount, log, report
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.BuildPath(fs.GetParentFolderName(WScript.ScriptFullName), "pdf-word-results")
Set log = fs.OpenTextFile(fs.BuildPath(folder, "word-vbs.log"), 8, True)
Set app = Nothing
Set doc = Nothing
Sub CheckError(stage)
  If Err.Number <> 0 Then
    Dim message
    message = stage & ": " & Err.Description
    log.WriteLine message
    On Error Resume Next
    If Not doc Is Nothing Then doc.Close 0
    If Not app Is Nothing Then app.Quit 0
    WScript.Echo message
    WScript.Quit 1
  End If
End Sub
Set app = CreateObject("Word.Application")
CheckError "Create Word"
If app.Documents.Count <> 0 Then
  WScript.Echo "Word instance contains existing documents; stopping."
  WScript.Quit 1
End If
app.Visible = False
app.DisplayAlerts = 0
app.AutomationSecurity = 3
names = Array("converted", "page-two", "mixed")
expected = Array(3, 1, 1)
result = "["
For i = 0 To UBound(names)
  name = names(i)
  log.WriteLine "Opening " & name
  Set doc = app.Documents.Open(fs.BuildPath(folder, name & ".docx"), False, True)
  CheckError "Open document"
  doc.Repaginate
  pageCount = doc.ComputeStatistics(2, False)
  CheckError "Count pages"
  log.WriteLine "Pages: " & pageCount
  If pageCount <> expected(i) Then
    Err.Raise 1001, , "Unexpected page count: " & pageCount
    CheckError "Page count"
  End If
  pdfPath = fs.BuildPath(folder, name & "-word.pdf")
  doc.ExportAsFixedFormat pdfPath, 17
  CheckError "Export PDF"
  log.WriteLine "Exported " & name
  If i > 0 Then result = result & ","
  result = result & "{""name"":""" & name & """,""pages"":" & pageCount & ",""shapes"":" & doc.Shapes.Count & "}"
  If name = "converted" Then
    Set titleShape = Nothing
    For j = 1 To 5
      If doc.Shapes(j).TextFrame.HasText Then
        If InStr(doc.Shapes(j).TextFrame.TextRange.Text, "CONVERSION REPORT") > 0 Then
          Set titleShape = doc.Shapes(j)
          Exit For
        End If
      End If
    Next
    If titleShape Is Nothing Then Err.Raise 1002, , "Editable title not found"
    CheckError "Find editable title"
    titleShape.TextFrame.TextRange.Text = "EDITED IN WORD"
    doc.SaveAs2 fs.BuildPath(folder, "edited-in-word.docx"), 16
    CheckError "Save edited DOCX"
    doc.ExportAsFixedFormat fs.BuildPath(folder, "edited-in-word.pdf"), 17
    CheckError "Export edited PDF"
    log.WriteLine "Edited title and saved DOCX/PDF"
  End If
  doc.Close 0
  Set doc = Nothing
Next
app.Quit 0
Set app = Nothing
result = result & "]"
Set report = fs.CreateTextFile(fs.BuildPath(folder, "word-interop.json"), True)
report.Write result
report.Close
log.Close
WScript.Echo "PASS: Word opens, renders all three samples with expected page counts and saves an edited title."
