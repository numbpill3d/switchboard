'use strict';
/* Switchboard — renderer */

const THEMES = window.SB_THEMES;
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const TerminalCls = window.Terminal;
const FitCls = (window.FitAddon && window.FitAddon.FitAddon) || null;
const LinksCls = (window.WebLinksAddon && window.WebLinksAddon.WebLinksAddon) || null;

let cfg = null;
const tabs = new Map();       // id -> tab object
let activeId = null;
let uid = 0;
const SPIN = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

const STATE_META = {
  typing:   { cls:'dot-green',  label:'typing…',           foot:'typing' },
  thinking: { cls:'dot-yellow', label:'thinking…',         foot:'thinking' },
  waiting:  { cls:'dot-red',    label:'waiting for input', foot:'waiting for input' },
  paused:   { cls:'dot-grey',   label:'paused',            foot:'paused' },
  idle:     { cls:'dot-grey',   label:'idle',              foot:'idle' },
  exited:   { cls:'dot-grey',   label:'exited',            foot:'exited' }
};

/* ---------------- boot ---------------- */
async function boot(){
  cfg = await window.sb.getConfig();
  applyTheme(cfg.settings.theme);
  applyAnimations(cfg.settings.animations);
  applyFont();
  wireChrome();
  wireGlobalKeys();
  window.sb.onOutput((id,data)=>{ const t=tabs.get(id); if(t) t.term.write(data); });
  window.sb.onExit((id,code)=>{ const t=tabs.get(id); if(t){ setState(id,'exited'); } });
  window.sb.onState((id,state,cpu)=>setState(id,state,cpu));
  window.sb.onTopChange(v=>{ $('#pinbox').textContent = v ? '▲' : '△'; });
  $('#pinbox').textContent = cfg.settings.alwaysOnTop ? '▲' : '△';
  startSpinner();
  startClock();
  document.body.classList.add('zoom');
  setTimeout(()=>document.body.classList.remove('zoom'), 260);
  // reopen last session tabs
  if(Array.isArray(cfg.openTabs) && cfg.openTabs.length){
    for(const aid of cfg.openTabs){ const p = cfg.agents.find(a=>a.id===aid); if(p) await openTab(p); }
  }
  refreshEmpty();
}

/* ---------------- theme / anim / font ---------------- */
function applyTheme(name){
  const th = THEMES[name] || THEMES.classic;
  cfg.settings.theme = name;
  document.body.setAttribute('data-theme', name);
  for(const [k,v] of Object.entries(th.ui)) document.documentElement.style.setProperty(k,v);
  document.body.classList.toggle('crt-on',
    !!cfg.settings.animations.crt && (name==='phosphor'||name==='amber'));
  for(const t of tabs.values()){ t.term.options.theme = th.term; }
}
function applyAnimations(a){
  const b = document.body;
  b.classList.toggle('anim-on', !!a.master);
  b.classList.toggle('anim-off', !a.master);
  b.classList.toggle('pulse-on', !!a.master && !!a.statePulse);
  b.classList.toggle('tabslide', !!a.master && !!a.tabSwitch);
  b.classList.toggle('crt-on', !!a.master && !!a.crt &&
    (cfg.settings.theme==='phosphor'||cfg.settings.theme==='amber'));
}
function applyFont(){
  document.documentElement.style.setProperty('--mono', cfg.settings.fontFamily);
  for(const t of tabs.values()){
    t.term.options.fontFamily = cfg.settings.fontFamily;
    t.term.options.fontSize = cfg.settings.fontSize;
    fitTab(t);
  }
}

/* ---------------- tabs ---------------- */
async function openTab(profile){
  if(!TerminalCls){ alert('xterm failed to load. Run: npm install'); return; }
  const id = 'sess-'+(++uid);
  const th = THEMES[cfg.settings.theme] || THEMES.classic;

  const host = document.createElement('div');
  host.className = 'term-host';
  host.dataset.id = id;
  $('#stack').appendChild(host);

  const term = new TerminalCls({
    fontFamily: cfg.settings.fontFamily,
    fontSize: cfg.settings.fontSize,
    theme: th.term,
    cursorBlink: !!cfg.settings.animations.master,
    cursorStyle: 'block',
    scrollback: 5000,
    allowProposedApi: true,
    macOptionIsMeta: true,
    letterSpacing: 0
  });
  const fit = FitCls ? new FitCls() : null;
  if(fit) term.loadAddon(fit);
  if(LinksCls) term.loadAddon(new LinksCls());
  term.open(host);
  term.onData(d => window.sb.write(id, d));

  // tab element
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML =
    `<div class="tab-title"><span class="tab-glyph">${escapeHtml(profile.glyph||'●')}</span>`+
    `<span class="tab-name">${escapeHtml(profile.name)}</span></div>`+
    `<div class="tab-state"><span class="dot dot-grey"></span>`+
    `<span class="spin"></span><span class="tab-slabel">idle</span></div>`+
    `<span class="tab-close" title="Close">✕</span>`;
  $('#tabs').appendChild(tabEl);
  tabEl.addEventListener('click', e=>{ if(e.target.classList.contains('tab-close')) return; selectTab(id); });
  $('.tab-close', tabEl).addEventListener('click', e=>{ e.stopPropagation(); closeTab(id); });

  const t = {
    id, profile, term, fit, host, tabEl,
    dotEl: $('.dot', tabEl), spinEl: $('.spin', tabEl),
    slabelEl: $('.tab-slabel', tabEl), state:'idle', spinFrame:0
  };
  tabs.set(id, t);

  const res = await window.sb.createSession(id, profile);
  if(!res || !res.ok){
    term.write(`\r\n\x1b[31m[Switchboard] could not start: ${res && res.error || 'unknown error'}\x1b[0m\r\n`);
  }
  selectTab(id);
  persistTabs();
  refreshEmpty();
  // observe size
  if(!openTab._ro){
    openTab._ro = new ResizeObserver(()=>{ const a=tabs.get(activeId); if(a) fitTab(a); });
    openTab._ro.observe($('#stack'));
  }
  return t;
}

function selectTab(id){
  const t = tabs.get(id); if(!t) return;
  activeId = id;
  for(const o of tabs.values()){
    o.host.classList.toggle('active', o.id===id);
    o.tabEl.classList.toggle('active', o.id===id);
  }
  fitTab(t);
  setTimeout(()=>{ try{ t.term.focus(); }catch(e){} }, 0);
  updateFooter(t);
}

function closeTab(id){
  const t = tabs.get(id); if(!t) return;
  window.sb.close(id);
  try{ t.term.dispose(); }catch(e){}
  t.host.remove(); t.tabEl.remove();
  tabs.delete(id);
  if(activeId===id){
    const next = [...tabs.keys()].pop();
    activeId = null;
    if(next) selectTab(next); else updateFooter(null);
  }
  persistTabs();
  refreshEmpty();
}

function fitTab(t){
  if(!t || !t.fit) return;
  try{
    t.fit.fit();
    window.sb.resize(t.id, t.term.cols, t.term.rows);
  }catch(e){}
}

/* ---------------- state ---------------- */
function setState(id, state, cpu){
  const t = tabs.get(id); if(!t) return;
  t.state = state; t.cpu = cpu;
  const m = STATE_META[state] || STATE_META.idle;
  t.dotEl.className = 'dot ' + m.cls;
  t.slabelEl.textContent = m.label;
  const spinning = (state==='typing' || state==='thinking');
  t.spinEl.style.display = spinning ? 'inline-block' : 'none';
  if(!spinning) t.spinEl.textContent = '';
  if(id===activeId) updateFooter(t);
}

function updateFooter(t){
  const dot = $('#foot-state .dot'); const lab = $('#foot-label');
  if(!t){ dot.className='dot dot-grey'; lab.textContent='no line'; $('#foot-cpu').textContent=''; return; }
  const m = STATE_META[t.state] || STATE_META.idle;
  dot.className = 'dot ' + m.cls;
  lab.textContent = t.profile.name + ' — ' + m.foot;
  $('#foot-cpu').textContent = (t.cpu!=null ? t.cpu+'% cpu' : '');
}

function startSpinner(){
  setInterval(()=>{
    if(!(cfg.settings.animations.master && cfg.settings.animations.spinner)) return;
    for(const t of tabs.values()){
      if(t.state==='typing' || t.state==='thinking'){
        t.spinFrame = (t.spinFrame+1) % SPIN.length;
        t.spinEl.textContent = SPIN[t.spinFrame];
      }
    }
  }, 90);
}

/* ---------------- chrome / footer ---------------- */
function wireChrome(){
  $('#closebox').addEventListener('click', ()=>window.sb.win('close'));
  $('#pinbox').addEventListener('click', ()=>window.sb.win('toggleTop'));
  $('#zoombox').addEventListener('click', openSettings);
  $('#newtab').addEventListener('click', openChooser);
  $('#chooser-cancel').addEventListener('click', ()=>$('#chooser').classList.add('hidden'));
  $('#chooser-settings').addEventListener('click', ()=>{ $('#chooser').classList.add('hidden'); openSettings('agents'); });
  $('#settings-close').addEventListener('click', closeSettings);
  $('#settings-cancel').addEventListener('click', closeSettings);
  $('#settings-save').addEventListener('click', saveSettings);
  $$('.stab').forEach(b=>b.addEventListener('click', ()=>selectPane(b.dataset.pane)));
}
function refreshEmpty(){ $('#empty').classList.toggle('hidden', tabs.size>0); }
function startClock(){
  const upd=()=>{ const d=new Date();
    $('#foot-clock').textContent = d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); };
  upd(); setInterval(upd, 15000);
}
function persistTabs(){
  const openTabs = [...tabs.values()].map(t=>t.profile.id);
  window.sb.saveConfig({ settings: cfg.settings, agents: cfg.agents, openTabs });
}

/* ---------------- chooser ---------------- */
function openChooser(){
  const list = $('#chooser-list'); list.innerHTML='';
  for(const a of cfg.agents){
    const el = document.createElement('div');
    el.className='chooser-item';
    el.innerHTML = `<span class="ci-glyph">${escapeHtml(a.glyph||'●')}</span>`+
      `<span><span class="ci-name">${escapeHtml(a.name)}</span><br>`+
      `<span class="ci-cmd">${escapeHtml(a.command)}</span></span>`;
    el.addEventListener('click', ()=>{ $('#chooser').classList.add('hidden'); openTab(a); });
    list.appendChild(el);
  }
  $('#chooser').classList.remove('hidden');
}

/* ---------------- settings ---------------- */
let draft = null;
function openSettings(pane){
  draft = JSON.parse(JSON.stringify(cfg));  // editable copy
  buildAppearance(); buildAnimation(); buildDetection(); buildAgents(); buildWindow();
  selectPane(typeof pane==='string' ? pane : 'appearance');
  $('#settings').classList.remove('hidden');
}
function closeSettings(){ $('#settings').classList.add('hidden'); }
function selectPane(name){
  $$('.stab').forEach(b=>b.classList.toggle('active', b.dataset.pane===name));
  $$('.pane').forEach(p=>p.classList.toggle('active', p.dataset.pane===name));
}
function row(label, hint, control){
  const r=document.createElement('div'); r.className='row';
  const l=document.createElement('label');
  l.innerHTML = `${escapeHtml(label)}${hint?`<span class="hint">${escapeHtml(hint)}</span>`:''}`;
  r.appendChild(l); r.appendChild(control); return r;
}
function checkbox(getter, setter){
  const c=document.createElement('div'); c.className='chk'+(getter()?' on':'');
  c.addEventListener('click', ()=>{ setter(!getter()); c.classList.toggle('on'); });
  return c;
}
function numInput(getter, setter, min, max, step){
  const i=document.createElement('input'); i.type='number'; i.value=getter();
  if(min!=null)i.min=min; if(max!=null)i.max=max; if(step!=null)i.step=step;
  i.addEventListener('change', ()=>setter(parseFloat(i.value))); return i;
}
function txtInput(getter, setter, w){
  const i=document.createElement('input'); i.type='text'; i.value=getter();
  if(w)i.style.width=w+'px';
  i.addEventListener('change', ()=>setter(i.value)); return i;
}

function buildAppearance(){
  const p=$('.pane[data-pane=appearance]'); p.innerHTML='';
  // theme swatches
  const wrap=document.createElement('div');
  wrap.innerHTML='<label>Theme</label>';
  const sw=document.createElement('div'); sw.className='swatch-row';
  for(const [key,th] of Object.entries(THEMES)){
    const s=document.createElement('div');
    s.className='swatch'+(draft.settings.theme===key?' sel':'');
    s.style.background=th.ui['--bg']; s.style.color=th.ui['--fg'];
    s.title=th.label; s.textContent=key.slice(0,3);
    s.addEventListener('click', ()=>{
      draft.settings.theme=key;
      $$('.swatch',sw).forEach(x=>x.classList.remove('sel')); s.classList.add('sel');
      applyTheme(key); // live preview
    });
    sw.appendChild(s);
  }
  wrap.appendChild(sw); p.appendChild(wrap);
  p.appendChild(row('Terminal font', 'CSS font-family stack',
    txtInput(()=>draft.settings.fontFamily, v=>draft.settings.fontFamily=v, 160)));
  p.appendChild(row('Font size', 'px',
    numInput(()=>draft.settings.fontSize, v=>draft.settings.fontSize=v, 7, 24, 1)));
  const opac=document.createElement('input'); opac.type='range'; opac.min=0.5; opac.max=1; opac.step=0.02;
  opac.value=draft.settings.opacity; opac.addEventListener('input',()=>draft.settings.opacity=parseFloat(opac.value));
  p.appendChild(row('Window opacity','0.5 – 1.0', opac));
}

function buildAnimation(){
  const p=$('.pane[data-pane=animation]'); p.innerHTML='';
  const a=draft.settings.animations;
  const items=[
    ['master','Animations master switch','turns all motion on/off'],
    ['windowZoom','Window zoom-open','classic rectangle zoom'],
    ['tabSwitch','Tab switch fade',''],
    ['statePulse','Pulsing state dots',''],
    ['spinner','Marching tab spinner',''],
    ['typingShimmer','Typing shimmer',''],
    ['crt','CRT scanlines','phosphor/amber themes only']
  ];
  for(const [k,lab,hint] of items){
    p.appendChild(row(lab, hint, checkbox(()=>a[k], v=>{ a[k]=v; applyAnimations(a); })));
  }
}

function buildDetection(){
  const p=$('.pane[data-pane=detection]'); p.innerHTML='';
  const d=draft.settings.detection;
  p.appendChild(row('Poll interval','ms between state scans',
    numInput(()=>d.pollMs, v=>d.pollMs=v, 100, 2000, 50)));
  p.appendChild(row('Fresh-output window','ms; recent output = active',
    numInput(()=>d.recentOutputMs, v=>d.recentOutputMs=v, 150, 3000, 50)));
  p.appendChild(row('Thinking CPU threshold','% subtree CPU ⇒ thinking',
    numInput(()=>d.cpuThinkingPct, v=>d.cpuThinkingPct=v, 0, 100, 1)));
  p.appendChild(row('Generic prompt detection','flag idle prompts as "waiting"',
    checkbox(()=>d.genericPrompts, v=>d.genericPrompts=v)));
  const info=document.createElement('div');
  info.className='hint'; info.style.marginTop='8px';
  info.textContent='State = colored dot under each tab: green typing · yellow thinking · '+
    'red waiting for input · grey paused/idle. Per-agent regexes refine this (Agents tab).';
  p.appendChild(info);
}

function buildWindow(){
  const p=$('.pane[data-pane=window]'); p.innerHTML='';
  const s=draft.settings;
  p.appendChild(row('Widget mode','always-on-top + hide from taskbar',
    checkbox(()=>s.widgetMode, v=>s.widgetMode=v)));
  p.appendChild(row('Always on top','', checkbox(()=>s.alwaysOnTop, v=>s.alwaysOnTop=v)));
  p.appendChild(row('Hide from taskbar','', checkbox(()=>s.skipTaskbar, v=>s.skipTaskbar=v)));
  p.appendChild(row('Width','px', numInput(()=>s.window.width, v=>s.window.width=v, 260, 1200, 10)));
  p.appendChild(row('Height','px', numInput(()=>s.window.height, v=>s.window.height=v, 360, 1600, 10)));
  const info=document.createElement('div'); info.className='hint'; info.style.marginTop='8px';
  info.innerHTML='For a true desktop widget on KDE Wayland, also add a KWin rule '+
    '(see README): keep-above, no titlebar, all-desktops.';
  p.appendChild(info);
}

function buildAgents(){
  const p=$('.pane[data-pane=agents]'); p.innerHTML='';
  const list=document.createElement('div'); list.className='agent-list';
  draft.agents.forEach((a,idx)=> list.appendChild(agentRow(a, idx)));
  p.appendChild(list);
  const add=document.createElement('button'); add.className='mac-btn'; add.textContent='+ Add agent';
  add.style.marginTop='8px';
  add.addEventListener('click', ()=>{
    draft.agents.push({ id:'agent'+Date.now(), name:'New Agent', command:'bash',
      args:[], cwd:'~', glyph:'●', accent:'#000000',
      patterns:{thinking:null,waiting:null,typing:null} });
    buildAgents();
  });
  p.appendChild(add);
}
function agentRow(a, idx){
  const r=document.createElement('div'); r.className='agent-row';
  const head=document.createElement('div'); head.className='ar-head';
  const g=mkField(a.glyph||'●', v=>a.glyph=v); g.style.width='34px'; g.style.textAlign='center';
  const nm=mkField(a.name, v=>a.name=v);
  const up=mkMini('↑', ()=>{ if(idx>0){ [draft.agents[idx-1],draft.agents[idx]]=[draft.agents[idx],draft.agents[idx-1]]; buildAgents(); } });
  const del=mkMini('✕', ()=>{ draft.agents.splice(idx,1); buildAgents(); });
  head.append(g, nm, up, del);
  r.appendChild(head);
  const grid=document.createElement('div'); grid.className='ar-grid';
  const argStr = Array.isArray(a.args) ? a.args.join(' ') : '';
  addGrid(grid,'command', mkField(a.command, v=>a.command=v));
  addGrid(grid,'args', mkField(argStr, v=>a.args = v.trim()? splitArgs(v):[]));
  addGrid(grid,'cwd', mkField(a.cwd||'~', v=>a.cwd=v));
  a.patterns = a.patterns || {};
  addGrid(grid,'thinking re', mkField(a.patterns.thinking||'', v=>a.patterns.thinking=v||null));
  addGrid(grid,'waiting re', mkField(a.patterns.waiting||'', v=>a.patterns.waiting=v||null));
  r.appendChild(grid);
  return r;
}
function addGrid(grid,label,field){
  const l=document.createElement('span'); l.textContent=label; grid.appendChild(l);
  grid.appendChild(field);
}
function mkField(val, setter){
  const i=document.createElement('input'); i.className='field'; i.type='text'; i.value=val;
  i.addEventListener('change',()=>setter(i.value)); return i;
}
function mkMini(txt, fn){ const b=document.createElement('button'); b.className='mini-btn';
  b.textContent=txt; b.addEventListener('click',fn); return b; }
function splitArgs(s){ return s.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
  .map(x=>x.replace(/^["']|["']$/g,'')); }

async function saveSettings(){
  // commit any focused fields
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  cfg.settings = draft.settings;
  cfg.agents = draft.agents;
  applyTheme(cfg.settings.theme);
  applyAnimations(cfg.settings.animations);
  applyFont();
  const openTabs=[...tabs.values()].map(t=>t.profile.id);
  await window.sb.saveConfig({ settings:cfg.settings, agents:cfg.agents, openTabs });
  closeSettings();
}

/* ---------------- keys ---------------- */
function wireGlobalKeys(){
  window.addEventListener('keydown', e=>{
    const ctrl = e.ctrlKey || e.metaKey;
    if(ctrl && e.key==='t'){ e.preventDefault(); openChooser(); }
    else if(ctrl && e.key==='w'){ e.preventDefault(); if(activeId) closeTab(activeId); }
    else if(ctrl && e.key===','){ e.preventDefault(); openSettings(); }
    else if(ctrl && e.key==='q'){ e.preventDefault(); window.sb.win('close'); }
    else if(ctrl && e.key==='Tab'){ e.preventDefault(); cycleTab(e.shiftKey?-1:1); }
    else if(ctrl && /^[1-9]$/.test(e.key)){ e.preventDefault();
      const ids=[...tabs.keys()]; const t=ids[parseInt(e.key,10)-1]; if(t) selectTab(t); }
    else if(e.key==='Escape'){ $('#chooser').classList.add('hidden'); }
  });
}
function cycleTab(dir){
  const ids=[...tabs.keys()]; if(!ids.length) return;
  let i=ids.indexOf(activeId); i=(i+dir+ids.length)%ids.length; selectTab(ids[i]);
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g,
  c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

boot();
