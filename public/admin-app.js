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
const reasonLabels = {"Nudité / contenu sexuel":"Nudity / sexual content","Harcèlement / haine":"Harassment / hate","Mineur présumé":"Suspected minor","Violence / menace":"Violence / threats","Spam / escroquerie":"Spam / scams","Autre":"Other"};
const states = { pending: 'New', reviewing: 'In review', resolved: 'Resolved', dismissed: 'Dismissed' };
const date = value => new Intl.DateTimeFormat('en-GB', { timeZone: chartTimezone, dateStyle: 'medium', timeStyle: 'short' }).format(timestamp(value));
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function notice(text) { $('notice').textContent = text; }
function loggedIn(value) {
  $('login').hidden = value; $('dashboard').hidden = $('logout').hidden = !value;
  clearInterval(metricsTimer);
  clearInterval(clockTimer);
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
      action('Ban this IP', async () => { if (!confirm('Ban this IP for ' + days.value + ' day(s)? This may affect a shared network.')) return; await api('report', { id: report.id, action: 'ban', days: Number(days.value) }); await load(); notice('IP banned.'); }, true),
      action('Delete', async () => { if (!confirm('Permanently delete this report and its IP?')) return; await api('report', { id: report.id, action: 'delete' }); await load(); notice('Report deleted.'); }, true));
    card.append(status, notes, buttons); return card;
  }));
  if (!data.reports.length) $('reports').append(el('p', 'No reports.'));
  const contactStates = { new: 'New', in_progress: 'In progress', closed: 'Closed' };
  $('contacts').replaceChildren(...(data.contacts || []).map(contact => {
    const card = el('article', undefined, 'report'); card.dataset.contactId = contact.id;
    card.append(el('h3', contact.firstName + ' ' + contact.lastName + ' · ' + contact.email), el('p', date(contact.created) + ' · ' + contact.id, 'meta'), el('p', contact.message, 'details'));
    const status = el('select'); status.setAttribute('aria-label', 'Mail status'); Object.entries(contactStates).forEach(([value, label]) => { const option = el('option', label); option.value = value; status.append(option); }); status.value = contact.status;
    const notes = el('textarea'); notes.value = contact.notes || ''; notes.maxLength = 2000; notes.placeholder = 'Internal notes';
    const buttons = el('div', undefined, 'report-actions'); buttons.append(action('Save', async () => { await api('contact', { id: contact.id, action: 'update', status: status.value, notes: notes.value }); await load(); notice('Mail updated.'); }), action('Delete', async () => { if (!confirm('Delete this message?')) return; await api('contact', { id: contact.id, action: 'delete' }); await load(); notice('Mail deleted.'); }, true));
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
