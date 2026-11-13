param(
  [Parameter(Mandatory=$true)][string]$Title,
  [string]$FilePath,
  [switch]$Cancel
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MappingOutDialog {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wparam, string lparam);
  [DllImport("user32.dll", EntryPoint="SendMessageW")]
  public static extern IntPtr SendNumber(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
}
'@
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $Title)
$dialog = $null
for ($attempt = 0; $attempt -lt 100; $attempt++) {
  $dialog = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
  if ($dialog) { break }
  Start-Sleep -Milliseconds 100
}
if (-not $dialog) { throw 'Native file dialog did not appear' }
Start-Sleep -Milliseconds 500
$shell = New-Object -ComObject WScript.Shell
if (-not $shell.AppActivate($Title)) { throw 'Could not focus native dialog' }
if ($Cancel) {
  [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
} else {
  $idCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '1001')
  $fields = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $idCondition)
  if ($fields.Count -eq 0) { throw 'Native filename control not found' }
  $filename = $fields | Where-Object { $_.Current.Name -notmatch '^[^:]+: ' } | Select-Object -First 1
  if (-not $filename) {
    $editId = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '1148')
    $editClass = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Edit')
    $editCondition = New-Object System.Windows.Automation.AndCondition($editId, $editClass)
    $filename = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCondition)
  }
  if (-not $filename) {
    $all = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($item in $all) {
      if ($item.Current.NativeWindowHandle -ne 0) { Write-Output ("CONTROL: {0} / {1} / {2}" -f $item.Current.AutomationId, $item.Current.ClassName, $item.Current.Name) }
    }
    throw 'Could not distinguish filename from address control'
  }
  $handle = [IntPtr]$filename.Current.NativeWindowHandle
  [void][MappingOutDialog]::SendNumber($handle, 177, [IntPtr]::Zero, [IntPtr](-1))
  [void][MappingOutDialog]::SendMessage($handle, 194, [IntPtr]1, $FilePath)
  Start-Sleep -Milliseconds 200
  $dialogHandle = [IntPtr]$dialog.Current.NativeWindowHandle
  [void][MappingOutDialog]::PostMessage($dialogHandle, 273, [IntPtr]1, [IntPtr]::Zero)
}
