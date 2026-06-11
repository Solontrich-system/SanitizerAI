/* ============================================================
   SanitizerAI Suite — admin.js
   Admin dashboard: auth gate, Supabase data, Make scenarios
   ============================================================ */

"use strict";

// ── CONFIG ──────────────────────────────────────────────────
const SUPABASE_URL      = "https://qlkzyzvkqioisnpfslsk.supabase.co";
const SUPABASE_ANON     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsa3p5enZrcWlvaXNucGZzbHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjc2ODUsImV4cCI6MjA5NjcwMzY4NX0.3N-x3FgGfyRmL9EmkuWs474VHwzGGXZtsFfEYxyk5lc";
const SERVICE_KEY       = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsa3p5enZrcWlvaXNucGZzbHNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTEyNzY4NSwiZXhwIjoyMDk2NzAzNjg1fQ.H5_n2zLL4T-5B_IdLYCxkjgb9yOYXsPQlBHORRLbK-o";
const MAKE_API_BASE     = "https://eu1.make.com/api/v2";
const MAKE_TEAM_ID      = 1889489;
const ADMIN_PASSWORD    = "sanitizerai_admin_2024";   // ← change this

// ── SERVICE HEADERS (bypass RLS for admin reads) ─────────────
function svcHeaders(extra = {}) {
    return {
        "apikey": SUPABASE_ANON,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        ...extra
    };
}

// ── STATE ───────────────────────────────────────────────────
let currentView = "overview";

// ============================================================
// AUTH
// ============================================================
function adminLogin() {
    const pw = document.getElementById("admin-pw-input").value;
    if (pw === ADMIN_PASSWORD) {
        document.getElementById("admin-auth").style.display      = "none";
        document.getElementById("admin-dashboard").style.display = "flex";
        startClock();
        loadOverview();
        pingStatus();
    } else {
        const err = document.getElementById("admin-auth-error");
        err.style.display = "block";
        document.getElementById("admin-pw-input").value = "";
    }
}

function adminLogout() {
    document.getElementById("admin-dashboard").style.display = "none";
    document.getElementById("admin-auth").style.display      = "flex";
    document.getElementById("admin-pw-input").value          = "";
    document.getElementById("admin-auth-error").style.display = "none";
}

document.getElementById("admin-pw-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") adminLogin();
});

// ============================================================
// CLOCK + STATUS
// ============================================================
function startClock() {
    const el = document.getElementById("admin-clock");
    const tick = () => { el.textContent = new Date().toLocaleTimeString(); };
    tick(); setInterval(tick, 1000);
}

async function pingStatus() {
    const el   = document.getElementById("admin-status-text");
    const dot  = document.querySelector(".admin-pulse");
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/system_logs?select=id&limit=1`, { headers: svcHeaders() });
        if (res.ok) {
            el.textContent = "Supabase Online";
            dot.classList.remove("dead");
        } else throw new Error();
    } catch {
        el.textContent = "Connection Error";
        dot.classList.add("dead");
    }
    setTimeout(pingStatus, 30000);
}

// ============================================================
// VIEW SWITCHING
// ============================================================
const VIEW_META = {
    overview:     { title: "Overview",          sub: "System-wide metrics and health" },
    users:        { title: "Users",             sub: "All registered accounts" },
    transactions: { title: "Transactions",      sub: "All financial records across users" },
    documents:    { title: "Documents",         sub: "Ingested files and extraction results" },
    logs:         { title: "System Logs",       sub: "Automation heartbeats and events" },
    make:         { title: "Make Scenarios",    sub: "Automation scenario status and controls" },
};

function switchView(view, btn) {
    // nav highlight
    document.querySelectorAll(".admin-nav-btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    // panel toggle
    document.querySelectorAll(".admin-view").forEach(v => v.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");

    // topbar copy
    const meta = VIEW_META[view] || {};
    document.getElementById("admin-page-title").textContent = meta.title || view;
    document.getElementById("admin-page-sub").textContent   = meta.sub   || "";

    currentView = view;

    // load data
    const loaders = {
        overview:     loadOverview,
        users:        loadUsers,
        transactions: loadTransactions,
        documents:    loadDocuments,
        logs:         loadLogs,
        make:         loadMakeScenarios,
    };
    loaders[view]?.();
}

function refreshCurrentView() {
    const btn = document.getElementById("admin-refresh-btn");
    btn.classList.add("spinning");
    setTimeout(() => btn.classList.remove("spinning"), 800);
    switchView(currentView, document.querySelector(`[data-view="${currentView}"]`));
}

function setLastUpdated() {
    document.getElementById("admin-last-updated").textContent =
        `Updated ${new Date().toLocaleTimeString()}`;
}

// ============================================================
// SUPABASE HELPERS
// ============================================================
async function sbFetch(path) {
    const res  = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: svcHeaders() });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.json();
}

// ============================================================
// OVERVIEW
// ============================================================
async function loadOverview() {
    try {
        const [txns, docs, logs, users] = await Promise.all([
            sbFetch("transactions?select=id,status,amount"),
            sbFetch("documents?select=id,status"),
            sbFetch("system_logs?select=id,status,event_type,created_at&order=created_at.desc&limit=8"),
            sbFetch("profiles?select=id").catch(() => null),
        ]);

        const totalTxns    = txns.length;
        const verifiedTxns = txns.filter(t => t.status === "verified").length;
        const pendingTxns  = txns.filter(t => t.status === "pending_review").length;
        const totalDocs    = docs.length;
        const pendingDocs  = docs.filter(d => ["pending_review","failed","manual_queue"].includes(d.status)).length;
        const totalAmt     = txns.filter(t => t.status === "verified").reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

        const statsEl = document.getElementById("overview-stats");
        statsEl.innerHTML = [
            statCard("Total Transactions", totalTxns, `${verifiedTxns} verified`, "#10b981"),
            statCard("Pending Review", pendingTxns + pendingDocs, `${pendingDocs} docs · ${pendingTxns} txns`, "#f59e0b"),
            statCard("Verified Volume", formatAmt(totalAmt), "from verified transactions", "#1a6db5"),
            statCard("Total Documents", totalDocs, `${pendingDocs} awaiting action`, "#7c3aed"),
        ].join("");

        // Recent transactions table
        const recentTxns = await sbFetch("transactions?select=id,vendor,amount,status,created_at&order=created_at.desc&limit=8");
        document.getElementById("overview-recent-txns").innerHTML = txnTable(recentTxns);

        // Log feed
        document.getElementById("overview-log-feed").innerHTML = logFeed(logs);

        setLastUpdated();
    } catch (e) {
        document.getElementById("overview-stats").innerHTML = `<div class="admin-empty" style="grid-column:1/-1">Failed to load: ${e.message}</div>`;
    }
}

function statCard(label, value, sub, color) {
    return `<div class="admin-stat-card">
        <span class="admin-stat-label">${label}</span>
        <span class="admin-stat-value" style="color:${color}">${value}</span>
        <span class="admin-stat-sub"><span class="admin-stat-dot" style="background:${color}22;border:1px solid ${color}44;"></span>${sub}</span>
    </div>`;
}

// ============================================================
// USERS
// ============================================================
async function loadUsers() {
    const wrap = document.getElementById("users-table-wrap");
    wrap.innerHTML = `<div class="admin-loading">Loading users…</div>`;
    try {
        // Query auth.users via RPC or fall back to transactions distinct user_ids
        const txns = await sbFetch("transactions?select=user_id,created_at&order=created_at.desc");
        const docs  = await sbFetch("documents?select=user_id&limit=1000");

        // Aggregate unique users
        const userMap = {};
        txns.forEach(t => {
            if (!t.user_id) return;
            if (!userMap[t.user_id]) userMap[t.user_id] = { user_id: t.user_id, txn_count: 0, doc_count: 0, last_seen: t.created_at };
            userMap[t.user_id].txn_count++;
            if (t.created_at > userMap[t.user_id].last_seen) userMap[t.user_id].last_seen = t.created_at;
        });
        docs.forEach(d => {
            if (!d.user_id) return;
            if (!userMap[d.user_id]) userMap[d.user_id] = { user_id: d.user_id, txn_count: 0, doc_count: 0, last_seen: null };
            userMap[d.user_id].doc_count++;
        });

        const users = Object.values(userMap);
        document.getElementById("users-count").textContent = `${users.length} users`;

        if (users.length === 0) {
            wrap.innerHTML = `<div class="admin-empty">No registered users with data yet.</div>`;
            return;
        }

        wrap.innerHTML = `<table class="admin-table">
            <thead><tr>
                <th>User ID</th>
                <th>Transactions</th>
                <th>Documents</th>
                <th>Last Active</th>
            </tr></thead>
            <tbody>${users.map(u => `<tr>
                <td class="admin-td-mono admin-td-main">${u.user_id.slice(0,8)}…</td>
                <td class="admin-td-mono">${u.txn_count}</td>
                <td class="admin-td-mono">${u.doc_count}</td>
                <td class="admin-td-dim">${u.last_seen ? relTime(u.last_seen) : "—"}</td>
            </tr>`).join("")}</tbody>
        </table>`;

        setLastUpdated();
    } catch (e) {
        wrap.innerHTML = `<div class="admin-empty">Failed: ${e.message}</div>`;
    }
}

// ============================================================
// TRANSACTIONS
// ============================================================
async function loadTransactions() {
    const wrap   = document.getElementById("txn-table-wrap");
    wrap.innerHTML = `<div class="admin-loading">Loading transactions…</div>`;
    try {
        const status = document.getElementById("txn-status-filter")?.value || "";
        const limit  = document.getElementById("txn-limit-filter")?.value  || 50;
        let path = `transactions?select=id,vendor,amount,currency,status,category,source,created_at&order=created_at.desc&limit=${limit}`;
        if (status) path += `&status=eq.${status}`;
        const data = await sbFetch(path);

        document.getElementById("txn-count").textContent = `${data.length} records`;
        wrap.innerHTML = txnTable(data, true);
        setLastUpdated();
    } catch (e) {
        wrap.innerHTML = `<div class="admin-empty">Failed: ${e.message}</div>`;
    }
}

function txnTable(data, extended = false) {
    if (!data.length) return `<div class="admin-empty">No transactions found.</div>`;
    return `<table class="admin-table">
        <thead><tr>
            <th>Vendor</th>
            <th>Amount</th>
            <th>Status</th>
            ${extended ? "<th>Category</th><th>Source</th>" : ""}
            <th>Date</th>
        </tr></thead>
        <tbody>${data.map(t => `<tr>
            <td class="admin-td-main">${esc(t.vendor || "—")}</td>
            <td class="admin-td-mono">${formatAmt(t.amount)} <span class="admin-td-dim">${t.currency || ""}</span></td>
            <td>${statusBadge(t.status)}</td>
            ${extended ? `<td class="admin-td-dim">${esc(t.category || "—")}</td><td class="admin-td-dim">${esc(t.source || "—")}</td>` : ""}
            <td class="admin-td-dim">${relTime(t.created_at)}</td>
        </tr>`).join("")}</tbody>
    </table>`;
}

// ============================================================
// DOCUMENTS
// ============================================================
async function loadDocuments() {
    const wrap = document.getElementById("doc-table-wrap");
    wrap.innerHTML = `<div class="admin-loading">Loading documents…</div>`;
    try {
        const status = document.getElementById("doc-status-filter")?.value || "";
        let path = `documents?select=id,file_name,doc_type,vendor,amount,status,accuracy_score,created_at&order=created_at.desc&limit=100`;
        if (status) path += `&status=eq.${status}`;
        const data = await sbFetch(path);

        document.getElementById("doc-count").textContent = `${data.length} records`;

        if (!data.length) {
            wrap.innerHTML = `<div class="admin-empty">No documents found.</div>`;
            return;
        }

        wrap.innerHTML = `<table class="admin-table">
            <thead><tr>
                <th>File</th>
                <th>Type</th>
                <th>Vendor</th>
                <th>Amount</th>
                <th>Accuracy</th>
                <th>Status</th>
                <th>Date</th>
            </tr></thead>
            <tbody>${data.map(d => `<tr>
                <td class="admin-td-main">${esc(d.file_name || "—")}</td>
                <td class="admin-td-dim">${esc(d.doc_type || "—")}</td>
                <td>${esc(d.vendor || "—")}</td>
                <td class="admin-td-mono">${d.amount != null ? formatAmt(d.amount) : "—"}</td>
                <td class="admin-td-mono">${d.accuracy_score != null ? (d.accuracy_score * 100).toFixed(0) + "%" : "—"}</td>
                <td>${statusBadge(d.status)}</td>
                <td class="admin-td-dim">${relTime(d.created_at)}</td>
            </tr>`).join("")}</tbody>
        </table>`;
        setLastUpdated();
    } catch (e) {
        wrap.innerHTML = `<div class="admin-empty">Failed: ${e.message}</div>`;
    }
}

// ============================================================
// SYSTEM LOGS
// ============================================================
async function loadLogs() {
    const wrap = document.getElementById("log-table-wrap");
    wrap.innerHTML = `<div class="admin-loading">Loading logs…</div>`;
    try {
        const type   = document.getElementById("log-type-filter")?.value   || "";
        const status = document.getElementById("log-status-filter")?.value || "";
        const limit  = document.getElementById("log-limit-filter")?.value  || 100;
        let path = `system_logs?select=id,event_type,source,status,message,duration_ms,created_at&order=created_at.desc&limit=${limit}`;
        if (type)   path += `&event_type=eq.${type}`;
        if (status) path += `&status=eq.${status}`;
        const data = await sbFetch(path);

        document.getElementById("log-count").textContent = `${data.length} entries`;

        if (!data.length) {
            wrap.innerHTML = `<div class="admin-empty">No logs found.</div>`;
            return;
        }

        wrap.innerHTML = `<table class="admin-table">
            <thead><tr>
                <th>Event</th>
                <th>Source</th>
                <th>Status</th>
                <th>Message</th>
                <th>Duration</th>
                <th>Time</th>
            </tr></thead>
            <tbody>${data.map(l => `<tr>
                <td class="admin-td-mono admin-td-main">${esc(l.event_type)}</td>
                <td class="admin-td-dim">${esc(l.source || "—")}</td>
                <td>${statusBadge(l.status)}</td>
                <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;">${esc(l.message || "—")}</td>
                <td class="admin-td-mono">${l.duration_ms != null ? l.duration_ms + "ms" : "—"}</td>
                <td class="admin-td-dim">${relTime(l.created_at)}</td>
            </tr>`).join("")}</tbody>
        </table>`;
        setLastUpdated();
    } catch (e) {
        wrap.innerHTML = `<div class="admin-empty">Failed: ${e.message}</div>`;
    }
}

function logFeed(logs) {
    if (!logs.length) return `<div class="admin-empty">No recent logs.</div>`;
    return logs.map(l => `<div class="admin-log-entry">
        <span class="admin-log-dot log-dot-${l.status}"></span>
        <div class="admin-log-body">
            <span class="admin-log-msg">${esc(l.message || l.event_type)}</span>
            <span class="admin-log-meta">
                <span>${esc(l.event_type)}</span>
                <span>${relTime(l.created_at)}</span>
            </span>
        </div>
    </div>`).join("");
}

// ============================================================
// MAKE SCENARIOS
// ============================================================
async function loadMakeScenarios() {
    const wrap = document.getElementById("make-scenarios-wrap");
    wrap.innerHTML = `<div class="admin-loading">Loading scenarios…</div>`;
    try {
        // Fetch via Supabase-stored log data (Make API not directly callable from browser)
        // Show known scenarios from our session context
        const scenarios = [
            { id: 6091161, name: "📥 Document Ingestion — Log to Supabase",    active: true,  interval: "webhook",   modules: ["gateway", "http", "http"] },
            { id: 6080469, name: "💓📊 Health Heartbeat + Daily Pulse Summary", active: true,  interval: "every 15m", modules: ["http", "http", "http", "http"] },
            { id: 6080464, name: "💓 System Health Logger — Heartbeat",         active: false, interval: "—",         modules: ["http"] },
        ];

        // Cross-reference with latest heartbeat from logs to show real last-run
        const latestLogs = await sbFetch("system_logs?select=event_type,created_at&order=created_at.desc&limit=20").catch(() => []);
        const lastHeartbeat = latestLogs.find(l => l.event_type === "heartbeat")?.created_at;
        const lastPulse     = latestLogs.find(l => l.event_type === "pulse_summary")?.created_at;
        const lastIngestion = latestLogs.find(l => l.event_type === "document_ingestion")?.created_at;

        document.getElementById("make-count").textContent = `${scenarios.length} scenarios`;

        wrap.innerHTML = `<div class="admin-scenario-list">${scenarios.map(s => {
            const lastRun = s.id === 6091161 ? lastIngestion
                          : s.id === 6080469 ? lastHeartbeat
                          : null;
            return `<div class="admin-scenario-row">
                <div>
                    <div class="admin-scenario-name">${esc(s.name)}</div>
                    <div class="admin-scenario-meta">
                        ID: ${s.id} · ${s.interval} · ${s.modules.length} modules
                        ${lastRun ? ` · Last run: ${relTime(lastRun)}` : ""}
                    </div>
                </div>
                <div class="admin-scenario-actions">
                    <span class="admin-badge ${s.active ? "badge-active" : "badge-inactive"}">${s.active ? "Active" : "Inactive"}</span>
                </div>
            </div>`;
        }).join("")}</div>`;

        setLastUpdated();
    } catch (e) {
        wrap.innerHTML = `<div class="admin-empty">Failed: ${e.message}</div>`;
    }
}

// ============================================================
// UTILS
// ============================================================
function statusBadge(status) {
    const map = {
        verified:       "badge-verified",
        pending_review: "badge-pending",
        rejected:       "badge-rejected",
        failed:         "badge-failed",
        processed:      "badge-processed",
        manual_queue:   "badge-manual",
        success:        "badge-success",
        warning:        "badge-warning",
        error:          "badge-error",
        active:         "badge-active",
    };
    const cls = map[status] || "badge-inactive";
    const label = (status || "unknown").replace(/_/g, " ");
    return `<span class="admin-badge ${cls}">${label}</span>`;
}

function relTime(iso) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400)return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

function formatAmt(val) {
    if (val == null || val === "") return "—";
    const n = parseFloat(val);
    if (isNaN(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(str) {
    return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function copyWebhook() {
    const url = document.getElementById("admin-webhook-url").textContent;
    navigator.clipboard.writeText(url).then(() => showToast("Webhook URL copied."));
}

function showToast(msg) {
    const el = document.getElementById("admin-toast");
    el.textContent    = msg;
    el.style.display  = "block";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = "none"; }, 3000);
}

window.adminLogin         = adminLogin;
window.adminLogout        = adminLogout;
window.switchView         = switchView;
window.refreshCurrentView = refreshCurrentView;
window.loadTransactions   = loadTransactions;
window.loadDocuments      = loadDocuments;
window.loadLogs           = loadLogs;
window.copyWebhook        = copyWebhook;
