"""Launch a dedicated hardware-accelerated Chrome profile for the local renderer."""
from pathlib import Path
import argparse
import json
import os
import subprocess
import sys

PREFERENCE_KEY = r'Software\Microsoft\DirectX\UserGpuPreferences'


def find_chrome():
    for base in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'):
        candidate = Path(os.environ.get(base, '')) / 'Google/Chrome/Application/chrome.exe'
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError('Google Chrome was not found.')


def prefer_high_performance(chrome, backup):
    """Preserve the original app preference once; do not change any other app."""
    if sys.platform != 'win32':
        return
    import winreg
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, PREFERENCE_KEY) as key:
        try:
            value, kind = winreg.QueryValueEx(key, str(chrome))
        except FileNotFoundError:
            value, kind = None, winreg.REG_SZ
        if not backup.exists():
            backup.write_text(json.dumps({'application': str(chrome), 'original': value, 'type': kind}, indent=2), encoding='utf-8')
        # Preserve other Windows per-application options, changing only GPU preference.
        entries = [p for p in (value or '').split(';') if p and not p.startswith('GpuPreference=')]
        entries.append('GpuPreference=2')
        winreg.SetValueEx(key, str(chrome), 0, winreg.REG_SZ, ';'.join(entries) + ';')


def launch(url, project_root):
    chrome = find_chrome()
    output = Path(project_root) / 'output'
    output.mkdir(parents=True, exist_ok=True)
    prefer_high_performance(chrome, output / 'chrome_gpu_preference_backup.json')
    profile = output / 'rtx_browser_profile'
    profile.mkdir(exist_ok=True)
    state = profile / 'Local State'
    # Initialize only a new, app-owned profile. Never edit a running/personal profile.
    if not state.exists():
        state.write_text(json.dumps({'hardware_acceleration_mode': {'enabled': True}}), encoding='utf-8')
    command = [str(chrome), '--user-data-dir=' + str(profile),
               '--force-high-performance-gpu', '--use-angle=d3d11',
               '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows',
               '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
               '--no-first-run', '--no-default-browser-check', '--new-window', url]
    process = subprocess.Popen(command)
    print('Dedicated RTX renderer window opened; verify the GPU name in the app.', flush=True)
    return process


def restore(project_root):
    import winreg
    backup = Path(project_root) / 'output/chrome_gpu_preference_backup.json'
    saved = json.loads(backup.read_text(encoding='utf-8'))
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, PREFERENCE_KEY) as key:
        if saved['original'] is None:
            try:
                winreg.DeleteValue(key, saved['application'])
            except FileNotFoundError:
                pass
        else:
            winreg.SetValueEx(key, saved['application'], 0, saved['type'], saved['original'])
    print('Original Windows Chrome GPU preference restored.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8800/host')
    parser.add_argument('--restore', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    if args.restore:
        restore(root)
    else:
        launch(args.url, root)
