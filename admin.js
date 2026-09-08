const API_BASE = '/.netlify/functions';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// The PIN gate below is a convenience lock on the front end only — anyone
// could read this file's source and see the code. Real protection happens
// server-side: every status-change / bulk / notes request is checked again
// against ADMIN_CODE on the server, so a visitor who bypasses this screen
// still can't modify tickets without the right code.
const CLIENT_PIN = '2012';

let adminCode = '';
let allTickets = [];
let currentFilter = 'all';
let currentCategory = '';
let selectedIds = new Set();

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const gateCode = document.getElementById('gate-code');
const gateErr = document.getElementById('gate-err');
const adminShell = document.getElementById('admin-shell');
const sessionBanner = document.getElementById('session-banner');

function startSession(code){
  adminCode = code;
  localStorage.setItem('admin_session', JSON.stringify({ code, started: Date.now() }));
  gate.style.display = 'none';
  adminShell.classList.add('active');
  loadTickets();
  loadFlagged();
  checkSessionExpiry();
}

function checkSessionExpiry(){
  const raw = localStorage.getItem('admin_session');
  if(!raw) return;
  const session = JSON.parse(raw);
  const elapsed = Date.now() - session.started;
  if(elapsed > SESSION_TTL_MS){
    localStorage.removeItem('admin_session');
    location.reload();
    return;
  }
  const remaining = Math.round((SESSION_TTL_MS - elapsed) / 60000);
  sessionBanner.style.display = 'block';
  sessionBanner.textContent = `Session active — auto-expires in about ${remaining} min for security.`;
  setTimeout(checkSessionExpiry, 60000);
}

// Resume an existing session if still valid
(function tryResume(){
  const raw = localStorage.getItem('admin_session');
  if(!raw) return;
  const session = JSON.parse(raw);
  if(Date.now() - session.started < SESSION_TTL_MS){
    startSession(session.code);
  }else{
    localStorage.removeItem('admin_session');
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
  selectedIds.clear();
  render();
});

document.getElementById('category-filter').addEventListener('change', (e) => {
  currentCategory = e.target.value;
  render();
});

async function loadTickets(){
  const wrap = document.getElementById('table-wrap');
  wrap.innerHTML = '<div class="loading">Loading tickets…</div>';
  try{
    const res = await fetch(`${API_BASE}/tickets`);
    if(!res.ok) throw new Error('failed');
    allTickets = await res.json();
    allTickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    render();
    renderChart();
  }catch(e){
    wrap.innerHTML = '<div class="loading">Could not load tickets. Try refreshing.</div>';
  }
}

async function loadFlagged(){
  try{
    const res = await fetch(`${API_BASE}/tickets?flagged=true`);
    if(!res.ok) return;
    const flagged = await res.json();
    const wrap = document.getElementById('flagged-wrap');
    if(!flagged.length){ wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <h3 style="font-size:0.9rem;font-family:var(--mono-tick);margin:0 0 8px;">Reported as outdated</h3>
      <div class="flagged-list">
        ${flagged.map(t => `<div class="flagged-item"><span>${escapeHtml(t.subject)}</span><span style="color:var(--slate);font-size:0.78rem;">${escapeHtml(t.status)}</span></div>`).join('')}
      </div>
    `;
  }catch(e){}
}

function render(){
  const wrap = document.getElementById('table-wrap');
  let items = currentFilter === 'all' ? allTickets : allTickets.filter(t => t.status === currentFilter);
  if(currentCategory) items = items.filter(t => t.category === currentCategory);

  if(!items.length){
    wrap.innerHTML = '<div class="empty-state">No tickets in this view.</div>';
    updateBulkBar();
    return;
  }

  const rows = items.map(t => `
    <tr>
      <td><input type="checkbox" class="row-check" data-id="${t.id}" ${selectedIds.has(t.id) ? 'checked' : ''}></td>
      <td>${new Date(t.createdAt).toLocaleDateString()}</td>
      <td>${escapeHtml(t.name)}<br><span style="color:var(--slate)">${escapeHtml(t.email)}</span></td>
      <td>${escapeHtml(t.subject)} ${t.urgent ? '<span class="badge-urgent">URGENT</span>' : ''}</td>
      <td>${t.category ? `<span class="item-tag">${escapeHtml(t.category)}</span>` : '—'}</td>
      <td><span class="status-pill ${pillClass(t.status)}">${statusLabel(t.status)}</span></td>
      <td><button class="btn-ghost" data-open="${t.id}">View</button></td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="ticket-table">
      <thead>
        <tr>
          <th><input type="checkbox" id="check-all"></th>
          <th>Date</th><th>From</th><th>Subject</th><th>Category</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if(cb.checked) selectedIds.add(cb.dataset.id); else selectedIds.delete(cb.dataset.id);
      updateBulkBar();
    });
  });
  wrap.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.open));
  });
  document.getElementById('check-all').addEventListener('change', (e) => {
    items.forEach(t => e.target.checked ? selectedIds.add(t.id) : selectedIds.delete(t.id));
    render();
  });

  updateBulkBar();
}

function updateBulkBar(){
  const bar = document.getElementById('bulk-bar');
  const count = document.getElementById('bulk-count');
  if(selectedIds.size > 0){
    bar.classList.add('show');
    count.textContent = `${selectedIds.size} selected`;
  }else{
    bar.classList.remove('show');
  }
}

document.getElementById('bulk-apply').addEventListener('click', async () => {
  const status = document.getElementById('bulk-status').value;
  try{
    await fetch(`${API_BASE}/ticket-update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-code': adminCode },
      body: JSON.stringify({ ids: Array.from(selectedIds), status })
    });
    selectedIds.clear();
    loadTickets();
  }catch(e){
    alert("Couldn't apply bulk update.");
  }
});

// ---------- Modal ----------
const modalOverlay = document.getElementById('modal-overlay');
const modalCard = document.getElementById('modal-card');

function openModal(id){
  const ticket = allTickets.find(t => t.id === id);
  if(!ticket) return;
  modalCard.innerHTML = `
    <button class="modal-close" id="modal-close">&times;</button>
    <h2>${escapeHtml(ticket.subject)}</h2>
    <div class="modal-meta">${escapeHtml(ticket.name)} · ${escapeHtml(ticket.email)} · ${new Date(ticket.createdAt).toLocaleString()}</div>
    <p>${escapeHtml(ticket.description)}</p>
    ${ticket.urgent ? `<p style="color:var(--red)"><strong>Urgent:</strong> ${escapeHtml(ticket.urgentReason)}</p>` : ''}
    ${ticket.category ? `<div class="item-tags"><span class="item-tag">${escapeHtml(ticket.category)}</span></div>` : ''}

    <label>Status</label>
    <select class="status-select" id="modal-status">
      <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
      <option value="in-progress" ${ticket.status === 'in-progress' ? 'selected' : ''}>In progress</option>
      <option value="fixed" ${ticket.status === 'fixed' ? 'selected' : ''}>Fixed</option>
    </select>

    <label>Internal notes (not visible to the submitter)</label>
    <textarea id="modal-notes">${escapeHtml(ticket.internalNotes || '')}</textarea>

    <div style="margin-top:16px;display:flex;gap:10px;">
      <button class="submit-btn" id="modal-save">Save changes</button>
      ${ticket.status === 'fixed' ? `<button class="btn-ghost" id="modal-reopen">Reopen ticket</button>` : ''}
    </div>
  `;
  modalOverlay.classList.add('show');

  document.getElementById('modal-close').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeModal(); });

  document.getElementById('modal-save').addEventListener('click', async () => {
    const status = document.getElementById('modal-status').value;
    const internalNotes = document.getElementById('modal-notes').value;
    await saveTicket(ticket.id, { status, internalNotes });
    closeModal();
  });

  const reopenBtn = document.getElementById('modal-reopen');
  if(reopenBtn){
    reopenBtn.addEventListener('click', async () => {
      await saveTicket(ticket.id, { status: 'open' });
      closeModal();
    });
  }
}

function closeModal(){
  modalOverlay.classList.remove('show');
}

async function saveTicket(id, updates){
  try{
    await fetch(`${API_BASE}/ticket-update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-code': adminCode },
      body: JSON.stringify({ id, ...updates })
    });
    loadTickets();
    loadFlagged();
  }catch(e){
    alert("Couldn't save changes. Try again.");
  }
}

// ---------- CSV export ----------
document.getElementById('export-csv').addEventListener('click', () => {
  const items = currentFilter === 'all' ? allTickets : allTickets.filter(t => t.status === currentFilter);
  const headers = ['id', 'createdAt', 'name', 'email', 'subject', 'category', 'priority', 'urgent', 'status', 'description'];
  const rows = items.map(t => headers.map(h => csvCell(t[h])).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

function csvCell(val){
  const s = String(val === undefined || val === null ? '' : val).replace(/"/g, '""');
  return `"${s}"`;
}

// ---------- Chart ----------
function renderChart(){
  const days = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const counts = days.map(d => {
    const key = d.toDateString();
    return allTickets.filter(t => new Date(t.createdAt).toDateString() === key).length;
  });
  const max = Math.max(...counts, 1);
  const chart = document.getElementById('chart-by-day');
  chart.innerHTML = days.map((d, i) => `
    <div class="bar-chart-col">
      <div class="bar" style="height:${(counts[i] / max) * 100}%;" title="${counts[i]} tickets"></div>
      <div class="bar-label">${d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
    </div>
  `).join('');
}

function pillClass(status){
  if(status === 'open') return 'open';
  if(status === 'in-progress') return 'progress';
  return 'fixed';
}
function statusLabel(status){
  if(status === 'open') return 'Open';
  if(status === 'in-progress') return 'In progress';
  return 'Fixed';
}
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
