// ===================== CONFIGURAÇÃO DO FIREBASE =====================
// Substitua pelos dados do seu projeto (Console Firebase > Configurações do projeto)
const firebaseConfig = {
  apiKey: "AIzaSyDMA2Y1OzrkoO3cR98m65tfZbKbpkm2Dwk",
  authDomain: "acesso-workin.firebaseapp.com",
  databaseURL: "https://acesso-workin-default-rtdb.firebaseio.com",
  projectId: "acesso-workin",
  storageBucket: "acesso-workin.firebasestorage.app",
  messagingSenderId: "1061650014954",
  appId: "1:1061650014954:web:7fa2c22fb34882155a2d93"
};

// E-mail do admin guardado apenas como hash SHA-256
const ADMIN_HASH = "5edfa2692bdacc5e6ee805c626c50cb44cebb065f092d9a1067d89f74dacd326";
async function sha256(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
const isAdminEmail = async (e) => !!e && (await sha256(e.trim().toLowerCase())) === ADMIN_HASH;
// ====================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, push, set, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);
const THEMES = ["green", "cyan", "light"];
const THEME_LABEL = { green: "Verde", cyan: "Ciano", light: "Claro" };
let cards = {};
let settings = {};
let isAdmin = false;

// ---------- Utilidades ----------
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u = "") => /^https?:\/\//i.test(u) ? u : (u ? "https://" + u : "#");
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); }
function spinner(on) { $("spinner").classList.toggle("show", on); }
function openModal(id) { $(id).classList.add("open"); }
function closeModal(id) { $(id).classList.remove("open"); }
function logoHTML(c) {
  return c.logo ? `<img src="${esc(c.logo)}" alt="${esc(c.title)}" loading="lazy">`
                : `<div class="logo-ph">${esc((c.title || "?")[0].toUpperCase())}</div>`;
}
const sorted = () => Object.entries(cards).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));

// ---------- Tema ----------
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  $("themeLabel").textContent = THEME_LABEL[theme];
  applyAccent();
}
function applyAccent() {
  const s = document.body.style;
  if (settings.useAccent && settings.accent) {
    s.setProperty("--accent", settings.accent);
    s.setProperty("--glow", settings.accent + "59");
  } else { s.removeProperty("--accent"); s.removeProperty("--glow"); }
}
$("themeBtn").onclick = () => {
  const next = THEMES[(THEMES.indexOf(document.body.dataset.theme) + 1) % THEMES.length];
  localStorage.setItem("theme", next);
  applyTheme(next);
};

// ---------- Renderização ----------
function renderCards() {
  const el = $("cards");
  const list = sorted();
  if (!list.length) { el.innerHTML = `<div class="empty">Nenhum item cadastrado ainda.</div>`; return; }
  el.innerHTML = list.map(([id, c], i) =>
    `<div class="card" data-id="${id}" style="animation-delay:${i * 60}ms">${logoHTML(c)}<h3>${esc(c.title)}</h3></div>`).join("");
  el.querySelectorAll(".card").forEach(card => card.onclick = () => showCard(card.dataset.id));
}
function showCard(id) {
  const c = cards[id]; if (!c) return;
  const img = $("cmLogo");
  if (c.logo) { img.src = c.logo; img.style.display = ""; } else img.style.display = "none";
  $("cmTitle").textContent = c.title;
  $("cmDesc").textContent = c.desc || "";
  $("cmLink").dataset.url = safeUrl(c.url);
  openModal("cardModal");
}
function applySettings() {
  const s = settings;
  $("siteTitle").textContent = s.siteTitle || "Portal";
  document.title = s.siteTitle || "Portal";
  $("heroTitle").textContent = s.heroTitle || "Meus Serviços";
  $("heroSubtitle").textContent = s.heroSubtitle ?? "Acesse rapidamente tudo em um só lugar.";
  $("footerText").textContent = s.footer || `© ${new Date().getFullYear()} ${s.siteTitle || "Portal"}`;
  const root = document.documentElement.style;
  if (s.cardSize) root.setProperty("--card-size", s.cardSize + "px");
  if (s.radius !== undefined) root.setProperty("--radius", s.radius + "px");
  document.body.classList.toggle("no-grid", s.grid === false);
  applyTheme(localStorage.getItem("theme") || s.theme || "green");
}
function renderAdminList() {
  const list = sorted();
  $("adminList").innerHTML = list.length ? list.map(([id, c]) => `
    <div class="admin-item">
      ${logoHTML(c)}
      <div class="info"><strong>${esc(c.title)}</strong><small>${esc(c.url)}</small></div>
      <div class="actions">
        <button class="btn ghost sm" data-edit="${id}">Editar</button>
        <button class="btn danger sm" data-del="${id}">Excluir</button>
      </div>
    </div>`).join("") : `<div class="empty">Nenhum card.</div>`;
  $("adminList").querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editCard(b.dataset.edit));
  $("adminList").querySelectorAll("[data-del]").forEach(b => b.onclick = () => deleteCard(b.dataset.del));
}

// ---------- Dados em tempo real ----------
onValue(ref(db, "cards"), snap => { cards = snap.val() || {}; renderCards(); renderAdminList(); });
onValue(ref(db, "settings"), snap => { settings = snap.val() || {}; applySettings(); fillVisualForm(); });

// ---------- Login ----------
$("secretDot").onclick = () => isAdmin ? openAdmin() : openModal("loginModal");
$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("loginError").textContent = "";
  const email = $("loginEmail").value.trim().toLowerCase();
  if (!(await isAdminEmail(email))) { $("loginError").textContent = "Acesso negado."; return; }
  spinner(true);
  try {
    await signInWithEmailAndPassword(auth, email, $("loginPass").value);
    await new Promise(r => setTimeout(r, 700));
    closeModal("loginModal");
    $("loginForm").reset();
    openAdmin();
  } catch { $("loginError").textContent = "E-mail ou senha inválidos."; }
  finally { spinner(false); }
};
onAuthStateChanged(auth, async user => {
  isAdmin = !!user && await isAdminEmail(user.email);
  document.body.classList.toggle("is-admin", isAdmin);
  if (user && !isAdmin) signOut(auth);
  if (!isAdmin) $("adminPanel").classList.remove("open");
});
$("logoutBtn").onclick = async () => { spinner(true); await signOut(auth); spinner(false); toast("Sessão encerrada"); };

// ---------- Painel ----------
function openAdmin() { $("adminPanel").classList.add("open"); document.body.style.overflow = "hidden"; }
$("closeAdmin").onclick = () => { $("adminPanel").classList.remove("open"); document.body.style.overflow = ""; };
document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
  document.querySelectorAll(".tab,.tab-content").forEach(x => x.classList.remove("active"));
  t.classList.add("active"); $(t.dataset.tab).classList.add("active");
});

function resetCardForm() { $("cardForm").reset(); $("cardId").value = ""; $("cardFormTitle").textContent = "Novo card"; }
$("cardReset").onclick = resetCardForm;
function editCard(id) {
  const c = cards[id];
  $("cardId").value = id; $("cardTitle").value = c.title || ""; $("cardLogo").value = c.logo || "";
  $("cardDesc").value = c.desc || ""; $("cardUrl").value = c.url || ""; $("cardOrder").value = c.order ?? "";
  $("cardFormTitle").textContent = "Editar card";
  $("cardForm").scrollIntoView({ behavior: "smooth" });
}
async function deleteCard(id) {
  if (!confirm("Excluir este card?")) return;
  await remove(ref(db, "cards/" + id)); toast("Card excluído");
}
$("cardForm").onsubmit = async (e) => {
  e.preventDefault();
  const data = {
    title: $("cardTitle").value.trim(), logo: $("cardLogo").value.trim(),
    desc: $("cardDesc").value.trim(), url: $("cardUrl").value.trim(),
    order: Number($("cardOrder").value) || 0
  };
  const id = $("cardId").value;
  try {
    spinner(true);
    if (id) await update(ref(db, "cards/" + id), data);
    else await set(push(ref(db, "cards")), data);
    resetCardForm(); toast("Card salvo");
  } catch { toast("Erro ao salvar (verifique as regras)"); }
  finally { spinner(false); }
};

function fillVisualForm() {
  const s = settings;
  $("vSiteTitle").value = s.siteTitle || ""; $("vHeroTitle").value = s.heroTitle || "";
  $("vHeroSubtitle").value = s.heroSubtitle || ""; $("vFooter").value = s.footer || "";
  $("vTheme").value = s.theme || "green"; $("vAccent").value = s.accent || "#00ff88";
  $("vUseAccent").checked = !!s.useAccent; $("vCardSize").value = s.cardSize || 170;
  $("vRadius").value = s.radius ?? 18; $("vGrid").checked = s.grid !== false;
}
$("visualForm").onsubmit = async (e) => {
  e.preventDefault();
  const data = {
    siteTitle: $("vSiteTitle").value.trim(), heroTitle: $("vHeroTitle").value.trim(),
    heroSubtitle: $("vHeroSubtitle").value.trim(), footer: $("vFooter").value.trim(),
    theme: $("vTheme").value, accent: $("vAccent").value, useAccent: $("vUseAccent").checked,
    cardSize: Number($("vCardSize").value), radius: Number($("vRadius").value), grid: $("vGrid").checked
  };
  try { spinner(true); await set(ref(db, "settings"), data); localStorage.removeItem("theme"); toast("Visual salvo"); }
  catch { toast("Erro ao salvar"); }
  finally { spinner(false); }
};

// ---------- Fechar modais ----------
document.querySelectorAll(".modal").forEach(m => {
  m.addEventListener("click", e => { if (e.target === m || e.target.hasAttribute("data-close")) m.classList.remove("open"); });
});
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open")); });

// ---------- Acessar sem mostrar link no rodapé do navegador ----------
$("cmLink").onclick = () => { const u = $("cmLink").dataset.url; if (u && u !== "#") window.open(u, "_blank", "noopener"); };

// ---------- Proteção para visitantes (liberada para o admin) ----------
document.addEventListener("contextmenu", e => { if (!isAdmin) e.preventDefault(); });
document.addEventListener("keydown", e => {
  if (isAdmin) return;
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === "F12" ||
      (ctrl && ["u", "s", "p"].includes(k)) ||
      (ctrl && e.shiftKey && ["i", "j", "c", "k"].includes(k)) ||
      (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(k))) {
    e.preventDefault(); e.stopPropagation();
  }
}, true);
document.addEventListener("dragstart", e => { if (!isAdmin && e.target.tagName === "IMG") e.preventDefault(); });
