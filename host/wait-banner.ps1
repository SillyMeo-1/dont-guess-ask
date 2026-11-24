param(
    [Parameter(Mandatory = $true)][string]$ParamsPath
)

$ErrorActionPreference = 'Stop'

$raw = [System.IO.File]::ReadAllText($ParamsPath, [System.Text.Encoding]::UTF8)
$p = $raw | ConvertFrom-Json

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public static class AskNative
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    public static IntPtr FindWindowByTitle(string needle)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
        {
            if (!IsWindowVisible(hWnd)) return true;
            StringBuilder text = new StringBuilder(512);
            GetWindowText(hWnd, text, text.Capacity);
            string title = text.ToString();
            if (title.Length > 0 && title.IndexOf(needle, StringComparison.Ordinal) >= 0)
            {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}

public sealed class AskBannerForm : Form
{
    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x08000000; // WS_EX_NOACTIVATE: never steal focus
            cp.ExStyle |= 0x00000080; // WS_EX_TOOLWINDOW: no taskbar entry
            return cp;
        }
    }
}
'@

$target = $null
try { $target = [System.Diagnostics.Process]::GetProcessById([int]$p.pid) } catch { }
$hwnd = [IntPtr]::Zero
if ($null -ne $target) { $hwnd = $target.MainWindowHandle }

# A Host outside the window-owning process has no MainWindowHandle; the app's
# title is the reliable handle then. No window at all means no banner: a bar
# that could never tell "in front" from "hidden" would just stay up.
if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [AskNative]::FindWindowByTitle('DeepSeek Harness') }
if ($hwnd -eq [IntPtr]::Zero) { exit 0 }

function Get-WindowTitle([IntPtr]$handle) {
    if ($handle -eq [IntPtr]::Zero) { return '' }
    $buffer = New-Object System.Text.StringBuilder 512
    [void][AskNative]::GetWindowText($handle, $buffer, $buffer.Capacity)
    return $buffer.ToString()
}

function Focus-Target {
    if ($hwnd -eq [IntPtr]::Zero) { return }
    if ([AskNative]::IsIconic($hwnd)) { [void][AskNative]::ShowWindow($hwnd, 9) }  # SW_RESTORE
    [void][AskNative]::SetForegroundWindow($hwnd)
}

$accent = [System.Drawing.Color]::FromArgb(255, 106, 61)
$dark = [System.Drawing.Color]::FromArgb(20, 22, 31)

$form = New-Object AskBannerForm
$form.AutoSize = $true
$form.AutoSizeMode = 'GrowAndShrink'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.BackColor = $accent
$form.Padding = New-Object System.Windows.Forms.Padding(2)
$form.Cursor = [System.Windows.Forms.Cursors]::Hand

$flow = New-Object System.Windows.Forms.FlowLayoutPanel
$flow.FlowDirection = [System.Windows.Forms.FlowDirection]::TopDown
$flow.WrapContents = $false
$flow.AutoSize = $true
$flow.AutoSizeMode = [System.Windows.Forms.AutoSizeMode]::GrowAndShrink
$flow.BackColor = $dark
$flow.Padding = New-Object System.Windows.Forms.Padding(18, 11, 22, 11)

$headline = New-Object System.Windows.Forms.Label
$headline.Text = [string]$p.text
$headline.AutoSize = $true
$headline.Margin = New-Object System.Windows.Forms.Padding(0)
$headline.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 11, [System.Drawing.FontStyle]::Bold)
$headline.ForeColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$headline.Cursor = [System.Windows.Forms.Cursors]::Hand

$sub = New-Object System.Windows.Forms.Label
$sub.Text = [string]$p.subtext
$sub.AutoSize = $true
$sub.Margin = New-Object System.Windows.Forms.Padding(0, 4, 0, 0)
$sub.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 8.5)
$sub.ForeColor = [System.Drawing.Color]::FromArgb(180, 188, 208)
$sub.Cursor = [System.Windows.Forms.Cursors]::Hand

$flow.Controls.Add($headline)
if (-not [string]::IsNullOrWhiteSpace([string]$p.subtext)) { $flow.Controls.Add($sub) }
$form.Controls.Add($flow)

$form.Add_Click({ Focus-Target })
$headline.Add_Click({ Focus-Target })
$sub.Add_Click({ Focus-Target })

$delay = [int]$p.delayMs
$poll = [int]$p.pollMs
if ($poll -lt 200) { $poll = 200 }
$logPath = [string]$p.logFile
$lastLog = ''

$shown = $false
$since = 0

while ($true) {
    if (Test-Path -LiteralPath ([string]$p.stopFile)) { break }

    $alive = $false
    try {
        $alive = -not [System.Diagnostics.Process]::GetProcessById([int]$p.pid).HasExited
    } catch { $alive = $false }
    if (-not $alive) { break }

    [System.Windows.Forms.Application]::DoEvents()

    $foreground = [AskNative]::GetForegroundWindow()
    $minimized = ($hwnd -ne [IntPtr]::Zero) -and [AskNative]::IsIconic($hwnd)
    $title = Get-WindowTitle $hwnd

    $sameSession = $true
    if (-not [string]::IsNullOrEmpty([string]$p.titleMatch)) {
        $sameSession = $title.IndexOf([string]$p.titleMatch, [System.StringComparison]::Ordinal) -ge 0
    }

    $need = $minimized -or ($foreground -ne $hwnd) -or (-not $sameSession)
    if ($need) {
        if ($since -eq 0) { $since = [Environment]::TickCount }
    } else {
        $since = 0
    }

    $want = $need -and ($since -ne 0) -and (([Environment]::TickCount - $since) -ge $delay)
    if ($logPath) {
        $line = "$(Get-Date -Format HH:mm:ss) fg=$($foreground.ToInt64()) hwnd=$($hwnd.ToInt64()) min=$minimized same=$sameSession need=$need want=$want title=[$title]"
        if ($line -ne $lastLog) {
            try { Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8 } catch { }
            $lastLog = $line
        }
    }
    if ($want -ne $shown) {
        if ($want) {
            $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
            $form.Visible = $true
            $form.Location = New-Object System.Drawing.Point(
                [int](($area.Width - $form.Width) / 2),
                [int]($area.Top + 10)
            )
            $form.Refresh()
        } else {
            $form.Visible = $false
        }
        $shown = $want
    }

    Start-Sleep -Milliseconds $poll
}

try { $form.Close() } catch { }
