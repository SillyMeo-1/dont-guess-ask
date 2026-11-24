param(
    [Parameter(Mandatory = $true)][string]$ParamsPath
)

$ErrorActionPreference = 'Stop'

$raw = [System.IO.File]::ReadAllText($ParamsPath, [System.Text.Encoding]::UTF8)
$p = $raw | ConvertFrom-Json

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class AskWin
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
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
'@

$target = $null
try { $target = [System.Diagnostics.Process]::GetProcessById([int]$p.pid) } catch { }
$hwnd = [IntPtr]::Zero
if ($null -ne $target) { $hwnd = $target.MainWindowHandle }
if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [AskWin]::FindWindowByTitle('DeepSeek Harness') }
if ($hwnd -eq [IntPtr]::Zero) { exit 0 }

function Get-WindowTitle([IntPtr]$handle) {
    if ($handle -eq [IntPtr]::Zero) { return '' }
    $buffer = New-Object System.Text.StringBuilder 512
    [void][AskWin]::GetWindowText($handle, $buffer, $buffer.Capacity)
    return $buffer.ToString()
}

function Focus-Target {
    if ($hwnd -eq [IntPtr]::Zero) { return }
    if ([AskWin]::IsIconic($hwnd)) { [void][AskWin]::ShowWindow($hwnd, 9) }  # SW_RESTORE
    [void][AskWin]::SetForegroundWindow($hwnd)
}

# --- translucent light-red to transparent gradient ---------------------------
$gradient = New-Object System.Windows.Media.LinearGradientBrush
$gradient.StartPoint = New-Object System.Windows.Point(0, 0)
$gradient.EndPoint = New-Object System.Windows.Point(1, 0)
$gradient.GradientStops.Add((New-Object System.Windows.Media.GradientStop ([System.Windows.Media.Color]::FromArgb(214, 255, 128, 128)), 0.0))
$gradient.GradientStops.Add((New-Object System.Windows.Media.GradientStop ([System.Windows.Media.Color]::FromArgb(186, 255, 146, 146)), 0.45))
$gradient.GradientStops.Add((New-Object System.Windows.Media.GradientStop ([System.Windows.Media.Color]::FromArgb(70, 255, 170, 170)), 0.78))
$gradient.GradientStops.Add((New-Object System.Windows.Media.GradientStop ([System.Windows.Media.Color]::FromArgb(0, 255, 190, 190)), 1.0))

$border = New-Object System.Windows.Controls.Border
$border.Background = $gradient
$border.CornerRadius = New-Object System.Windows.CornerRadius(10)
$border.BorderThickness = New-Object System.Windows.Thickness(1)
$border.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(90, 255, 255, 255))
$border.Padding = New-Object System.Windows.Thickness(18, 11, 26, 11)

$stack = New-Object System.Windows.Controls.StackPanel

$headline = New-Object System.Windows.Controls.TextBlock
$headline.Text = [string]$p.text
$headline.FontSize = 15
$headline.FontWeight = [System.Windows.FontWeights]::SemiBold
$headline.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 96, 16, 22))

$sub = New-Object System.Windows.Controls.TextBlock
$sub.Text = [string]$p.subtext
$sub.FontSize = 12
$sub.Margin = New-Object System.Windows.Thickness(0, 3, 0, 0)
$sub.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 128, 40, 44))

$stack.Children.Add($headline) | Out-Null
if (-not [string]::IsNullOrWhiteSpace([string]$p.subtext)) { $stack.Children.Add($sub) | Out-Null }
$border.Child = $stack

$window = New-Object System.Windows.Window
$window.WindowStyle = [System.Windows.WindowStyle]::None
$window.AllowsTransparency = $true
$window.Background = [System.Windows.Media.Brushes]::Transparent
$window.Topmost = $true
$window.ShowInTaskbar = $false
$window.ShowActivated = $false
$window.ResizeMode = [System.Windows.ResizeMode]::NoResize
$window.SizeToContent = [System.Windows.SizeToContent]::WidthAndHeight
$window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
$window.Content = $border

$border.Add_MouseLeftButtonDown({ Focus-Target })
$window.Add_MouseLeftButtonDown({ Focus-Target })

function Get-BannerPosition {
    $area = [System.Windows.SystemParameters]::WorkArea
    $width = $window.ActualWidth
    $height = $window.ActualHeight
    $offsetX = [double]$p.offsetX
    $offsetY = [double]$p.offsetY
    $where = [string]$p.position
    if ([string]::IsNullOrWhiteSpace($where)) { $where = 'top-left' }

    $left = $area.Left + 16 + $offsetX
    $top = $area.Top + 12 + $offsetY

    switch ($where) {
        'top-center' {
            $left = $area.Left + (($area.Width - $width) / 2) + $offsetX
            $top = $area.Top + 12 + $offsetY
        }
        'top-right' {
            $left = $area.Right - $width - 16 + $offsetX
            $top = $area.Top + 12 + $offsetY
        }
        'bottom-left' {
            $left = $area.Left + 16 + $offsetX
            $top = $area.Bottom - $height - 16 + $offsetY
        }
        'bottom-center' {
            $left = $area.Left + (($area.Width - $width) / 2) + $offsetX
            $top = $area.Bottom - $height - 16 + $offsetY
        }
        'bottom-right' {
            $left = $area.Right - $width - 16 + $offsetX
            $top = $area.Bottom - $height - 16 + $offsetY
        }
        default {
            $left = $area.Left + 16 + $offsetX
            $top = $area.Top + 12 + $offsetY
        }
    }

    $window.Left = [double]$left
    $window.Top = [double]$top
}

$delay = [int]$p.delayMs
$poll = [int]$p.pollMs
if ($poll -lt 200) { $poll = 200 }
$logPath = [string]$p.logFile
$lastLog = ''

$app = New-Object System.Windows.Application
$app.ShutdownMode = [System.Windows.ShutdownMode]::OnExplicitShutdown

$script:shown = $false
$script:since = 0
$script:lastLog = ''

$tick = {
    if (Test-Path -LiteralPath ([string]$p.stopFile)) {
        $timer.Stop()
        $window.Close()
        $app.Shutdown()
        return
    }

    $alive = $false
    try { $alive = -not [System.Diagnostics.Process]::GetProcessById([int]$p.pid).HasExited } catch { $alive = $false }
    if (-not $alive) {
        $timer.Stop()
        $window.Close()
        $app.Shutdown()
        return
    }

    $foreground = [AskWin]::GetForegroundWindow()
    $minimized = ($hwnd -ne [IntPtr]::Zero) -and [AskWin]::IsIconic($hwnd)
    $title = Get-WindowTitle $hwnd

    $sameSession = $true
    if (-not [string]::IsNullOrEmpty([string]$p.titleMatch)) {
        $sameSession = $title.IndexOf([string]$p.titleMatch, [System.StringComparison]::Ordinal) -ge 0
    }

    $need = $minimized -or ($foreground -ne $hwnd) -or (-not $sameSession)
    if ($need) {
        if ($script:since -eq 0) { $script:since = [Environment]::TickCount }
    } else {
        $script:since = 0
    }

    $want = $need -and ($script:since -ne 0) -and (([Environment]::TickCount - $script:since) -ge $delay)

    if ($logPath) {
        $line = "$(Get-Date -Format HH:mm:ss) fg=$($foreground.ToInt64()) hwnd=$($hwnd.ToInt64()) min=$minimized same=$sameSession need=$need want=$want pos=$([string]$p.position) title=[$title]"
        if ($line -ne $script:lastLog) {
            try { Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8 } catch { }
            $script:lastLog = $line
        }
    }

    if ($want -ne $script:shown) {
        if ($want) {
            if (-not $window.IsVisible) { $window.Show() }
            Get-BannerPosition
            $window.Topmost = $true
        } else {
            $window.Hide()
        }
        $script:shown = $want
    }
}

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds($poll)
$timer.Add_Tick($tick)
$timer.Start()

$app.Run() | Out-Null
