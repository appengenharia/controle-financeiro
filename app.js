/* =========================
 * Configuração
 * ========================= */

const API_URL = 'https://twilight-firefly-1225.josimar-rrocha.workers.dev';

/* =========================
 * Módulo principal da aplicação (IIFE)
 * ========================= */

const App = (() => {
  /* --------- Estado interno --------- */
  let TOKEN = '';
  let USER = null;
  let WORKS = [];
  let CATEGORIAS = [];
  let currentObraId = '';
  let lineChart = null;

  /* --------- Utilitários --------- */
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
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  /* --------- Comunicação com API --------- */
  async function api(action, payload = {}) {
    if (!API_URL || API_URL.includes('COLE_AQUI')) {
      throw new Error('Configure a API_URL no app.js.');
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({ action, ...payload }),
    });

    if (!res.ok) {
      throw new Error('Erro de comunicação.');
    }

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || 'Erro.');
    }

    return data.data;
  }

  /* --------- Preenchimento de selects / UI --------- */

  function fillWorks() {
    const select = $('obraSelect');
    select.innerHTML = '';

    (WORKS || []).forEach((obra) => {
      const option = document.createElement('option');
      option.value = obra.obra_id;
      option.textContent = obra.obra_nome
        ? `${obra.obra_id} — ${obra.obra_nome}`
        : obra.obra_id;
      select.appendChild(option);
    });

    if (currentObraId) {
      select.value = currentObraId;
    }
  }

  function fillCats() {
    const select = $('inpCat');
    select.innerHTML = '';

    (CATEGORIAS || []).forEach((categoria) => {
      const option = document.createElement('option');
      option.value = categoria;
      option.textContent = categoria;
      select.appendChild(option);
    });
  }

  /* --------- Autenticação --------- */

  async function login() {
    setMsg('loginMsg', '');

    try {
      const role = $('loginRole').value;
      const username = $('loginUser').value.trim();
      const password = $('loginPass').value;

      const result = await api('auth.login', {
        role,
        username,
        password,
      });

      TOKEN = result.token;
      USER = result.user;
      WORKS = result.works || [];
      CATEGORIAS = result.categorias || [];

      const pillUser = $('pillUser');
      pillUser.textContent = `${USER.role} • ${USER.username}`;
      pillUser.classList.remove('hidden');

      $('btnLogout').classList.remove('hidden');

      if (USER.primeiro_acesso) {
        $('loginArea').classList.add('hidden');
        $('pwArea').classList.remove('hidden');
        return;
      }

      await initApp();
    } catch (e) {
      setMsg('loginMsg', e.message || String(e));
    }
  }

  async function changePassword() {
    setMsg('pwMsg', '');

    try {
      const p1 = $('pw1').value;
      const p2 = $('pw2').value;

      if (!p1 || p1.length < 4) {
        throw new Error('Senha muito curta.');
      }

      if (p1 !== p2) {
        throw new Error('As senhas não conferem.');
      }

      await api('auth.changePassword', {
        token: TOKEN,
        newPassword: p1,
      });

      const me = await api('auth.me', { token: TOKEN });

      USER = me.user;
      WORKS = me.works || WORKS;
      CATEGORIAS = me.categorias || CATEGORIAS;

      $('pwArea').classList.add('hidden');
      await initApp();
    } catch (e) {
      setMsg('pwMsg', e.message || String(e));
    }
  }

  async function logout() {
    try {
      if (TOKEN) {
        await api('auth.logout', { token: TOKEN });
      }
    } catch (_e) {
      // silencioso
    }

    location.reload();
  }

  /* --------- Inicialização da aplicação --------- */

  async function initApp() {
    const initData = await api('app.init', { token: TOKEN });

    WORKS = initData.works || WORKS;
    CATEGORIAS = initData.categorias || CATEGORIAS;

    currentObraId = WORKS[0]?.obra_id || '';

    fillWorks();
    fillCats();

    $('fMes').value = currentMonth();

    $('loginArea').classList.add('hidden');
    $('pwArea').classList.add('hidden');
    $('appArea').classList.remove('hidden');

    if (USER.role === 'ADMIN') {
      $('btnAdmin').classList.remove('hidden');
    }

    refreshAll();
  }

  /* --------- Despesas --------- */

  async function registerExpense() {
    setMsg('msg', '');

    try {
      const data = $('inpData').value;
      const categoria = $('inpCat').value;
      const detalhes = $('inpDet').value.trim();
      const reembolsavel = $('inpReemb').value;

      const rawValor = $('inpVal').value || '';
      const valor = Number(
        rawValor.replace(/\./g, '').replace(',', '.'),
      );

      if (
        !currentObraId ||
        !data ||
        !categoria ||
        !detalhes ||
        !(valor > 0)
      ) {
        throw new Error('Preencha os campos corretamente.');
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

      setMsg('msg', 'Registrado.', true);
      refreshAll();
    } catch (e) {
      setMsg('msg', e.message || String(e));
    }
  }

  /* --------- Dashboard / Resumo --------- */

  async function refreshAll() {
    try {
      const monthRef = $('fMes').value || currentMonth();
      if (!currentObraId) return;

      // Resumo
      const summary = await api('dash.summary', {
        token: TOKEN,
        monthRef,
        obra_id: currentObraId,
      });

      $('kTotal').textContent = formatBRL(summary.totalGeral);
      $('kStatus').textContent = summary.isClosed ? 'FECHADO' : 'ABERTO';
      $('kTop').textContent = summary.maiorCategoria || '-';
      $('kBottom').textContent = summary.menorCategoria || '-';

      const tbody = $('tbResumo');
      tbody.innerHTML = '';

      (CATEGORIAS || []).forEach((cat) => {
        const value = Number(summary.totals?.[cat] || 0);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><b>${cat}</b></td>
          <td>${formatBRL(value)}</td>
        `;
        tbody.appendChild(tr);
      });

      // Série / Gráfico
      const series = await api('dash.series', {
        token: TOKEN,
        monthRef,
        obra_id: currentObraId,
      });

      const labels = (series.points || []).map((p) => p.date);
      const values = (series.points || []).map((p) => Number(p.total || 0));

      if (lineChart) {
        lineChart.destroy();
      }

      const ctx = document.getElementById('chartLine');
      lineChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              data: values,
              tension: 0.25,
            },
          ],
        },
        options: {
          plugins: {
            legend: {
              display: false,
            },
          },
        },
      });
    } catch (_e) {
      // silencioso; em produção, logaria o erro
    }
  }

  function onChangeObra() {
    currentObraId = $('obraSelect').value;
    refreshAll();
  }

  /* --------- Relatório --------- */

  async function printPdf() {
    const monthRef = $('fMes').value || currentMonth();

    const result = await api('report.pdf', {
      token: TOKEN,
      monthRef,
      obra_id: currentObraId,
    });

    window.open(result.fileUrl, '_blank');
  }

  /* --------- Helpers de UI --------- */

  function togglePass(id) {
    const el = $(id);
    el.type = el.type === 'password' ? 'text' : 'password';
  }

  function toggleAdmin() {
    $('adminArea').classList.toggle('hidden');
  }

  function adminTab() {
    // futuro: lógica das abas de admin
  }

  /* --------- API pública do módulo --------- */

  return {
    login,
    changePassword,
    togglePass,
    registerExpense,
    refreshAll,
    onChangeObra,
    printPdf,
    logout,
    toggleAdmin,
    adminTab,
  };
})();
