/**
 * Incident Recall — Vanilla JS Single-Page App
 * Handles:
 *  1. Health & status polling
 *  2. Quick incident sample chips
 *  3. Submitting active incidents (Recall -> Groq -> Retain)
 *  4. Live Hindsight memory trace drawer & raw JSON viewer (for demo video)
 *  5. Rendering recalled incidents & SRE AI diagnosis
 *  6. Seeding 16 synthetic incidents
 */

const API_BASE = "";

// Sample incident presets for realistic live demo
const SAMPLE_PRESETS = {
  pg_conn: {
    title: "PostgreSQL connection slots saturated on checkout-db",
    system: "Database / PostgreSQL",
    severity: "CRITICAL",
    symptoms: "FATAL: remaining connection slots are reserved for non-replication superuser connections\nActive connection count: 500/500.\nOperationalError: could not connect to server: Connection refused from web-worker pods."
  },
  oom_k8s: {
    title: "Billing worker pods crashlooping with OOMKilled",
    system: "Kubernetes / Payment Service",
    severity: "HIGH",
    symptoms: "kubectl get pods: billing-sync-7c48f877bf-4x2lm in CrashLoopBackOff\nExit Code: 137 (OOMKilled)\ndmesg: Memory cgroup out of memory: Kill process 38419 (node) score 1024."
  },
  ssh_brute: {
    title: "Massive SSH authentication failure alert on staging bastion",
    system: "Security / Bastion",
    severity: "HIGH",
    symptoms: "sshd: Failed password for root from 185.220.101.42 port 52140 ssh2\nAuth log: 3,400 authentication failures in 120 seconds. Engineers locked out by pam_tally2."
  },
  tls_cert: {
    title: "SSL handshake failure on api.company.io ingress",
    system: "Networking / TLS & Ingress",
    severity: "CRITICAL",
    symptoms: "Curl error: SSL certificate problem: certificate has expired (x509: certificate has expired or is not yet valid)\nIngress controller reports: TLS handshake error from remote client: tls: bad certificate."
  },
  conntrack: {
    title: "Kernel dropping outbound TCP packets under load",
    system: "Linux Kernel / Networking",
    severity: "CRITICAL",
    symptoms: "dmesg: nf_conntrack: table full, dropping packet.\nOutbound HTTP requests timing out during SYN_SENT. Conntrack entries at 65,536 limit."
  }
};

let currentTraces = [];

// DOM Elements
const hindsightStatus = document.getElementById("hindsightStatus");
const hindsightStatusText = document.getElementById("hindsightStatusText");
const seedBtn = document.getElementById("seedBtn");
const toggleTraceBtn = document.getElementById("toggleTraceBtn");
const closeTraceBtn = document.getElementById("closeTraceBtn");
const clearTracesBtn = document.getElementById("clearTracesBtn");
const traceDrawer = document.getElementById("traceDrawer");
const traceList = document.getElementById("traceList");
const traceCountBadge = document.getElementById("traceCountBadge");

const incidentForm = document.getElementById("incidentForm");
const incidentTitle = document.getElementById("incidentTitle");
const affectedSystem = document.getElementById("affectedSystem");
const severitySelect = document.getElementById("severitySelect");
const incidentSymptoms = document.getElementById("incidentSymptoms");
const submitBtn = document.getElementById("submitBtn");
const formFeedback = document.getElementById("formFeedback");

const resultsSection = document.getElementById("resultsSection");
const recalledIncidentsList = document.getElementById("recalledIncidentsList");
const recalledCountBadge = document.getElementById("recalledCountBadge");
const aiFixTitle = document.getElementById("aiFixTitle");
const aiFixContent = document.getElementById("aiFixContent");
const llmModelBadge = document.getElementById("llmModelBadge");
const copyFixBtn = document.getElementById("copyFixBtn");
const viewRetainTraceBtn = document.getElementById("viewRetainTraceBtn");

const incidentHistoryList = document.getElementById("incidentHistoryList");
const searchInput = document.getElementById("searchInput");
const totalMemoryCount = document.getElementById("totalMemoryCount");

// Initialize on Load
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  checkHealth();
  fetchIncidents();
  fetchTraces();
});

function setupEventListeners() {
  // Trace Drawer toggling
  toggleTraceBtn.addEventListener("click", () => traceDrawer.classList.toggle("open"));
  closeTraceBtn.addEventListener("click", () => traceDrawer.classList.remove("open"));
  viewRetainTraceBtn.addEventListener("click", () => traceDrawer.classList.add("open"));
  clearTracesBtn.addEventListener("click", () => {
    currentTraces = [];
    renderTraces();
  });

  // Seed Button
  seedBtn.addEventListener("click", handleSeed);

  // Quick Preset Chips
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const sampleKey = chip.getAttribute("data-sample");
      const sample = SAMPLE_PRESETS[sampleKey];
      if (sample) {
        incidentTitle.value = sample.title;
        affectedSystem.value = sample.system;
        severitySelect.value = sample.severity;
        incidentSymptoms.value = sample.symptoms;
        incidentTitle.focus();
      }
    });
  });

  // Form Submit
  incidentForm.addEventListener("submit", handleIncidentSubmit);

  // Search filter
  searchInput.addEventListener("input", (e) => {
    fetchIncidents(e.target.value);
  });

  // Copy Fix
  copyFixBtn.addEventListener("click", () => {
    const text = aiFixContent.innerText;
    navigator.clipboard.writeText(text).then(() => {
      copyFixBtn.textContent = "Copied!";
      setTimeout(() => (copyFixBtn.textContent = "Copy Fix"), 2000);
    });
  });
}

// 1. Health & Mode Check
async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (res.ok) {
      const data = await res.json();
      hindsightStatusText.textContent = data.hindsight_mode || "Hindsight Active";
      if (data.hindsight_configured) {
        hindsightStatus.style.borderColor = "var(--accent-green)";
        hindsightStatusText.style.color = "#86efac";
      } else {
        hindsightStatusText.textContent = "Hindsight Memory (Local Mode)";
      }
    }
  } catch (err) {
    hindsightStatusText.textContent = "Hindsight Standby";
  }
}

// 2. Fetch Incidents
async function fetchIncidents(searchTerm = "") {
  try {
    const url = searchTerm 
      ? `${API_BASE}/incidents?search=${encodeURIComponent(searchTerm)}`
      : `${API_BASE}/incidents`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    renderIncidentHistory(data.incidents || []);
  } catch (err) {
    console.error("Failed to load incidents:", err);
  }
}

// Render incident list
function renderIncidentHistory(incidents) {
  totalMemoryCount.textContent = `${incidents.length} Memories`;
  
  if (incidents.length === 0) {
    incidentHistoryList.innerHTML = `<div class="trace-empty">No incidents found in memory. Click "Seed 16 Past Incidents" to populate.</div>`;
    return;
  }

  incidentHistoryList.innerHTML = incidents.map(inc => `
    <div class="history-item" onclick="loadIncidentIntoForm('${escapeHtml(inc.id)}')">
      <div class="history-item-top">
        <h4 class="history-item-title">${escapeHtml(inc.title)}</h4>
        <span class="tag-severity sev-${escapeHtml(inc.severity)}">${escapeHtml(inc.severity)}</span>
      </div>
      <div class="history-tags">
        <span class="tag-system">${escapeHtml(inc.affected_system)}</span>
        <span style="font-size:0.75rem; color:var(--text-muted);">${formatTimestamp(inc.timestamp)}</span>
      </div>
      <div class="history-item-body">${escapeHtml(inc.symptoms)}</div>
    </div>
  `).join("");
}

// Quick click on history item to inspect
window.loadIncidentIntoForm = function(incidentId) {
  fetch(`${API_BASE}/incidents`)
    .then(r => r.json())
    .then(data => {
      const inc = (data.incidents || []).find(i => i.id === incidentId);
      if (inc) {
        incidentTitle.value = `Recurrence: ${inc.title}`;
        affectedSystem.value = inc.affected_system;
        severitySelect.value = inc.severity;
        incidentSymptoms.value = inc.symptoms;
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
};

// 3. Handle Submit: Recall -> LLM -> Retain
async function handleIncidentSubmit(e) {
  e.preventDefault();
  
  const title = incidentTitle.value.trim();
  const symptoms = incidentSymptoms.value.trim();
  const system = affectedSystem.value;
  const severity = severitySelect.value;

  if (!title || !symptoms) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="pulse-dot"></span> Recalling Memory &amp; Generating Fix...`;
  formFeedback.textContent = "Step 1/3: Querying Hindsight semantic memory...";

  try {
    const payload = {
      title,
      symptoms,
      affected_system: system,
      severity
    };

    const res = await fetch(`${API_BASE}/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const data = await res.json();

    // Render results
    renderResults(data);

    // Update traces
    if (data.traces && data.traces.length > 0) {
      currentTraces = [...data.traces, ...currentTraces];
      renderTraces();
    }

    // Refresh history list
    fetchIncidents();
    checkHealth();

    formFeedback.textContent = "Done! Fix generated and incident retained to Hindsight.";
    setTimeout(() => (formFeedback.textContent = ""), 4000);

  } catch (err) {
    formFeedback.textContent = `Error: ${err.message}`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span class="btn-icon">⚡</span> Run Recall &amp; Generate Fix`;
  }
}

// 4. Render Results (Recalled Memories + AI Suggestion)
function renderResults(data) {
  resultsSection.classList.remove("hidden");
  
  // 1. Recalled past incidents
  const recalled = data.recalled_incidents || [];
  recalledCountBadge.textContent = `${recalled.length} Past Incident(s) Recalled from Hindsight`;

  if (recalled.length === 0) {
    recalledIncidentsList.innerHTML = `
      <div style="grid-column: 1/-1; padding: 1rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); font-size: 0.85rem; color: var(--text-muted);">
        No close matches found in Hindsight memory bank for this novel failure signature.
      </div>
    `;
  } else {
    recalledIncidentsList.innerHTML = recalled.map(past => {
      const pct = Math.round((past.score || 0) * 100);
      return `
        <div class="recalled-card">
          <div class="recalled-card-top">
            <span class="similarity-score">⚡ ${pct}% Semantic Match</span>
            <span class="tag-severity sev-${escapeHtml(past.severity)}">${escapeHtml(past.severity)}</span>
          </div>
          <h4 class="recalled-title">${escapeHtml(past.title)}</h4>
          <div class="recalled-meta">
            <span>${escapeHtml(past.affected_system)}</span>
            <span>&bull;</span>
            <span>${formatTimestamp(past.timestamp)}</span>
          </div>
          
          <div>
            <div class="recalled-box-label">Historical Root Cause:</div>
            <div class="recalled-box">${escapeHtml(past.root_cause)}</div>
          </div>

          <div>
            <div class="recalled-box-label">Proven Fix Runbook:</div>
            <div class="recalled-box">${escapeHtml(past.resolution)}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  // 2. AI Fix
  aiFixTitle.textContent = `Diagnosis & Fix for: ${data.title}`;
  llmModelBadge.textContent = data.llm_model || "Groq (openai/gpt-oss-120b)";
  aiFixContent.innerHTML = formatMarkdown(data.suggested_fix);

  // Scroll to result
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 5. Seed Database
async function handleSeed() {
  seedBtn.disabled = true;
  seedBtn.innerHTML = `<span class="pulse-dot"></span> Retaining Seed Incidents...`;

  try {
    const res = await fetch(`${API_BASE}/seed`, { method: "POST" });
    if (!res.ok) throw new Error("Seed failed");
    const data = await res.json();
    alert(`Seeded ${data.total_seeded} incidents into Hindsight memory in ${data.elapsed_ms}ms!`);
    fetchIncidents();
    fetchTraces();
    checkHealth();
  } catch (err) {
    alert(`Seeding failed: ${err.message}`);
  } finally {
    seedBtn.disabled = false;
    seedBtn.innerHTML = `<span class="btn-icon">⚡</span> Seed 16 Past Incidents`;
  }
}

// 6. Memory Traces
async function fetchTraces() {
  try {
    const res = await fetch(`${API_BASE}/traces`);
    if (!res.ok) return;
    const data = await res.json();
    currentTraces = data.traces || [];
    renderTraces();
  } catch (err) {
    console.error("Failed to load traces:", err);
  }
}

function renderTraces() {
  traceCountBadge.textContent = `${currentTraces.length} calls`;

  if (currentTraces.length === 0) {
    traceList.innerHTML = `<div class="trace-empty">No calls recorded yet. Submit an incident or click Seed to watch live memory calls.</div>`;
    return;
  }

  traceList.innerHTML = currentTraces.map(trace => `
    <div class="trace-card">
      <div class="trace-card-top">
        <span class="op-badge op-${escapeHtml(trace.operation)}">${escapeHtml(trace.operation)}</span>
        <span class="trace-latency">${trace.latency_ms}ms</span>
      </div>
      <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.3rem;">
        Mode: <strong>${escapeHtml(trace.mode)}</strong> &bull; ${formatTimestamp(trace.timestamp)}
      </div>

      <div class="recalled-box-label">Request Payload:</div>
      <div class="trace-json">${escapeHtml(JSON.stringify(trace.request_payload, null, 2))}</div>

      <div class="recalled-box-label" style="margin-top:0.4rem;">Hindsight Response:</div>
      <div class="trace-json">${escapeHtml(JSON.stringify(trace.response_payload, null, 2))}</div>
    </div>
  `).join("");
}

// Helpers
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTimestamp(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoStr;
  }
}

// Basic Markdown Formatter for SRE Output
function formatMarkdown(md) {
  if (!md) return "";
  let html = escapeHtml(md);

  // Code blocks ```bash ... ```
  html = html.replace(/```(?:bash|sh|json|yaml)?\n([\s\S]*?)```/g, (match, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Lists
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;

  return html;
}
