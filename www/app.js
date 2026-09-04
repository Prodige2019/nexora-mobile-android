// ============================================================
// NEXORA — Frontend SPA (vanilla JS, sans framework ni build).
// Choix volontaire : légèreté maximale pour tourner sur du
// matériel ancien (macOS 2011, Android entrée de gamme), et un
// seul fichier facile à embarquer dans un wrapper natif
// (Electron / Tauri / Capacitor) plus tard sans réécriture.
// ============================================================

// Stockage des données : 100% local sur l'appareil (IndexedDB, voir
// storage-local.js) — aucun serveur requis pour créer des projets, saisir
// des transactions, gérer le stock ou les états de besoin. Conforme à
// l'exigence du cahier des charges : "fonctionnement offline pour
// l'essentiel des fonctions". Seul l'assistant IA nécessite un serveur
// distant et une connexion (une IA ne peut pas tourner sur le téléphone).
function getServerUrl() {
  return localStorage.getItem('nexora_server_url') || '';
}
function setServerUrl(url) {
  localStorage.setItem('nexora_server_url', url.replace(/\/$/, ''));
}

const state = {
  projects: [],
  view: 'global', // 'global' | 'project' | 'about'
  currentProjectId: null,
  currentTab: 'dashboard', // dashboard | finances | stock | needs | chat
  online: navigator.onLine,
};

const ICONS = ['🏢', '🚜', '🔩', '🚗', '🛢️', '🪵', '🛠️', '🏪', '🧱', '🐄', '✂️', '📦'];
const COLORS = ['#2E6BE6', '#C9A24B', '#3FBF7F', '#E5533D', '#8B5CF6', '#E8A33D'];

// Toutes les opérations de données passent par localApi (IndexedDB).
// api.sendChatRemote / api.health restent les deux seules routes qui
// appellent un serveur distant, uniquement quand l'utilisateur ouvre le
// chat IA.
const api = window.localApi;

async function callAiServer(path, options = {}) {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    const err = new Error('NO_SERVER');
    err.code = 'NO_SERVER';
    throw err;
  }
  const res = await fetch(`${serverUrl}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur serveur (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}
api.sendChatRemote = (id, message) => callAiServer(`/projects/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) });
api.health = () => callAiServer('/health').catch(() => ({ aiConfigured: false, unreachable: true }));

// ---------------------------------------------------------------
// UI utils
// ---------------------------------------------------------------
function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = message;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function fmt(amount, currency = 'FCFA') {
  const n = Number(amount || 0);
  return `${n.toLocaleString('fr-FR')} ${currency}`;
}

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
}
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') closeModal();
});

function updateNetworkStatus() {
  state.online = navigator.onLine;
  const el = document.getElementById('network-status');
  const text = document.getElementById('network-status-text');
  el.classList.toggle('offline', !state.online);
  el.classList.toggle('online', state.online);
  text.textContent = state.online
    ? 'En ligne'
    : 'Hors-ligne — saisie/consultation OK, IA & sync indisponibles';
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// ---------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------
function renderSidebarNav() {
  const list = document.getElementById('project-nav-list');
  if (state.projects.length === 0) {
    list.innerHTML = `<div style="color:var(--text-faint); font-size:12.5px; padding:6px 8px;">Aucun projet encore</div>`;
    return;
  }
  list.innerHTML = state.projects
    .map(
      (p) => `
      <button class="project-nav-item ${state.view === 'project' && state.currentProjectId === p.id ? 'active' : ''}" data-id="${p.id}">
        <span class="icon-badge" style="background:${p.color}22; color:${p.color}">${p.icon}</span>
        <span class="name">${escapeHtml(p.name)}</span>
        ${p.stockAlerts > 0 ? '<span class="alert-dot" title="Alerte stock"></span>' : ''}
      </button>`
    )
    .join('');
  list.querySelectorAll('.project-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      openProject(btn.dataset.id);
      closeSidebar();
    });
  });
}

// ---------------------------------------------------------------
// Sidebar en tiroir (mobile) : ouverte/fermée via le bouton ☰ et l'overlay.
// ---------------------------------------------------------------
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('visible');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('visible');
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
}
document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);
document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);

document.getElementById('btn-global-dashboard').addEventListener('click', () => {
  state.view = 'global';
  render();
  closeSidebar();
});
document.getElementById('btn-about').addEventListener('click', () => {
  state.view = 'about';
  render();
  closeSidebar();
});
document.getElementById('btn-new-project').addEventListener('click', showNewProjectModal);

// ---------------------------------------------------------------
// Global dashboard
// ---------------------------------------------------------------
function renderGlobalDashboard() {
  const main = document.getElementById('main-content');

  if (state.projects.length === 0) {
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Vue d'ensemble</h1>
          <div class="page-subtitle">Pilotez tous vos business, un seul endroit.</div>
        </div>
      </div>
      <div class="empty-state">
        <div class="empty-icon">🗂️</div>
        <h3>Aucun projet pour le moment</h3>
        <p>Créez votre premier projet — ferme, quincaillerie, garage, ou toute autre activité.</p>
        <button class="btn btn-gold" onclick="showNewProjectModal()">+ Créer un projet</button>
      </div>`;
    return;
  }

  const totalBalance = state.projects.reduce((s, p) => s + p.balance, 0);
  const totalAlerts = state.projects.reduce((s, p) => s + p.stockAlerts, 0);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Vue d'ensemble</h1>
        <div class="page-subtitle">${state.projects.length} projet${state.projects.length > 1 ? 's' : ''} actif${state.projects.length > 1 ? 's' : ''}</div>
      </div>
      <button class="btn btn-gold" onclick="showNewProjectModal()">+ Nouveau projet</button>
    </div>

    <div class="grid grid-3" style="margin-bottom:8px;">
      <div class="card card-metric">
        <div class="metric-label">Bénéfice cumulé (tous projets)</div>
        <div class="metric-value ${totalBalance >= 0 ? 'positive' : 'negative'}">${fmt(totalBalance)}</div>
        <div class="metric-sub">Toutes périodes confondues</div>
      </div>
      <div class="card card-metric">
        <div class="metric-label">Projets actifs</div>
        <div class="metric-value">${state.projects.length}</div>
        <div class="metric-sub">Non archivés</div>
      </div>
      <div class="card card-metric">
        <div class="metric-label">Alertes stock</div>
        <div class="metric-value ${totalAlerts > 0 ? 'negative' : ''}">${totalAlerts}</div>
        <div class="metric-sub">Articles sous seuil critique</div>
      </div>
    </div>

    <div class="section-title">Vos projets</div>
    <div class="grid grid-3" id="project-cards"></div>
  `;

  const grid = document.getElementById('project-cards');
  grid.innerHTML = state.projects
    .map(
      (p) => `
    <div class="project-card" data-id="${p.id}">
      <div class="pc-top">
        <div class="pc-icon" style="background:${p.color}22; color:${p.color}">${p.icon}</div>
        <div>
          <div class="pc-name">${escapeHtml(p.name)}</div>
          <div class="pc-category">${escapeHtml(p.category)}</div>
        </div>
      </div>
      <div class="pc-balance ${p.balance >= 0 ? 'positive' : 'negative'}">${fmt(p.balance, p.currency)}</div>
      <div class="pc-footer">
        <span>Maj: ${new Date(p.lastActivity).toLocaleDateString('fr-FR')}</span>
        ${p.stockAlerts > 0 ? `<span class="pc-alert">⚠ ${p.stockAlerts} alerte(s)</span>` : '<span>Stock OK</span>'}
      </div>
    </div>`
    )
    .join('');
  grid.querySelectorAll('.project-card').forEach((c) => {
    c.addEventListener('click', () => openProject(c.dataset.id));
  });
}

// ---------------------------------------------------------------
// Project view
// ---------------------------------------------------------------
async function openProject(id) {
  state.view = 'project';
  state.currentProjectId = id;
  state.currentTab = 'dashboard';
  render();
}

function currentProject() {
  return state.projects.find((p) => p.id === state.currentProjectId);
}

async function renderProjectView() {
  const project = currentProject();
  const main = document.getElementById('main-content');
  if (!project) {
    state.view = 'global';
    render();
    return;
  }

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${project.icon} ${escapeHtml(project.name)}</h1>
        <div class="page-subtitle">${escapeHtml(project.category)} · devise ${project.currency}</div>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn-ghost" onclick="showEditProjectModal('${project.id}')">Modifier</button>
        <button class="btn-ghost" onclick="archiveProject('${project.id}')">Archiver</button>
        <button class="btn btn-danger" onclick="confirmDeleteProject('${project.id}')">Supprimer</button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${tabActive('dashboard')}" data-tab="dashboard">Tableau de bord</button>
      <button class="tab-btn ${tabActive('finances')}" data-tab="finances">Finances</button>
      <button class="tab-btn ${tabActive('stock')}" data-tab="stock">Stock</button>
      <button class="tab-btn ${tabActive('needs')}" data-tab="needs">États de besoin</button>
      <button class="tab-btn ${tabActive('chat')}" data-tab="chat">Assistant IA</button>
    </div>

    <div id="tab-content"></div>
  `;

  main.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentTab = btn.dataset.tab;
      renderProjectTab();
    });
  });

  await renderProjectTab();
}

function tabActive(tab) {
  return state.currentTab === tab ? 'active' : '';
}

async function renderProjectTab() {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.currentTab));
  const container = document.getElementById('tab-content');
  container.innerHTML = `<div style="color:var(--text-faint); padding:30px 0;">Chargement…</div>`;

  const project = currentProject();
  try {
    if (state.currentTab === 'dashboard') await renderTabDashboard(project, container);
    else if (state.currentTab === 'finances') await renderTabFinances(project, container);
    else if (state.currentTab === 'stock') await renderTabStock(project, container);
    else if (state.currentTab === 'needs') await renderTabNeeds(project, container);
    else if (state.currentTab === 'chat') await renderTabChat(project, container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Impossible de charger ces données.</div>`;
  }
}

// --- Tab: Dashboard ---
async function renderTabDashboard(project, container) {
  const data = await api.dashboard(project.id);
  const f = data.financials;
  const s = data.stock;

  container.innerHTML = `
    <div class="grid grid-4">
      <div class="card card-metric">
        <div class="metric-label">Revenus</div>
        <div class="metric-value positive">${fmt(f.totalIncome, project.currency)}</div>
      </div>
      <div class="card card-metric">
        <div class="metric-label">Dépenses</div>
        <div class="metric-value negative">${fmt(f.totalExpense, project.currency)}</div>
      </div>
      <div class="card card-metric">
        <div class="metric-label">Bénéfice / Marge brute</div>
        <div class="metric-value ${f.profit >= 0 ? 'positive' : 'negative'}">${fmt(f.profit, project.currency)}</div>
      </div>
      <div class="card card-metric">
        <div class="metric-label">Marge nette</div>
        <div class="metric-value">${f.netMarginPct}%</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px;">
      <div class="card">
        <div class="metric-label" style="margin-bottom:10px;">Valorisation du stock</div>
        <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:6px;">
          <span style="color:var(--text-muted);">Valeur d'achat</span><span>${fmt(s.buyValue, project.currency)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:6px;">
          <span style="color:var(--text-muted);">Valeur de vente potentielle</span><span>${fmt(s.sellValue, project.currency)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13.5px; font-weight:600;">
          <span>Marge potentielle</span><span class="${s.potentialMargin >= 0 ? 'positive' : 'negative'}" style="color:${s.potentialMargin >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(s.potentialMargin, project.currency)}</span>
        </div>
        ${s.lowStock.length > 0 ? `<div style="margin-top:12px; color:var(--danger); font-size:12.5px;">⚠ ${s.lowStock.length} article(s) sous le seuil d'alerte</div>` : ''}
      </div>
      <div class="card">
        <div class="metric-label" style="margin-bottom:10px;">États de besoin</div>
        <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:6px;">
          <span style="color:var(--text-muted);">À acheter</span><span>${data.needsCount.toBuy}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:6px;">
          <span style="color:var(--text-muted);">Commandé</span><span>${data.needsCount.ordered}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13.5px;">
          <span style="color:var(--text-muted);">Reçu</span><span>${data.needsCount.received}</span>
        </div>
      </div>
    </div>

    <div class="section-title">Transactions récentes</div>
    ${
      data.recentTransactions.length === 0
        ? `<div class="empty-state" style="padding:30px;">Aucune transaction encore.</div>`
        : `<table><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Type</th><th style="text-align:right;">Montant</th></tr></thead><tbody>
      ${data.recentTransactions
        .map(
          (t) => `<tr>
        <td>${new Date(t.date).toLocaleDateString('fr-FR')}</td>
        <td>${escapeHtml(t.label)}</td>
        <td>${escapeHtml(t.category)}</td>
        <td><span class="tag tag-${t.type}">${t.type === 'income' ? 'Revenu' : 'Dépense'}</span></td>
        <td style="text-align:right;">${fmt(t.amount, project.currency)}</td>
      </tr>`
        )
        .join('')}
      </tbody></table>`
    }
  `;
}

// --- Tab: Finances ---
async function renderTabFinances(project, container) {
  const data = await api.listTransactions(project.id);
  container.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn btn-gold" onclick="showNewTransactionModal('${project.id}')">+ Enregistrer une transaction</button>
    </div>
    ${
      data.transactions.length === 0
        ? `<div class="empty-state"><div class="empty-icon">💰</div><h3>Aucune transaction</h3><p>Enregistrez vos premières dépenses et revenus.</p></div>`
        : `<table><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Type</th><th style="text-align:right;">Montant</th><th></th></tr></thead><tbody>
        ${data.transactions
          .map(
            (t) => `<tr>
          <td>${new Date(t.date).toLocaleDateString('fr-FR')}</td>
          <td>${escapeHtml(t.label)}</td>
          <td>${escapeHtml(t.category)}</td>
          <td><span class="tag tag-${t.type}">${t.type === 'income' ? 'Revenu' : 'Dépense'}</span></td>
          <td style="text-align:right;">${fmt(t.amount, project.currency)}</td>
          <td style="text-align:right;"><button class="btn-ghost btn-sm" onclick="deleteTransaction('${project.id}', '${t.id}')">✕</button></td>
        </tr>`
          )
          .join('')}
        </tbody></table>`
    }
  `;
}

// --- Tab: Stock ---
async function renderTabStock(project, container) {
  const data = await api.listStock(project.id);
  container.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn btn-gold" onclick="showNewStockModal('${project.id}')">+ Ajouter un article</button>
    </div>
    ${
      data.items.length === 0
        ? `<div class="empty-state"><div class="empty-icon">📦</div><h3>Stock vide</h3><p>Ajoutez vos premiers articles pour suivre votre inventaire.</p></div>`
        : `<table><thead><tr><th>Article</th><th>Quantité</th><th>Seuil alerte</th><th>Prix achat</th><th>Prix vente</th><th>Fournisseur</th><th></th></tr></thead><tbody>
        ${data.items
          .map(
            (i) => `<tr>
          <td>${escapeHtml(i.name)}</td>
          <td class="${i.quantity <= i.alertThreshold ? 'row-danger-text' : ''}">${i.quantity}${i.quantity <= i.alertThreshold ? ' ⚠' : ''}</td>
          <td>${i.alertThreshold}</td>
          <td>${fmt(i.buyPrice, project.currency)}</td>
          <td>${fmt(i.sellPrice, project.currency)}</td>
          <td>${escapeHtml(i.supplier || '—')}</td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="btn-ghost btn-sm" onclick="showStockMovementModal('${project.id}', '${i.id}', 'in')">+ Entrée</button>
            <button class="btn-ghost btn-sm" onclick="showStockMovementModal('${project.id}', '${i.id}', 'out')">− Sortie</button>
            <button class="btn-ghost btn-sm" onclick="deleteStockItem('${project.id}', '${i.id}')">✕</button>
          </td>
        </tr>`
          )
          .join('')}
        </tbody></table>`
    }
  `;
}

// --- Tab: Needs ---
async function renderTabNeeds(project, container) {
  const needs = await api.listNeeds(project.id);
  const statusLabel = { to_buy: 'À acheter', ordered: 'Commandé', received: 'Reçu' };
  container.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn btn-gold" onclick="showNewNeedModal('${project.id}')">+ Ajouter un besoin</button>
    </div>
    ${
      needs.length === 0
        ? `<div class="empty-state"><div class="empty-icon">📋</div><h3>Aucun état de besoin</h3><p>Listez ce dont votre activité a besoin.</p></div>`
        : `<table><thead><tr><th>Élément</th><th>Coût estimé</th><th>Statut</th><th></th></tr></thead><tbody>
        ${needs
          .map(
            (n) => `<tr>
          <td>${escapeHtml(n.label)}</td>
          <td>${fmt(n.estimatedCost, project.currency)}</td>
          <td>
            <select onchange="updateNeedStatus('${project.id}', '${n.id}', this.value)" style="width:auto; padding:5px 8px; font-size:12px;">
              <option value="to_buy" ${n.status === 'to_buy' ? 'selected' : ''}>À acheter</option>
              <option value="ordered" ${n.status === 'ordered' ? 'selected' : ''}>Commandé</option>
              <option value="received" ${n.status === 'received' ? 'selected' : ''}>Reçu</option>
            </select>
          </td>
          <td style="text-align:right;"><button class="btn-ghost btn-sm" onclick="deleteNeed('${project.id}', '${n.id}')">✕</button></td>
        </tr>`
          )
          .join('')}
        </tbody></table>`
    }
  `;
}

// --- Tab: AI Chat ---
async function renderTabChat(project, container) {
  const messages = await api.listChat(project.id);
  const serverConfigured = Boolean(getServerUrl());
  const health = serverConfigured ? await api.health() : { aiConfigured: false, unreachable: true };

  let badge = '<span class="ai-mode-badge" style="background:rgba(232,163,61,0.15); color:var(--warning);">● Serveur IA non configuré</span>';
  if (serverConfigured && !health.unreachable && health.aiConfigured) badge = '<span class="ai-mode-badge">● IA connectée</span>';
  else if (serverConfigured && !health.unreachable) badge = '<span class="ai-mode-badge">● Mode démo (serveur joignable)</span>';
  else if (serverConfigured && health.unreachable) badge = '<span class="ai-mode-badge" style="background:rgba(229,83,61,0.15); color:var(--danger);">● Serveur IA injoignable</span>';

  const canChat = state.online && serverConfigured && !health.unreachable;

  container.innerHTML = `
    <div class="chat-wrap">
      <div style="margin-bottom:6px; display:flex; align-items:center; gap:10px;">
        ${badge}
        <button class="btn-ghost btn-sm" onclick="showServerSetupModal(false)">${serverConfigured ? 'Changer' : 'Configurer'} le serveur IA</button>
      </div>
      <div class="chat-messages" id="chat-messages">
        ${
          messages.length === 0
            ? `<div class="empty-state" style="padding:30px;"><div class="empty-icon">🤖</div><h3>Assistant IA de ${escapeHtml(project.name)}</h3><p>${serverConfigured ? 'Posez une question sur vos finances, votre stock ou votre stratégie.' : "L'assistant IA nécessite un serveur NEXORA accessible (voir « Configurer le serveur IA » ci-dessus). Vos données (projets, finances, stock) restent utilisables normalement sans lui."}</p></div>`
            : messages.map((m) => `<div class="chat-bubble ${m.role}">${escapeHtml(m.content)}</div>`).join('')
        }
      </div>
      <div class="chat-suggestions">
        <span class="chat-suggestion-chip" onclick="sendSuggestion('Quelle marge dois-je viser sur mes produits ?')">Quelle marge viser ?</span>
        <span class="chat-suggestion-chip" onclick="sendSuggestion('Aide-moi à faire un plan d\\'approvisionnement.')">Plan d'approvisionnement</span>
        <span class="chat-suggestion-chip" onclick="sendSuggestion('Rédige une accroche marketing courte pour ce projet.')">Idée marketing</span>
      </div>
      <div class="chat-input-row">
        <input type="text" id="chat-input" placeholder="${canChat ? 'Écrivez votre question…' : "Assistant IA indisponible (voir ci-dessus)"}" ${canChat ? '' : 'disabled'} />
        <button class="btn btn-gold" id="chat-send" ${canChat ? '' : 'disabled'}>Envoyer</button>
      </div>
    </div>
  `;

  const msgBox = document.getElementById('chat-messages');
  msgBox.scrollTop = msgBox.scrollHeight;

  document.getElementById('chat-send').addEventListener('click', () => sendChatMessage(project.id));
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage(project.id);
  });
}

window.sendSuggestion = (text) => {
  const input = document.getElementById('chat-input');
  if (!input || input.disabled) return;
  input.value = text;
  sendChatMessage(currentProject().id);
};

async function sendChatMessage(projectId) {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.disabled = true;
  document.getElementById('chat-send').disabled = true;

  const msgBox = document.getElementById('chat-messages');
  msgBox.insertAdjacentHTML('beforeend', `<div class="chat-bubble user">${escapeHtml(text)}</div>`);
  msgBox.insertAdjacentHTML('beforeend', `<div class="chat-bubble assistant" id="chat-typing">…</div>`);
  msgBox.scrollTop = msgBox.scrollHeight;

  await api.saveChatMessage(projectId, 'user', text);

  try {
    const res = await api.sendChatRemote(projectId, text);
    const replyText = res.assistantMessage.content;
    document.getElementById('chat-typing').outerHTML = `<div class="chat-bubble assistant">${escapeHtml(replyText)}</div>`;
    await api.saveChatMessage(projectId, 'assistant', replyText);
  } catch (err) {
    const msg = err.code === 'NO_SERVER'
      ? "Aucun serveur IA configuré. Utilisez « Configurer le serveur IA » ci-dessus."
      : "Impossible de joindre le serveur IA. Vérifiez la connexion et l'adresse configurée.";
    document.getElementById('chat-typing').outerHTML = `<div class="chat-bubble assistant" style="color:var(--danger);">⚠ ${msg}</div>`;
  } finally {
    msgBox.scrollTop = msgBox.scrollHeight;
    renderProjectTab(); // recharge le badge d'état
  }
}

// ---------------------------------------------------------------
// About view
// ---------------------------------------------------------------
function renderAboutView() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="about-hero">
      <img src="assets/logo.png" alt="NEXORA" />
      <div>
        <h1 class="page-title">NEXORA</h1>
        <div class="page-subtitle">Pilotez tous vos business, un seul endroit.</div>
      </div>
    </div>
    <div class="card" style="max-width:640px;">
      <p style="color:var(--text-muted); line-height:1.7; font-size:14px;">
        NEXORA est une application de gestion multi-entreprises assistée par IA,
        conçue pour l'entrepreneur qui pilote plusieurs activités indépendantes en parallèle :
        finances, marges, stock, états de besoin et stratégie, projet par projet.
      </p>
      <p style="color:var(--text-muted); line-height:1.7; font-size:14px;">
        Fonctionnement hors-ligne pour la saisie et la consultation ; synchronisation
        cloud et assistant IA disponibles en ligne.
      </p>
    </div>
    <div class="legal-footer">
      Développé par Sam Digital Pro Creator © Août 2026 — Tous droits réservés.<br/>
      +242 06 635-5053 — bricesam10@gmail.com
    </div>
  `;
}

// ---------------------------------------------------------------
// Modals: project CRUD
// ---------------------------------------------------------------
function showNewProjectModal() {
  openModal(`
    <h3>Nouveau projet</h3>
    <div class="form-group">
      <label>Nom du projet</label>
      <input type="text" id="np-name" placeholder="Ex : Quincaillerie Centrale" />
    </div>
    <div class="form-group">
      <label>Catégorie (libre)</label>
      <input type="text" id="np-category" placeholder="Ex : Commerce, Agriculture, Mécanique…" />
    </div>
    <div class="form-group">
      <label>Devise</label>
      <input type="text" id="np-currency" value="FCFA" />
    </div>
    <div class="form-group">
      <label>Icône</label>
      <div class="icon-picker" id="np-icon-picker">
        ${ICONS.map((ic, idx) => `<button type="button" data-icon="${ic}" class="${idx === 0 ? 'selected' : ''}">${ic}</button>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label>Couleur</label>
      <div class="icon-picker" id="np-color-picker">
        ${COLORS.map((c, idx) => `<button type="button" data-color="${c}" style="background:${c}${idx === 0 ? '; outline:2px solid #fff' : ''}"></button>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-gold" id="np-submit">Créer le projet</button>
    </div>
  `);

  let selectedIcon = ICONS[0];
  let selectedColor = COLORS[0];
  document.querySelectorAll('#np-icon-picker button').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('#np-icon-picker button').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      selectedIcon = b.dataset.icon;
    })
  );
  document.querySelectorAll('#np-color-picker button').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('#np-color-picker button').forEach((x) => (x.style.outline = 'none'));
      b.style.outline = '2px solid #fff';
      selectedColor = b.dataset.color;
    })
  );

  document.getElementById('np-submit').addEventListener('click', async () => {
    const name = document.getElementById('np-name').value.trim();
    if (!name) return toast('Le nom du projet est requis.', true);
    try {
      await api.createProject({
        name,
        category: document.getElementById('np-category').value.trim() || 'Général',
        currency: document.getElementById('np-currency').value.trim() || 'FCFA',
        icon: selectedIcon,
        color: selectedColor,
      });
      closeModal();
      toast('Projet créé.');
      await refreshProjects();
      render();
    } catch {}
  });
}

function showEditProjectModal(id) {
  const p = state.projects.find((x) => x.id === id);
  openModal(`
    <h3>Modifier le projet</h3>
    <div class="form-group"><label>Nom</label><input type="text" id="ep-name" value="${escapeAttr(p.name)}" /></div>
    <div class="form-group"><label>Catégorie</label><input type="text" id="ep-category" value="${escapeAttr(p.category)}" /></div>
    <div class="form-group"><label>Devise</label><input type="text" id="ep-currency" value="${escapeAttr(p.currency)}" /></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-gold" id="ep-submit">Enregistrer</button>
    </div>
  `);
  document.getElementById('ep-submit').addEventListener('click', async () => {
    try {
      await api.updateProject(id, {
        name: document.getElementById('ep-name').value.trim(),
        category: document.getElementById('ep-category').value.trim(),
        currency: document.getElementById('ep-currency').value.trim(),
      });
      closeModal();
      toast('Projet mis à jour.');
      await refreshProjects();
      render();
    } catch {}
  });
}

window.archiveProject = async (id) => {
  try {
    await api.updateProject(id, { archived: true });
    toast('Projet archivé.');
    state.view = 'global';
    await refreshProjects();
    render();
  } catch {}
};

window.confirmDeleteProject = (id) => {
  const p = state.projects.find((x) => x.id === id);
  openModal(`
    <h3>Supprimer "${escapeHtml(p.name)}" ?</h3>
    <p style="color:var(--text-muted); font-size:13.5px;">Cette action supprime définitivement toutes les données du projet (finances, stock, besoins, historique IA). Elle est irréversible.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-danger" id="del-submit">Supprimer définitivement</button>
    </div>
  `);
  document.getElementById('del-submit').addEventListener('click', async () => {
    try {
      await api.deleteProject(id);
      closeModal();
      toast('Projet supprimé.');
      state.view = 'global';
      await refreshProjects();
      render();
    } catch {}
  });
};

// ---------------------------------------------------------------
// Modals: transactions / stock / needs
// ---------------------------------------------------------------
function showNewTransactionModal(projectId) {
  openModal(`
    <h3>Nouvelle transaction</h3>
    <div class="form-group">
      <label>Type</label>
      <select id="tx-type"><option value="income">Revenu</option><option value="expense">Dépense</option></select>
    </div>
    <div class="form-group"><label>Libellé</label><input type="text" id="tx-label" placeholder="Ex : Vente de pièces détachées" /></div>
    <div class="form-row">
      <div class="form-group"><label>Montant</label><input type="number" id="tx-amount" placeholder="0" /></div>
      <div class="form-group"><label>Catégorie</label><input type="text" id="tx-category" placeholder="Ex : Vente, Achat, Transport…" /></div>
    </div>
    <div class="form-group"><label>Date</label><input type="date" id="tx-date" value="${new Date().toISOString().slice(0, 10)}" /></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-gold" id="tx-submit">Enregistrer</button>
    </div>
  `);
  document.getElementById('tx-submit').addEventListener('click', async () => {
    const amount = Number(document.getElementById('tx-amount').value);
    const label = document.getElementById('tx-label').value.trim();
    if (!label || !amount) return toast('Libellé et montant sont requis.', true);
    try {
      await api.createTransaction(projectId, {
        type: document.getElementById('tx-type').value,
        label,
        amount,
        category: document.getElementById('tx-category').value.trim() || 'Divers',
        date: document.getElementById('tx-date').value,
      });
      closeModal();
      toast('Transaction enregistrée.');
      await refreshProjects();
      renderProjectTab();
    } catch {}
  });
}

window.deleteTransaction = async (projectId, txId) => {
  try {
    await api.deleteTransaction(projectId, txId);
    toast('Transaction supprimée.');
    await refreshProjects();
    renderProjectTab();
  } catch {}
};

function showNewStockModal(projectId) {
  openModal(`
    <h3>Nouvel article de stock</h3>
    <div class="form-group"><label>Nom de l'article</label><input type="text" id="st-name" placeholder="Ex : Huile moteur 5W30" /></div>
    <div class="form-row">
      <div class="form-group"><label>Quantité initiale</label><input type="number" id="st-qty" value="0" /></div>
      <div class="form-group"><label>Seuil d'alerte</label><input type="number" id="st-threshold" value="0" /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Prix d'achat (unitaire)</label><input type="number" id="st-buy" value="0" /></div>
      <div class="form-group"><label>Prix de vente (unitaire)</label><input type="number" id="st-sell" value="0" /></div>
    </div>
    <div class="form-group"><label>Fournisseur (optionnel)</label><input type="text" id="st-supplier" /></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-gold" id="st-submit">Ajouter</button>
    </div>
  `);
  document.getElementById('st-submit').addEventListener('click', async () => {
    const name = document.getElementById('st-name').value.trim();
    if (!name) return toast("Le nom de l'article est requis.", true);
    try {
      await api.createStock(projectId, {
        name,
        quantity: document.getElementById('st-qty').value,
        alertThreshold: document.getElementById('st-threshold').value,
        buyPrice: document.getElementById('st-buy').value,
        sellPrice: document.getElementById('st-sell').value,
        supplier: document.getElementById('st-supplier').value.trim(),
      });
      closeModal();
      toast('Article ajouté.');
      await refreshProjects();
      renderProjectTab();
    } catch {}
  });
}

window.deleteStockItem = async (projectId, itemId) => {
  try {
    await api.deleteStock(projectId, itemId);
    toast('Article supprimé.');
    await refreshProjects();
    renderProjectTab();
  } catch {}
};

window.showStockMovementModal = (projectId, itemId, type) => {
  openModal(`
    <h3>${type === 'in' ? 'Entrée de stock' : 'Sortie de stock'}</h3>
    <div class="form-group"><label>Quantité</label><input type="number" id="mv-qty" placeholder="0" /></div>
    <div class="form-group"><label>Motif (optionnel)</label><input type="text" id="mv-reason" placeholder="Ex : Réapprovisionnement, Vente comptoir…" /></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-gold" id="mv-submit">Valider</button>
    </div>
  `);
  document.getElementById('mv-submit').addEventListener('click', async () => {
    const qty = Number(document.getElementById('mv-qty').value);
    if (!qty || qty <= 0) return toast('Quantité invalide.', true);
    try {
      await api.moveStock(projectId, itemId, { type, quantity: qty, reason: document.getElementById('mv-reason').value.trim() });
      closeModal();
      toast('Mouvement de stock enregistré.');
      await refreshProjects();
      renderProjectTab();
    } catch {}
  });
};

function showNewNeedModal(projectId) {
  openModal(`
    <h3>Nouvel état de besoin</h3>
    <div class="form-group"><label>Élément nécessaire</label><input type="text" id="nd-label" placeholder="Ex : Pièce moteur, palette de bois…" /></div>
    <div class="form-group"><label>Coût estimé</label><input type="number" id="nd-cost" value="0" /></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-gold" id="nd-submit">Ajouter</button>
    </div>
  `);
  document.getElementById('nd-submit').addEventListener('click', async () => {
    const label = document.getElementById('nd-label').value.trim();
    if (!label) return toast('Le libellé est requis.', true);
    try {
      await api.createNeed(projectId, { label, estimatedCost: document.getElementById('nd-cost').value });
      closeModal();
      toast('Besoin ajouté.');
      renderProjectTab();
    } catch {}
  });
}

window.updateNeedStatus = async (projectId, needId, status) => {
  try {
    await api.updateNeed(projectId, needId, { status });
    toast('Statut mis à jour.');
  } catch {}
};

window.deleteNeed = async (projectId, needId) => {
  try {
    await api.deleteNeed(projectId, needId);
    toast('Besoin supprimé.');
    renderProjectTab();
  } catch {}
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

// Expose functions used inline in generated HTML
window.showNewProjectModal = showNewProjectModal;
window.showEditProjectModal = showEditProjectModal;
window.showNewTransactionModal = showNewTransactionModal;
window.showNewStockModal = showNewStockModal;
window.showNewNeedModal = showNewNeedModal;
window.closeModal = closeModal;

// ---------------------------------------------------------------
// Render dispatcher + bootstrap
// ---------------------------------------------------------------
async function refreshProjects() {
  try {
    state.projects = await api.listProjects();
  } catch {
    state.projects = state.projects || [];
  }
}

function render() {
  renderSidebarNav();
  if (state.view === 'global') renderGlobalDashboard();
  else if (state.view === 'project') renderProjectView();
  else if (state.view === 'about') renderAboutView();
}

async function bootstrap() {
  updateNetworkStatus();
  await refreshProjects();
  render();
}

function showServerSetupModal(isFirstRun = false) {
  openModal(`
    <h3>Serveur de l'assistant IA</h3>
    <p style="color:var(--text-muted); font-size:13px; line-height:1.6;">
      Vos projets, finances, stock et états de besoin sont déjà utilisables
      sans serveur — tout est stocké directement sur cet appareil.
      Cette adresse sert uniquement à activer l'<strong>assistant IA</strong>
      (celui que vous lancez avec <code>npm start</code> dans le dossier
      backend, sur votre réseau local ou dans le cloud).
    </p>
    <div class="form-group">
      <label>Adresse du serveur (optionnel)</label>
      <input type="text" id="srv-url" placeholder="http://192.168.1.20:4000" value="${escapeAttr(getServerUrl())}" />
    </div>
    <div class="form-group">
      <button class="btn-ghost" id="srv-import" style="width:100%;" onclick="importFromServer()">
        📥 Importer les projets depuis ce serveur
      </button>
      <p style="color:var(--text-muted); font-size:12px; line-height:1.5; margin-top:6px;">
        Copie les projets, besoins, stock et transactions déjà présents sur ce serveur vers cet
        appareil (les projets déjà existants ici, même nom, sont ignorés — pas de doublon).
        Enregistrez d'abord l'adresse ci-dessus si ce n'est pas déjà fait.
      </p>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-gold" id="srv-submit">Enregistrer</button>
    </div>
  `);
  document.getElementById('srv-submit').addEventListener('click', async () => {
    const url = document.getElementById('srv-url').value.trim();
    setServerUrl(url);
    toast(url ? 'Serveur IA enregistré.' : 'Serveur IA désactivé.');
    if (state.view === 'project' && state.currentTab === 'chat') renderProjectTab();
  });
}
window.showServerSetupModal = showServerSetupModal;

// ---------------------------------------------------------------
// Import depuis un serveur NEXORA distant (ex: instance Render) vers le
// stockage local (IndexedDB) de cet appareil. Utile pour retrouver sur
// mobile des projets déjà créés côté desktop/serveur. Les données restent
// ensuite 100% locales sur le téléphone (pas de synchronisation continue).
// ---------------------------------------------------------------
async function importFromServer() {
  const serverUrl = getServerUrl();
  const btn = document.getElementById('srv-import');
  if (!serverUrl) {
    toast("Renseignez d'abord une adresse de serveur ci-dessus, puis Enregistrer.");
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Import en cours…'; }
  try {
    const remoteProjects = await fetch(`${serverUrl}/api/projects?includeArchived=true`).then((r) => {
      if (!r.ok) throw new Error(`Le serveur a répondu ${r.status}`);
      return r.json();
    });
    const localProjects = await api.listProjects();
    const existingNames = new Set(localProjects.map((p) => p.name.trim().toLowerCase()));

    let createdCount = 0, needCount = 0, stockCount = 0, txCount = 0, skipped = 0;

    for (const rp of remoteProjects) {
      if (existingNames.has(rp.name.trim().toLowerCase())) { skipped += 1; continue; }

      const localProject = await api.createProject({
        name: rp.name, category: rp.category, icon: rp.icon, color: rp.color, currency: rp.currency,
      });
      createdCount += 1;

      const needs = await fetch(`${serverUrl}/api/projects/${rp.id}/needs`).then((r) => (r.ok ? r.json() : []));
      for (const n of needs) {
        await api.createNeed(localProject.id, { label: n.label, estimatedCost: n.estimatedCost, status: n.status });
        needCount += 1;
      }

      const stockRes = await fetch(`${serverUrl}/api/projects/${rp.id}/stock`).then((r) => (r.ok ? r.json() : { items: [] }));
      for (const s of stockRes.items || []) {
        await api.createStock(localProject.id, {
          name: s.name, quantity: s.quantity, alertThreshold: s.alertThreshold,
          buyPrice: s.buyPrice, sellPrice: s.sellPrice, supplier: s.supplier,
        });
        stockCount += 1;
      }

      const txRes = await fetch(`${serverUrl}/api/projects/${rp.id}/transactions`).then((r) => (r.ok ? r.json() : { transactions: [] }));
      for (const t of txRes.transactions || []) {
        await api.createTransaction(localProject.id, {
          type: t.type, label: t.label, category: t.category, amount: t.amount, date: t.date,
        });
        txCount += 1;
      }
    }

    await refreshProjects();
    render();
    closeModal();
    toast(`Import terminé : ${createdCount} projet(s) ajouté(s) (${needCount} besoins, ${stockCount} stock, ${txCount} transactions). ${skipped} déjà présent(s).`);
  } catch (err) {
    toast(`Erreur d'import : ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 Importer les projets depuis ce serveur'; }
  }
}
window.importFromServer = importFromServer;

bootstrap();
