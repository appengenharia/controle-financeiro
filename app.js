// =========================
// Configuração da API
// =========================

const API_URL = 'https://script.google.com/macros/s/AKfycbzILvsQK2SBM8yUKhlaX8pMdbUO6vU5ywc5ON_bt0sw1cGFyViWxv0AHadN7XpmUySmGA/exec';

// =========================
// Módulo principal da aplicação (IIFE)
// =========================

const App = (() => {
  // --------- Estado interno ---------
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
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  // --------- Comunicação com API ---------
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

  // --------- Preenchimento de selects / UI ---------
  function fillWorks() {
    const select = $('obraSelect');
    if (!select) return;

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
    if (!select) return;

    select.innerHTML = '';

    (CATEGORIAS || []).forEach((categoria) => {
      const option = document.createElement('option');
      option.value = categoria;
      option.textContent = categoria;
      select.appendChild(option);
    });
  }

  // --------- Autenticação ---------
  async function login() {
    setMsg('loginMsg', '');

    const btn = $('btnLogin'); // adicione id="btnLogin" no HTML do botão Entrar
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Entrando...';
    }

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
      if (pillUser) {
        pillUser.textContent = `${USER.role} • ${USER.username}`;
        pillUser.classList.remove('hidden');
      }

      const btnLogout = $('btnLogout');
      if (btnLogout) {
        btnLogout.classList.remove('hidden');
      }

      if (USER.primeiro_acesso) {
        $('loginArea').classList.add('hidden');
        $('pwArea').classList.remove('hidden');
        return;
      }

      async function initApp() {
  const init = await api('app.init', { token: TOKEN });

  WORKS = init.works || WORKS;
  CATEGORIAS = init.categorias || CATEGORIAS;

  currentObraId = init.primaryObraId || (WORKS[0]?.obra_id || '');

  fillWorks();
  fillCats();

  const monthRef = init.initialMonthRef || currentMonth();
  $('fMes').value = monthRef;

  $('loginArea').classList.add('hidden');
  $('pwArea').classList.add('hidden');
  $('appArea').classList.remove('hidden');

  // Controle de UI por perfil
  if (USER.role === 'ADMIN') {
    $('btnAdmin').classList.remove('hidden');
  } else {
    $('btnAdmin').classList.add('hidden');
    $('adminArea').classList.add('hidden');
  }

  if (init.initialSummary && init.initialSeries && currentObraId) {
    applySummaryAndSeries(init.initialSummary, init.initialSeries);
  } else {
    refreshAll();
  }
}

      }
    }
  }

  async function changePassword() {
    setMsg('pwMsg', '');

    const btn = $('btnSavePw'); // coloque id="btnSavePw" no botão Salvar da troca de senha
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Salvando...';
    }

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
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Salvar';
      }
    }
  }

  async function logout() {
    const btn = $('btnLogout');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saindo...';
    }

    try {
      if (TOKEN) {
        await api('auth.logout', { token: TOKEN });
      }
    } catch (_e) {
      // silencioso
    } finally {
      location.reload();
    }
  }

  // --------- Inicialização da aplicação ---------
  async function initApp() {
    const init = await api('app.init', { token: TOKEN });

    WORKS = init.works || WORKS;
    CATEGORIAS = init.categorias || CATEGORIAS;

    currentObraId = init.primaryObraId || (WORKS[0]?.obra_id || '');

    fillWorks();
    fillCats();

    const monthRef = init.initialMonthRef || currentMonth();
    $('fMes').value = monthRef;

    $('loginArea').classList.add('hidden');
    $('pwArea').classList.add('hidden');
    $('appArea').classList.remove('hidden');

    if (USER.role === 'ADMIN') {
      $('btnAdmin').classList.remove('hidden');
    }

    if (init.initialSummary && init.initialSeries && currentObraId) {
      applySummaryAndSeries(init.initialSummary, init.initialSeries);
    } else {
      refreshAll();
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
      const value = Number(summary.totals?.[cat] || 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${cat}</b></td>
        <td>${formatBRL(value)}</td>
      `;
      tbody.appendChild(tr);
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
  }

  // --------- Despesas ---------
  async function registerExpense() {
    setMsg('msg', '');

    const btn = $('btnSaveExpense'); // coloque id="btnSaveExpense" no botão Registrar
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Salvando...';
    }

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
      await refreshAll();
    } catch (e) {
      setMsg('msg', e.message || String(e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Registrar';
      }
    }
  }

  // --------- Dashboard / Resumo ---------
  async function refreshAll() {
    try {
      const monthRef = $('fMes').value || currentMonth();
      if (!currentObraId) return;

      const sum = await api('dash.summary', {
        token: TOKEN,
        monthRef,
        obra_id: currentObraId,
      });

      const series = await api('dash.series', {
        token: TOKEN,
        monthRef,
        obra_id: currentObraId,
      });

      applySummaryAndSeries(sum, series);
    } catch (_e) {
      // silencioso; em produção, logaria o erro
    }
  }

  function onChangeObra() {
    currentObraId = $('obraSelect').value;
    refreshAll();
  }

  // --------- Relatório ---------
  async function printPdf() {
    const btn = $('btnPrintPdf'); // coloque id="btnPrintPdf" no botão Imprimir PDF
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Gerando...';
    }

    try {
      const monthRef = $('fMes').value || currentMonth();

      const result = await api('report.pdf', {
        token: TOKEN,
        monthRef,
        obra_id: currentObraId,
      });

      window.open(result.fileUrl, '_blank');
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Imprimir PDF';
      }
    }
  }

  // --------- Helpers de UI ---------
  function togglePass(id) {
    const el = $(id);
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
  }

  function toggleAdmin() {
    $('adminArea').classList.toggle('hidden');
  }

  function adminTab(tabName) {
    // Placeholder para você implementar depois
    console.log('Trocar para aba admin:', tabName);
  }

  // --------- Service Worker (opcional) ---------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./service-worker.js')
        .catch(() => {});
    });
  }

  // --------- API pública do módulo ---------
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
