# 常驻 STA 通知助手：启动时绑 AUMID，身份只在缺或坏了时登记，然后读 stdin 弹气泡。
# 左上角来源图标看的是「进程 AUMID + Start 快捷方式图标」，不是 Toast XML。
# 审批用独立 Hidden PowerShell 弹出右下角通知卡片；助手进程本身无窗口，点按钮写回允许/拒绝。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$appId = $env:DSH_TOAST_APP_ID
$displayName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DSH_TOAST_NAME_B64))
$pngPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DSH_TOAST_PNG_B64))

$localDir = Join-Path $env:LOCALAPPDATA 'DeepSeek Harness'
$smallIco = Join-Path $localDir 'toast.ico'
$shortcutPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk'
$stampPath = Join-Path $localDir 'channel.stamp'

if (-not (Test-Path $localDir)) {
  New-Item -ItemType Directory -Path $localDir | Out-Null
}

if (-not ([System.Management.Automation.PSTypeName]'ShortcutNative').Type) {
  Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

[assembly: ComVisible(true)]

public static class ShortcutNative {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string appId);

  [DllImport("ole32.dll")]
  static extern int PropVariantClear(ref PROPVARIANT pvar);

  public static void BindProcess(string appId) {
    int hr = SetCurrentProcessExplicitAppUserModelID(appId);
    if (hr < 0) Marshal.ThrowExceptionForHR(hr);
  }

  public static readonly Guid ActivatorClsid = new Guid("8F3A2C11-9B47-4D6E-A1E0-7C2D9E4B6F01");

  public static void SetAumid(string shortcutPath, string appId) {
    IPersistFile file = (IPersistFile)new CShellLink();
    file.Load(shortcutPath, 2);
    IPropertyStore store = (IPropertyStore)file;
    PROPERTYKEY key = new PROPERTYKEY();
    key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");

    key.pid = 5;
    PROPVARIANT pv = new PROPVARIANT();
    pv.vt = 31;
    pv.pointerValue = Marshal.StringToCoTaskMemUni(appId);
    uint hr = store.SetValue(ref key, ref pv);
    if (hr != 0) Marshal.ThrowExceptionForHR(unchecked((int)hr));
    PropVariantClear(ref pv);

    // 未打包应用：快捷方式上的 stub CLSID 让按钮走协议，而不是去开 PowerShell。
    key.pid = 26;
    pv = new PROPVARIANT();
    pv.vt = 72;
    IntPtr guid = Marshal.AllocCoTaskMem(16);
    Marshal.Copy(ActivatorClsid.ToByteArray(), 0, guid, 16);
    pv.pointerValue = guid;
    hr = store.SetValue(ref key, ref pv);
    if (hr != 0) Marshal.ThrowExceptionForHR(unchecked((int)hr));
    PropVariantClear(ref pv);

    hr = store.Commit();
    if (hr != 0) Marshal.ThrowExceptionForHR(unchecked((int)hr));
    file.Save(shortcutPath, true);
  }

  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  private class CShellLink {}

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("0000010b-0000-0000-C000-000000000046")]
  private interface IPersistFile {
    void GetClassID(out Guid pClassID);
    [PreserveSig] int IsDirty();
    void Load([In, MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([In, MarshalAs(UnmanagedType.LPWStr)] string pszFileName, [In, MarshalAs(UnmanagedType.Bool)] bool fRemember);
    void SaveCompleted([In, MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  private struct PROPERTYKEY {
    public Guid fmtid;
    public uint pid;
  }

  [StructLayout(LayoutKind.Explicit)]
  private struct PROPVARIANT {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr pointerValue;
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
  private interface IPropertyStore {
    [PreserveSig] uint GetCount(out uint cProps);
    [PreserveSig] uint GetAt(uint iProp, out PROPERTYKEY pkey);
    [PreserveSig] uint GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
    [PreserveSig] uint SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
    [PreserveSig] uint Commit();
  }
}

public static class ToastWaitGate {
  [StructLayout(LayoutKind.Sequential)]
  public struct MSG {
    public IntPtr hwnd;
    public uint message;
    public IntPtr wParam;
    public IntPtr lParam;
    public uint time;
    public int ptX;
    public int ptY;
  }

  [DllImport("user32.dll")]
  static extern int PeekMessage(out MSG lpMsg, IntPtr hWnd, uint min, uint max, uint remove);
  [DllImport("user32.dll")]
  static extern bool TranslateMessage(ref MSG lpMsg);
  [DllImport("user32.dll")]
  static extern IntPtr DispatchMessage(ref MSG lpMsg);

  public static readonly ManualResetEventSlim Done = new ManualResetEventSlim(false);
  public static string Result = "deferred";
  public static string ClickPath = "";
  static readonly object Gate = new object();
  static DateTime CloseDeadlineUtc = DateTime.MaxValue;

  static void Debug(string line) {
    try {
      string dir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
      string path = System.IO.Path.Combine(dir, "DeepSeek Harness", "toast-debug.log");
      System.IO.File.AppendAllText(path, DateTime.Now.ToString("HH:mm:ss.fff") + " " + line + "\r\n");
    } catch {}
  }

  public static void OnActivate(string invokedArgs) {
    Debug("activate " + invokedArgs);
    string mapped = MapClick(invokedArgs);
    if (mapped == null) return;
    try {
      if (!string.IsNullOrEmpty(ClickPath))
        System.IO.File.WriteAllText(ClickPath, mapped + "\n");
    } catch {}
    Complete(mapped);
  }

  public static void Reset() {
    lock (Gate) {
      Result = "deferred";
      CloseDeadlineUtc = DateTime.MaxValue;
      if (Done.IsSet) Done.Reset();
    }
  }

  public static void Complete(string result) {
    Debug("complete " + result);
    lock (Gate) {
      if (result == "allowed-once" || result == "rejected") {
        Result = result;
        Done.Set();
        return;
      }
      if (Done.IsSet) return;
      Result = "deferred";
      Done.Set();
    }
  }

  public static void NoteUserClosed() {
    lock (Gate) {
      if (Done.IsSet) return;
      if (CloseDeadlineUtc == DateTime.MaxValue)
        CloseDeadlineUtc = DateTime.UtcNow.AddMilliseconds(8000);
    }
  }

  static bool IsButton() {
    lock (Gate) {
      return Result == "allowed-once" || Result == "rejected";
    }
  }

  static void Pump() {
    MSG msg;
    while (PeekMessage(out msg, IntPtr.Zero, 0, 0, 1) != 0) {
      TranslateMessage(ref msg);
      DispatchMessage(ref msg);
    }
  }

  static string MapClick(string raw) {
    if (string.IsNullOrEmpty(raw)) return null;
    if (raw.IndexOf("allowed-once", StringComparison.OrdinalIgnoreCase) >= 0) return "allowed-once";
    if (raw.IndexOf("rejected", StringComparison.OrdinalIgnoreCase) >= 0) return "rejected";
    return null;
  }

  static void TryReadClick(string clickPath) {
    if (string.IsNullOrEmpty(clickPath) || !System.IO.File.Exists(clickPath)) return;
    string text;
    try {
      text = System.IO.File.ReadAllText(clickPath).Trim();
      System.IO.File.Delete(clickPath);
    } catch {
      return;
    }
    if (string.Equals(text, "abort", StringComparison.OrdinalIgnoreCase)
        || string.Equals(text, "deferred", StringComparison.OrdinalIgnoreCase)) {
      Complete("deferred");
      return;
    }
    string mapped = MapClick(text);
    if (mapped != null) Complete(mapped);
  }

  public static string Wait(int ms, string clickPath) {
    var end = DateTime.UtcNow.AddMilliseconds(ms);
    while (!Done.IsSet) {
      Pump();
      TryReadClick(clickPath);
      if (IsButton()) break;
      var now = DateTime.UtcNow;
      if (now >= end) {
        Complete("deferred");
        break;
      }
      DateTime closeAt;
      lock (Gate) { closeAt = CloseDeadlineUtc; }
      if (now >= closeAt) {
        Complete("deferred");
        break;
      }
      Thread.Sleep(50);
    }
    TryReadClick(clickPath);
    lock (Gate) {
      string outcome = (Result == "allowed-once" || Result == "rejected") ? Result : "deferred";
      Debug("wait-return " + outcome);
      return outcome;
    }
  }
}

[ComImport, Guid("53E31837-6600-4A81-9395-75CFFE746F94"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface INotificationActivationCallback {
  void Activate(
    [In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
    [In, MarshalAs(UnmanagedType.LPWStr)] string invokedArgs,
    [In] IntPtr data,
    [In] uint count);
}

[ComVisible(true)]
[Guid("8F3A2C11-9B47-4D6E-A1E0-7C2D9E4B6F01")]
[ClassInterface(ClassInterfaceType.None)]
[ComDefaultInterface(typeof(INotificationActivationCallback))]
public class DshToastActivator : INotificationActivationCallback {
  public DshToastActivator() {}
  public void Activate(string appUserModelId, string invokedArgs, IntPtr data, uint count) {
    ToastWaitGate.OnActivate(invokedArgs);
  }
}

public static class ToastCom {
  static int Cookie;

  public static void RegisterClassObject() {
    if (Cookie != 0) return;
    var rs = new RegistrationServices();
    Cookie = rs.RegisterTypeForComClients(
      typeof(DshToastActivator),
      RegistrationClassContext.LocalServer,
      RegistrationConnectionType.MultipleUse);
  }

  public static void RegisterLocalServer(string command) {
    string path = @"Software\Classes\CLSID\{8F3A2C11-9B47-4D6E-A1E0-7C2D9E4B6F01}\LocalServer32";
    var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(path);
    key.SetValue("", command);
    key.Close();
  }
}
'@
}

[ShortcutNative]::BindProcess($appId)

function Get-ShowClickPath([string]$Tag) {
  if ($Tag -and $Tag -ne '-' -and $Tag -match '^[A-Za-z0-9]+$') {
    return Join-Path $localDir ("toast-click-$Tag.txt")
  }
  return Join-Path $localDir 'toast-click.txt'
}

$clickPath = Join-Path $localDir 'toast-click.txt'
[ToastWaitGate]::ClickPath = $clickPath

$comOnly = $false
try { $comOnly = -not [Console]::IsInputRedirected } catch { $comOnly = $false }

# Button clicks use the dsh-toast protocol so the resident helper receives them.
function Register-ToastProtocol {
  $vbs = Join-Path $PSScriptRoot 'toast-activate.vbs'
  if (-not (Test-Path -LiteralPath $vbs)) { return }
  $wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
  if (-not (Test-Path -LiteralPath $wscript)) { $wscript = 'wscript.exe' }
  $command = '"{0}" //B //Nologo "{1}" "%1"' -f $wscript, $vbs
  $root = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Classes\dsh-toast')
  $root.SetValue('', 'URL:DeepSeek Harness Toast')
  $root.SetValue('URL Protocol', '')
  $cmd = $root.CreateSubKey('shell\open\command')
  $cmd.SetValue('', $command)
  $cmd.Close()
  $root.Close()
}

try { Register-ToastProtocol } catch {}

function Register-ToastCom {
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $script = Join-Path $PSScriptRoot 'show-toast.ps1'
  $command = '"{0}" -NoProfile -NonInteractive -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}"' -f $ps, $script
  [ToastCom]::RegisterLocalServer($command)
  [ToastCom]::RegisterClassObject()
}
try { Register-ToastCom } catch {}

if ($comOnly) {
  [ToastWaitGate]::Reset()
  [void][ToastWaitGate]::Wait(20000, $clickPath)
  exit 0
}

function Get-ToastArgument($EventArgs) {
  foreach ($candidate in @($EventArgs)) {
    if ($null -eq $candidate) { continue }
    try {
      $value = [string]$candidate.Arguments
      if ($value) { return $value }
    } catch {}
  }
  try {
    $value = [string]$args[1].Arguments
    if ($value) { return $value }
  } catch {}
  return ''
}

function Map-ToastAction([string]$Raw) {
  if ($Raw -match 'allowed-once') { return 'allowed-once' }
  if ($Raw -match 'rejected') { return 'rejected' }
  return ''
}

function Save-PngIco {
  param([System.Drawing.Bitmap]$Bitmap, [string]$Path)
  $ms = New-Object System.IO.MemoryStream
  $Bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $png = $ms.ToArray()
  $ms.Dispose()
  $w = $Bitmap.Width
  $h = $Bitmap.Height
  if ($w -ge 256) { $w = 0 }
  if ($h -ge 256) { $h = 0 }
  $fs = [System.IO.File]::Create($Path)
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([uint16]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]1)
  $bw.Write([byte]$w)
  $bw.Write([byte]$h)
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]32)
  $bw.Write([uint32]$png.Length)
  $bw.Write([uint32]22)
  $bw.Write($png)
  $bw.Flush()
  $fs.Dispose()
}

function Get-IconStamp {
  $suffix = '|toast-com'
  if ($pngPath -ne '' -and (Test-Path -LiteralPath $pngPath)) {
    return ($appId + '|' + (Get-FileHash -LiteralPath $pngPath -Algorithm SHA256).Hash + $suffix)
  }
  return ($appId + '|none' + $suffix)
}

function Write-ToastShortcut {
  $toastExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  if (-not (Test-Path -LiteralPath $toastExe)) { return }
  $iconForShell = $smallIco
  if (-not (Test-Path -LiteralPath $iconForShell)) { $iconForShell = $pngPath }
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut($shortcutPath)
  $s.TargetPath = $toastExe
  $s.Arguments = ''
  $s.WorkingDirectory = Split-Path -Parent $toastExe
  if ($iconForShell -ne '' -and (Test-Path -LiteralPath $iconForShell)) {
    $s.IconLocation = "$iconForShell,0"
  }
  $s.Save()
  [ShortcutNative]::SetAumid($shortcutPath, $appId)
}

$stamp = Get-IconStamp
$identityReady = (Test-Path -LiteralPath $shortcutPath) -and (Test-Path -LiteralPath $smallIco) -and (Test-Path -LiteralPath $stampPath) -and ((Get-Content -LiteralPath $stampPath -Raw).Trim() -eq $stamp)

if (-not $identityReady) {
  try {
    Add-Type -AssemblyName System.Drawing
    if ($pngPath -ne '' -and (Test-Path -LiteralPath $pngPath)) {
      $src = [System.Drawing.Image]::FromFile($pngPath)
      try {
        $bmp = New-Object System.Drawing.Bitmap 32, 32
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
          $g.Clear([System.Drawing.Color]::White)
          $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $g.DrawImage($src, 2, 2, 28, 28)
        } finally {
          $g.Dispose()
        }
        try { Save-PngIco -Bitmap $bmp -Path $smallIco } finally { $bmp.Dispose() }
      } finally {
        $src.Dispose()
      }
    }

    $iconForShell = $smallIco
    if (-not (Test-Path -LiteralPath $iconForShell)) { $iconForShell = $pngPath }

    Write-ToastShortcut

    $iconUri = $pngPath
    if ($iconUri -ne '' -and (Test-Path -LiteralPath $iconUri)) {
      $iconUri = ([Uri]((Get-Item -LiteralPath $iconUri).FullName)).AbsoluteUri
    } elseif (Test-Path -LiteralPath $iconForShell) {
      $iconUri = ([Uri]((Get-Item -LiteralPath $iconForShell).FullName)).AbsoluteUri
    } else {
      $iconUri = ''
    }

    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey(('Software\Classes\AppUserModelId\' + $appId))
    $key.SetValue('DisplayName', $displayName, [Microsoft.Win32.RegistryValueKind]::ExpandString)
    if ($iconUri -ne '') {
      $key.SetValue('IconUri', $iconUri, [Microsoft.Win32.RegistryValueKind]::ExpandString)
    }
    $key.SetValue('IconBackgroundColor', 'FFFFFFFF', [Microsoft.Win32.RegistryValueKind]::String)
    $key.SetValue('ShowInSettings', 1, [Microsoft.Win32.RegistryValueKind]::DWord)
    $key.Close()

    $ie4 = Join-Path $env:SystemRoot 'System32\ie4uinit.exe'
    if (Test-Path -LiteralPath $ie4) {
      Start-Process -FilePath $ie4 -ArgumentList '-show' -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
    }
    Set-Content -LiteralPath $stampPath -Value $stamp -Encoding ASCII
  } catch {
    # 身份登记失败仍继续弹通知；进程 AUMID 已经绑过。
  }
}

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
try {
  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier()
} catch {
  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
}

function Write-Reply([string]$Text) {
  [Console]::Out.WriteLine($Text)
  [Console]::Out.Flush()
}

function Show-ToastLine([string]$WaitRaw, [string]$Tag, [string]$Encoded) {
  $waitMs = 0
  [void][int]::TryParse($WaitRaw, [ref]$waitMs)
  $xml = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Encoded))
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xml)
  $toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
  if ($Tag -and $Tag -ne '-') {
    $toast.Tag = $Tag
    $toast.Group = 'task-notify'
  }
  if ($waitMs -gt 0) {
    $showClick = Get-ShowClickPath $Tag
    [ToastWaitGate]::ClickPath = $showClick
    if (Test-Path -LiteralPath $showClick) {
      Remove-Item -LiteralPath $showClick -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath ($showClick + '.ready')) {
      Remove-Item -LiteralPath ($showClick + '.ready') -Force -ErrorAction SilentlyContinue
    }
    [ToastWaitGate]::Reset()
    [void]$toast.add_Activated({
      try {
        $raw = ''
        if ($args.Count -ge 2) {
          try { $raw = [string]$args[1].Arguments } catch {}
        }
        if (-not $raw) { $raw = Get-ToastArgument $null }
        $mapped = Map-ToastAction $raw
        if ($mapped) { [ToastWaitGate]::OnActivate($mapped) }
      } catch {}
    })
    [void]$toast.add_Dismissed({
      try {
        $reason = ''
        if ($args.Count -ge 2) {
          try { $reason = [string]$args[1].Reason } catch {}
        }
        if ($reason -eq 'TimedOut' -or $reason -eq '2') {
          [ToastWaitGate]::Complete('deferred')
        }
      } catch {}
    })
    [void]$toast.add_Failed({
      try { [ToastWaitGate]::Complete('deferred') } catch {}
    })
  }
  if ($waitMs -le 0) {
    [void]$notifier.Show($toast)
    Write-Reply 'ok'
    return
  }

  $titleText = '需要你批准'
  $bodyText = ''
  try {
    $nodes = $doc.GetElementsByTagName('text')
    if ($nodes.Length -gt 0) { $titleText = [string]$nodes.Item(0).InnerText }
    if ($nodes.Length -gt 1) { $bodyText = [string]$nodes.Item(1).InnerText }
  } catch {}
  $iconForCard = $smallIco
  if (-not (Test-Path -LiteralPath $iconForCard)) { $iconForCard = $pngPath }
  $ui = $null
  try {
    $env:DSH_TOAST_UI_CLICK = $showClick
    $env:DSH_TOAST_UI_TITLE_B64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($titleText))
    $env:DSH_TOAST_UI_BODY_B64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bodyText))
    $env:DSH_TOAST_UI_ICON = $iconForCard
    $env:DSH_TOAST_UI_WAIT_MS = [string]$waitMs
    $uiScript = Join-Path $PSScriptRoot 'show-approval-ui.ps1'
    $uiExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $uiExe
    $psi.Arguments = '-WindowStyle Hidden -NoProfile -STA -ExecutionPolicy Bypass -File "' + $uiScript + '"'
    $psi.UseShellExecute = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $ui = [System.Diagnostics.Process]::Start($psi)
  } catch {}
  $outcome = [ToastWaitGate]::Wait($waitMs, $showClick)
  if ($ui -ne $null -and -not $ui.HasExited) {
    try { Stop-Process -Id $ui.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  if ($outcome -ne 'allowed-once' -and $outcome -ne 'rejected') { $outcome = 'deferred' }
  try {
    Set-Content -LiteralPath (Join-Path $localDir 'toast-last.txt') -Value $outcome -Encoding ASCII
  } catch {}
  Write-Reply $outcome
}

Write-Reply 'ready'

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if ($line -eq '') { continue }
  if ($line -eq 'QUIT') { break }
  try {
    $parts = $line.Split(' ', 4)
    if ($parts.Length -lt 4 -or $parts[0] -ne 'SHOW') {
      Write-Reply 'error bad command'
      continue
    }
    Show-ToastLine $parts[1] $parts[2] $parts[3]
  } catch {
    Write-Reply ('error ' + $_.Exception.Message)
  }
}
