
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT lpPoint);

  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
}
"@

$ErrorActionPreference = 'SilentlyContinue'

function Test-KeyDown([int]$vk) {
  return ([NativeInput]::GetAsyncKeyState($vk) -band 0x8000) -ne 0
}

function Get-Cursor {
  $pt = New-Object NativeInput+POINT
  [NativeInput]::GetCursorPos([ref]$pt) | Out-Null
  return @{ x = $pt.X; y = $pt.Y }
}

$keyMap = @{
  0x08 = 'backspace'
  0x09 = 'tab'
  0x0D = 'enter'
  0x1B = 'escape'
  0x20 = 'space'
  0x25 = 'left'
  0x26 = 'up'
  0x27 = 'right'
  0x28 = 'down'
  0x2E = 'delete'
  0x6A = '*'
  0x6B = '+'
  0x6D = '-'
  0x6E = '.'
  0x6F = '/'
  0x70 = 'f1'
  0x71 = 'f2'
  0x72 = 'f3'
  0x73 = 'f4'
  0x74 = 'f5'
  0x75 = 'f6'
  0x76 = 'f7'
  0x77 = 'f8'
  0x78 = 'f9'
  0x79 = 'f10'
  0x7A = 'f11'
  0x7B = 'f12'
  0xBA = ';'
  0xBB = '='
  0xBC = ','
  0xBD = '-'
  0xBE = '.'
  0xBF = '/'
  0xC0 = '`'
  0xDB = '['
  0xDC = '\\'
  0xDD = ']'
  0xDE = "'"
}

for ($code = 0x30; $code -le 0x39; $code++) { $keyMap[$code] = [char]$code }
for ($code = 0x41; $code -le 0x5A; $code++) { $keyMap[$code] = ([char]$code).ToString().ToLowerInvariant() }
for ($code = 0x60; $code -le 0x69; $code++) { $keyMap[$code] = [string]($code - 0x60) }

$trackedKeys = @($keyMap.Keys)
$prevDown = @{}
foreach ($vk in $trackedKeys) { $prevDown[$vk] = $false }

$prevLeft = $false
$prevRight = $false
$prevStopHotkey = $false

while ($true) {
  $cursor = Get-Cursor

  $leftNow = Test-KeyDown 0x01
  $rightNow = Test-KeyDown 0x02

  if ($leftNow -and -not $prevLeft) {
    @{ kind = 'mouse_click'; button = 'left'; x = $cursor.x; y = $cursor.y; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
  }

  if ($rightNow -and -not $prevRight) {
    @{ kind = 'mouse_click'; button = 'right'; x = $cursor.x; y = $cursor.y; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
  }

  $prevLeft = $leftNow
  $prevRight = $rightNow

  $stopNow = Test-KeyDown 0x77
  if ($stopNow -and -not $prevStopHotkey) {
    @{ kind = 'control'; action = 'stop_and_save'; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
  }
  $prevStopHotkey = $stopNow

  $ctrlDown = (Test-KeyDown 0x11)
  $altDown = (Test-KeyDown 0x12)
  $shiftDown = (Test-KeyDown 0x10)

  foreach ($vk in $trackedKeys) {
    $isDown = Test-KeyDown $vk
    $wasDown = [bool]$prevDown[$vk]

    if ($isDown -and -not $wasDown) {
      @{ 
        kind = 'key';
        key = $keyMap[$vk];
        ctrl = $ctrlDown;
        alt = $altDown;
        shift = $shiftDown;
        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      } | ConvertTo-Json -Compress
    }

    $prevDown[$vk] = $isDown
  }

  Start-Sleep -Milliseconds 10
}
