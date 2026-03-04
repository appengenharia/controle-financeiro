const API_URL = "https://script.google.com/macros/s/AKfycbwUBmnkEkUKJGfCoDcu547QNlqzpmjuyT-iLDshB1gJWYgRmi6fnPLiCJTWpBAzKSfjZw/exec";

const App = (() => {
  let TOKEN = "";
  let USER = null;
  let WORKS = [];
  let CATEGORIAS = [];
  let currentObraId = "";
  let brand = { name: "Controle Financeiro de Obras", color: "#0b2a4a", logo_url: "" };
  let notaSelectedFile = null;
  let notaUploaded = { fileId: "", url: "" };
  let logoSelectedFile = null;
  let lineChart = null;

  function $(id) { return document.getElementById(id); }

  function setMsg(id, text, ok = false) {
    const el = $(id);
    if (!el) return;
    if (!text) { el.className = "msg"; el.textContent = ""; return; }
    el.className = "msg " + (ok ? "ok" : "err");
    el.textContent = text;
  }

  function brl(n) {
    return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function setDefaultDate() {
    const d = new Date();
    const el = $("inpData");
    if (el) el.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function togglePass(inputId) {
    const el = $(inputId);
    if (el) el.type = el.type === "password" ? "text" : "password";
  }

  function applyBrand() {
    document.documentElement.style.setProperty("--brand", brand.color || "#0b2a4a");
    const title = $("brandTitle");
    if (!title) return;
    if (brand.logo_url) {
      title.innerHTML = `<img src="${brand.logo_url}" alt="logo" style="height:28px;border-radius:4px;vertical-align:middle;margin-right:8px;">${brand.name || ""}`;
    } else {
      title.textContent = brand.name || "Controle Financeiro de Obras";
    }
  }

  function initOffline() {
    function update() {
      const b = $("offlineBanner");
      if (b) b.classList.toggle("hidden", navigator.onLine);
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  }

  async function api(action, payload = {}) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload })
    });
    if (!res.ok) throw new Error("Erro na comunicação com servidor");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Erro desconhecido");
    return data.data;
  }

  // ── AUTH ──
  async function login() {
    setMsg("loginMsg", "");
    const btn = document.querySelector("#loginArea .btn-primary");
    if (btn) { btn.disabled = true; btn.textContent = "Entrando..."; }
    try {
      const role = $("loginRole").value;
      const username = $("loginUser").value.trim();
      const password = $("loginPass").value;
      if (!username) throw new Error("Informe o usuário.");
      if (!password) throw new Error("Informe a senha.");
      const r = await api("auth.login", { role, username, password });
      TOKEN = r.token;
      USER = r.user;
      WORKS = r.works || [];
      CATEGORIAS = r.categorias || [];
      brand = r.brand || brand;
      applyBrand();
      $("pillUser").textContent = `${USER.role} • ${USER.username}`;
      $("pillUser").classList.remove("hidden");
      $("btnLogout").classList.remove("hidden");
      if (USER.primeiro_acesso) {
        $("loginArea").classList.add("hidden");
        $("pwArea").classList.remove("hidden");
        return;
      }
      await initApp();
    } catch (e) {
      setMsg("loginMsg", e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Entrar"; }
    }
  }

  async function changePassword() {
    setMsg("pwMsg", "");
    try {
      const p1 = $("pw1").value;
      const p2 = $("pw2").value;
      if (!p1 || p1.length < 4) throw new Error("Senha muito curta (mín. 4 caracteres).");
      if (p1 !== p2) throw new Error("As senhas não conferem.");
      await api("auth.changePassword", { token: TOKEN, newPassword: p1 });
      $("pwArea").classList.add("hidden");
      await initApp();
    } catch (e) {
      setMsg("pwMsg", e.message);
    }
  }

  function logout() {
    if (TOKEN) { try { api("auth.logout", { token: TOKEN }); } catch (_) {} }
    location.reload();
  }

  // ── INIT ──
  async function initApp() {
    try {
      const r = await api("app.init", { token: TOKEN });
      WORKS = r.works || WORKS;
      CATEGORIAS = r.categorias || CATEGORIAS;
    } catch (_) {}

    currentObraId = WORKS[0]?.obra_id || "";
    fillWorks();
    fillCategories();
    setDefaultDate();

    const fMes = $("fMes");
    if (fMes) fMes.value = currentMonth();
    const monthRef = $("monthRef");
    if (monthRef) monthRef.value = currentMonth();

    $("loginArea").classList.add("hidden");
    $("appArea").classList.remove("hidden");

    if (USER.role === "ADMIN") {
      $("tabBtnAdmin").classList.remove("hidden");
    }

    mainTab("lancamentos");
    refreshAll();
  }

  function fillWorks() {
    const s = $("obraSelect");
    if (!s) return;
    s.innerHTML = "";
    WORKS.forEach(w => {
      const o = document.createElement("option");
      o.value = w.obra_id;
      o.textContent = `${w.obra_id} — ${w.obra_nome}`;
      s.appendChild(o);
    });
    if (currentObraId) s.value = currentObraId;
  }

  function onChangeObra() {
    currentObraId = $("obraSelect").value;
    refreshAll();
  }

  function fillCategories() {
    const s = $("inpCat");
    if (!s) return;
    s.innerHTML = "";
    CATEGORIAS.forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      s.appendChild(o);
    });
  }

  // ── TABS ──
  function mainTab(tab) {
    ["lancamentos", "relatorios", "admin"].forEach(t => {
      const el = $(`tab_${t}`); if (el) el.classList.add("hidden");
    });
    $("tabBtnLanc").classList.remove("active");
    $("tabBtnRel").classList.remove("active");
    $("tabBtnAdmin").classList.remove("active");

    const panel = $(`tab_${tab}`);
    if (panel) panel.classList.remove("hidden");

    const btnMap = { lancamentos: "tabBtnLanc", relatorios: "tabBtnRel", admin: "tabBtnAdmin" };
    const b = $(btnMap[tab]);
    if (b) b.classList.add("active");

    if (tab === "relatorios") refreshAll();
    if (tab === "admin") adminTab("users");
  }

  // ── LANÇAMENTOS ──
  async function registerExpense() {
    setMsg("msg", "");
    const btn = document.querySelector("#tab_lancamentos .btn-primary");
    if (btn) { btn.disabled = true; btn.textContent = "Registrando..."; }
    try {
      const rawVal = ($("inpVal").value || "").replace(/\./g, "").replace(",", ".");
      const valor = Number(rawVal);
      const payload = {
        obra_id: currentObraId,
        categoria: $("inpCat").value,
        detalhes: $("inpDet").value.trim(),
        valor,
        data: $("inpData").value,
        reembolsavel: $("inpReemb").value,
        nota_file_id: notaUploaded.fileId || "",
        nota_url: notaUploaded.url || ""
      };
      if (!payload.obra_id) throw new Error("Selecione uma obra.");
      if (!payload.detalhes) throw new Error("Preencha os detalhes.");
      if (!payload.valor || isNaN(payload.valor)) throw new Error("Informe um valor válido.");
      await api("expense.create", { token: TOKEN, payload });
      $("inpDet").value = "";
      $("inpVal").value = "";
      clearNota();
      setMsg("msg", "✅ Registrado com sucesso!", true);
      refreshAll();
    } catch (e) {
      setMsg("msg", e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Registrar"; }
    }
  }

  function onNotaSelected(file) {
    if (!file) return;
    notaSelectedFile = file;
    const reader = new FileReader();
    reader.onload = e => {
      $("notaImg").src = e.target.result;
      $("notaPreview").classList.remove("hidden");
    };
    reader.readAsDataURL(file);
    notaUploaded = { fileId: "", url: "" };
  }

  function clearNota() {
    notaSelectedFile = null;
    notaUploaded = { fileId: "", url: "" };
    const prev = $("notaPreview"); if (prev) prev.classList.add("hidden");
    const img = $("notaImg"); if (img) img.src = "";
    const nf = $("notaFile"); if (nf) nf.value = "";
    const nc = $("notaCam"); if (nc) nc.value = "";
  }

  // ── DASHBOARD ──
  async function refreshAll() {
    try {
      const monthRef = $("fMes")?.value || currentMonth();
      const res = await api("dash.summary", { token: TOKEN, monthRef, obra_id: currentObraId });
      const kTotal = $("kTotal"); if (kTotal) kTotal.textContent = brl(res.totalGeral);
      const kStatus = $("kStatus"); if (kStatus) kStatus.textContent = res.isClosed ? "🔒 FECHADO" : "🟢 ABERTO";
      const kTop = $("kTop"); if (kTop) kTop.textContent = res.maiorCategoria || "-";
      const kBottom = $("kBottom"); if (kBottom) kBottom.textContent = res.menorCategoria || "-";
      const tb = $("tbResumo");
      if (tb) {
        tb.innerHTML = "";
        Object.entries(res.totals || {}).forEach(([cat, val]) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${cat}</td><td><strong>${brl(val)}</strong></td>`;
          tb.appendChild(tr);
        });
      }
      const series = await api("dash.series", { token: TOKEN, monthRef, obra_id: currentObraId });
      renderLine(series);
    } catch (e) {
      console.error("refreshAll:", e.message);
    }
  }

  function renderLine(series) {
    const pts = series.points || [];
    if (lineChart) lineChart.destroy();
    const canvas = $("chartLine");
    if (!canvas) return;
    lineChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: pts.map(p => p.date),
        datasets: [{
          data: pts.map(p => p.total),
          tension: 0.3,
          borderColor: brand.color || "#0b2a4a",
          backgroundColor: "rgba(11,42,74,.08)",
          fill: true,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function printReport() { window.print(); }

  // ── ADMIN TABS ──
  async function adminTab(tab) {
    setMsg("admMsg", "");
    ["users", "works", "emails", "logo", "month"].forEach(t => {
      const p = $(`adm_${t}`); if (p) p.classList.add("hidden");
      const b = $(`sadm_${t}`); if (b) b.classList.remove("active");
    });
    const panel = $(`adm_${tab}`); if (panel) panel.classList.remove("hidden");
    const btn = $(`sadm_${tab}`); if (btn) btn.classList.add("active");

    if (tab === "users") await renderUsers();
    if (tab === "works") await renderWorks();
    if (tab === "emails") await renderEmails();
    if (tab === "logo") await loadConfig();
    if (tab === "month") await renderClosedMonths();
  }

  // ── ADMIN: USUÁRIOS ──
  async function renderUsers() {
    try {
      const list = await api("admin.users.list", { token: TOKEN });
      const el = $("userList");
      if (!el) return;
      el.innerHTML = list.map(u => `
        <div class="listItem">
          <span class="liName">${u.username}</span>
          <span style="color:var(--muted);font-size:.82rem">${u.nome || ""}</span>
          <span class="liBadge ${u.role === "ADMIN" ? "admin" : ""}">${u.role}</span>
          <div class="liActions">
            <button class="btn btn-sm btn-secondary" onclick="App.adminResetPass('${u.username}')">Reset senha</button>
            
