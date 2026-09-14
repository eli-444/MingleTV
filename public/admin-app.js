const $ = id => document.getElementById(id);
const base = location.pathname.replace(/\/$/, '') + '/api/';
let csrf = '', page = 0;
let metricsTimer, metricsLoading = false;
let lastMetrics, trafficMode = 'line', clockTimer;
let serverTime = Date.now(), receivedAt = performance.now();
let chartTimezone = 'Europe/Paris';
try { const saved = localStorage.getItem('mingle.admin.timezone'); if (['Europe/Paris', 'UTC'].includes(saved)) chartTimezone = saved; } catch {}
const numberFormat = new Intl.NumberFormat('en-GB');
const count = value => Number.isFinite(Number(value)) && value != null ? numberFormat.format(Number(value)) : '—';
const palette = ['#48d9ed', '#b5a0ff', '#5ee5a5', '#ffd27b', '#ff8dba', '#7eaaff', '#ffab7c', '#d0ed83', '#dd94eb', '#76d9c4'];
function timestamp(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  let iso = value.trim().replace(' ', 'T');
  if (!iso.includes('T')) return Date.parse(iso + 'T00:00:00Z');
  if (/T/.test(iso) && !/(Z|[+-]\d{2}(?::?\d{2})?)$/i.test(iso)) iso += 'Z';
  return Date.parse(iso.replace(/([+-]\d{2})$/, '$1:00'));
}
function time(value, seconds = false) { return new Intl.DateTimeFormat('en-GB', { timeZone: chartTimezone, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23' }).format(value); }
function updateClock() { $('adminClock').textContent = time(serverTime + performance.now() - receivedAt, true); $('adminClock').title = chartTimezone + ' · synchronised with the last server response'; }

const views = {
  overview: ['Overview', 'A live pulse of your community.'],
  analytics: ['Analytics', 'Traffic and activity over time.'],
  'reports-section': ['Reports', 'Review reports and manage moderation.'],
  'mail-section': ['Mail', 'Messages from your community.'],
  'bans-section': ['IP bans', 'Review and manage access restrictions.'],
  'settings-section': ['Settings', 'Manage public information and retention.'],
  'audit-section': ['Audit log', 'Recent administrative actions.']
};
const mobileLayout = matchMedia('(max-width: 900px)');
function closeMenu(restoreFocus = false) {
  document.body.classList.remove('menu-open');
  $('menuToggle').setAttribute('aria-expanded', 'false');
  $('menuBackdrop').hidden = true;
  $('workspace').inert = false;
  $('sidebar').inert = mobileLayout.matches;
  $('sidebar').removeAttribute('role');
  $('sidebar').removeAttribute('aria-modal');
  if (restoreFocus) $('menuToggle').focus();
}
function selectView(focus = false) {
  const requested = location.hash.slice(1);
  const name = Object.hasOwn(views, requested) ? requested : 'overview';
  if (requested !== name) history.replaceState(null, '', '#' + name);
  document.querySelectorAll('[data-view]').forEach(section => { section.hidden = section.id !== name; });
  document.querySelectorAll('.side-link').forEach(link => {
    const current = link.hash === '#' + name;
    link.classList.toggle('active', current);
    if (current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('viewTitle').textContent = views[name][0];
  $('viewDescription').textContent = views[name][1];
  document.title = views[name][0] + ' · Mingle TV Admin';
  closeMenu();
  if (focus && typeof lastMetrics !== 'undefined' && lastMetrics) requestAnimationFrame(() => renderCharts(lastMetrics));
  if (focus && !$('dashboard').hidden) { $('viewTitle').focus({ preventScroll: true }); window.scrollTo(0, 0); }
}
$('menuToggle').onclick = () => {
  document.body.classList.add('menu-open');
  $('menuToggle').setAttribute('aria-expanded', 'true');
  $('menuBackdrop').hidden = false;
  $('workspace').inert = true;
  $('sidebar').inert = false;
  $('sidebar').setAttribute('role', 'dialog');
  $('sidebar').setAttribute('aria-modal', 'true');
  $('menuClose').focus();
};
$('menuClose').onclick = () => closeMenu(true);
$('menuBackdrop').onclick = () => closeMenu(true);
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('menu-open')) return;
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
  if (event.key === 'Tab') {
    const items = [...$('sidebar').querySelectorAll('a[href], button:not([hidden])')].filter(el => el.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
mobileLayout.addEventListener('change', () => closeMenu());
window.addEventListener('hashchange', () => selectView(true));
document.querySelectorAll('.side-link').forEach(link => link.addEventListener('click', () => {
  if (location.hash === link.hash) { closeMenu(); $('viewTitle').focus(); }
}));
selectView();

const reasonLabels = {"Nudité / contenu sexuel":"Nudity / sexual content","Harcèlement / haine":"Harassment / hate","Mineur présumé":"Suspected minor","Violence / menace":"Violence / threats","Spam / escroquerie":"Spam / scams","Autre":"Other"};
const states = { pending: 'New', reviewing: 'In review', resolved: 'Resolved', dismissed: 'Dismissed' };
const date = value => new Intl.DateTimeFormat('en-GB', { timeZone: chartTimezone, dateStyle: 'medium', timeStyle: 'short' }).format(timestamp(value));
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function notice(text) { $('notice').textContent = text; }
function loggedIn(value) {
  $('login').hidden = value; $('dashboard').hidden = $('logout').hidden = !value;
  clearInterval(metricsTimer); clearInterval(clockTimer);
  closeMenu();
  if (value) selectView();
  if (value) { metricsTimer = setInterval(refreshMetrics, 5000); clockTimer = setInterval(updateClock, 1000); }
}
async function api(endpoint, data) {
  const response = await fetch(base + endpoint, { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) { if (response.status === 401) loggedIn(false); throw new Error(result.error || 'Operation failed'); }
  return result;
}
function action(label, task, dangerous = false) {
  const b = el('button', label, dangerous ? 'danger' : ''); b.type = 'button';
  b.onclick = async () => { b.disabled = true; try { await task(); } catch (e) { notice(e.message); } finally { b.disabled = false; } }; return b;
}
function rows(id, items, keys) { $(id).replaceChildren(...items.map(item => { const tr = el('tr'); keys.forEach(key => tr.append(el('td', item[key]))); return tr; })); }

function confirmAction(message) {
  return new Promise(resolve => {
    const dialog = $('confirmDialog');
    const previous = document.activeElement;
    $('confirmMessage').textContent = message;
    dialog.returnValue = '';
    dialog.addEventListener('close', () => { previous?.focus(); resolve(dialog.returnValue === 'confirm'); }, { once: true });
    dialog.showModal();
  });
}
function plot(id, items, definitions, labelKey) {
  const host = $(id); host.replaceChildren();
  if (!items.length) { host.append(el('p', 'No activity recorded yet.', 'chart-empty')); return; }
  const ns = 'http://www.w3.org/2000/svg';
  const svgNode = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k,v]) => n.setAttribute(k,v)); if(text !== undefined) n.textContent = text; return n; };
  const svg = svgNode('svg', { viewBox:'0 0 640 250', role:'img', 'aria-label': definitions.map(d=>d[1]).join(' and ') + ' over time' });
  const value = (row,key) => Math.max(0, Number(row[key]) || 0);
  const maximum = Math.max(1, ...items.flatMap(row => definitions.map(d=>value(row,d[0]))));
  const x = i => items.length === 1 ? 340 : 52 + i/(items.length-1)*568;
  const y = v => 208-v/maximum*180;
  for(let i=0;i<=4;i++){
    const yy=28+i*45;
    svg.append(svgNode('line',{x1:52,x2:620,y1:yy,y2:yy,stroke:'#292929','stroke-dasharray':'3 6'}));
    svg.append(svgNode('text',{x:42,y:yy+4,'text-anchor':'end',fill:'#888', 'font-size':11},new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(maximum*(4-i)/4)));
  }
  const defs = svgNode('defs',{}); svg.append(defs);
  definitions.forEach(([key,label,color],index)=>{
    const points=items.map((row,i)=>[x(i),y(value(row,key))]);
    const gradient=svgNode('linearGradient',{id:id+'-fill-'+index,x1:0,y1:0,x2:0,y2:1});
    gradient.append(svgNode('stop',{offset:'0%','stop-color':color,'stop-opacity':'.22'}),svgNode('stop',{offset:'100%','stop-color':color,'stop-opacity':'0'})); defs.append(gradient);
    if(points.length>1){
      const line='M'+points.map(p=>p.join(',')).join(' L');
      svg.append(svgNode('path',{d:line+' L620,208 L52,208 Z',fill:'url(#'+id+'-fill-'+index+')'}));
      svg.append(svgNode('path',{d:line,fill:'none',stroke:color,'stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round'}));
    }
    points.forEach(([xx,yy],i)=>{const dot=svgNode('circle',{cx:xx,cy:yy,r:points.length===1?5:3,fill:color}); dot.append(svgNode('title',{},String(items[i][labelKey])+': '+numberFormat.format(value(items[i],key))+' '+label));svg.append(dot);});
  });
  const formatLabel = row => labelKey==='minute' ? new Date(row.minute).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}) : String(row[labelKey]);
  [...new Set([0,Math.floor((items.length-1)/2),items.length-1])].forEach(i=>svg.append(svgNode('text',{x:x(i),y:239,'text-anchor':i===0?'start':i===items.length-1?'end':'middle',fill:'#999','font-size':11},formatLabel(items[i]))));
  host.append(svg);
  const legend=el('div',undefined,'chart-legend');
  definitions.forEach(([,label,color])=>{const item=el('span',label);item.style.setProperty('--series',color);legend.append(item);});
  host.append(legend);
}

function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
function chart(id, series, { color, mode, unit, label }) {
  const container = $(id), width = Math.max(280, Math.round(container.getBoundingClientRect().width));
  const signature = JSON.stringify([series, color, mode, unit, chartTimezone, width]);
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  if (!series) { container.replaceChildren(el('div', 'Minute-level traffic is not available from this server.', 'chart-empty')); return; }
  const height = 240, left = 46, right = 20, top = 14, bottom = 34;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const max = Math.max(4, Math.ceil(Math.max(0, ...series.map(point => point.value)) / 4) * 4);
  const step = plotWidth / series.length;
  const x = i => left + step * (i + .5), y = value => top + plotHeight * (1 - value / max);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, 'aria-label': `${unit} chart. Focus a point for its value.`, role: 'group' });
  svg.append(svgNode('title', {}, `${unit} over ${series.length} time intervals`));
  for (let i = 0; i <= 4; i++) {
    const value = max * i / 4, py = y(value);
    svg.append(svgNode('line', { x1: left, y1: py, x2: width - right, y2: py, class: 'chart-grid' }));
    svg.append(svgNode('text', { x: left - 8, y: py + 4, 'text-anchor': 'end', class: 'chart-axis' }, value >= 10000 ? (value / 1000).toFixed(0) + 'k' : count(value)));
  }
  const indices = width < 480 ? [0, Math.round((series.length - 1) / 2), series.length - 1] : [...new Set([0, Math.round((series.length - 1) / 4), Math.round((series.length - 1) / 2), Math.round((series.length - 1) * .75), series.length - 1])];
  for (const i of indices) svg.append(svgNode('text', { x: x(i), y: height - 8, 'text-anchor': 'middle', class: 'chart-axis' }, label(series[i].at)));
  if (mode === 'line') {
    const path = series.map((point, i) => `${i ? 'L' : 'M'}${x(i)},${y(point.value)}`).join(' ');
    svg.append(svgNode('path', { d: `${path} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`, fill: color, class: 'chart-area' }));
    svg.append(svgNode('path', { d: path, stroke: color, class: 'chart-line' }));
  } else {
    series.forEach((point, i) => svg.append(svgNode('rect', { x: x(i) - step * .32, y: y(point.value), width: step * .64, height: Math.max(0, y(0) - y(point.value)), rx: 2, fill: color, class: 'chart-column' })));
  }
  const guide = svgNode('line', { x1: 0, x2: 0, y1: top, y2: y(0), class: 'chart-guide', visibility: 'hidden' });
  const dot = svgNode('circle', { r: 4, fill: color, stroke: '#08080b', 'stroke-width': 2, visibility: 'hidden' });
  svg.append(guide, dot);
  const readout = el('div', 'Hover or focus a point to inspect', 'chart-readout');
  series.forEach((point, i) => {
    const description = `${label(point.at)} · ${count(point.value)} ${unit}`;
    const target = svgNode('rect', { x: left + i * step, y: top, width: step, height: plotHeight, tabindex: '0', 'aria-label': description, class: 'chart-target' });
    target.append(svgNode('title', {}, description));
    const show = () => { readout.textContent = description; guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('visibility', 'visible'); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(point.value)); dot.setAttribute('visibility', 'visible'); };
    target.addEventListener('pointerenter', show); target.addEventListener('focus', show);
    target.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const next = event.key === 'ArrowLeft' ? target.previousElementSibling : target.nextElementSibling; if (next?.classList.contains('chart-target')) next.focus(); } });
    svg.append(target);
  });
  container.replaceChildren(readout, svg);
}
function renderCharts(data) {
  const anchor = Math.floor((timestamp(data.generatedAt) || serverTime) / 60000) * 60000;
  let series = null;
  if (Array.isArray(data.visitSeries)) {
    const minutes = new Map();
    for (const row of data.visitSeries) { const at = Math.floor(timestamp(row.minute) / 60000) * 60000; if (Number.isFinite(at)) minutes.set(at, Math.max(0, Number(row.visits) || 0)); }
    series = Array.from({ length: 30 }, (_, i) => { const at = anchor - (29 - i) * 60000; return { at, value: minutes.get(at) || 0 }; });
  }
  $('trafficRange').textContent = `${time(anchor - 29 * 60000)} – ${time(anchor)} · ${chartTimezone} · visits per minute`;
  chart('trafficChart', series, { color: palette[0], mode: trafficMode, unit: 'visits', label: at => time(at) });
  const metric = $('activityMetric').value, utcDay = Math.floor(anchor / 86400000) * 86400000;
  const days = new Map((data.daily || []).map(row => [row.date.slice(0, 10), row]));
  const daily = Array.from({ length: 30 }, (_, i) => { const at = utcDay - (29 - i) * 86400000; return { at, value: Math.max(0, Number(days.get(new Date(at).toISOString().slice(0, 10))?.[metric]) || 0) }; });
  chart('activityChart', daily, { color: metric === 'pageviews' ? palette[1] : metric === 'connections' ? palette[2] : palette[3], mode: 'bars', unit: { pageviews: 'page views', connections: 'connections', matches: 'matches' }[metric], label: at => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(at) });
}
function renderCountries(items) {
  const countries = (items || []).filter(item => Number(item.visits) > 0), total = countries.reduce((sum, item) => sum + Number(item.visits), 0);
  const signature = JSON.stringify(countries); if ($('countries').dataset.signature === signature) return; $('countries').dataset.signature = signature;
  const svg = svgNode('svg', { viewBox: '0 0 120 120', role: 'img', 'aria-label': `Visits by country. ${count(total)} visits across the displayed countries.` });
  svg.append(svgNode('circle', { cx: 60, cy: 60, r: 48, fill: 'none', stroke: '#25252d', 'stroke-width': 12 }));
  let offset = 0;
  countries.forEach((item, i) => { const part = Number(item.visits) / total * 100; svg.append(svgNode('circle', { cx: 60, cy: 60, r: 48, fill: 'none', stroke: palette[i % palette.length], 'stroke-width': 12, pathLength: 100, 'stroke-dasharray': `${part} ${100 - part}`, 'stroke-dashoffset': -offset })); offset += part; });
  const center = el('div', undefined, 'country-total'); center.append(el('strong', count(total)), el('small', 'visits shown'));
  $('countryChart').replaceChildren(svg, center);
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  $('countries').replaceChildren(...countries.map((item, i) => {
    const row = el('div', undefined, 'country-row'), heading = el('div'), percent = Number(item.visits) / total * 100;
    heading.append(el('strong', /^[A-Z]{2}$/.test(item.country) ? names.of(item.country) : 'Unknown'), el('span', `${count(item.visits)} · ${percent.toFixed(1)}%`));
    const track = el('div', undefined, 'country-track'), fill = el('i'); fill.style.width = percent + '%'; fill.style.backgroundColor = palette[i % palette.length]; track.append(fill); row.append(heading, track); return row;
  }));
  if (!countries.length) $('countries').append(el('p', 'No country data for this period.'));
}
function renderMetrics(data) {
  lastMetrics = data; serverTime = timestamp(data.generatedAt) || Date.now(); receivedAt = performance.now(); updateClock();
  $('updated').textContent = `Data updated at ${time(serverTime, true)} · ${chartTimezone} · automatic refresh every 5 s`;
  const currentMonth = new Date(serverTime).toISOString().slice(0, 7);
  const metrics = [['Visits / 30 min', data.visits30m, 'Current minute included'], ['Visits today', data.visitsToday ?? data.today?.pageviews, 'Since 00:00 UTC'], ['Visits this month', data.visitsMonth ?? data.monthly?.find(row => row.month === currentMonth)?.pageviews, 'Calendar month · UTC'], ['People online', data.online.connected, 'Active chat sessions'], ['Reports', data.reportsTotal, 'Reports currently retained']];
  metrics.forEach(([label, value, hint], i) => {
    let card = $('live').children[i];
    if (!card) { card = el('div', undefined, 'card'); card.append(el('span', label), el('strong', ''), el('small', hint)); $('live').append(card); }
    const number = card.querySelector('strong'), text = count(value);
    if (number.textContent !== text) { card.classList.remove('changed'); void card.offsetWidth; number.textContent = text; card.classList.add('changed'); }
  });
  $('sessionSummary').replaceChildren(...[['waiting', data.online.waiting], ['active matches', data.online.conversations], ['peak online today (UTC)', data.today?.peak]].map(([label, value]) => { const span = el('span'); span.append(el('strong', count(value)), document.createTextNode(label)); return span; }));
  renderCharts(data); renderCountries(data.countries);
  plot('dailyChart', [...(data.daily || [])].sort((a,b)=>a.date.localeCompare(b.date)), [['pageviews','Page views',palette[1]],['connections','Connections',palette[2]]], 'date');
  plot('monthlyChart', [...(data.monthly || [])].sort((a,b)=>a.month.localeCompare(b.month)), [['pageviews','Page views',palette[0]],['matches','Matches',palette[3]]], 'month');
  const formatRows = items => (items || []).map(item => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, ['month', 'date'].includes(key) ? value : count(value)])));
  rows('monthly', formatRows(data.monthly), ['month', 'pageviews', 'connections', 'visitors', 'peak', 'matches', 'reports']); rows('daily', formatRows(data.daily), ['date', 'pageviews', 'connections', 'peak', 'matches', 'reports']);
}
$('chartTimezone').value = chartTimezone;
$('chartTimezone').onchange = () => { chartTimezone = $('chartTimezone').value; try { localStorage.setItem('mingle.admin.timezone', chartTimezone); } catch {} updateClock(); if (lastMetrics) { renderCharts(lastMetrics); $('updated').textContent = `Data updated at ${time(serverTime, true)} · ${chartTimezone} · automatic refresh every 5 s`; } };
for (const [id, mode] of [['trafficLine', 'line'], ['trafficBars', 'bars']]) $(id).onclick = () => { trafficMode = mode; $('trafficLine').setAttribute('aria-pressed', mode === 'line'); $('trafficBars').setAttribute('aria-pressed', mode === 'bars'); if (lastMetrics) renderCharts(lastMetrics); };
$('activityMetric').onchange = () => { if (lastMetrics) renderCharts(lastMetrics); };
let chartResizeFrame;
window.addEventListener('resize', () => { cancelAnimationFrame(chartResizeFrame); chartResizeFrame = requestAnimationFrame(() => { if (lastMetrics && !$('dashboard').hidden) renderCharts(lastMetrics); }); });
async function refreshMetrics() {
  if (document.hidden || $('dashboard').hidden || metricsLoading) return;
  metricsLoading = true;
  try { const data = await api('metrics'); if (!$('dashboard').hidden) renderMetrics(data); }
  catch (e) { $('updated').textContent = 'Statistics could not be refreshed: ' + e.message; }
  finally { metricsLoading = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshMetrics(); });
async function load() {
  const data = await api('dashboard?status=' + $('filter').value + '&page=' + page); loggedIn(true);
  renderMetrics(data);
  $('reports').replaceChildren(...data.reports.map(report => {
    const card = el('article', undefined, 'report'); card.dataset.reportId = report.id;
    card.append(el('h3', (reasonLabels[report.reason] || report.reason) + ' · ' + states[report.status]), el('p', date(report.created) + ' · ' + report.id, 'meta'), el('p', 'Reported IP: ' + report.ip + ' · Country: ' + (report.country || '—'), 'meta'), el('p', report.details || 'No details provided.', 'details'));
    const status = el('select'); status.setAttribute('aria-label', 'Report status');
    Object.entries(states).forEach(([value, label]) => { const option = el('option', label); option.value = value; status.append(option); }); status.value = report.status;
    const notes = el('textarea'); notes.value = report.notes; notes.maxLength = 2000; notes.placeholder = 'Internal notes'; notes.setAttribute('aria-label', 'Internal notes');
    const days = el('select'); days.setAttribute('aria-label', 'Ban duration'); [1, 7, 30].forEach(n => { const option = el('option', n + ' day(s)'); option.value = n; days.append(option); }); days.value = '7';
    const buttons = el('div', undefined, 'report-actions');
    buttons.append(action('Save', async () => { await api('report', { id: report.id, action: 'update', status: status.value, notes: notes.value }); await load(); notice('Report updated.'); }), days,
      action('Ban this IP', async () => { if (!await confirmAction('Ban this IP for ' + days.value + ' day(s)? This may affect a shared network.')) return; await api('report', { id: report.id, action: 'ban', days: Number(days.value) }); await load(); notice('IP banned.'); }, true),
      action('Delete', async () => { if (!await confirmAction('Permanently delete this report and its IP?')) return; await api('report', { id: report.id, action: 'delete' }); await load(); notice('Report deleted.'); }, true));
    card.append(status, notes, buttons); return card;
  }));
  if (!data.reports.length) $('reports').append(el('p', 'No reports.'));
  const contactStates = { new: 'New', in_progress: 'In progress', closed: 'Closed' };
  $('contacts').replaceChildren(...(data.contacts || []).map(contact => {
    const card = el('article', undefined, 'report'); card.dataset.contactId = contact.id;
    card.append(el('h3', contact.firstName + ' ' + contact.lastName + ' · ' + contact.email), el('p', date(contact.created) + ' · ' + contact.id, 'meta'), el('p', contact.message, 'details'));
    const status = el('select'); status.setAttribute('aria-label', 'Mail status'); Object.entries(contactStates).forEach(([value, label]) => { const option = el('option', label); option.value = value; status.append(option); }); status.value = contact.status;
    const notes = el('textarea'); notes.value = contact.notes || ''; notes.maxLength = 2000; notes.placeholder = 'Internal notes';
    const buttons = el('div', undefined, 'report-actions'); buttons.append(action('Save', async () => { await api('contact', { id: contact.id, action: 'update', status: status.value, notes: notes.value }); await load(); notice('Mail updated.'); }), action('Delete', async () => { if (!await confirmAction('Delete this message?')) return; await api('contact', { id: contact.id, action: 'delete' }); await load(); notice('Mail deleted.'); }, true));
    card.append(status, notes, buttons); return card;
  }));
  if (!(data.contacts || []).length) $('contacts').append(el('p', 'No messages.'));
  $('pagination').textContent = 'Page ' + (page + 1) + ' · ' + data.totalReports + ' report(s)'; $('previous').disabled = page === 0; $('next').disabled = (page + 1) * 50 >= data.totalReports;
  $('bans').replaceChildren(...data.bans.map(ban => { const row = el('div', undefined, 'ban'); row.append(el('span', ban.ip + ' · until ' + date(ban.expires)), action('Unban', async () => { await api('unban', { ip: ban.ip }); await load(); notice('IP unbanned.'); })); return row; }));
  for (const key of ['operator', 'contact', 'address', 'hosting']) $(key).value = data.policy[key]; $('retention').value = data.policy.retentionDays;
  $('audit').replaceChildren(...data.audit.map(a => el('li', date(a.created) + ' · ' + a.action)));
}
$('login').onsubmit = async e => { e.preventDefault(); const button = $('login').querySelector('button'); button.disabled = true; try { const result = await api('login', { password: $('password').value }); csrf = result.csrf; $('password').value = ''; await load(); notice(''); } catch (e) { notice(e.message); } finally { button.disabled = false; } };
$('logout').onclick = async () => { try { await api('logout', {}); csrf = ''; loggedIn(false); $('reports').replaceChildren(); $('bans').replaceChildren(); notice('Signed out.'); } catch (e) { notice(e.message); } };
$('refresh').onclick = () => load().catch(e => notice(e.message));
$('filter').onchange = () => { page = 0; load().catch(e => notice(e.message)); };
$('previous').onclick = () => { page--; load().catch(e => notice(e.message)); };
$('next').onclick = () => { page++; load().catch(e => notice(e.message)); };
$('settings').onsubmit = async e => { e.preventDefault(); try { await api('settings', { operator: $('operator').value.trim(), contact: $('contact').value.trim(), address: $('address').value.trim(), hosting: $('hosting').value.trim(), retentionDays: Number($('retention').value) }); await load(); notice('Privacy information saved.'); } catch (e) { notice(e.message); } };
api('session').then(result => { csrf = result.csrf; return load(); }).catch(e => { loggedIn(false); if (e.message !== 'Sign-in required') notice(e.message); });
