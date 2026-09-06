const API_BASE = '/.netlify/functions';

// The PIN gate below is a convenience lock on the front end only — anyone
// could read this file's source and see the code. Real protection happens
// server-side: every status-change request is checked against ADMIN_CODE
// on the server (see netlify/functions/ticket-update.js), so a visitor who
// bypasses this screen still can't modify tickets without the right code.
const CLIENT_PIN = '2012';

let adminCode = '';
let allTickets = [];
let currentFilter = 'all';

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const gateCode = document.getElementById('gate-code');
const gateErr = document.getElementById('gate-err');
const adminShell = document.getElementById('admin-shell');

gateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = gateCode.value.trim();
  if(val === CLIENT_PIN){
    adminCode = val;
    gate.style.display = 'none';
    adminShell.classList.add('active');
    loadTickets();
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
  [...document.querySelectorAll('#admin-filters button')].forEach(b =>
    b.setAttribute('aria-selected', b === btn)
  );
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
  }catch(e){
    wrap.innerHTML = '<div class="loading">Could not load tickets. Try refreshing.</div>';
  }
}

function render(){
  const wrap = document.getElementById('table-wrap');
  const items = currentFilter === 'all'
    ? allTickets
    : allTickets.filter(t => t.status === currentFilter);

  if(!items.length){
    wrap.innerHTML = '<div class="empty-state">No tickets in this view.</div>';
    return;
  }

  const rows = items.map(t => `
    <tr>
      <td>${new Date(t.createdAt).toLocaleDateString()}</td>
      <td>${escapeHtml(t.name)}<br><span style="color:var(--slate)">${escapeHtml(t.email)}</span></td>
      <td>${escapeHtml(t.subject)}</td>
      <td class="desc">${escapeHtml(t.description)}</td>
      <td>${escapeHtml(t.priority || 'normal')}</td>
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
      <thead>
        <tr>
          <th>Date</th><th>From</th><th>Subject</th><th>Details</th><th>Priority</th><th>Status</th><th>Update</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => updateStatus(sel.dataset.id, sel.value));
  });
}

async function updateStatus(id, status){
  try{
    const res = await fetch(`${API_BASE}/ticket-update`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': adminCode
      },
      body: JSON.stringify({ id, status })
    });
    if(!res.ok) throw new Error('failed');
    const ticket = allTickets.find(t => t.id === id);
    if(ticket){ ticket.status = status; ticket.updatedAt = new Date().toISOString(); }
    render();
  }catch(e){
    alert("Couldn't update that ticket. Try again.");
    loadTickets();
  }
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
