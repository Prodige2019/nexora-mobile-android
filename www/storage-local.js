// storage-local.js — Stockage 100% local sur l'appareil (IndexedDB).
//
// IndexedDB est disponible nativement dans toute WebView Android/iOS
// (Capacitor l'utilise directement, aucun plugin natif à compiler).
// Cette couche reproduit exactement la forme des réponses de l'API
// serveur (mêmes noms de champs, mêmes structures), pour que le reste de
// l'application (app.js) n'ait presque rien à changer.

const DB_NAME = 'nexora_local';
const DB_VERSION = 1;
const STORES = ['projects', 'transactions', 'stockItems', 'stockMovements', 'needs', 'chatMessages'];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          const os = db.createObjectStore(store, { keyPath: 'id' });
          if (store !== 'projects') os.createIndex('projectId', 'projectId', { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(storeName, filterFn) {
  const store = await tx(storeName);
  const all = await reqToPromise(store.getAll());
  return filterFn ? all.filter(filterFn) : all;
}
async function getOne(storeName, id) {
  const store = await tx(storeName);
  return reqToPromise(store.get(id));
}
async function put(storeName, obj) {
  const store = await tx(storeName, 'readwrite');
  await reqToPromise(store.put(obj));
  return obj;
}
async function remove(storeName, id) {
  const store = await tx(storeName, 'readwrite');
  await reqToPromise(store.delete(id));
}
async function removeWhere(storeName, filterFn) {
  const items = await getAll(storeName, filterFn);
  const store = await tx(storeName, 'readwrite');
  for (const item of items) await reqToPromise(store.delete(item.id));
}

function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}
function nowIso() {
  return new Date().toISOString();
}
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function computeFinancials(transactions) {
  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const grossMargin = income - expense;
  const netMarginPct = income > 0 ? (grossMargin / income) * 100 : 0;
  return {
    totalIncome: round2(income),
    totalExpense: round2(expense),
    grossMargin: round2(grossMargin),
    netMarginPct: round2(netMarginPct),
    profit: round2(grossMargin),
  };
}

function computeStockValuation(stockItems) {
  let buyValue = 0;
  let sellValue = 0;
  const lowStock = [];
  for (const item of stockItems) {
    buyValue += Number(item.quantity) * Number(item.buyPrice || 0);
    sellValue += Number(item.quantity) * Number(item.sellPrice || 0);
    if (Number(item.quantity) <= Number(item.alertThreshold || 0)) lowStock.push(item);
  }
  return { buyValue: round2(buyValue), sellValue: round2(sellValue), potentialMargin: round2(sellValue - buyValue), lowStock };
}

// -----------------------------------------------------------------
// API locale — mêmes signatures que l'objet `api` (backend distant),
// pour que app.js puisse utiliser l'une ou l'autre de façon transparente.
// -----------------------------------------------------------------
const localApi = {
  async listProjects() {
    const projects = await getAll('projects', (p) => !p.archived);
    const out = [];
    for (const p of projects) {
      const transactions = await getAll('transactions', (t) => t.projectId === p.id);
      const stockItems = await getAll('stockItems', (s) => s.projectId === p.id);
      const financials = computeFinancials(transactions);
      const stock = computeStockValuation(stockItems);
      const lastActivity = [...transactions, ...stockItems].map((x) => x.createdAt).sort().pop();
      out.push({ ...p, balance: financials.profit, stockAlerts: stock.lowStock.length, lastActivity: lastActivity || p.createdAt });
    }
    return out;
  },

  async createProject(data) {
    if (!data.name || !data.name.trim()) throw new Error('Le nom du projet est requis.');
    const project = {
      id: uid(),
      name: data.name.trim(),
      category: data.category || 'Général',
      color: data.color || '#2E6BE6',
      icon: data.icon || '🏢',
      currency: data.currency || 'FCFA',
      createdAt: nowIso(),
      archived: false,
    };
    return put('projects', project);
  },

  async updateProject(id, data) {
    const project = await getOne('projects', id);
    if (!project) throw new Error('Projet introuvable.');
    Object.assign(project, data);
    return put('projects', project);
  },

  async deleteProject(id) {
    await remove('projects', id);
    await removeWhere('transactions', (t) => t.projectId === id);
    await removeWhere('stockItems', (s) => s.projectId === id);
    await removeWhere('stockMovements', (m) => m.projectId === id);
    await removeWhere('needs', (n) => n.projectId === id);
    await removeWhere('chatMessages', (c) => c.projectId === id);
  },

  async dashboard(id) {
    const project = await getOne('projects', id);
    if (!project) throw new Error('Projet introuvable.');
    const transactions = await getAll('transactions', (t) => t.projectId === id);
    const stockItems = await getAll('stockItems', (s) => s.projectId === id);
    const needs = await getAll('needs', (n) => n.projectId === id);
    return {
      project,
      financials: computeFinancials(transactions),
      stock: computeStockValuation(stockItems),
      needsCount: {
        toBuy: needs.filter((n) => n.status === 'to_buy').length,
        ordered: needs.filter((n) => n.status === 'ordered').length,
        received: needs.filter((n) => n.status === 'received').length,
      },
      recentTransactions: transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
    };
  },

  async listTransactions(id) {
    const transactions = (await getAll('transactions', (t) => t.projectId === id)).sort((a, b) => new Date(b.date) - new Date(a.date));
    return { transactions, summary: computeFinancials(transactions) };
  },
  async createTransaction(id, data) {
    if (!['income', 'expense'].includes(data.type)) throw new Error("Le type doit être 'income' ou 'expense'.");
    if (!data.label || !data.amount) throw new Error('Le libellé et le montant sont requis.');
    const transaction = {
      id: uid(), projectId: id, type: data.type, label: data.label,
      category: data.category || 'Divers', amount: Number(data.amount),
      date: data.date || nowIso().slice(0, 10), createdAt: nowIso(),
    };
    return put('transactions', transaction);
  },
  async deleteTransaction(id, txId) { return remove('transactions', txId); },

  async listStock(id) {
    const items = await getAll('stockItems', (s) => s.projectId === id);
    return { items, valuation: computeStockValuation(items) };
  },
  async createStock(id, data) {
    if (!data.name) throw new Error("Le nom de l'article est requis.");
    const item = {
      id: uid(), projectId: id, name: data.name,
      quantity: Number(data.quantity || 0), alertThreshold: Number(data.alertThreshold || 0),
      buyPrice: Number(data.buyPrice || 0), sellPrice: Number(data.sellPrice || 0),
      supplier: data.supplier || '', createdAt: nowIso(),
    };
    return put('stockItems', item);
  },
  async deleteStock(id, itemId) { return remove('stockItems', itemId); },
  async moveStock(id, itemId, data) {
    if (!['in', 'out'].includes(data.type)) throw new Error("Le type doit être 'in' ou 'out'.");
    if (!data.quantity || Number(data.quantity) <= 0) throw new Error('La quantité doit être positive.');
    const item = await getOne('stockItems', itemId);
    if (!item) throw new Error('Article introuvable.');
    if (data.type === 'out' && Number(data.quantity) > item.quantity) throw new Error('Quantité en stock insuffisante.');
    item.quantity += data.type === 'in' ? Number(data.quantity) : -Number(data.quantity);
    await put('stockItems', item);
    const movement = {
      id: uid(), projectId: id, itemId, type: data.type, quantity: Number(data.quantity),
      reason: data.reason || '', date: nowIso(), createdAt: nowIso(),
    };
    await put('stockMovements', movement);
    return { movement, item };
  },

  async listNeeds(id) {
    return (await getAll('needs', (n) => n.projectId === id)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  async createNeed(id, data) {
    if (!data.label) throw new Error('Le libellé est requis.');
    const need = { id: uid(), projectId: id, label: data.label, estimatedCost: Number(data.estimatedCost || 0), status: data.status || 'to_buy', createdAt: nowIso() };
    return put('needs', need);
  },
  async updateNeed(id, needId, data) {
    const need = await getOne('needs', needId);
    if (!need) throw new Error('Élément introuvable.');
    Object.assign(need, data);
    return put('needs', need);
  },
  async deleteNeed(id, needId) { return remove('needs', needId); },

  // Chat: l'historique est stocké localement, mais générer une réponse IA
  // nécessite toujours un appel réseau vers un serveur NEXORA (l'IA ne peut
  // pas tourner sur le téléphone) — géré séparément dans app.js.
  async listChat(id) {
    return (await getAll('chatMessages', (c) => c.projectId === id)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },
  async saveChatMessage(id, role, content) {
    const msg = { id: uid(), projectId: id, role, content, createdAt: nowIso() };
    return put('chatMessages', msg);
  },
};

window.localApi = localApi;
window.__nexoraStorageMode = 'local'; // signal pour app.js : données 100% locales, pas de serveur requis
