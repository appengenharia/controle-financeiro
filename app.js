// =========================
// Configuração da API
// =========================

const API_URL =
  'https://script.google.com/macros/s/AKfycbzILvsQK2SBM8yUKhlaX8pMdbUO6vU5ywc5ON_bt0sw1cGFyViWxv0AHadN7XpmUySmGA/exec';

// =========================
// Módulo principal (IIFE)
// =========================

const App = (() => {
  // --------- Estado ---------
  let TOKEN = '';
  let USER = null;
  let WORKS = [];
  let CATEGORIAS = [];
  let currentObraId = '';
  let lineChart = null;

  // --------- Utilitários ---------
  const $ = (id) => document.getElementById(id);

  const formatBRL = (value) =>
    Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

  const setMsg = (id, text, ok = false) => {
    const el = $(id);
    if (!el) return;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
    el.textContent = text || '';
  };

  const currentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // --------- API ---------
  async function api(action, payload = {}) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
    });

    if (!res.ok) throw new Error('Erro de comunicação.');

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erro.');
    return data.data;
  }

  // --------- UI helpers ---------
  function fillWorks() {
    const select = $('obraSelect');
    if (!select) return;
    select.innerHTML = '';
    (WORKS || []).forEach((obra) => {
      const o = document.createElement('option');
      o.value = obra.obra_id;
      o.textContent = obra.obra_nome
        ? `${obra.obra_id} — ${obra.obra_nome}`
        : obra.obra_id;
      select.appendChild(o);
    });
    if (currentObraId) select.value = currentObraId;
  }

  function fillCats() {
    const select = $('inpCat');
    if (!select) return;
    select.innerHTML = '';
    (CATEGORIAS || []).forEach((cat) => {
      const o = document.createElement('option');
      o.value = cat;
      o.textContent = cat;
      select.appendChild(o);
    });
  }

  function updateUserPill() {
    const pill = $('pillUser');
    if (!pill || !USER) return;
    const label = USER.role === 'ADMIN' ? 'ADMIN' : 'USUÁRIO';
    pill.textContent = `${label} • ${USER.username}`;
    pill.classList.remove('hidden');
    const btnLogout = $('btnLogout');
    if (btnLogout) btnLogout.classList.remove('hidden');
  }

  function applyRoleUI() {
    const isAdmin = USER && USER.role === 'ADMIN';
    const adminArea = $('adminArea');
    if (isAdmin) {
      if (adminArea) adminArea.classList.remove('hidden');
    } else {
      if (adminArea) adminArea.classList.add('hidden');
    }
  }

  function togglePass(id) {
    const el = $(id);
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
  }

  // --------- Login ---------
  async function login() {
    setMsg('loginMsg', '');
    const btn = $('btnLogin');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

    try {
      const roleVal = $('loginRole').value;
      const role = roleVal === 'ADMIN' ? 'ADMIN' : 'USER';
      const username = $('loginUser').value.trim();
      const password = $('loginPass').value;

      const result = await api('auth.login', { role, username, password });

      TOKEN = result.token;
      USER = result.user;
      WORKS = result.works || [];
      CATEGORIAS = result.categorias || [];

      updateUserPill();
      applyRoleUI();

      if (USER.primeiro_acesso && USER.role === 'USER') {
        $('loginArea').classList.add('hidden');
        $('pwArea').classList.remove('hidden');
        return;
      }

      await initApp();
    } catch (e) {
      setMsg('loginMsg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
  }

  async function changePassword() {
    setMsg('pwMsg', '');
    const btn = $('btnSavePw');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      const p1 = $('pw1').value;
      const p2 = $('pw2').value;
      if (!p1 || p1.length < 4) throw new Error('Senha muito curta.');
      if (p1 !== p2) throw new Error('As senhas não conferem.');

      await api('auth.changePassword', { token: TOKEN, newPassword: p1 });
      const me = await api('auth.me', { token: TOKEN });
      USER = me.user;
      WORKS = me.works || WORKS;
      CATEGORIAS = me.categorias || CATEGORIAS;

      $('pwArea').classList.add('hidden');
      await initApp();
    } catch (e) {
      setMsg('pwMsg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    }
  }

  async function logout() {
    const btn = $('btnLogout');
    if (btn) { btn.disabled = true; btn.textContent = 'Saindo...'; }
    try {
      if (TOKEN) await api('auth.logout', { token: TOKEN });
    } catch (_) {}
    finally { location.reload(); }
  }

  // --------- Init app ---------
  async function initApp() {
    const init = await api('app.init', { token: TOKEN });

    WORKS = init.works || WORKS;
    CATEGORIAS = init.categorias || CATEGORIAS;
    currentObraId = init.primaryObraId || (WORKS[0]?.obra_id || '');

    fillWorks();
    fillCats();

    $('fMes').value = init.initialMonthRef || currentMonth();
    $('loginArea').classList.add('hidden');
    $('pwArea').classList.add('hidden');
    $('appArea').classList.remove('hidden');

    applyRoleUI();

    if (USER.role === 'ADMIN') {
      adminTab('users');
    }

    if (init.initialSummary && init.initialSeries && currentObraId) {
      applySummaryAndSeries(init.initialSummary, init.initialSeries);
    } else {
      await refreshAll();
    }
  }

  // --------- Dashboard ---------
  function applySummaryAndSeries(summary, series) {
    $('kTotal').textContent = formatBRL(summary.totalGeral);
    $('kStatus').textContent = summary.isClosed ? 'FECHADO' : 'ABERTO';
    $('kTop').textContent = summary.maiorCategoria || '-';
    $('kBottom').textContent = summary.menorCategoria || '-';

    const tbody = $('tbResumo');
    tbody.innerHTML = '';
    (CATEGORIAS || []).forEach((cat) => {
      const v = Number(summary.totals?.[cat] || 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><b>${cat}</b></td><td>${formatBRL(v)}</td>`;
      tbody.appendChild(tr);
    });

    const labels = (series.points || []).map((p) => p.date);
    const values = (series.points || []).map((p) => Number(p.total || 0));

    if (lineChart) lineChart.destroy();
    const ctx = $('chartLine');
    lineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ data: values, tension: 0.25 }],
      },
      options: { plugins: { legend: { display: false } } },
    });
  }

  async function refreshAll() {
    try {
      const monthRef = $('fMes').value || currentMonth();
      if (!currentObraId) return;
      const sum = await api('dash.summary', { token: TOKEN, monthRef, obra_id: currentObraId });
      const series = await api('dash.series', { token: TOKEN, monthRef, obra_id: currentObraId });
      applySummaryAndSeries(sum, series);
    } catch (_) {}
  }

  function onChangeObra() {
    currentObraId = $('obraSelect').value;
    refreshAll();
  }

  // --------- Despesas ---------
  async function registerExpense() {
    setMsg('msg', '');
    const btn = $('btnSaveExpense');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      const data = $('inpData').value;
      const categoria = $('inpCat').value;
      const detalhes = $('inpDet').value.trim();
      const reembolsavel = $('inpReemb').value;
      const rawValor = $('inpVal').value || '';
      const valor = Number(rawValor.replace(/\./g, '').replace(',', '.'));

      if (!currentObraId || !data || !categoria || !detalhes || !(valor > 0)) {
        throw new Error('Preencha todos os campos corretamente.');
      }

      await api('expense.create', {
        token: TOKEN,
        payload: {
          obra_id: currentObraId,
          data,
          categoria,
          detalhes,
          valor,
          reembolsavel,
          nota_file_id: '',
          nota_url: '',
        },
      });

      $('inpDet').value = '';
      $('inpVal').value = '';
      setMsg('msg', 'Registrado com sucesso.', true);
      await refreshAll();
    } catch (e) {
      setMsg('msg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Registrar'; }
    }
  }

  // --------- PDF ---------
  async function printPdf() {
    const btn = $('btnPrintPdf');
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }

    try {
      const monthRef = $('fMes').value || currentMonth();
      const result = await api('report.pdf', { token: TOKEN, monthRef, obra_id: currentObraId });
      window.open(result.fileUrl, '_blank');
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Imprimir PDF'; }
    }
  }

  // =========================
  // ADMIN — Abas
  // =========================

  function adminTab(tabName) {
    const tabs = ['users', 'works', 'alloc', 'emails', 'config', 'month'];
    tabs.forEach((name) => {
      const el = $(`adm_${name}`);
      const btn = $(`tab_${name}`);
      if (el) el.classList.toggle('hidden', name !== tabName);
      if (btn) btn.classList.toggle('tab-active', name === tabName);
    });

    if (tabName === 'users') loadAdminUsers();
    if (tabName === 'works') loadAdminWorks();
    if (tabName === 'alloc') loadAdminAlloc();
  }

  // --------- Aba Usuários ---------
  async function loadAdminUsers() {
    const tbody = $('admUsersTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

    try {
      const result = await api('admin.users.list', { token: TOKEN });
      const users = result.users || [];

      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Nenhum usuário cadastrado.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      users.forEach((u) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${u.username}</td>
          <td>${u.nome || '-'}</td>
          <td>${u.role}</td>
          <td>
            <button class="btn btn-sm" onclick="App.resetUserPassword('${u.username}')">Reset senha</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteUser('${u.username}')">Excluir</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="err">${e.message}</td></tr>`;
    }
  }

  async function saveAdminUser() {
    setMsg('admUsersMsg', '');
    const btn = $('btnSaveUser');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      const username = $('admUsername').value.trim();
      const nome = $('admNome').value.trim();
      const email = $('admEmail').value.trim();
      const role = $('admRole').value;

      if (!username || !nome || !email) {
        throw new Error('Preencha usuário, nome e email.');
      }

      await api('admin.users.upsert', {
        token: TOKEN,
        payload: { username, nome, email, role },
      });

      $('admUsername').value = '';
      $('admNome').value = '';
      $('admEmail').value = '';
      $('admRole').value = 'USER';

      setMsg('admUsersMsg', 'Usuário salvo. Senha padrão: user123', true);
      await loadAdminUsers();
    } catch (e) {
      setMsg('admUsersMsg', e.message || String(e));
    
