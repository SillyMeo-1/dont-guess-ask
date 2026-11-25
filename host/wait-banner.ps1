param(
    [Parameter(Mandatory = $true)][string]$StatePath
)

$ErrorActionPreference = 'Stop'

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

function Read-State {
    try {
        $text = [System.IO.File]::ReadAllText($StatePath, [System.Text.Encoding]::UTF8)
        return ($text | ConvertFrom-Json)
    } catch {
        return $null
    }
}

$state = Read-State
if ($null -eq $state) { exit 0 }

$dshPid = [int]$state.pid
$hwnd = [IntPtr]::Zero
try { $hwnd = [System.Diagnostics.Process]::GetProcessById($dshPid).MainWindowHandle } catch { }
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
    if ([AskWin]::IsIconic($hwnd)) { [void][AskWin]::ShowWindow($hwnd, 9) }
    [void][AskWin]::SetForegroundWindow($hwnd)
}

function Send-Focus($sessionId) {
    # `$Host` is a read-only automatic variable, so the API base needs its own name.
    $apiBase = [string]$state.apiHost
    if ([string]::IsNullOrEmpty($apiBase) -or [string]::IsNullOrEmpty([string]$sessionId)) {
        if ($script:logPath) { try { Add-Content -LiteralPath $script:logPath -Value "$(Get-Date -Format HH:mm:ss) focus skipped host=[$apiBase] sid=[$sessionId]" -Encoding UTF8 } catch { } }
        return
    }
    try {
        $payload = @{ sessionId = [string]$sessionId } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri ("http://" + $apiBase + "/dont-guess-api/focus") -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 3 | Out-Null
        if ($script:logPath) { try { Add-Content -LiteralPath $script:logPath -Value "$(Get-Date -Format HH:mm:ss) focus sent sid=[$sessionId]" -Encoding UTF8 } catch { } }
    } catch {
        if ($script:logPath) { try { Add-Content -LiteralPath $script:logPath -Value "$(Get-Date -Format HH:mm:ss) focus failed: $($_.Exception.Message)" -Encoding UTF8 } catch { } }
    }
}

# --- window chrome: translucent light-red fading to transparent ---------------
$gradient = New-Object System.Windows.Media.LinearGradientBrush
$gradient.StartPoint = New-Object System.Windows.Point(0, 0)
$gradient.EndPoint = New-Object System.Windows.Point(1, 0)
$gradient.GradientStops.Add((New-Object System.Windows.Media.GradientStop ([System.Windows.Media.Color]::FromArgb(214, 255, 128, 128)), 0.0))
$gradient.GradientStops.Add((New-Object System.Windows.Media.GradientStop ([System.Windows.Media.Color]::FromArgb(204, 255, 138, 138)), 0.62))
$gradient.GradientStops.Add((New-Object System.Windows.Media.GradientStop ([System.Windows.Media.Color]::FromArgb(96, 255, 160, 160)), 0.86))
$gradient.GradientStops.Add((New-Object System.Windows.Media.GradientStop ([System.Windows.Media.Color]::FromArgb(0, 255, 190, 190)), 1.0))

$border = New-Object System.Windows.Controls.Border
$border.Background = $gradient
$border.CornerRadius = New-Object System.Windows.CornerRadius(10)
$border.BorderThickness = New-Object System.Windows.Thickness(1)
$border.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(90, 255, 255, 255))
$border.Padding = New-Object System.Windows.Thickness(18, 11, 28, 11)

$stack = New-Object System.Windows.Controls.StackPanel
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

function Update-Content($asks) {
    $stack.Children.Clear()

    $headline = New-Object System.Windows.Controls.TextBlock
    $headline.Text = [string]$state.text
    $headline.FontSize = 15
    $headline.FontWeight = [System.Windows.FontWeights]::SemiBold
    $headline.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 96, 16, 22))
    $stack.Children.Add($headline) | Out-Null

    foreach ($ask in $asks) {
        # A TextBlock with no background is not reliably hit-testable, so the row
        # is a transparent Border that owns the click.
        $row = New-Object System.Windows.Controls.Border
        $row.Background = [System.Windows.Media.Brushes]::Transparent
        $row.Margin = New-Object System.Windows.Thickness(0, 4, 0, 0)
        $row.Padding = New-Object System.Windows.Thickness(1, 2, 1, 2)
        $row.Cursor = [System.Windows.Input.Cursors]::Hand

        $line = New-Object System.Windows.Controls.TextBlock
        $line.FontSize = 12
        $line.TextWrapping = [System.Windows.TextWrapping]::NoWrap
        $line.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 118, 32, 38))
        $question = [string]$ask.question
        if ($question.Length -gt 34) { $question = $question.Substring(0, 34) + '…' }
        $title = [string]$ask.title
        if ([string]::IsNullOrEmpty($title)) { $line.Text = $question }
        else { $line.Text = ($question + '   ·   ' + $title) }
        $row.Child = $line

        $sessionId = [string]$ask.sessionId
        $row.Add_MouseLeftButtonDown({ param($s, $e) Send-Focus $sessionId; Focus-Target }.GetNewClosure())
        $stack.Children.Add($row) | Out-Null
    }
}

function Get-BannerPosition {
    $area = [System.Windows.SystemParameters]::WorkArea
    $width = $window.ActualWidth
    $height = $window.ActualHeight
    $offsetX = [double]$state.offsetX
    $offsetY = [double]$state.offsetY
    $where = [string]$state.position
    if ([string]::IsNullOrWhiteSpace($where)) { $where = 'top-left' }

    $left = $area.Left + 16 + $offsetX
    $top = $area.Top + 12 + $offsetY

    switch ($where) {
        'top-center' { $left = $area.Left + (($area.Width - $width) / 2) + $offsetX; $top = $area.Top + 12 + $offsetY }
        'top-right' { $left = $area.Right - $width - 16 + $offsetX; $top = $area.Top + 12 + $offsetY }
        'bottom-left' { $left = $area.Left + 16 + $offsetX; $top = $area.Bottom - $height - 16 + $offsetY }
        'bottom-center' { $left = $area.Left + (($area.Width - $width) / 2) + $offsetX; $top = $area.Bottom - $height - 16 + $offsetY }
        'bottom-right' { $left = $area.Right - $width - 16 + $offsetX; $top = $area.Bottom - $height - 16 + $offsetY }
    }

    $window.Left = [double]$left
    $window.Top = [double]$top
}

$app = New-Object System.Windows.Application
$app.ShutdownMode = [System.Windows.ShutdownMode]::OnExplicitShutdown

$script:shown = $false
$script:since = 0
$script:signature = ''
$script:logPath = [string]$state.logFile
$script:lastLog = ''
$poll = [int]$state.pollMs
if ($poll -lt 200) { $poll = 200 }

$tick = {
    if (Test-Path -LiteralPath ([string]$state.stopFile)) {
        if ($script:logPath) { try { Add-Content -LiteralPath $script:logPath -Value "$(Get-Date -Format HH:mm:ss) stop-file seen; exiting" -Encoding UTF8 } catch { } }
        $timer.Stop(); $window.Close(); $app.Shutdown(); return
    }

    $alive = $false
    try { $alive = -not [System.Diagnostics.Process]::GetProcessById($dshPid).HasExited } catch { $alive = $false }
    if (-not $alive) {
        if ($script:logPath) { try { Add-Content -LiteralPath $script:logPath -Value "$(Get-Date -Format HH:mm:ss) host-dead; exiting" -Encoding UTF8 } catch { } }
        $timer.Stop(); $window.Close(); $app.Shutdown(); return
    }

    $fresh = Read-State
    if ($null -eq $fresh) { return }
    $script:state = $fresh
    $asks = @($fresh.asks)
    if ($asks.Count -eq 0) {
        if ($script:shown) { $window.Hide(); $script:shown = $false }
        $script:since = 0
        return
    }

    $foreground = [AskWin]::GetForegroundWindow()
    $minimized = ($hwnd -ne [IntPtr]::Zero) -and [AskWin]::IsIconic($hwnd)
    $title = Get-WindowTitle $hwnd
    $activeSession = [string]$fresh.activeSessionId

    $sameSession = $false
    if (-not [string]::IsNullOrEmpty($activeSession)) {
        foreach ($ask in $asks) {
            if ([string]$ask.sessionId -eq $activeSession) { $sameSession = $true; break }
        }
    } elseif ($asks.Count -eq 1 -and -not [string]::IsNullOrEmpty([string]$asks[0].title)) {
        $sameSession = $title.IndexOf([string]$asks[0].title, [System.StringComparison]::Ordinal) -ge 0
    }

    $need = $minimized -or ($foreground -ne $hwnd) -or (-not $sameSession)
    if ($need) { if ($script:since -eq 0) { $script:since = [Environment]::TickCount } }
    else { $script:since = 0 }

    $want = $need -and ($script:since -ne 0) -and (([Environment]::TickCount - $script:since) -ge [int]$fresh.delayMs)

    if ($script:logPath) {
        $line = "$(Get-Date -Format HH:mm:ss) fg=$($foreground.ToInt64()) hwnd=$($hwnd.ToInt64()) min=$minimized sameSession=$sameSession need=$need want=$want shown=$($script:shown) vis=$($window.IsVisible) asks=$($asks.Count) active=[$activeSession] title=[$title]"
        if ($line -ne $script:lastLog) {
            try { Add-Content -LiteralPath $script:logPath -Value $line -Encoding UTF8 } catch { }
            $script:lastLog = $line
        }
    }

    if ($want -ne $script:shown) {
        if ($want) {
            $signature = ($asks | ForEach-Object { [string]$_.sessionId + '|' + [string]$_.question }) -join '||'
            if ($signature -ne $script:signature) {
                Update-Content $asks
                $script:signature = $signature
            }
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
