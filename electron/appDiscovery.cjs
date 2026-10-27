// appDiscovery.cjs — Windows Application Discovery for KADOWAZ Deck Studio
// Discovers installed applications via Start Menu, Registry, Packaged Apps (UWP/Store), App Paths, and PATH.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const electronModule = require('electron');
const app = typeof electronModule === 'object' && electronModule ? electronModule.app : null;
const shell = typeof electronModule === 'object' && electronModule ? electronModule.shell : null;
const dialog = typeof electronModule === 'object' && electronModule ? electronModule.dialog : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOG_PREFIX = '[AppDiscovery]';

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function warn(...args) {
  console.warn(LOG_PREFIX, ...args);
}

/**
 * Generate a stable MD5-based ID from name + exePath.
 */
function makeId(name, exePath) {
  return crypto
    .createHash('md5')
    .update(`${name}|${exePath}`.toLowerCase())
    .digest('hex');
}

/**
 * Check if a filename looks like an uninstaller / updater / helper we should skip.
 */
const SKIP_PATTERNS = [
  'uninstall', 'uninst', 'update', 'updater', 'setup', 'install',
  'crash', 'helper', 'repair', 'remove', 'diagnostic',
];

function shouldSkip(name) {
  const lower = (name || '').toLowerCase();
  return SKIP_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Normalise a path for dedup (lower-case, forward-slash, trimmed quotes).
 */
function normalisePath(p) {
  return (p || '').replace(/^"+|"+$/g, '').trim().toLowerCase().replace(/\\/g, '/');
}

/**
 * Extract the first plausible .exe path from a string that may include args or
 * icon-resource indices (e.g. `"C:\foo\bar.exe",0`).
 */
function extractExePath(raw) {
  if (!raw) return '';
  let cleaned = raw.replace(/^"+|"+$/g, '').trim();
  // Strip icon resource index (",0", ",1", etc.)
  cleaned = cleaned.replace(/,\s*-?\d+\s*$/, '').trim();
  // If it ends with .exe already, great
  if (cleaned.toLowerCase().endsWith('.exe')) return cleaned;
  // Try to pull out the .exe portion from a longer command line
  const match = cleaned.match(/^(.+?\.exe)/i);
  return match ? match[1] : cleaned;
}

// ─── Category classification ─────────────────────────────────────────────────

const CATEGORY_MAP = {
  // Development
  'code.exe': 'development', 'devenv.exe': 'development', 'idea64.exe': 'development',
  'idea.exe': 'development', 'phpstorm64.exe': 'development', 'webstorm64.exe': 'development',
  'rider64.exe': 'development', 'clion64.exe': 'development', 'pycharm64.exe': 'development',
  'goland64.exe': 'development', 'rubymine64.exe': 'development', 'datagrip64.exe': 'development',
  'sublime_text.exe': 'development', 'notepad++.exe': 'development', 'atom.exe': 'development',
  'git.exe': 'development', 'node.exe': 'development', 'python.exe': 'development',
  'pythonw.exe': 'development', 'java.exe': 'development', 'javaw.exe': 'development',
  'WindowsTerminal.exe': 'development', 'wt.exe': 'development', 'powershell.exe': 'development',
  'pwsh.exe': 'development', 'cmd.exe': 'development', 'mintty.exe': 'development',
  'ConEmu64.exe': 'development', 'Hyper.exe': 'development', 'Alacritty.exe': 'development',
  'cursor.exe': 'development', 'windsurf.exe': 'development', 'zed.exe': 'development',
  'studio64.exe': 'development', 'arduino ide.exe': 'development', 'arduino.exe': 'development',

  // Browsers
  'chrome.exe': 'browser', 'firefox.exe': 'browser', 'msedge.exe': 'browser',
  'opera.exe': 'browser', 'brave.exe': 'browser', 'vivaldi.exe': 'browser',
  'iexplore.exe': 'browser', 'arc.exe': 'browser', 'chromium.exe': 'browser',
  'waterfox.exe': 'browser', 'thorium.exe': 'browser', 'zen.exe': 'browser',

  // Media
  'vlc.exe': 'media', 'spotify.exe': 'media', 'wmplayer.exe': 'media',
  'itunes.exe': 'media', 'foobar2000.exe': 'media', 'audacity.exe': 'media',
  'obs64.exe': 'media', 'obs32.exe': 'media', 'handbrake.exe': 'media',
  'mpv.exe': 'media', 'mpc-hc64.exe': 'media', 'mpc-hc.exe': 'media',
  'resolve.exe': 'media', 'premiere pro.exe': 'media', 'afterfx.exe': 'media',
  'photoshop.exe': 'media', 'gimp.exe': 'media', 'gimp-2.10.exe': 'media',
  'illustrator.exe': 'media', 'lightroom.exe': 'media', 'blender.exe': 'media',
  'krita.exe': 'media', 'inkscape.exe': 'media', 'shotcut.exe': 'media', 'kdenlive.exe': 'media',
  'screentogif.exe': 'media', 'sharex.exe': 'media',

  // Communication
  'discord.exe': 'communication', 'slack.exe': 'communication',
  'teams.exe': 'communication', 'ms-teams.exe': 'communication',
  'zoom.exe': 'communication', 'telegram.exe': 'communication',
  'signal.exe': 'communication', 'skype.exe': 'communication',
  'thunderbird.exe': 'communication', 'outlook.exe': 'communication',
  'element.exe': 'communication',

  // Games
  'steam.exe': 'game', 'epicgameslauncher.exe': 'game', 'galaxyclient.exe': 'game',
  'battle.net.exe': 'game', 'origin.exe': 'game', 'eadesktop.exe': 'game',
  'playnite.desktopapp.exe': 'game', 'lutris.exe': 'game',

  // Productivity
  'winword.exe': 'productivity', 'excel.exe': 'productivity',
  'powerpnt.exe': 'productivity', 'onenote.exe': 'productivity',
  'msaccess.exe': 'productivity', 'notion.exe': 'productivity',
  'obsidian.exe': 'productivity', 'todoist.exe': 'productivity', 'evernote.exe': 'productivity',
  'clickup.exe': 'productivity', 'figma.exe': 'productivity', 'trello.exe': 'productivity',
  'asana.exe': 'productivity', 'logseq.exe': 'productivity',

  // Utility
  '7zfm.exe': 'utility', 'winrar.exe': 'utility', 'everything.exe': 'utility',
  'notepad.exe': 'utility', 'calc.exe': 'utility', 'mspaint.exe': 'utility',
  'snippingtool.exe': 'utility', 'powertoys.exe': 'utility', 'autohotkey.exe': 'utility',
  'keepassxc.exe': 'utility', '1password.exe': 'utility', 'bitwarden.exe': 'utility',
  'ccleaner64.exe': 'utility', 'treesize.exe': 'utility', 'wiztree64.exe': 'utility',

  // System
  'taskmgr.exe': 'system', 'regedit.exe': 'system', 'devmgmt.msc': 'system',
  'msconfig.exe': 'system', 'dxdiag.exe': 'system', 'perfmon.exe': 'system',
  'systempropertiesadvanced.exe': 'system', 'control.exe': 'system',
};

function categorise(targetPath, name = '') {
  const basename = path.basename(targetPath || '').toLowerCase();
  if (CATEGORY_MAP[basename]) return CATEGORY_MAP[basename];

  const lowerName = (name || '').toLowerCase();
  if (lowerName.includes('code') || lowerName.includes('studio') || lowerName.includes('git') || lowerName.includes('terminal')) {
    return 'development';
  }
  if (lowerName.includes('browser') || lowerName.includes('chrome') || lowerName.includes('edge') || lowerName.includes('firefox')) {
    return 'browser';
  }
  if (lowerName.includes('music') || lowerName.includes('video') || lowerName.includes('audio') || lowerName.includes('media') || lowerName.includes('player')) {
    return 'media';
  }
  if (lowerName.includes('chat') || lowerName.includes('message') || lowerName.includes('discord') || lowerName.includes('teams') || lowerName.includes('slack')) {
    return 'communication';
  }
  if (lowerName.includes('game') || lowerName.includes('play') || lowerName.includes('steam')) {
    return 'game';
  }
  if (lowerName.includes('calc') || lowerName.includes('tool') || lowerName.includes('utility')) {
    return 'utility';
  }

  return 'other';
}

// ─── Promisified execFile ─────────────────────────────────────────────────────

function execFileAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 15000, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout, stderr });
    });
  });
}

// ─── Recursive readdir ────────────────────────────────────────────────────────

function walkDir(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          results.push(...walkDir(full));
        } else {
          results.push(full);
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Directory inaccessible
  }
  return results;
}

// ─── Source 1: Start Menu Shortcuts ───────────────────────────────────────────

function discoverFromStartMenu() {
  const apps = [];
  if (!shell || !shell.readShortcutLink) return apps;
  const dirs = [
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = walkDir(dir);
    const lnkFiles = files.filter((f) => f.toLowerCase().endsWith('.lnk'));
    log(`Scanning ${lnkFiles.length} shortcuts in ${dir}`);

    for (const lnk of lnkFiles) {
      try {
        const details = shell.readShortcutLink(lnk);
        const target = details.target || '';
        if (!target || !target.toLowerCase().endsWith('.exe')) continue;

        const name = path.basename(lnk, '.lnk');
        if (shouldSkip(name)) continue;

        apps.push({
          name,
          exePath: target,
          iconPath: lnk, // Prefer .lnk for icon extraction as Windows shell stores icon mapping
          launchArgs: details.args || '',
          source: 'startmenu',
          targetType: 'shortcut',
        });
      } catch {
        // Broken shortcut – skip
      }
    }
  }

  log(`Start Menu: found ${apps.length} apps`);
  return apps;
}

// ─── Source 2: Registry Uninstall Entries ──────────────────────────────────────

async function discoverFromRegistryUninstall() {
  const apps = [];
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];

  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', key, '/s']);
      const lines = stdout.split('\r\n');

      let currentDisplayName = '';
      let currentDisplayIcon = '';
      let currentInstallLocation = '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('HKEY_')) {
          if (currentDisplayName) {
            const entry = buildRegistryApp(currentDisplayName, currentDisplayIcon, currentInstallLocation);
            if (entry) apps.push(entry);
          }
          currentDisplayName = '';
          currentDisplayIcon = '';
          currentInstallLocation = '';
          continue;
        }

        const match = trimmed.match(/^\s*(DisplayName|DisplayIcon|InstallLocation)\s+REG_SZ\s+(.+)$/i);
        if (match) {
          const [, valName, valData] = match;
          const upper = valName.toUpperCase();
          if (upper === 'DISPLAYNAME') currentDisplayName = valData.trim();
          else if (upper === 'DISPLAYICON') currentDisplayIcon = valData.trim();
          else if (upper === 'INSTALLLOCATION') currentInstallLocation = valData.trim();
        }
      }
      if (currentDisplayName) {
        const entry = buildRegistryApp(currentDisplayName, currentDisplayIcon, currentInstallLocation);
        if (entry) apps.push(entry);
      }
    } catch {
      // Key not found or access denied
    }
  }

  log(`Registry Uninstall: found ${apps.length} apps`);
  return apps;
}

function buildRegistryApp(displayName, displayIcon, installLocation) {
  if (shouldSkip(displayName)) return null;

  let exePath = '';
  let iconPath = '';

  if (displayIcon) {
    const candidate = extractExePath(displayIcon);
    if (candidate.toLowerCase().endsWith('.exe') && fs.existsSync(candidate)) {
      exePath = candidate;
    }
    iconPath = candidate || displayIcon;
  }

  if (!exePath && installLocation) {
    const loc = installLocation.replace(/^"+|"+$/g, '').trim();
    if (fs.existsSync(loc)) {
      try {
        const exes = fs.readdirSync(loc).filter((f) => f.toLowerCase().endsWith('.exe'));
        const displayLower = displayName.toLowerCase();
        const best = exes.find((e) => displayLower.includes(path.basename(e, '.exe').toLowerCase()));
        const chosen = best || exes[0];
        if (chosen) {
          const full = path.join(loc, chosen);
          if (!shouldSkip(chosen) && fs.existsSync(full)) {
            exePath = full;
            if (!iconPath) iconPath = full;
          }
        }
      } catch {
        // Can't read directory
      }
    }
  }

  if (!exePath) return null;

  return {
    name: displayName,
    exePath,
    iconPath: iconPath || exePath,
    launchArgs: '',
    source: 'registry',
    targetType: 'executable',
  };
}

// ─── Source 3: Registered Packaged Apps / Microsoft Store (UWP) ───────────────

async function discoverFromPackagedApps() {
  const apps = [];
  try {
    const psCommand = 'Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress';
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', psCommand], { timeout: 15000 });
    if (!stdout.trim()) return apps;

    let parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    for (const item of parsed) {
      if (!item || !item.Name || !item.AppID) continue;
      const name = item.Name.trim();
      const appId = item.AppID.trim();

      if (shouldSkip(name)) continue;

      const isUwp = appId.includes('!') || !appId.toLowerCase().endsWith('.exe');
      const isPath = fs.existsSync(appId);

      apps.push({
        name,
        exePath: isPath ? appId : appId,
        iconPath: isPath ? appId : '',
        launchArgs: '',
        source: 'packaged',
        targetType: isUwp ? 'uwp' : 'executable',
        appId: appId,
        isValid: true,
      });
    }
  } catch (err) {
    warn('Packaged Apps (Get-StartApps) scan failed:', err.message);
  }

  log(`Packaged Apps scan: found ${apps.length} apps`);
  return apps;
}

// ─── Source 4: App Paths Registry ─────────────────────────────────────────────

async function discoverFromAppPaths() {
  const apps = [];
  const rootKeys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'
  ];

  for (const key of rootKeys) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', key]);
      const subkeys = stdout
        .split('\r\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('HKEY_'));

      for (const subkey of subkeys) {
        try {
          const { stdout: valOut } = await execFileAsync('reg', ['query', subkey, '/ve']);
          const match = valOut.match(/\(Default\)\s+REG_SZ\s+(.+)/i);
          if (!match) continue;

          const rawPath = match[1].trim().replace(/^"+|"+$/g, '');
          if (!rawPath.toLowerCase().endsWith('.exe')) continue;

          const name = path.basename(rawPath, '.exe');
          if (shouldSkip(name)) continue;

          apps.push({
            name,
            exePath: rawPath,
            iconPath: rawPath,
            launchArgs: '',
            source: 'apppath',
            targetType: 'executable',
          });
        } catch {
          // Subkey read failed
        }
      }
    } catch {
      // Key not found
    }
  }

  log(`App Paths: found ${apps.length} apps`);
  return apps;
}

// ─── Source 5: PATH Environment ───────────────────────────────────────────────

async function discoverFromPath() {
  const apps = [];
  const targets = [
    'code.exe', 'chrome.exe', 'firefox.exe', 'msedge.exe', 'brave.exe',
    'opera.exe', 'vivaldi.exe', 'git.exe', 'node.exe', 'python.exe',
    'java.exe', 'pwsh.exe', 'powershell.exe', 'wt.exe', 'curl.exe',
    'ssh.exe', 'notepad++.exe', 'sublime_text.exe', 'vlc.exe',
    'obs64.exe', 'steam.exe', 'discord.exe', 'slack.exe',
    'spotify.exe', 'blender.exe', 'figma.exe', 'cursor.exe',
  ];

  for (const exe of targets) {
    try {
      const { stdout } = await execFileAsync('where.exe', [exe]);
      const found = stdout.trim().split('\r\n').filter(Boolean);
      if (found.length > 0) {
        const firstPath = found[0].trim();
        const name = path.basename(firstPath, '.exe');
        if (shouldSkip(name)) continue;

        apps.push({
          name,
          exePath: firstPath,
          iconPath: firstPath,
          launchArgs: '',
          source: 'env_path',
          targetType: 'executable',
        });
      }
    } catch {
      // Not on PATH
    }
  }

  log(`PATH scan: found ${apps.length} apps`);
  return apps;
}

// ─── Deduplication, Icon Extraction & Assembly ───────────────────────────────

async function deduplicateAndFinalize(rawApps) {
  const seen = new Map(); // identifier -> app
  const results = [];

  for (const raw of rawApps) {
    if (!raw.exePath && !raw.appId) continue;
    const key = (raw.appId || raw.exePath).toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.set(key, true);

    const isUwp = raw.targetType === 'uwp';
    const isValid = isUwp ? true : (raw.exePath ? fs.existsSync(raw.exePath) : false);

    results.push({
      id: makeId(raw.name, raw.appId || raw.exePath),
      name: raw.name,
      exePath: raw.exePath,
      iconPath: raw.iconPath || raw.exePath,
      iconDataUrl: '',
      category: categorise(raw.exePath, raw.name),
      source: raw.source,
      isValid,
      launchArgs: raw.launchArgs || '',
      targetType: raw.targetType || (isUwp ? 'uwp' : 'executable'),
      appId: raw.appId || '',
    });
  }

  // Concurrently extract real native application icons in batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (item) => {
        try {
          const target = item.iconPath || item.exePath;
          if (app && app.getFileIcon && target && fs.existsSync(target)) {
            const icon = await app.getFileIcon(target, { size: 'normal' });
            if (icon && !icon.isEmpty()) {
              item.iconDataUrl = icon.toDataURL();
            }
          }
        } catch {
          // Graceful fallback for icon extraction
        }
      })
    );
  }

  return results;
}

// ─── Public APIs ─────────────────────────────────────────────────────────────

/**
 * Discover installed Windows applications from all primary sources.
 */
async function discoverApplications() {
  log('Starting comprehensive application discovery…');
  const allApps = [];

  // Source 1 — Start Menu
  try {
    const startMenuApps = discoverFromStartMenu();
    allApps.push(...startMenuApps);
  } catch (err) {
    warn('Start Menu scan failed:', err.message);
  }

  // Source 2 — Packaged / Microsoft Store Apps
  try {
    const packagedApps = await discoverFromPackagedApps();
    allApps.push(...packagedApps);
  } catch (err) {
    warn('Packaged apps scan failed:', err.message);
  }

  // Source 3 — Registry Uninstall
  try {
    const registryApps = await discoverFromRegistryUninstall();
    allApps.push(...registryApps);
  } catch (err) {
    warn('Registry Uninstall scan failed:', err.message);
  }

  // Source 4 — App Paths
  try {
    const appPathApps = await discoverFromAppPaths();
    allApps.push(...appPathApps);
  } catch (err) {
    warn('App Paths scan failed:', err.message);
  }

  // Source 5 — PATH env
  try {
    const pathApps = await discoverFromPath();
    allApps.push(...pathApps);
  } catch (err) {
    warn('PATH scan failed:', err.message);
  }

  const finalized = await deduplicateAndFinalize(allApps);
  log(`Discovery complete — ${finalized.length} unique applications assembled.`);
  return finalized;
}

/**
 * Extract icon as data URL for a specific file path.
 */
async function getAppIcon(targetPath) {
  if (!targetPath) return '';
  try {
    if (app && app.getFileIcon && fs.existsSync(targetPath)) {
      const icon = await app.getFileIcon(targetPath, { size: 'normal' });
      return icon.isEmpty() ? '' : icon.toDataURL();
    }
  } catch {
    // Ignore
  }
  return '';
}

/**
 * Browse for application via native file dialog.
 */
async function browseForApp() {
  if (!dialog || !dialog.showOpenDialog) return null;
  const result = await dialog.showOpenDialog({
    title: 'Select Application or Shortcut',
    properties: ['openFile'],
    filters: [
      { name: 'Applications & Shortcuts (*.exe, *.lnk, *.bat, *.cmd)', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  let exePath = selectedPath;
  let targetType = 'executable';
  let name = path.basename(selectedPath, path.extname(selectedPath));

  if (selectedPath.toLowerCase().endsWith('.lnk')) {
    try {
      const details = shell.readShortcutLink(selectedPath);
      if (details.target && fs.existsSync(details.target)) {
        exePath = details.target;
        targetType = 'shortcut';
      }
    } catch {
      // Keep selectedPath
    }
  }

  let iconDataUrl = '';
  try {
    iconDataUrl = await getAppIcon(selectedPath);
    if (!iconDataUrl && exePath !== selectedPath) {
      iconDataUrl = await getAppIcon(exePath);
    }
  } catch {
    // Fallback
  }

  return {
    id: makeId(name, exePath),
    name,
    exePath,
    iconPath: selectedPath,
    iconDataUrl,
    category: categorise(exePath, name),
    source: 'custom',
    isValid: fs.existsSync(exePath),
    launchArgs: '',
    targetType,
    appId: '',
  };
}

/**
 * Launch an application safely with options.
 */
async function launchApplication(appInfo) {
  if (!appInfo) {
    return { success: false, error: 'No application info specified' };
  }

  const { appId, exePath, launchArgs, focusExisting, launchMinimized, targetType, source } = appInfo;

  try {
    // 1. Packaged App / Microsoft Store / UWP
    if (targetType === 'uwp' || source === 'packaged' || (appId && appId.includes('!'))) {
      const targetAumid = appId || exePath;
      if (!targetAumid) {
        return { success: false, error: 'Missing AUMID for packaged application' };
      }
      await shell.openExternal(`shell:AppsFolder\\${targetAumid}`);
      return { success: true, method: 'uwp_shell' };
    }

    // 2. Windows Shortcut (.lnk)
    if (exePath && exePath.toLowerCase().endsWith('.lnk')) {
      const err = await shell.openPath(exePath);
      if (err) {
        return { success: false, error: `Could not open shortcut: ${err}` };
      }
      return { success: true, method: 'open_path' };
    }

    // 3. Direct Executable (.exe, .bat, .cmd)
    if (!exePath) {
      return { success: false, error: 'No executable path provided' };
    }

    if (!fs.existsSync(exePath)) {
      return { success: false, error: `Executable does not exist: ${exePath}` };
    }

    // Focus existing instance if requested
    if (focusExisting) {
      const baseName = path.basename(exePath, path.extname(exePath));
      try {
        const psScript = `
          $proc = Get-Process -Name "${baseName}" -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($proc -and $proc.MainWindowHandle -ne 0) {
            $wshell = New-Object -ComObject WScript.Shell
            $wshell.AppActivate($proc.Id)
            exit 0
          } else {
            exit 1
          }
        `;
        await execFileAsync('powershell', ['-NoProfile', '-Command', psScript]);
        return { success: true, method: 'focus_existing' };
      } catch {
        // Fall back to spawning a new instance
      }
    }

    // Parse launch arguments safely without untrusted shell interpretation
    let argsArray = [];
    if (launchArgs && typeof launchArgs === 'string') {
      const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
      let match;
      while ((match = regex.exec(launchArgs)) !== null) {
        argsArray.push(match[1] || match[2] || match[0]);
      }
    }

    const child = spawn(exePath, argsArray, {
      detached: true,
      stdio: 'ignore',
      windowsHide: launchMinimized === true,
      cwd: path.dirname(exePath),
    });
    child.unref();

    return { success: true, pid: child.pid, method: 'spawn' };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

module.exports = {
  discoverApplications,
  getAppIcon,
  browseForApp,
  launchApplication,
};
