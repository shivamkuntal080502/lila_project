// LILA BLACK — Player Journey Visualizer
// Pure vanilla JS. Loads pre-built JSON (see data_prep/build_data.py) — no parquet parsing in-browser.

const EVENT_COLOR = {
  Kill: '#ff5c39', BotKill: '#ff5c39',
  Killed: '#ffd166', BotKilled: '#ffd166',
  KilledByStorm: '#b388ff',
  Loot: '#4caf50',
};
const EVENT_LABEL = {
  Kill: 'Kill', BotKill: 'Kill (bot)',
  Killed: 'Death', BotKilled: 'Death (by bot)',
  KilledByStorm: 'Storm death', Loot: 'Loot',
};
const DEATH_TYPES = new Set(['Killed', 'BotKilled', 'KilledByStorm']);
const KILL_TYPES = new Set(['Kill', 'BotKill']);

const el = (id) => document.getElementById(id);
const mapSelect = el('mapSelect'), dateSelect = el('dateSelect'), matchSelect = el('matchSelect');
const minimapImg = el('minimapImg'), mainCanvas = el('mainCanvas'), heatCanvas = el('heatCanvas');
const ctx = mainCanvas.getContext('2d'), hctx = heatCanvas.getContext('2d');
const scrub = el('scrub'), playBtn = el('playBtn'), timeLabel = el('timeLabel'), speedSelect = el('speedSelect');
const statGrid = el('statGrid'), playerList = el('playerList'), loading = el('loading');
const tooltip = el('tooltip'), canvasWrap = el('canvasWrap');

let manifest = null;
let currentMatch = null;   // parsed match JSON
let hiddenPlayers = new Set();
let playing = false, rafId = null, lastFrameT = 0;
let curT = 0; // ms into match

const MAP_IMG = {
  AmbroseValley: 'minimaps/AmbroseValley_Minimap.jpg',
  GrandRift: 'minimaps/GrandRift_Minimap.jpg',
  Lockdown: 'minimaps/Lockdown_Minimap.jpg',
};

async function init() {
  manifest = await fetch('data/manifest.json').then(r => r.json());
  const maps = Object.keys(manifest.maps).sort((a, b) => manifest.maps[b] - manifest.maps[a]);
  mapSelect.innerHTML = maps.map(m => `<option value="${m}">${m} (${manifest.maps[m]})</option>`).join('');
  populateDates();
  populateMatches();
  await loadMatch(matchSelect.value);

  mapSelect.onchange = () => { populateDates(); populateMatches(); loadMatch(matchSelect.value); };
  dateSelect.onchange = () => { populateMatches(); loadMatch(matchSelect.value); };
  matchSelect.onchange = () => loadMatch(matchSelect.value);
}

function populateDates() {
  const map = mapSelect.value;
  const dates = [...new Set(manifest.matches.filter(m => m.map_id === map).map(m => m.date))].sort();
  dateSelect.innerHTML = `<option value="__all">All dates</option>` +
    dates.map(d => `<option value="${d}">${d.replace('_', ' ')}</option>`).join('');
}

function populateMatches() {
  const map = mapSelect.value, date = dateSelect.value;
  let list = manifest.matches.filter(m => m.map_id === map);
  if (date !== '__all') list = list.filter(m => m.date === date);
  list.sort((a, b) => (b.humans + b.bots) - (a.humans + a.bots));
  matchSelect.innerHTML = list.map(m =>
    `<option value="${m.match_id}">${m.match_id.slice(0, 8)}… — ${m.humans}h/${m.bots}b, ${m.kills}K</option>`
  ).join('');
  if (list.length === 0) matchSelect.innerHTML = '<option>No matches</option>';
}

async function loadMatch(matchId) {
  if (!matchId) return;
  loading.classList.remove('hidden');
  pause();
  const safe = matchId.replace('/', '_');
  currentMatch = await fetch(`data/matches/${safe}.json`).then(r => r.json());
  hiddenPlayers.clear();
  minimapImg.src = MAP_IMG[currentMatch.map_id];
  buildPlayerList();
  buildStats();
  buildHeatmap();
  scrub.max = currentMatch.duration_ms || 1000;
  curT = scrub.max;
  scrub.value = curT;
  draw();
  loading.classList.add('hidden');
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildStats() {
  const players = currentMatch.players;
  const humans = players.filter(p => !p.bot), bots = players.filter(p => p.bot);
  let kills = 0, deaths = 0, storm = 0, loot = 0;
  players.forEach(p => p.events.forEach(e => {
    if (KILL_TYPES.has(e.type)) kills++;
    if (DEATH_TYPES.has(e.type)) deaths++;
    if (e.type === 'KilledByStorm') storm++;
    if (e.type === 'Loot') loot++;
  }));
  const rows = [
    ['Map', currentMatch.map_id], ['Date', currentMatch.date.replace('_', ' ')],
    ['Duration', fmtTime(currentMatch.duration_ms)],
    ['Humans', humans.length], ['Bots', bots.length],
    ['Kills', kills], ['Deaths', deaths],
    ['Storm deaths', storm], ['Loot events', loot],
  ];
  statGrid.innerHTML = rows.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
}

function buildPlayerList() {
  const players = [...currentMatch.players].sort((a, b) => {
    const ka = a.events.filter(e => KILL_TYPES.has(e.type)).length;
    const kb = b.events.filter(e => KILL_TYPES.has(e.type)).length;
    return kb - ka;
  });
  playerList.innerHTML = players.map(p => {
    const kills = p.events.filter(e => KILL_TYPES.has(e.type)).length;
    const died = p.events.some(e => DEATH_TYPES.has(e.type));
    return `<div class="player-row" data-id="${p.user_id}">
      <span class="tag"><span class="dot ${p.bot ? 'bot' : 'human'}"></span>
        <span class="id">${p.bot ? 'Bot ' + p.user_id : p.user_id.slice(0, 8)}</span></span>
      <span class="k">${kills ? kills + 'K' : ''}${died ? ' ☠' : ''}</span>
    </div>`;
  }).join('');
  playerList.querySelectorAll('.player-row').forEach(row => {
    row.onclick = () => {
      const id = row.dataset.id;
      if (hiddenPlayers.has(id)) hiddenPlayers.delete(id); else hiddenPlayers.add(id);
      row.classList.toggle('dim', hiddenPlayers.has(id));
      draw();
    };
  });
}

function buildHeatmap() {
  hctx.clearRect(0, 0, 1024, 1024);
  if (!el('showHeat').checked) return;
  const mode = el('heatMode').value;
  const pts = [];
  currentMatch.players.forEach(p => {
    if (mode === 'traffic') {
      for (let i = 0; i < p.path.length; i += 3) pts.push(p.path[i]);
    } else {
      p.events.forEach(e => {
        if (mode === 'deaths' && DEATH_TYPES.has(e.type)) pts.push([e.x, e.y]);
        if (mode === 'kills' && KILL_TYPES.has(e.type)) pts.push([e.x, e.y]);
      });
    }
  });
  if (!pts.length) return;
  // additive radial gradients -> grayscale intensity buffer, then colorize
  const tmp = document.createElement('canvas'); tmp.width = 1024; tmp.height = 1024;
  const tctx = tmp.getContext('2d');
  const r = mode === 'traffic' ? 26 : 42;
  pts.forEach(([x, y]) => {
    const g = tctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    tctx.fillStyle = g;
    tctx.fillRect(x - r, y - r, r * 2, r * 2);
  });
  const img = tctx.getImageData(0, 0, 1024, 1024);
  const out = hctx.createImageData(1024, 1024);
  const stops = mode === 'deaths' ? [255, 209, 102] : mode === 'kills' ? [255, 92, 57] : [79, 195, 247];
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    out.data[i] = stops[0]; out.data[i + 1] = stops[1]; out.data[i + 2] = stops[2];
    out.data[i + 3] = Math.min(255, a * 2.2);
  }
  hctx.putImageData(out, 0, 0);
}

function draw() {
  ctx.clearRect(0, 0, 1024, 1024);
  if (!currentMatch) return;
  const showHumans = el('showHumans').checked, showBots = el('showBots').checked;
  const showPaths = el('showPaths').checked, showEvents = el('showEvents').checked;

  currentMatch.players.forEach(p => {
    if (hiddenPlayers.has(p.user_id)) return;
    if (p.bot && !showBots) return;
    if (!p.bot && !showHumans) return;
    const color = p.bot ? '#8d97ad' : '#4fc3f7';

    const pts = p.path.filter(pt => pt[2] <= curT);
    if (showPaths && pts.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.globalAlpha = p.bot ? 0.35 : 0.75;
      ctx.lineWidth = p.bot ? 1 : 1.6;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (pts.length) {
      const last = pts[pts.length - 1];
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(last[0], last[1], p.bot ? 2.6 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (!p.bot) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    if (showEvents) {
      p.events.filter(e => e.t <= curT).forEach(e => {
        const c = EVENT_COLOR[e.type] || '#fff';
        ctx.beginPath();
        ctx.fillStyle = c;
        const shape = DEATH_TYPES.has(e.type) ? 5.5 : 4;
        ctx.arc(e.x, e.y, shape, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke();
      });
    }
  });

  timeLabel.textContent = `${fmtTime(curT)} / ${fmtTime(currentMatch.duration_ms)}`;
}

// Playback
function tick(ts) {
  if (!lastFrameT) lastFrameT = ts;
  const dt = ts - lastFrameT; lastFrameT = ts;
  const speed = parseFloat(speedSelect.value);
  curT += dt * speed;
  if (curT >= currentMatch.duration_ms) { curT = currentMatch.duration_ms; pause(); }
  scrub.value = curT;
  draw();
  if (playing) rafId = requestAnimationFrame(tick);
}
function play() {
  if (!currentMatch) return;
  if (curT >= currentMatch.duration_ms) curT = 0;
  playing = true; lastFrameT = 0;
  playBtn.textContent = '⏸';
  rafId = requestAnimationFrame(tick);
}
function pause() {
  playing = false; playBtn.textContent = '▶';
  if (rafId) cancelAnimationFrame(rafId);
}
playBtn.onclick = () => playing ? pause() : play();
scrub.oninput = () => { pause(); curT = parseFloat(scrub.value); draw(); };

['showHumans', 'showBots', 'showPaths', 'showEvents'].forEach(id => el(id).onchange = draw);
el('showHeat').onchange = buildHeatmap;
el('heatMode').onchange = buildHeatmap;

// Hover tooltip — nearest marker within radius
canvasWrap.addEventListener('mousemove', (e) => {
  if (!currentMatch) return;
  const rect = canvasWrap.getBoundingClientRect();
  const scale = 1024 / rect.width;
  const mx = (e.clientX - rect.left) * scale, my = (e.clientY - rect.top) * scale;
  let best = null, bestD = 18;
  currentMatch.players.forEach(p => {
    if (hiddenPlayers.has(p.user_id)) return;
    p.events.filter(ev => ev.t <= curT).forEach(ev => {
      const d = Math.hypot(ev.x - mx, ev.y - my);
      if (d < bestD) { bestD = d; best = { label: `${EVENT_LABEL[ev.type] || ev.type} — ${p.bot ? 'Bot ' + p.user_id : p.user_id.slice(0, 8)}`, x: ev.x, y: ev.y }; }
    });
  });
  if (best) {
    tooltip.textContent = best.label;
    tooltip.style.left = (best.x / 1024 * rect.width) + 'px';
    tooltip.style.top = (best.y / 1024 * rect.height) + 'px';
    tooltip.classList.remove('hidden');
  } else tooltip.classList.add('hidden');
});
canvasWrap.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));

init();
