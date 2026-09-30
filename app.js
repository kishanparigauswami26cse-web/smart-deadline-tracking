// ================= STATE & API =================
localStorage.setItem("token", "demo123");
let tasks = [];
let editingId = null;
let charts = {};
let firstPaint = true, animNext = false, filter = 'All', q = '';
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2400); }
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.token || '') },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path.startsWith('/tasks')) logout();
  if (!res.ok) throw new Error(data.message || 'Something went wrong');
  return data;
}

// ================= AUTH =================
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
let mode = 'login';
function setMode(m) {
  mode = m; $('authBox').dataset.mode = m; $('authErr').textContent = '';
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
  $('authBox').style.setProperty('--tab', m === 'login' ? 0 : 1);
  $('submitBtn').textContent = m === 'login' ? 'Log in' : 'Create account';
  $('authSub').textContent = m === 'login' ? 'Log in to see what to study today.' : 'Create a free account to plan your deadlines.';
  $('password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
}
document.querySelectorAll('.tab').forEach((t) => t.onclick = () => setMode(t.dataset.mode));
$('email').oninput = () => { const v = $('email').value.trim(); $('email').classList.toggle('bad', !!v && !EMAIL_RE.test(v)); $('email').classList.toggle('good', EMAIL_RE.test(v)); $('emailHint').classList.toggle('show', !!v && !EMAIL_RE.test(v)); };
$('password').oninput = () => {
  const p = $('password').value; const s = [p.length >= 6, p.length >= 10, /\d/.test(p), /[A-Z]/.test(p) && /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
  $('meterBar').style.width = (p ? s * 25 : 0) + '%'; $('meterBar').style.background = ['#e04848', '#e04848', '#e6a100', '#2f9e6b', '#0d9488'][s];
  $('meterTxt').textContent = p ? ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][s] : 'Password strength';
};
$('authForm').onsubmit = async (e) => {
  e.preventDefault();
  const box = $('authBox'), btn = $('submitBtn');
  const fail = (m) => { $('authErr').textContent = m; box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); };
  const name = $('name').value.trim(), email = $('email').value.trim().toLowerCase(), password = $('password').value;
  $('authErr').textContent = '';
  if (!EMAIL_RE.test(email)) return fail('Enter a valid email address, like name@example.com');
  if (mode === 'signup') {
    if (!name) return fail('Enter your name');
    if (password.length < 6) return fail('Password must be at least 6 characters');
    if (password !== $('confirm').value) return fail('Passwords do not match');
  } else if (!password) return fail('Enter your password');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const data = await api('/auth/' + mode, 'POST', { name, email, password });
    localStorage.token = data.token; localStorage.userName = data.user.name;
    box.classList.add('success'); await new Promise((r) => setTimeout(r, 450));
    start(); toast(mode === 'signup' ? 'Account created. Welcome, ' + data.user.name : 'Welcome back, ' + data.user.name);
  } catch (err) { fail(err.message); }
  btn.disabled = false; btn.classList.remove('loading');
};
function logout() { localStorage.removeItem('token'); location.reload(); }
$('logout').onclick = logout;

// ================= PRIORITY ENGINE =================
// Priority Score = (Days Left * -2) + Difficulty + Importance
function priority(t) {
  const daysLeft = (new Date(t.deadline) - Date.now()) / 864e5; // negative when overdue
  const score = daysLeft * -2 + t.difficulty + t.importance;
  const label = score >= 2 ? 'High' : score >= -4 ? 'Medium' : 'Low';
  return { daysLeft, score, label };
}

// ================= STUDY PLANNER =================
// Estimated effort per task grows with difficulty; it is spread evenly from today to the deadline.
const hoursFor = (t) => 0.5 + t.difficulty * 0.75;
const MAX_DAY_HOURS = 6, MAX_DUE_PER_DAY = 3;
const fmtH = (h) => (h < 1 ? Math.round(h * 60) + ' min' : Math.round(h * 2) / 2 + ' h');

function buildPlan() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start); date.setDate(date.getDate() + i);
    return { date, items: [], hours: 0, due: 0, overloaded: false };
  });
  tasks.filter((t) => t.status === 'Pending')
    .map((t) => ({ ...t, ...priority(t) }))
    .sort((a, b) => b.score - a.score) // higher priority first, so it is listed first each day
    .forEach((t) => {
      const dl = new Date(t.deadline); dl.setHours(0, 0, 0, 0);
      const dueIdx = Math.round((dl - start) / 864e5);        // days from today to deadline day
      const span = Math.max(1, dueIdx + 1);                    // overdue tasks land on today
      const per = hoursFor(t) / span;                          // spread workload across days
      for (let i = 0; i < Math.min(7, span); i++) { days[i].items.push({ title: t.title, hours: per }); days[i].hours += per; }
      if (dueIdx >= 0 && dueIdx < 7) days[dueIdx].due++;
    });
  days.forEach((d) => { d.overloaded = d.due >= MAX_DUE_PER_DAY || d.hours > MAX_DAY_HOURS; });
  return days;
}

// ================= RENDERING =================
function render() {
  updateProfileStats();
  renderPlan();
  renderTasks();
  if (!$('analytics').classList.contains('hidden')) renderCharts();
  firstPaint = false;
}

function renderPlan() {
  const plan = buildPlan();
  const t = plan[0];
  const done = tasks.filter((x) => x.status === 'Completed').length, pct = tasks.length ? done / tasks.length : 0;
  $('todayPlan').className = 'today' + (firstPaint ? ' enter' : '');
  $('todayPlan').innerHTML = `<div class="today-main">` + (t.items.length
    ? `<div>Today: ${fmtH(t.hours)} of study</div><ul>${t.items.map((i) => `<li>Work on ${esc(i.title)} for ${fmtH(i.hours)}</li>`).join('')}</ul>` +
      (t.overloaded ? '<div class="warn">You are overloaded on this day</div>' : '')
    : 'Nothing planned for today. Add a task to get a plan.') + `</div>
    <div class="ring"><svg width="96" height="96" viewBox="0 0 96 96"><circle class="bg" cx="48" cy="48" r="40"/><circle class="fg" cx="48" cy="48" r="40" stroke-dasharray="251.3" stroke-dashoffset="251.3"/></svg><b>${Math.round(pct * 100)}%</b><small>done</small></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => { const f = document.querySelector('.ring .fg'); if (f) f.style.strokeDashoffset = 251.3 * (1 - pct); }));
  $('weekPlan').innerHTML = plan.map((d, i) => `
    <div class="day ${d.overloaded ? 'over' : ''} ${firstPaint ? 'enter' : ''}" style="--i:${i}">
      <h4>${i === 0 ? 'Today' : d.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</h4>
      <div class="muted">${fmtH(d.hours)} planned, ${d.due} due</div>
      ${d.items.length ? `<ul>${d.items.map((x) => `<li>${esc(x.title)} (${fmtH(x.hours)})</li>`).join('')}</ul>` : ''}
      ${d.overloaded ? '<div class="warn">Overloaded</div>' : ''}
    </div>`).join('');
}

function renderTasks() {
  const anim = firstPaint || animNext; animNext = false;
  if (!tasks.length) { $('tasks').innerHTML = '<p class="empty">No tasks yet. Use “Add task” to create your first one.</p>'; return; }
  // pending first, sorted by priority score; completed at the bottom
  const list = [...tasks].map((t) => ({ ...t, ...priority(t) }))
    .filter((t) => (filter === 'All' || (filter === 'Completed' ? t.status === 'Completed' : t.status !== 'Completed' && t.label === filter)) && (t.title + ' ' + t.description).toLowerCase().includes(q))
    .sort((a, b) => (a.status === 'Completed') - (b.status === 'Completed') || b.score - a.score);
  $('tasks').innerHTML = !list.length ? '<p class="empty">No tasks match. Try another filter or search.</p>' : list.map((t, i) => `
    <article class="task ${t.status === 'Completed' ? 'done' : t.label} ${anim ? 'enter' : ''}" style="--i:${i}">
      <div><span class="badge ${t.label}">${t.label} priority</span> <span class="muted">score ${t.score.toFixed(1)}</span></div>
      <h4>${esc(t.title)}</h4>
      <p>${esc(t.description)}</p>
      <div class="muted">Due ${new Date(t.deadline).toLocaleString()} · Difficulty ${t.difficulty}/5 · Importance ${t.importance}/5</div>
      <div>${t.status === 'Completed' ? 'Completed' : `<span class="count" data-deadline="${t.deadline}"></span>`}</div>
      <div class="actions">
        <button data-act="toggle" data-id="${t._id}" class="ghost">${t.status === 'Completed' ? 'Mark pending' : 'Mark done'}</button>
        <button data-act="edit" data-id="${t._id}" class="ghost">Edit</button>
        <button data-act="del" data-id="${t._id}" class="ghost">Delete</button>
      </div>
    </article>`).join('');
  tick();
}

// Countdown timers: update every second
function tick() {
  document.querySelectorAll('.count').forEach((el) => {
    let ms = new Date(el.dataset.deadline) - Date.now();
    const late = ms < 0; ms = Math.abs(ms);
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    el.textContent = (late ? 'Overdue by ' : '') + `${d}d ${h}h ${m}m ${s}s` + (late ? '' : ' left');
    el.classList.toggle('late', late);
  });
}
setInterval(tick, 1000);

// ================= ANALYTICS (Chart.js) =================
function draw(id, config) { charts[id]?.destroy(); charts[id] = new Chart($(id), config); }
function renderCharts() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const labels = [], due = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    labels.push(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
    due.push(tasks.filter((t) => t.status === 'Pending' && new Date(t.deadline).toDateString() === d.toDateString()).length);
  }
  draw('cDue', { type: 'bar', data: { labels, datasets: [{ label: 'Tasks due', data: due, backgroundColor: '#0f8b8d' }] },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  const done = tasks.filter((t) => t.status === 'Completed').length;
  draw('cStatus', { type: 'doughnut', data: { labels: ['Completed', 'Pending'], datasets: [{ data: [done, tasks.length - done], backgroundColor: ['#2f9e6b', '#e0a100'] }] } });
  const plan = buildPlan();
  draw('cLoad', { type: 'bar', data: { labels: plan.map((d) => d.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })),
    datasets: [{ label: 'Planned hours', data: plan.map((d) => +d.hours.toFixed(1)), backgroundColor: plan.map((d) => (d.overloaded ? '#d64545' : '#1b2a41')) }] },
    options: { scales: { y: { beginAtZero: true } } } });
}

// ================= TASK CRUD =================
const toLocalInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

function openModal(t) {
  editingId = t?._id || null;
  $('modalTitle').textContent = t ? 'Edit task' : 'Add task';
  $('fTitle').value = t?.title || '';
  $('fDesc').value = t?.description || '';
  $('fDeadline').value = t ? toLocalInput(t.deadline) : '';
  $('fDiff').value = t?.difficulty || 3;
  $('fImp').value = t?.importance || 3;
  $('fStatus').value = t?.status || 'Pending';
  $('modal').classList.remove('hidden');
  $('fTitle').focus();
}
const closeModal = () => $('modal').classList.add('hidden');
$('addBtn').onclick = () => openModal();
$('cancelBtn').onclick = closeModal;

$('taskForm').onsubmit = async (e) => {
  e.preventDefault();
  const body = {
    title: $('fTitle').value, description: $('fDesc').value,
    deadline: new Date($('fDeadline').value).toISOString(),
    difficulty: +$('fDiff').value, importance: +$('fImp').value, status: $('fStatus').value
  };
  try {
    editingId ? await api('/tasks/' + editingId, 'PUT', body) : await api('/tasks', 'POST', body);
    closeModal(); await load(); checkReminders(); toast('Task saved');
  } catch (err) { alert(err.message); }
};

$('tasks').onclick = async (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const t = tasks.find((x) => x._id === btn.dataset.id);
  try {
    if (btn.dataset.act === 'edit') return openModal(t);
    if (btn.dataset.act === 'del') { if (confirm(`Delete “${t.title}”?`)) { e.target.closest('.task').classList.add('leaving'); await new Promise((r) => setTimeout(r, 300)); await api('/tasks/' + t._id, 'DELETE'); await load(); toast('Task deleted'); } return; }
    if (btn.dataset.act === 'toggle') { await api('/tasks/' + t._id, 'PUT', { ...t, status: t.status === 'Pending' ? 'Completed' : 'Pending' }); await load(); toast(t.status === 'Pending' ? 'Marked done' : 'Marked pending'); }
  } catch (err) { alert(err.message); }
};

async function load() { tasks = await api('/tasks'); render(); }

// ================= NAVIGATION =================
document.querySelectorAll('nav a[data-view]').forEach((a) => a.onclick = () => {
  document.querySelectorAll('nav a[data-view]').forEach((x) => x.classList.toggle('active', x === a));
  ['dashboard', 'analytics'].forEach((v) => $(v).classList.toggle('hidden', v !== a.dataset.view));
  render();
});

// ================= NOTIFICATIONS =================
// Fires at 2 days before, 1 day before and on the deadline day. Each alert is sent once (remembered in localStorage).
const remindersOn = () => localStorage.remindersOn === '1' && 'Notification' in window && Notification.permission === 'granted';
function updateNotifBtn() { $('remToggle').checked = remindersOn(); }
$('remToggle').onchange = async (e) => {
  if (!e.target.checked) { localStorage.remindersOn = '0'; return toast('Reminders off'); }
  if (!('Notification' in window)) { e.target.checked = false; return toast('This browser does not support notifications'); }
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') { e.target.checked = false; return toast('Notifications are blocked. Allow them in your browser settings.'); }
  localStorage.remindersOn = '1'; toast('Reminders on'); checkReminders();
};

function checkReminders() {
  if (!remindersOn()) return;
  const sent = JSON.parse(localStorage.sentAlerts || '{}');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  tasks.filter((t) => t.status === 'Pending').forEach((t) => {
    const dl = new Date(t.deadline); const dlDay = new Date(dl); dlDay.setHours(0, 0, 0, 0);
    const daysAway = Math.round((dlDay - today) / 864e5);
    if (![0, 1, 2].includes(daysAway) || dl < Date.now()) return;
    const key = `${t._id}:${daysAway}`;
    if (sent[key]) return;
    const when = daysAway === 0 ? 'is due today' : daysAway === 1 ? 'is due tomorrow' : 'is due in 2 days';
    new Notification('Deadline reminder', { body: `${t.title} ${when} (${dl.toLocaleString()})` });
    sent[key] = 1;
  });
  localStorage.sentAlerts = JSON.stringify(sent);
}

$('search').oninput = () => { q = $('search').value.trim().toLowerCase(); renderTasks(); };
$('chips').onclick = (e) => { const c = e.target.closest('.chip'); if (!c) return; filter = c.dataset.f; document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c)); animNext = true; renderTasks(); };
// button ripple
document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const r = b.getBoundingClientRect(), s = document.createElement('span'); s.className = 'ripple'; s.style.left = e.clientX - r.left + 'px'; s.style.top = e.clientY - r.top + 'px'; b.appendChild(s); setTimeout(() => s.remove(), 600); });

// ================= PROFILE =================
let me = null;
async function loadProfile() {
  try { me = await api('/auth/me'); } catch { me = { name: localStorage.userName || 'User', email: '' }; }
  const n = (me.name || 'User').trim(), ch = n[0].toUpperCase();
  $('avatar').textContent = ch; $('pAv').textContent = ch;
  $('pName').textContent = n; $('pEmail').textContent = me.email || '';
  $('pSince').textContent = me.createdAt ? 'Member since ' + new Date(me.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
  updateProfileStats();
}
function updateProfileStats() {
  const done = tasks.filter((t) => t.status === 'Completed').length;
  $('pTotal').textContent = tasks.length; $('pDone').textContent = done; $('pPend').textContent = tasks.length - done;
}
function setProfile(open) { $('profileCard').classList.toggle('open', open); $('avatar').setAttribute('aria-expanded', open); }
$('avatar').onclick = (e) => { e.stopPropagation(); setProfile(!$('profileCard').classList.contains('open')); };
$('profileCard').onclick = (e) => e.stopPropagation();
document.addEventListener('click', () => setProfile(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setProfile(false); });
$('pLogout').onclick = logout;

// ================= START =================
async function start() {
  if (!localStorage.token) return;
  $('auth').classList.add('hidden'); $('app').classList.remove('hidden');
  $('who').textContent = localStorage.userName || '';
  updateNotifBtn();
  loadProfile();
  try { await load(); checkReminders(); } catch (e) { logout(); }
  setInterval(checkReminders, 60000); // re-check every minute
  setInterval(() => { if (!document.hidden) renderPlan(); }, 300000);
}
start();
