const API_BASE = '/.netlify/functions';

// ---------- Tabs ----------
const tabSubmit = document.getElementById('tab-submit');
const tabFixes = document.getElementById('tab-fixes');
const panelSubmit = document.getElementById('panel-submit');
const panelFixes = document.getElementById('panel-fixes');

function selectTab(which){
  const submitActive = which === 'submit';
  tabSubmit.setAttribute('aria-selected', submitActive);
  tabFixes.setAttribute('aria-selected', !submitActive);
  panelSubmit.classList.toggle('active', submitActive);
  panelFixes.classList.toggle('active', !submitActive);
  if(!submitActive) loadFixes();
}
tabSubmit.addEventListener('click', () => selectTab('submit'));
tabFixes.addEventListener('click', () => selectTab('fixes'));

// ---------- Status counts ----------
async function loadCounts(){
  try{
    const res = await fetch(`${API_BASE}/tickets`);
    if(!res.ok) throw new Error('failed');
    const tickets = await res.json();
    const counts = { open: 0, progress: 0, fixed: 0 };
    tickets.forEach(t => {
      if(t.status === 'open') counts.open++;
      else if(t.status === 'in-progress') counts.progress++;
      else if(t.status === 'fixed') counts.fixed++;
    });
    document.getElementById('count-open').textContent = counts.open;
    document.getElementById('count-progress').textContent = counts.progress;
    document.getElementById('count-fixed').textContent = counts.fixed;
  }catch(e){
    document.getElementById('count-open').textContent = '–';
    document.getElementById('count-progress').textContent = '–';
    document.getElementById('count-fixed').textContent = '–';
  }
}

// ---------- General fixes ----------
let allFixed = [];

async function loadFixes(){
  const list = document.getElementById('fix-list');
  const empty = document.getElementById('fix-empty');
  list.innerHTML = '<div class="loading">Loading resolved tickets…</div>';
  try{
    const res = await fetch(`${API_BASE}/tickets?status=fixed`);
    if(!res.ok) throw new Error('failed');
    allFixed = await res.json();
    renderFixes(allFixed);
  }catch(e){
    list.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = "Couldn't load resolved tickets right now — try again shortly.";
  }
}

function renderFixes(items){
  const list = document.getElementById('fix-list');
  const empty = document.getElementById('fix-empty');
  list.innerHTML = '';
  if(!items.length){
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  items.forEach(t => {
    const item = document.createElement('div');
    item.className = 'fix-item';
    item.innerHTML = `
      <h3>${escapeHtml(t.subject)}</h3>
      <p>${escapeHtml(t.description)}</p>
      <span class="tag">● Resolved ${t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : ''}</span>
    `;
    list.appendChild(item);
  });
}

document.getElementById('fix-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if(!q){ renderFixes(allFixed); return; }
  renderFixes(allFixed.filter(t =>
    t.subject.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  ));
});

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Submit form ----------
const form = document.getElementById('ticket-form');
const submitBtn = document.getElementById('submit-btn');
const formMsg = document.getElementById('form-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';
  formMsg.className = 'form-msg';

  const payload = {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim(),
    subject: document.getElementById('subject').value.trim(),
    priority: document.getElementById('priority').value,
    description: document.getElementById('description').value.trim()
  };

  try{
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('failed');
    formMsg.textContent = "Ticket submitted — we'll take it from here.";
    formMsg.classList.add('show', 'ok');
    form.reset();
    loadCounts();
  }catch(err){
    formMsg.textContent = "Something went wrong submitting your ticket. Please try again.";
    formMsg.classList.add('show', 'err');
  }finally{
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit ticket';
  }
});

loadCounts();
