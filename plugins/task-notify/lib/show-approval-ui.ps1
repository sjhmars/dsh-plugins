# 审批卡片：版式和配色跟随 Windows 右下角系统通知（任务栏/通知中心那一套）。
# 先藏控制台，再编译界面，避免弹出 PowerShell 黑窗。
if (-not ([System.Management.Automation.PSTypeName]'NativeWin').Type) {
  Add-Type -Name NativeWin -Namespace Dsh -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
}
$console = [Dsh.NativeWin]::GetConsoleWindow()
if ($console -ne [IntPtr]::Zero) { [void][Dsh.NativeWin]::ShowWindow($console, 0) }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not ([System.Management.Automation.PSTypeName]'DshToastCard').Type) {
  Add-Type -ReferencedAssemblies System.Windows.Forms.dll, System.Drawing.dll -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class DshToastCard : Form {
  [DllImport("gdi32.dll")]
  static extern IntPtr CreateRoundRectRgn(int l, int t, int r, int b, int w, int h);

  Timer anim;
  int restX;
  int restY;
  int offX;
  int fromX;
  int toX;
  double fromOp;
  double toOp;
  int animMs;
  bool easeOut;
  bool closeAfter;
  DateTime animStarted;

  public DshToastCard() {
    FormBorderStyle = FormBorderStyle.None;
    StartPosition = FormStartPosition.Manual;
    ShowInTaskbar = false;
    TopMost = true;
    MinimizeBox = false;
    MaximizeBox = false;
    ShowIcon = false;
    Width = 364;
    Height = 152;
    Text = "DeepSeek Harness";
    Opacity = 0;
  }

  protected override CreateParams CreateParams {
    get {
      CreateParams cp = base.CreateParams;
      cp.ClassStyle |= 0x00020000;
      cp.ExStyle |= 0x00000080;
      return cp;
    }
  }

  protected override void OnHandleCreated(EventArgs e) {
    base.OnHandleCreated(e);
    ApplyRound();
  }

  protected override void OnSizeChanged(EventArgs e) {
    base.OnSizeChanged(e);
    if (IsHandleCreated) ApplyRound();
  }

  protected override void Dispose(bool disposing) {
    if (disposing && anim != null) {
      anim.Stop();
      anim.Dispose();
      anim = null;
    }
    base.Dispose(disposing);
  }

  void ApplyRound() {
    IntPtr rgn = CreateRoundRectRgn(0, 0, Width + 1, Height + 1, 4, 4);
    Region = Region.FromHrgn(rgn);
  }

  public void ArmSlide(int x, int y) {
    restX = x;
    restY = y;
    offX = Screen.FromPoint(new Point(x, y)).WorkingArea.Right;
    Location = new Point(offX, restY);
    Opacity = 0;
  }

  public void SlideIn() {
    closeAfter = false;
    StartAnim(offX, restX, 0, 1, 320, true);
  }

  public void CloseWithSlide() {
    if (closeAfter) return;
    closeAfter = true;
    int from = Left;
    if (!Visible) {
      Close();
      return;
    }
    StartAnim(from, offX, Opacity, 0, 220, false);
  }

  void StartAnim(int x0, int x1, double op0, double op1, int ms, bool decelerate) {
    fromX = x0;
    toX = x1;
    fromOp = op0;
    toOp = op1;
    animMs = ms;
    easeOut = decelerate;
    animStarted = DateTime.UtcNow;
    if (anim == null) {
      anim = new Timer();
      anim.Interval = 15;
      anim.Tick += OnAnim;
    }
    anim.Start();
  }

  void OnAnim(object sender, EventArgs e) {
    double t = (DateTime.UtcNow - animStarted).TotalMilliseconds / animMs;
    if (t >= 1) {
      FinishAnim();
      return;
    }
    double eased = easeOut ? 1 - Math.Pow(1 - t, 3) : t * t * t;
    Left = (int)Math.Round(fromX + (toX - fromX) * eased);
    Opacity = fromOp + (toOp - fromOp) * eased;
  }

  void FinishAnim() {
    if (anim != null) anim.Stop();
    Left = toX;
    Opacity = toOp;
    if (closeAfter) Close();
  }
}
'@
}

function Get-ToastCardTheme {
  # 跟任务栏/通知中心同一套 Windows 配色，不跟应用窗口的浅色主题。
  $light = $false
  try {
    $v = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name SystemUsesLightTheme -ErrorAction Stop).SystemUsesLightTheme
    $light = [int]$v -ne 0
  } catch {}
  if ($light) {
    return @{
      Back = [Drawing.Color]::FromArgb(255, 255, 255)
      App = [Drawing.Color]::FromArgb(96, 96, 96)
      Title = [Drawing.Color]::FromArgb(0, 0, 0)
      Body = [Drawing.Color]::FromArgb(96, 96, 96)
      Line = [Drawing.Color]::FromArgb(229, 229, 229)
      Btn = [Drawing.Color]::FromArgb(243, 243, 243)
      BtnText = [Drawing.Color]::FromArgb(0, 0, 0)
      Close = [Drawing.Color]::FromArgb(96, 96, 96)
    }
  }
  return @{
    Back = [Drawing.Color]::FromArgb(43, 43, 43)
    App = [Drawing.Color]::FromArgb(169, 169, 169)
    Title = [Drawing.Color]::FromArgb(255, 255, 255)
    Body = [Drawing.Color]::FromArgb(200, 200, 200)
    Line = [Drawing.Color]::FromArgb(58, 58, 58)
    Btn = [Drawing.Color]::FromArgb(58, 58, 58)
    BtnText = [Drawing.Color]::FromArgb(255, 255, 255)
    Close = [Drawing.Color]::FromArgb(169, 169, 169)
  }
}

function New-ToastCardButton([string]$Text, [Drawing.Color]$Back, [Drawing.Color]$Fore, [Drawing.Rectangle]$Bounds) {
  $btn = New-Object Windows.Forms.Button
  $btn.Text = $Text
  $btn.FlatStyle = [Windows.Forms.FlatStyle]::Flat
  $btn.FlatAppearance.BorderSize = 0
  $btn.BackColor = $Back
  $btn.ForeColor = $Fore
  $btn.Bounds = $Bounds
  $btn.Cursor = [Windows.Forms.Cursors]::Hand
  $btn.Font = New-Object Drawing.Font('Segoe UI', 14, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
  return $btn
}

function Write-ApprovalClick([string]$Action) {
  $script:ApprovalUiResult = $Action
  $path = $script:ApprovalClickPath
  if (-not $path) { return }
  try {
    $dir = Split-Path -Parent $path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
      New-Item -ItemType Directory -Path $dir | Out-Null
    }
    Set-Content -LiteralPath $path -Value $Action -Encoding ASCII
  } catch {}
}

function Show-ApprovalToastCard {
  param(
    [string]$Title,
    [string]$Body,
    [int]$WaitMs,
    [string]$ClickPath,
    [string]$IconPath
  )
  if ($Title -eq '') { $Title = '需要你批准' }
  $theme = Get-ToastCardTheme
  $script:ApprovalUiResult = 'deferred'
  $script:ApprovalWaitMs = $WaitMs
  $script:ApprovalClickPath = $ClickPath
  $form = New-Object DshToastCard
  $script:ApprovalForm = $form
  $form.BackColor = $theme.Back

  $appFont = New-Object Drawing.Font('Segoe UI', 12, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
  $titleFont = New-Object Drawing.Font('Segoe UI Semibold', 15, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
  if ($titleFont.Name -ne 'Segoe UI Semibold') {
    $titleFont = New-Object Drawing.Font('Segoe UI', 15, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
  }
  $bodyFont = New-Object Drawing.Font('Segoe UI', 13, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)

  $left = 12
  if ($IconPath -and (Test-Path -LiteralPath $IconPath)) {
    $pic = New-Object Windows.Forms.PictureBox
    $pic.SizeMode = [Windows.Forms.PictureBoxSizeMode]::Zoom
    $pic.Bounds = New-Object Drawing.Rectangle 12, 12, 16, 16
    try { $pic.Image = [Drawing.Image]::FromFile($IconPath) } catch {}
    $form.Controls.Add($pic)
    $left = 34
  }

  $app = New-Object Windows.Forms.Label
  $app.Text = 'DeepSeek Harness'
  $app.ForeColor = $theme.App
  $app.BackColor = $theme.Back
  $app.Font = $appFont
  $app.Bounds = New-Object Drawing.Rectangle $left, 10, 280, 18
  $form.Controls.Add($app)

  $close = New-Object Windows.Forms.Label
  $close.TextAlign = [Drawing.ContentAlignment]::MiddleCenter
  $close.ForeColor = $theme.Close
  $close.BackColor = $theme.Back
  $close.Bounds = New-Object Drawing.Rectangle 332, 4, 28, 28
  $close.Cursor = [Windows.Forms.Cursors]::Hand
  $mdl = New-Object Drawing.Font('Segoe MDL2 Assets', 12, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
  if ($mdl.Name -eq 'Segoe MDL2 Assets') {
    $close.Font = $mdl
    $close.Text = [char]0xE8BB
  } else {
    $close.Font = New-Object Drawing.Font('Segoe UI', 14, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $close.Text = [char]0x00D7
  }
  $close.Add_Click({ $script:ApprovalForm.CloseWithSlide() })
  $form.Controls.Add($close)
  $form.Add_FormClosed({
    if ($script:ApprovalUiResult -eq 'allowed-once' -or $script:ApprovalUiResult -eq 'rejected') { return }
    Write-ApprovalClick 'deferred'
  })

  $titleLabel = New-Object Windows.Forms.Label
  $titleLabel.Text = $Title
  $titleLabel.ForeColor = $theme.Title
  $titleLabel.BackColor = $theme.Back
  $titleLabel.Font = $titleFont
  $titleLabel.AutoEllipsis = $true
  $titleLabel.Bounds = New-Object Drawing.Rectangle 12, 34, 316, 22
  $form.Controls.Add($titleLabel)

  $bodyLabel = New-Object Windows.Forms.Label
  $bodyLabel.Text = $Body
  $bodyLabel.ForeColor = $theme.Body
  $bodyLabel.BackColor = $theme.Back
  $bodyLabel.Font = $bodyFont
  $bodyLabel.AutoEllipsis = $true
  $bodyLabel.Bounds = New-Object Drawing.Rectangle 12, 58, 340, 20
  $form.Controls.Add($bodyLabel)

  $line = New-Object Windows.Forms.Panel
  $line.BackColor = $theme.Line
  $line.Bounds = New-Object Drawing.Rectangle 0, 107, 364, 1
  $form.Controls.Add($line)

  $split = New-Object Windows.Forms.Panel
  $split.BackColor = $theme.Line
  $split.Bounds = New-Object Drawing.Rectangle 181, 108, 1, 44
  $form.Controls.Add($split)

  $deny = New-ToastCardButton '拒绝' $theme.Btn $theme.BtnText (New-Object Drawing.Rectangle 0, 108, 181, 44)
  $allow = New-ToastCardButton '允许一次' $theme.Btn $theme.BtnText (New-Object Drawing.Rectangle 182, 108, 182, 44)

  $deny.Add_Click({
    Write-ApprovalClick 'rejected'
    $script:ApprovalForm.CloseWithSlide()
  })
  $allow.Add_Click({
    Write-ApprovalClick 'allowed-once'
    $script:ApprovalForm.CloseWithSlide()
  })
  $form.Controls.Add($deny)
  $form.Controls.Add($allow)

  $area = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $form.ArmSlide(($area.Right - $form.Width - 16), ($area.Bottom - $form.Height - 16))

  $script:ApprovalStarted = [DateTime]::UtcNow
  $timer = New-Object Windows.Forms.Timer
  $timer.Interval = 200
  $timer.Add_Tick({
    if (([DateTime]::UtcNow - $script:ApprovalStarted).TotalMilliseconds -ge $script:ApprovalWaitMs) {
      $script:ApprovalForm.CloseWithSlide()
      return
    }
    $path = $script:ApprovalClickPath
    if ($path -and (Test-Path -LiteralPath $path)) {
      try {
        $raw = (Get-Content -LiteralPath $path -Raw).Trim()
        if ($raw -match 'allowed-once' -or $raw -match 'rejected' -or $raw -eq 'abort' -or $raw -eq 'deferred') {
          $script:ApprovalForm.CloseWithSlide()
        }
      } catch {}
    }
  })
  $timer.Start()
  try {
    [Windows.Forms.Application]::EnableVisualStyles()
    $form.Add_Shown({
      $script:ApprovalForm.SlideIn()
      $script:ApprovalForm.BringToFront()
      try {
        if ($script:ApprovalClickPath) {
          Set-Content -LiteralPath ($script:ApprovalClickPath + '.ready') -Value '1' -Encoding ASCII
        }
      } catch {}
    })
    [void]$form.ShowDialog()
  } finally {
    $timer.Stop()
    $timer.Dispose()
    $form.Dispose()
  }
  return $script:ApprovalUiResult
}

function Decode-ToastUiB64([string]$Raw) {
  if (-not $Raw) { return '' }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Raw))
}

$uiWait = 10000
[void][int]::TryParse($env:DSH_TOAST_UI_WAIT_MS, [ref]$uiWait)
[void](Show-ApprovalToastCard `
  -Title (Decode-ToastUiB64 $env:DSH_TOAST_UI_TITLE_B64) `
  -Body (Decode-ToastUiB64 $env:DSH_TOAST_UI_BODY_B64) `
  -WaitMs $uiWait `
  -ClickPath $env:DSH_TOAST_UI_CLICK `
  -IconPath $env:DSH_TOAST_UI_ICON)

