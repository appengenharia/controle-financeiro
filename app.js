const API_URL =
  'https://script.google.com/macros/s/AKfycbzILvsQK2SBM8yUKhlaX8pMdbUO6vU5ywc5ON_bt0sw1cGFyViWxv0AHadN7XpmUySmGA/exec';

const App = (() => {
  let TOKEN = '';
  let USER = null;
  let WORKS = [];
  let CATEGORIAS = [];
  let currentObraId = '';
  let lineChart = null;

  const $ = (id) => document.getElementById(id);

  const formatBRL = (v) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
    pill.textContent = `${USER.role === 'ADMIN' ? 'ADMIN' : 'USUÁRIO'} • ${USER.username}`;
    pill.classList.remove('hidden');
    const btnLogout = $('btnLogout');
    if (btnLogout) btnLogout.classList.remove('hidden');
  }

  function applyRoleUI() {
    const isAdmin = USER && USER.role === 'ADMIN';
    const adminArea = $('adminArea');
    if (adminArea) {
      if (isAdmin) {
        adminArea.classList.remove('hidden');
      } else {
        adminArea.classList.add('hidden');
      }
    }
  }

  function togglePass(id) {
    const el = $(id);
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
  }

  async function login() {
    setMsg('loginMsg', '');
    const btn = $('btnLogin');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
    try {
      const role = $('loginRole').value === 'ADMIN' ? 'ADMIN' : 'USER';
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
    if (USER.role === 'ADMIN') adminTab('users');
    if (init.initialSummary && init.initialSeries && currentObraId) {
      applySummaryAndSeries(init.initialSummary, init.initialSeries);
    } else {
      await refreshAll();
    }
  }

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
    lineChart = new Chart($('chartLine'), {
      type: 'line',
      data: { labels, datasets: [{ data: values, tension: 0.25 }] },
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
          obra_id: currentObraId, data, categoria,
          detalhes, valor, reembolsavel,
          nota_file_id: '', nota_url: '',
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

  // FIM DA PARTE 1
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

  // --- Usuários ---

  async function loadAdminUsers() {
    const tbody = $('admUsersTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
    try {
      const result = await api('admin.users.list', { token: TOKEN });
      const users = result.users || [];
      if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="4">Nenhum usuário.</td></tr>';
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
            <button class="btn btn-sm" onclick="App.resetUserPassword('${u.username}')">Reset</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteUser('${u.username}')">Excluir</button>
          </td>`;
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
      if (!username || !nome || !email) throw new Error('Preencha usuário, nome e email.');
      await api('admin.users.upsert', { token: TOKEN, payload: { username, nome, email, role } });
      $('admUsername').value = '';
      $('admNome').value = '';
      $('admEmail').value = '';
      $('admRole').value = 'USER';
      setMsg('admUsersMsg', 'Usuário salvo. Senha padrão: user123', true);
      await loadAdminUsers();
    } catch (e) {
      setMsg('admUsersMsg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar usuário'; }
    }
  }

  async function resetUserPassword(username) {
    if (!confirm(`Resetar senha de "${username}" para user123?`)) return;
    try {
      await api('admin.users.resetPassword', { token: TOKEN, username });
      setMsg('admUsersMsg', `Senha de ${username} resetada para user123.`, true);
    } catch (e) {
      setMsg('admUsersMsg', e.message || String(e));
    }
  }

  async function deleteUser(username) {
    if (!confirm(`Excluir usuário "${username}"? Não pode ser desfeito.`)) return;
    try {
      await api('admin.users.delete', { token: TOKEN, username });
      setMsg('admUsersMsg', `Usuário ${username} excluído.`, true);
      await loadAdminUsers();
    } catch (e) {
      setMsg('admUsersMsg', e.message || String(e));
    }
  }

  // --- Obras ---

  async function loadAdminWorks() {
    const tbody = $('admWorksTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';
    try {
      const result = await api('admin.works.list', { token: TOKEN });
      const works = result.works || [];
      if (!works.length) {
        tbody.innerHTML = '<tr><td colspan="3">Nenhuma obra.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      works.forEach((w) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${w.obra_id}</td>
          <td>${w.obra_nome || '-'}</td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="App.deleteWork('${w.obra_id}')">Excluir</button>
          </td>`;
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="err">${e.message}</td></tr>`;
    }
  }

  async function saveAdminWork() {
    setMsg('admWorksMsg', '');
    const btn = $('btnSaveWork');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const obra_id = $('admWorkId').value.trim();
      const obra_nome = $('admWorkNome').value.trim();
      if (!obra_id || !obra_nome) throw new Error('Preencha ID e nome da obra.');
      await api('admin.works.upsert', { token: TOKEN, payload: { obra_id, obra_nome } });
      $('admWorkId').value = '';
      $('admWorkNome').value = '';
      setMsg('admWorksMsg', 'Obra salva.', true);
      await loadAdminWorks();
    } catch (e) {
      setMsg('admWorksMsg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar obra'; }
    }
  }

  async function deleteWork(obra_id) {
    if (!confirm(`Excluir obra "${obra_id}"? Não pode ser desfeito.`)) return;
    try {
      await api('admin.works.delete', { token: TOKEN, obra_id });
      setMsg('admWorksMsg', `Obra ${obra_id} excluída.`, true);
      await loadAdminWorks();
    } catch (e) {
      setMsg('admWorksMsg', e.message || String(e));
    }
  }

  // --- Alocação ---

  async function loadAdminAlloc() {
    const tbody = $('admAllocTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';
    try {
      const result = await api('admin.alloc.list', { token: TOKEN });
      const allocs = result.allocs || [];
      if (!allocs.length) {
        tbody.innerHTML = '<tr><td colspan="3">Nenhuma alocação.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      allocs.forEach((a) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${a.username}</td>
          <td>${a.obra_id}</td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="App.deleteAlloc('${a.username}','${a.obra_id}')">Remover</button>
          </td>`;
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="err">${e.message}</td></tr>`;
    }
  }

  async function saveAdminAlloc() {
    setMsg('admAllocMsg', '');
    const btn = $('btnSaveAlloc');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const username = $('admAllocUser').value.trim();
      const obra_id = $('admAllocObra').value.trim();
      if (!username || !obra_id) throw new Error('Preencha usuário e obra.');
      await api('admin.alloc.add', { token: TOKEN, payload: { username, obra_id } });
      $('admAllocUser').value = '';
      $('admAllocObra').value = '';
      setMsg('admAllocMsg', 'Alocação salva.', true);
      await loadAdminAlloc();
    } catch (e) {
      setMsg('admAllocMsg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Alocar'; }
    }
  }

  async function deleteAlloc(username, obra_id) {
    if (!confirm(`Remover ${username} da obra ${obra_id}?`)) return;
    try {
      await api('admin.alloc.remove', { token: TOKEN, payload: { username, obra_id } });
      setMsg('admAllocMsg', 'Alocação removida.', true);
      await loadAdminAlloc();
    } catch (e) {
      setMsg('admAllocMsg', e.message || String(e));
    }
  }

  // --- Emails ---

  async function saveAdminEmails() {
    setMsg('admEmailsMsg', '');
    const btn = $('btnSaveEmails');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const emails = $('admEmailsList').value.trim();
      if (!emails) throw new Error('Informe ao menos um email.');
      await api('admin.config.setEmails', { token: TOKEN, emails });
      setMsg('admEmailsMsg', 'Emails salvos.', true);
    } catch (e) {
      setMsg('admEmailsMsg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar emails'; }
    }
  }

  // --- Config / Logo ---

  async function saveAdminConfig() {
    setMsg('admConfigMsg', '');
    const btn = $('btnSaveConfig');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const empresa = $('admEmpresa').value.trim();
      const logoUrl = $('admLogoUrl').value.trim();
      if (!empresa) throw new Error('Informe o nome da empresa.');
      await api('admin.config.set', { token: TOKEN, payload: { empresa, logoUrl } });
      setMsg('admConfigMsg', 'Configurações salvas.', true);
    } catch (e) {
      setMsg('admConfigMsg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar config'; }
    }
  }

  // --- Fechamento de mês ---

  async function closeMonth() {
    setMsg('admMonthMsg', '');
    const btn = $('btnCloseMonth');
    if (btn) { btn.disabled = true; btn.textContent = 'Fechando...'; }
    try {
      const monthRef = $('admMonthRef').value;
      const obra_id = $('admMonthObra').value.trim();
      if (!monthRef) throw new Error('Selecione o mês.');
      await api('admin.month.close', { token: TOKEN, monthRef, obra_id });
      setMsg('admMonthMsg', `Mês ${monthRef} fechado.`, true);
    } catch (e) {
      setMsg('admMonthMsg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Fechar mês'; }
    }
  }

  async function reopenMonth() {
    setMsg('admMonthMsg', '');
    const btn = $('btnReopenMonth');
    if (btn) { btn.disabled = true; btn.textContent = 'Reabrindo...'; }
    try {
      const monthRef = $('admMonthRef').value;
      const obra_id = $('admMonthObra').value.trim();
      if (!monthRef) throw new Error('Selecione o mês.');
      await api('admin.month.reopen', { token: TOKEN, monthRef, obra_id });
      setMsg('admMonthMsg', `Mês ${monthRef} reaberto.`, true);
    } catch (e) {
      setMsg('admMonthMsg', e.message || String(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Reabrir mês'; }
    }
  }

  // =========================
  // Service Worker (offline)
  // =========================

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    });
  }

  // =========================
  // API pública
  // =========================

  return {
    login,
    changePassword,
    togglePass,
    registerExpense,
    refreshAll,
    onChangeObra,
    printPdf,
    logout,
    adminTab,
    saveAdminUser,
    resetUserPassword,
    deleteUser,
    saveAdminWork,
    deleteWork,
    saveAdminAlloc,
    deleteAlloc,
    saveAdminEmails,
    saveAdminConfig,
    closeMonth,
    reopenMonth,
  };
})();
