const API_BASE = '/.netlify/functions';

// ---------- Language ----------
const langSelect = document.getElementById('lang-select');
Object.keys(LANG_NAMES).forEach(code => {
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = LANG_NAMES[code];
  langSelect.appendChild(opt);
});
langSelect.value = localStorage.getItem('site_lang') || 'en';
langSelect.addEventListener('change', () => {
  localStorage.setItem('site_lang', langSelect.value);
  applyTranslations();
  if(!panelFixes.classList.contains('active') === false) renderFixes(allFixed);
});
applyTranslations();

// ---------- Site name ----------
fetch(`${API_BASE}/site-config`).then(r => r.ok ? r.json() : null).then(cfg => {
  if(cfg && cfg.siteName){
    document.getElementById('brand-name').textContent = cfg.siteName;
    document.getElementById('page-title').textContent = cfg.siteName;
  }
}).catch(() => {});

// ---------- Tabs ----------
const tabSubmit = document.getElementById('tab-submit');
const tabFixes = document.getElementById('tab-fixes');
const tabMyTickets = document.getElementById('tab-mytickets');
const panelSubmit = document.getElementById('panel-submit');
const panelFixes = document.getElementById('panel-fixes');
const panelMyTickets = document.getElementById('panel-mytickets');

function selectTab(which){
  [tabSubmit, tabFixes, tabMyTickets].forEach(t => t.setAttribute('aria-selected', 'false'));
  [panelSubmit, panelFixes, panelMyTickets].forEach(p => p.classList.remove('active'));
  if(which === 'submit'){ tabSubmit.setAttribute('aria-selected', 'true'); panelSubmit.classList.add('active'); }
  if(which === 'fixes'){ tabFixes.setAttribute('aria-selected', 'true'); panelFixes.classList.add('active'); loadFixes(); }
  if(which === 'mytickets'){ tabMyTickets.setAttribute('aria-selected', 'true'); panelMyTickets.classList.add('active'); }
}
tabSubmit.addEventListener('click', () => selectTab('submit'));
tabFixes.addEventListener('click', () => selectTab('fixes'));
tabMyTickets.addEventListener('click', () => selectTab('mytickets'));

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

// ---------- General fixes (with voting + outdated report) ----------
let allFixed = [];
const votedIds = JSON.parse(localStorage.getItem('voted_tickets') || '{}');
const reportedIds = JSON.parse(localStorage.getItem('reported_tickets') || '{}');

async function loadFixes(){
  const list = document.getElementById('fix-list');
  const empty = document.getElementById('fix-empty');
  list.innerHTML = '<div class="loading">Loading resolved tickets…</div>';
  try{
    const res = await fetch(`${API_BASE}/tickets?status=fixed&public=true`);
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
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'fix-item';
    const voted = votedIds[item.id];
    const reported = reportedIds[item.id];
    el.innerHTML = `
      <h3>${escapeHtml(item.subject)}</h3>
      <p>${escapeHtml(item.description)}</p>
      ${item.category ? `<div class="item-tags"><span class="item-tag">${escapeHtml(item.category)}</span></div>` : ''}
      <span class="tag">● Resolved ${item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</span>
      <div class="fix-actions">
        <button class="vote-btn ${voted === 'helpful' ? 'voted' : ''}" data-id="${item.id}" data-action="helpful" ${voted ? 'disabled' : ''}>👍 <span data-i18n="vote_helpful">${t('vote_helpful')}</span></button>
        <button class="vote-btn ${voted === 'unhelpful' ? 'voted' : ''}" data-id="${item.id}" data-action="unhelpful" ${voted ? 'disabled' : ''}>👎 <span data-i18n="vote_unhelpful">${t('vote_unhelpful')}</span></button>
        <span class="vote-count">${item.helpful || 0} / ${(item.helpful || 0) + (item.unhelpful || 0)}</span>
        <button class="report-btn" data-id="${item.id}" ${reported ? 'disabled' : ''}>${reported ? t('report_outdated_done') : t('report_outdated')}</button>
      </div>
    `;
    list.appendChild(el);
  });

  list.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', () => castVote(btn.dataset.id, btn.dataset.action));
  });
  list.querySelectorAll('.report-btn').forEach(btn => {
    btn.addEventListener('click', () => reportOutdated(btn.dataset.id));
  });
}

async function castVote(id, action){
  if(votedIds[id]) return;
  try{
    await fetch(`${API_BASE}/ticket-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action })
    });
    votedIds[id] = action;
    localStorage.setItem('voted_tickets', JSON.stringify(votedIds));
    loadFixes();
  }catch(e){ /* fail quietly */ }
}

async function reportOutdated(id){
  if(reportedIds[id]) return;
  try{
    await fetch(`${API_BASE}/ticket-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'outdated' })
    });
    reportedIds[id] = true;
    localStorage.setItem('reported_tickets', JSON.stringify(reportedIds));
    renderFixes(allFixed);
  }catch(e){ /* fail quietly */ }
}

document.getElementById('fix-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if(!q){ renderFixes(allFixed); return; }
  renderFixes(allFixed.filter(item =>
    item.subject.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q) ||
    (item.category || '').toLowerCase().includes(q)
  ));
});

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---------- Urgent field toggle ----------
const urgentCheckbox = document.getElementById('urgent');
const urgentWrap = document.getElementById('urgent-reason-wrap');
urgentCheckbox.addEventListener('change', () => {
  urgentWrap.classList.toggle('show', urgentCheckbox.checked);
  document.getElementById('urgent-reason').required = urgentCheckbox.checked;
});

// ---------- Description counter ----------
const descField = document.getElementById('description');
const descCount = document.getElementById('desc-count');
descField.addEventListener('input', () => { descCount.textContent = descField.value.length; });

// ---------- Attachment ----------
let attachmentData = null;
const attachInput = document.getElementById('attachment');
const attachPreview = document.getElementById('attach-preview');
attachInput.addEventListener('change', () => {
  const file = attachInput.files[0];
  attachmentData = null;
  attachPreview.innerHTML = '';
  if(!file) return;
  if(file.size > 3 * 1024 * 1024){
    attachPreview.textContent = 'File too large (3MB max) — not attached.';
    attachInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    attachmentData = { filename: file.name, contentType: file.type, dataBase64: base64 };
    attachPreview.innerHTML = `${escapeHtml(file.name)} attached`;
    if(file.type.startsWith('image/')){
      const img = document.createElement('img');
      img.src = reader.result;
      attachPreview.appendChild(img);
    }
  };
  reader.readAsDataURL(file);
});

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
    category: document.getElementById('category').value,
    priority: document.getElementById('priority').value,
    urgent: urgentCheckbox.checked,
    urgentReason: document.getElementById('urgent-reason').value.trim(),
    description: descField.value.trim(),
    attachment: attachmentData
  };

  try{
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('failed');
    formMsg.textContent = t('msg_success');
    formMsg.classList.add('show', 'ok');
    form.reset();
    urgentWrap.classList.remove('show');
    attachmentData = null;
    attachPreview.innerHTML = '';
    descCount.textContent = '0';
    loadCounts();
  }catch(err){
    formMsg.textContent = t('msg_error');
    formMsg.classList.add('show', 'err');
  }finally{
    submitBtn.disabled = false;
    submitBtn.textContent = t('btn_submit');
  }
});

// ---------- My tickets ----------
const myTicketsForm = document.getElementById('mytickets-form');
const myTicketsMsg = document.getElementById('mytickets-msg');

myTicketsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('mytickets-email').value.trim();
  myTicketsMsg.className = 'form-msg';
  try{
    await fetch(`${API_BASE}/my-tickets?action=request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    myTicketsMsg.textContent = t('mytickets_sent');
    myTicketsMsg.classList.add('show', 'ok');
  }catch(err){
    myTicketsMsg.textContent = t('msg_error');
    myTicketsMsg.classList.add('show', 'err');
  }
});

async function loadMyTicketsFromLink(){
  const params = new URLSearchParams(window.location.search);
  const email = params.get('tickets_email');
  const token = params.get('tickets_token');
  if(!email || !token) return;
  selectTab('mytickets');
  const listEl = document.getElementById('mytickets-list');
  listEl.innerHTML = '<div class="loading">Loading your tickets…</div>';
  try{
    const res = await fetch(`${API_BASE}/my-tickets?action=view&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`);
    if(!res.ok) throw new Error('failed');
    const tickets = await res.json();
    if(!tickets.length){
      listEl.innerHTML = '<div class="empty-state">No tickets found for this email.</div>';
      return;
    }
    listEl.innerHTML = tickets.map(item => `
      <div class="fix-item">
        <h3>${escapeHtml(item.subject)} <span class="status-pill ${item.status === 'fixed' ? 'fixed' : item.status === 'in-progress' ? 'progress' : 'open'}">${escapeHtml(item.status)}</span></h3>
        <p>${escapeHtml(item.description)}</p>
        <span class="tag">Submitted ${new Date(item.createdAt).toLocaleDateString()}</span>
      </div>
    `).join('');
  }catch(e){
    listEl.innerHTML = '<div class="empty-state">This link is invalid or has expired. Request a new one above.</div>';
  }
}

loadCounts();
loadMyTicketsFromLink();
