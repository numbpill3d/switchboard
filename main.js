'use strict';
/*
 * Switchboard — main process
 * - Frameless, calculator-sized always-on-top widget
 * - One node-pty session per tab
 * - State engine: /proc subtree CPU + PTY output timing + spinner/prompt heuristics
 */
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

let pty;
try { pty = require('node-pty'); }
catch (e) { console.error('node-pty failed to load. Run: npm run rebuild'); }

// ---- Identity (match .desktop StartupWMClass so the menu icon groups) --------
app.setName('switchboard');
try { app.setDesktopName('switchboard.desktop'); } catch (e) {}

// ---- Wayland / Ozone hints (KDE Plasma on Wayland) --------------------------
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');

// ---- Config ----------------------------------------------------------------
const CONFIG_DIR = path.join(os.homedir(), '.config', 'switchboard');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_AGENTS = path.join(__dirname, 'config', 'default-agents.json');

const DEFAULT_SETTINGS = {
  theme: 'classic',
  fontFamily: '"GeistMono Nerd Font Mono","3270 Nerd Font Mono","Terminess Nerd Font",monospace',
  fontSize: 11,
  widgetMode: true,        // gates alwaysOnTop + skipTaskbar
  alwaysOnTop: true,
  skipTaskbar: false,      // show in the Plasma taskbar (icon matches switchboard.desktop)
  opacity: 1.0,
  animations: {
    master: true,
    windowZoom: true,      // classic zoom-rectangle on open
    tabSwitch: true,
    statePulse: true,      // pulsing state dot
    spinner: true,         // marching spinner in tab
    crt: false,            // scanline / flicker overlay (phosphor themes)
    typingShimmer: true
  },
  detection: {
    pollMs: 250,
    recentOutputMs: 450,   // "fresh output" window
    cpuThinkingPct: 6,     // subtree CPU above this => thinking
    genericPrompts: true   // use built-in prompt regexes for "waiting"
  },
  window: { width: 360, height: 560, x: null, y: null }
};

function deepMerge(base, over) {
  if (Array.isArray(base)) return over !== undefined ? over : base;
  if (typeof base === 'object' && base && typeof over === 'object' && over) {
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
    return out;
  }
  return over !== undefined ? over : base;
}

function loadConfig() {
  let cfg = { settings: DEFAULT_SETTINGS };
  try {
    const da = JSON.parse(fs.readFileSync(DEFAULT_AGENTS, 'utf8'));
    cfg.agents = da.agents;
  } catch (e) { cfg.agents = []; }
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (saved.settings) cfg.settings = deepMerge(DEFAULT_SETTINGS, saved.settings);
      if (Array.isArray(saved.agents)) cfg.agents = saved.agents;
      if (Array.isArray(saved.openTabs)) cfg.openTabs = saved.openTabs;
    }
  } catch (e) { console.error('config load error', e); }
  cfg.settings = deepMerge(DEFAULT_SETTINGS, cfg.settings || {});
  return cfg;
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    return true;
  } catch (e) { console.error('config save error', e); return false; }
}

let config = loadConfig();

// ---- Clock ticks for CPU math ----------------------------------------------
let CLK_TCK = 100;
try { CLK_TCK = parseInt(execSync('getconf CLK_TCK').toString().trim(), 10) || 100; } catch (e) {}

// ---- Sessions --------------------------------------------------------------
/** id -> { proc, root, tail, lastOutputTs, lastTextTs, paused, exited,
 *          patterns, lastCpuJiffies, lastCpuTs, cpu, state } */
const sessions = new Map();

const SPINNER_RE = /[⠀-⣿▀-▟|/\-\\●○▪·•]/; // braille+blocks+bullets
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

function stripAnsi(s) { return s.replace(ANSI_RE, ''); }

// does a chunk carry "real" text (letters/digits), not just spinner/box redraw?
function hasRealText(chunk) {
  const clean = stripAnsi(chunk).replace(/\s+/g, '');
  if (!clean) return false;
  let letters = 0;
  for (const ch of clean) { if (/[A-Za-z0-9]/.test(ch) && !SPINNER_RE.test(ch)) letters++; }
  return letters >= 3; // more than an incidental character or two
}

function expandHome(p) {
  if (!p) return os.homedir();
  return p.replace(/^~(?=$|\/)/, os.homedir());
}

function resolveShellPath() {
  return process.env.SHELL || '/bin/bash';
}

function createSession(id, profile) {
  if (!pty) return { ok: false, error: 'node-pty unavailable — run: npm run rebuild' };
  if (sessions.has(id)) closeSession(id);

  const cwd = expandHome(profile.cwd || '~');
  let file, args;
  if (profile.command === 'bash' || profile.command === resolveShellPath()) {
    file = profile.command;
    args = profile.args || ['-l'];
  } else {
    // run the agent inside a login shell so PATH/rc are loaded; keep the tab
    // alive with a fallback shell if the agent exits or is missing.
    file = '/bin/bash';
    const inner = [profile.command, ...(profile.args || [])]
      .map(a => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ');
    args = ['-lc', `${inner}; echo; echo "[${profile.name} exited — starting shell]"; exec bash -l`];
  }

  let proc;
  try {
    proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: profile.cols || 80,
      rows: profile.rows || 24,
      cwd: fs.existsSync(cwd) ? cwd : os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', SWITCHBOARD: '1' }
    });
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }

  const s = {
    proc, root: proc.pid, tail: '', lastOutputTs: 0, lastTextTs: 0,
    paused: false, exited: false, patterns: profile.patterns || {},
    lastCpuJiffies: 0, lastCpuTs: 0, cpu: 0, state: 'idle'
  };
  sessions.set(id, s);

  proc.onData(data => {
    const now = Date.now();
    s.lastOutputTs = now;
    if (hasRealText(data)) s.lastTextTs = now;
    s.tail = (s.tail + stripAnsi(data)).slice(-4000);
    if (win && !win.isDestroyed()) win.webContents.send('pty:data', { id, data });
  });

  proc.onExit(({ exitCode }) => {
    s.exited = true;
    if (win && !win.isDestroyed()) win.webContents.send('pty:exit', { id, code: exitCode });
  });

  return { ok: true, pid: proc.pid };
}

function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  try { if (s.paused) process.kill(-s.root, 'SIGCONT'); } catch (e) {}
  try { s.proc.kill(); } catch (e) {}
  sessions.delete(id);
}

// ---- CPU sampling (subtree jiffies via /proc) ------------------------------
function readProcTable() {
  // pid -> { ppid, jiffies }
  const table = new Map();
  let pids;
  try { pids = fs.readdirSync('/proc'); } catch (e) { return table; }
  for (const name of pids) {
    if (!/^\d+$/.test(name)) continue;
    let stat;
    try { stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8'); } catch (e) { continue; }
    const rp = stat.lastIndexOf(')');
    if (rp < 0) continue;
    const rest = stat.slice(rp + 2).split(' ');
    const ppid = parseInt(rest[1], 10);
    const utime = parseInt(rest[11], 10) || 0;
    const stime = parseInt(rest[12], 10) || 0;
    table.set(parseInt(name, 10), { ppid, jiffies: utime + stime });
  }
  return table;
}

function subtreeJiffies(rootPid, table) {
  // build children index
  const children = new Map();
  for (const [pid, info] of table) {
    if (!children.has(info.ppid)) children.set(info.ppid, []);
    children.get(info.ppid).push(pid);
  }
  let total = 0;
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const info = table.get(pid);
    if (info) total += info.jiffies;
    const kids = children.get(pid);
    if (kids) for (const k of kids) stack.push(k);
  }
  return total;
}

// ---- Prompt detection ------------------------------------------------------
const GENERIC_PROMPT_RE = /(?:[$#❯➜»▸►]|>|\bpassword\b.*:|\([yY]\/[nN]\)|\[[yY]\/[nN]\]|\?\s)\s*$/;

function lastNonEmptyLine(tail) {
  const lines = tail.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].replace(/\s+$/, '');
    if (t.trim() !== '') return t;
  }
  return '';
}

function safeRe(src) { try { return src ? new RegExp(src, 'i') : null; } catch (e) { return null; } }

function classify(s, now, set) {
  if (s.paused) return 'paused';
  if (s.exited) return 'exited';

  const tail = s.tail;
  const wRe = safeRe(s.patterns.waiting);
  const tRe = safeRe(s.patterns.thinking);
  const recent = set.recentOutputMs;

  // explicit per-agent waiting pattern wins (needs attention)
  if (wRe && wRe.test(tail.slice(-600))) return 'waiting';
  // explicit thinking pattern (spinners etc.) — only meaningful while output is fresh
  if (tRe && (now - s.lastOutputTs) < 1500 && tRe.test(tail.slice(-600))) return 'thinking';

  // fresh *textual* output => actively typing/generating
  if ((now - s.lastTextTs) < recent) return 'typing';
  // fresh output but no new text (spinner redraw) or busy CPU => thinking
  if ((now - s.lastOutputTs) < recent || s.cpu >= set.cpuThinkingPct) return 'thinking';
  // idle process sitting at a prompt => waiting for input
  if (set.genericPrompts && GENERIC_PROMPT_RE.test(lastNonEmptyLine(tail))) return 'waiting';
  return 'idle';
}

let stateTimer = null;
function startStateEngine() {
  if (stateTimer) clearInterval(stateTimer);
  const set = config.settings.detection;
  stateTimer = setInterval(() => {
    if (sessions.size === 0) return;
    const now = Date.now();
    const table = readProcTable();
    for (const [id, s] of sessions) {
      if (s.exited) { if (s.state !== 'exited') emitState(id, s, 'exited'); continue; }
      // cpu %
      const jiffies = subtreeJiffies(s.root, table);
      if (s.lastCpuTs) {
        const dtSec = (now - s.lastCpuTs) / 1000;
        const dJ = Math.max(0, jiffies - s.lastCpuJiffies);
        s.cpu = dtSec > 0 ? (dJ / CLK_TCK) / dtSec * 100 : 0;
      }
      s.lastCpuJiffies = jiffies; s.lastCpuTs = now;

      const st = classify(s, now, set);
      if (st !== s.state) emitState(id, s, st);
    }
  }, set.pollMs);
}

function emitState(id, s, st) {
  s.state = st;
  if (win && !win.isDestroyed())
    win.webContents.send('pty:state', { id, state: st, cpu: Math.round(s.cpu) });
}

// ---- Window ----------------------------------------------------------------
let win = null;
function createWindow() {
  const w = config.settings.window || {};
  const st = config.settings;
  win = new BrowserWindow({
    width: w.width || 360,
    height: w.height || 560,
    x: (w.x != null ? w.x : undefined),
    y: (w.y != null ? w.y : undefined),
    minWidth: 260, minHeight: 360,
    frame: false,
    transparent: false,
    backgroundColor: '#dddddd',
    alwaysOnTop: st.widgetMode ? st.alwaysOnTop : false,
    skipTaskbar: st.widgetMode ? st.skipTaskbar : false,
    resizable: true,
    fullscreenable: false,
    title: 'Switchboard',
    show: !process.env.SB_SMOKE,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  if (st.opacity && st.opacity < 1) win.setOpacity(st.opacity);
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (process.env.SB_SMOKE) {
    const errs = [];
    win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errs.push('CONSOLE: ' + msg); });
    win.webContents.on('did-fail-load', (_e, ec, desc) => errs.push('LOAD-FAIL: ' + ec + ' ' + desc));
    win.webContents.on('render-process-gone', (_e, d) => errs.push('RENDER-GONE: ' + JSON.stringify(d)));
    win.webContents.on('did-finish-load', () => {
      // test a pty spawn round-trip
      const r = createSession('smoke', { name: 'Smoke', command: 'bash', args: ['-lc', 'echo SB_PTY_OK; sleep 0.3'], cwd: '~', patterns: {} });
      console.log('SMOKE pty spawn:', JSON.stringify(r));
      setTimeout(() => {
        console.log('SMOKE errors:', errs.length ? JSON.stringify(errs, null, 1) : 'none');
        console.log('SMOKE state of pty:', sessions.get('smoke') && sessions.get('smoke').state);
        console.log('SMOKE DONE');
        app.exit(errs.length ? 1 : 0);
      }, 3500);
    });
  }

  win.on('close', () => {
    try {
      const b = win.getBounds();
      config.settings.window = { ...config.settings.window, width: b.width, height: b.height, x: b.x, y: b.y };
      saveConfig({ settings: config.settings, agents: config.agents, openTabs: config.openTabs });
    } catch (e) {}
  });
}

// ---- IPC -------------------------------------------------------------------
ipcMain.handle('cfg:get', () => config);
ipcMain.handle('cfg:save', (_e, payload) => {
  if (payload.settings) config.settings = deepMerge(DEFAULT_SETTINGS, payload.settings);
  if (Array.isArray(payload.agents)) config.agents = payload.agents;
  if (Array.isArray(payload.openTabs)) config.openTabs = payload.openTabs;
  const ok = saveConfig({ settings: config.settings, agents: config.agents, openTabs: config.openTabs });
  startStateEngine(); // pick up detection changes
  applyWindowSettings();
  return ok;
});

ipcMain.handle('pty:create', (_e, { id, profile }) => createSession(id, profile));
ipcMain.on('pty:input', (_e, { id, data }) => { const s = sessions.get(id); if (s && !s.exited) { try { s.proc.write(data); } catch (err) {} } });
ipcMain.on('pty:resize', (_e, { id, cols, rows }) => { const s = sessions.get(id); if (s && !s.exited) { try { s.proc.resize(cols, rows); } catch (err) {} } });
ipcMain.on('pty:close', (_e, { id }) => closeSession(id));
ipcMain.handle('pty:pause', (_e, { id }) => {
  const s = sessions.get(id); if (!s || s.exited) return false;
  try { process.kill(-s.root, 'SIGSTOP'); s.paused = true; emitState(id, s, 'paused'); return true; }
  catch (e) { return false; }
});
ipcMain.handle('pty:resume', (_e, { id }) => {
  const s = sessions.get(id); if (!s || s.exited) return false;
  try { process.kill(-s.root, 'SIGCONT'); s.paused = false; return true; }
  catch (e) { return false; }
});

function applyWindowSettings() {
  if (!win || win.isDestroyed()) return;
  const st = config.settings;
  win.setAlwaysOnTop(st.widgetMode ? !!st.alwaysOnTop : false);
  win.setSkipTaskbar(st.widgetMode ? !!st.skipTaskbar : false);
  win.setOpacity(st.opacity || 1);
}

ipcMain.on('win:ctl', (_e, action) => {
  if (!win) return;
  if (action === 'close') win.close();
  else if (action === 'minimize') win.minimize();
  else if (action === 'toggleTop') {
    config.settings.alwaysOnTop = !config.settings.alwaysOnTop;
    applyWindowSettings();
    win.webContents.send('win:top', config.settings.alwaysOnTop);
  }
});

app.whenReady().then(() => {
  createWindow();
  startStateEngine();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  for (const id of [...sessions.keys()]) closeSession(id);
  app.quit();
});
