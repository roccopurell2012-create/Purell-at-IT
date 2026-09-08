const API_BASE = '/.netlify/functions';
const SESSION_TTL_MS = 30 * 60 * 1000;

// Same convenience-lock caveat as the admin panel: this front-end code is
// readable in the page source. Real protection is the server-side check
// against DEV_CODE on every write request.
const CLIENT_PIN = '7007';

let devCode = '';
let allTickets = [];
let currentFilter = 'all';

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const gateCode = document.getElementById('gate-code');
const gateErr = document.getElementById('gate-err');
const adminShell = document.getElementById('admin-shell');
const sessionBanner = document.getElementById('session-banner');

function startSession(code){
  devCode = code;
  localStorage.setItem('dev_session', JSON.stringify({ code, started: Date.now() }));
  gate.style.display = 'none';
  adminShell.classList.add('active');
  loadTickets();
  loadSiteConfig();
  checkSessionExpiry();
}

function checkSessionExpiry(){
  const raw = localStorage.getItem('dev_session');
  if(!raw) return;
  const session = JSON.parse(raw);
  const elapsed = Date.now() - session.started;
  if(elapsed > SESSION_TTL_MS){
    localStorage.removeItem('dev_session');
    location.reload();
    return;
  }
  const remaining = Math.round((SESSION_TTL_MS - elapsed) / 60000);
  sessionBanner.style.display = 'block';
  sessionBanner.textContent = `Session active — auto-expires in about ${remaining} min for security.`;
  setTimeout(checkSessionExpiry, 60000);
}

(function tryResume(){
  const raw = localStorage.getItem('dev_session');
  if(!raw) return;
  const session = JSON.parse(raw);
  if(Date.now() - session.started < SESSION_TTL_MS){
    startSession(session.code);
  }else{
    localStorage.removeItem('dev_session');
  }
})();

gateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = gateCode.value.trim();
  if(val === CLIENT_PIN){
    startSession(val);
  }else{
    gateErr.textContent = 'Incorrect code.';
    gateCode.value = '';
    gateCode.focus();
  }
});

document.getElementById('admin-filters').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if(!btn) return;
  currentFilter = btn.dataset.filter;
  [...document.querySelectorAll('#admin-filters button')].forEach(b => b.setAttribute('aria-selected', b === btn));
  render();
});

// ---------- Site settings ----------
async function loadSiteConfig(){
  try{
    const res = await fetch(`${API_BASE}/site-config`);
    const cfg = await res.json();
    document.getElementById('site-name-input').value = cfg.siteName || 'IT Ticket Desk';
  }catch(e){}
  document.getElementById('dev-info').innerHTML = `
    <span>Functions</span><strong>6 deployed</strong>
    <span>Storage</span><strong>Netlify Blobs</strong>
    <span>Email</span><strong>Resend</strong>
    <span>Languages</span><strong>11 supported</strong>
  `;
}

document.getElementById('save-site-name').addEventListener('click', async () => {
  const siteName = document.getElementById('site-name-input').value.trim();
  try{
    await fetch(`${API_BASE}/site-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-code': devCode },
      body: JSON.stringify({ siteName })
    });
    const msg = document.getElementById('saved-msg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  }catch(e){
    alert("Couldn't save site name.");
  }
});

// ---------- Ticket dashboard (same behavior as admin) ----------
async function loadTickets(){
  const wrap = document.getElementById('table-wrap');
  wrap.innerHTML = '<div class="loading">Loading tickets…</div>';
  try{
    const res = await fetch(`${API_BASE}/tickets`);
    allTickets = await res.json();
    allTickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    render();
    renderChart();
  }catch(e){
    wrap.innerHTML = '<div class="loading">Could not load tickets.</div>';
  }
}

function render(){
  const wrap = document.getElementById('table-wrap');
  const items = currentFilter === 'all' ? allTickets : allTickets.filter(t => t.status === currentFilter);
  if(!items.length){ wrap.innerHTML = '<div class="empty-state">No tickets in this view.</div>'; return; }

  const rows = items.map(t => `
    <tr>
      <td>${new Date(t.createdAt).toLocaleDateString()}</td>
      <td>${escapeHtml(t.name)}<br><span style="color:var(--slate)">${escapeHtml(t.email)}</span></td>
      <td>${escapeHtml(t.subject)} ${t.urgent ? '<span class="badge-urgent">URGENT</span>' : ''}</td>
      <td><span class="status-pill ${pillClass(t.status)}">${statusLabel(t.status)}</span></td>
      <td>
        <select class="status-select" data-id="${t.id}">
          <option value="open" ${t.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="in-progress" ${t.status === 'in-progress' ? 'selected' : ''}>In progress</option>
          <option value="fixed" ${t.status === 'fixed' ? 'selected' : ''}>Fixed</option>
        </select>
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="ticket-table">
      <thead><tr><th>Date</th><th>From</th><th>Subject</th><th>Status</th><th>Update</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => updateStatus(sel.dataset.id, sel.value));
  });
}

async function updateStatus(id, status){
  try{
    await fetch(`${API_BASE}/ticket-update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-dev-code': devCode },
      body: JSON.stringify({ id, status })
    });
    loadTickets();
  }catch(e){
    alert("Couldn't update that ticket.");
  }
}

function renderChart(){
  const days = [];
  for(let i = 6; i >= 0; i--){ const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const counts = days.map(d => allTickets.filter(t => new Date(t.createdAt).toDateString() === d.toDateString()).length);
  const max = Math.max(...counts, 1);
  document.getElementById('chart-by-day').innerHTML = days.map((d, i) => `
    <div class="bar-chart-col">
      <div class="bar" style="height:${(counts[i] / max) * 100}%;"></div>
      <div class="bar-label">${d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
    </div>
  `).join('');
}

function pillClass(status){ if(status === 'open') return 'open'; if(status === 'in-progress') return 'progress'; return 'fixed'; }
function statusLabel(status){ if(status === 'open') return 'Open'; if(status === 'in-progress') return 'In progress'; return 'Fixed'; }
function escapeHtml(str){ const div = document.createElement('div'); div.textContent = str || ''; return div.innerHTML; }
