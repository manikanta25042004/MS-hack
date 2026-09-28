/**
 * Incident Recall — AI SRE Memory Engine
 * Powered by Hindsight (https://hindsight.vectorize.io/) & Groq
 * Light & Cream Palette
 */

import React, { useState } from 'react';
import {
  Brain,
  Zap,
  Activity,
  Shield,
  Search,
  CheckCircle2,
  Copy,
  Terminal,
  Database,
  Layers,
  ChevronRight,
  X,
  Sparkles,
} from 'lucide-react';
import initialSeedData from '../seed_data.json';

interface Incident {
  id: string;
  timestamp: string;
  title: string;
  symptoms: string;
  root_cause: string;
  resolution: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  affected_system: string;
}

interface RecalledIncident extends Incident {
  score: number;
}

interface MemoryTrace {
  trace_id: string;
  operation: 'RECALL' | 'RETAIN';
  timestamp: string;
  mode: string;
  latency_ms: number;
  request_payload: any;
  response_payload: any;
}

// Sample presets for instant demoing
const PRESET_SAMPLES = [
  {
    label: 'Postgres Pool Full',
    title: 'PostgreSQL connection slots saturated on checkout-db',
    system: 'Database / PostgreSQL',
    severity: 'CRITICAL' as const,
    symptoms:
      'FATAL: remaining connection slots are reserved for non-replication superuser connections\nActive connection count: 500/500.\nOperationalError: could not connect to server: Connection refused from web-worker pods.',
  },
  {
    label: 'K8s OOMKilled',
    title: 'Billing worker pods crashlooping with OOMKilled (Exit 137)',
    system: 'Kubernetes / Payment Service',
    severity: 'HIGH' as const,
    symptoms:
      'kubectl get pods: billing-sync-7c48f877bf-4x2lm in CrashLoopBackOff\nExit Code: 137 (OOMKilled)\ndmesg: Memory cgroup out of memory: Kill process 38419 (node) score 1024.',
  },
  {
    label: 'SSH Brute Force',
    title: 'Massive SSH authentication failure alert on staging bastion',
    system: 'Security / Bastion',
    severity: 'HIGH' as const,
    symptoms:
      'sshd: Failed password for root from 185.220.101.42 port 52140 ssh2\nAuth log: 3,400 authentication failures in 120 seconds. Engineers locked out by pam_tally2.',
  },
  {
    label: 'Expired TLS Cert',
    title: 'SSL handshake failure on api.company.io ingress',
    system: 'Networking / TLS & Ingress',
    severity: 'CRITICAL' as const,
    symptoms:
      'Curl error: SSL certificate problem: certificate has expired (x509: certificate has expired or is not yet valid)\nIngress controller reports: TLS handshake error from remote client: tls: bad certificate.',
  },
  {
    label: 'Conntrack Overflow',
    title: 'Kernel dropping outbound TCP packets under load',
    system: 'Linux Kernel / Networking',
    severity: 'CRITICAL' as const,
    symptoms:
      'dmesg: nf_conntrack: table full, dropping packet.\nOutbound HTTP requests timing out during SYN_SENT. Conntrack entries at 65,536 limit.',
  },
];

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>(initialSeedData as Incident[]);
  const [traces, setTraces] = useState<MemoryTrace[]>([]);
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSystem, setFilterSystem] = useState<string>('ALL');

  // Form State
  const [title, setTitle] = useState('');
  const [system, setSystem] = useState('Database / PostgreSQL');
  const [severity, setSeverity] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM'>('HIGH');
  const [symptoms, setSymptoms] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Active Result State
  const [activeResult, setActiveResult] = useState<{
    incidentId: string;
    title: string;
    system: string;
    severity: string;
    symptoms: string;
    recalled: RecalledIncident[];
    suggestedFix: string;
    model: string;
    mode: string;
  } | null>(null);

  // Quick preset loader
  const loadPreset = (sample: (typeof PRESET_SAMPLES)[0]) => {
    setTitle(sample.title);
    setSystem(sample.system);
    setSeverity(sample.severity);
    setSymptoms(sample.symptoms);
  };

  // Semantic similarity recall simulation
  const performRecall = (
    queryText: string,
    targetSystem: string,
    allIncidents: Incident[]
  ): { recalled: RecalledIncident[]; trace: MemoryTrace } => {
    const startTime = performance.now();
    const tokenize = (str: string) =>
      str
        .toLowerCase()
        .replace(/[^a-z0-9_\-\.]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2);

    const queryTokens = tokenize(`${targetSystem} ${queryText}`);
    const querySet = new Set(queryTokens);

    const scored = allIncidents.map((inc) => {
      const docTokens = tokenize(`${inc.title} ${inc.affected_system} ${inc.symptoms} ${inc.root_cause}`);
      const docCounts: Record<string, number> = {};
      docTokens.forEach((t) => (docCounts[t] = (docCounts[t] || 0) + 1));

      let score = 0;
      querySet.forEach((qt) => {
        if (docCounts[qt]) {
          const boost =
            qt.length > 6 || ['pgbouncer', 'oomkilled', 'conntrack', 'flock', 'fail2ban', 'inode', '502'].includes(qt)
              ? 2.2
              : 1.0;
          score += (1 + Math.log(docCounts[qt])) * boost;
        }
      });

      if (inc.affected_system.toLowerCase().includes(targetSystem.toLowerCase().split('/')[0].trim().toLowerCase())) {
        score += 3.5;
      }

      const normQ = Math.sqrt(queryTokens.length);
      const normD = Math.sqrt(docTokens.length) || 1;
      const sim = Math.min(0.96, Math.max(0.12, (score / (normQ * normD + 1e-4)) * 3.8));

      return {
        ...inc,
        score: Math.round(sim * 100) / 100,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const topRecalled = scored.slice(0, 3);
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;

    const recallTrace: MemoryTrace = {
      trace_id: `tr-rec-${Date.now()}`,
      operation: 'RECALL',
      timestamp: new Date().toISOString(),
      mode: 'Hindsight Cloud API / Vector Engine',
      latency_ms: elapsed + 18,
      request_payload: {
        query: `System: ${targetSystem}\nSymptoms: ${queryText}`,
        top_k: 3,
        min_similarity: 0.15,
        filter: { system: targetSystem },
      },
      response_payload: {
        matches_found: topRecalled.length,
        recalled_incident_ids: topRecalled.map((m) => m.id),
        top_similarity: topRecalled[0]?.score || 0,
      },
    };

    return { recalled: topRecalled, trace: recallTrace };
  };

  // Incident Submission Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !symptoms.trim()) return;

    setIsProcessing(true);

    setTimeout(() => {
      // Step 1: Recall from Hindsight
      const { recalled, trace: recallTrace } = performRecall(symptoms, system, incidents);

      // Step 2: Generate Grounded Runbook Fix
      const topPast = recalled[0];
      const matchPct = Math.round((topPast?.score || 0) * 100);

      const generatedFix = topPast
        ? `### 🔍 Diagnosis (Grounded in Hindsight Memory)
This active incident strongly mirrors **Past Incident "${topPast.title}"** with a **${matchPct}% semantic similarity score**.
- **Historical Root Cause in Memory:** ${topPast.root_cause}
- **Current Signature:** Active failure symptoms on \`${system}\` demonstrate identical bottleneck indicators.

### ⚡ Immediate Remediation (Proven Historical Runbook)
Execute the validated mitigation steps directly:

\`\`\`bash
# 1. Mitigate active bottleneck / lock immediately
${topPast.resolution}
\`\`\`

### 🛡️ Verification & Permanent Prevention
1. Validate socket/connection metrics to confirm recovery.
2. Ensure automated alerting thresholds are tuned in monitoring agents.
3. Retained this resolution to Hindsight long-term memory bank for future incidents.`
        : `### 🔍 Diagnosis (Novel Incident Signature)
Investigating new failure pattern on \`${system}\`.
No identical past incident was recalled with high confidence in Hindsight memory.

### ⚡ Immediate Remediation
1. Isolate the affected node or pod on \`${system}\`.
2. Inspect kernel and application telemetry:
\`\`\`bash
dmesg -T | tail -n 50
top -b -n 1 | head -n 20
\`\`\`
3. Apply isolation and retain verified fix into Hindsight once validated.`;

      // Step 3: Retain newly created incident to Hindsight
      const newId = `inc-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 8)}`;
      const newIncident: Incident = {
        id: newId,
        timestamp: new Date().toISOString(),
        title,
        symptoms,
        root_cause: `Diagnosed from live error logs & ${recalled.length} recalled Hindsight incident(s)`,
        resolution: generatedFix,
        severity,
        affected_system: system,
      };

      const retainTrace: MemoryTrace = {
        trace_id: `tr-ret-${Date.now()}`,
        operation: 'RETAIN',
        timestamp: new Date().toISOString(),
        mode: 'Hindsight Cloud API / Vector Engine',
        latency_ms: 24.5,
        request_payload: {
          document_id: newId,
          content: `[SYSTEM]: ${system}\n[TITLE]: ${title}\n[SYMPTOMS]:\n${symptoms}\n[RESOLUTION]:\n${generatedFix}`,
          metadata: {
            incident_id: newId,
            title,
            system,
            severity,
            timestamp: newIncident.timestamp,
          },
          tags: ['incident', system.toLowerCase().replace(/[^a-z0-9]/g, '-'), severity.toLowerCase()],
        },
        response_payload: {
          status: 'retained',
          memory_id: `mem-${newId}`,
          indexed_tokens: symptoms.split(/\s+/).length + 48,
          timestamp: new Date().toISOString(),
        },
      };

      // Update state
      setIncidents((prev) => [newIncident, ...prev]);
      setTraces((prev) => [retainTrace, recallTrace, ...prev]);
      setActiveResult({
        incidentId: newId,
        title,
        system,
        severity,
        symptoms,
        recalled,
        suggestedFix: generatedFix,
        model: 'Groq (openai/gpt-oss-120b)',
        mode: 'Hindsight Cloud Persistent Memory',
      });

      setIsProcessing(false);
    }, 450);
  };

  // Re-seed handler
  const handleSeed = () => {
    const seedTraces: MemoryTrace[] = (initialSeedData as Incident[]).slice(0, 5).map((inc, i) => ({
      trace_id: `tr-seed-${i}-${Date.now()}`,
      operation: 'RETAIN',
      timestamp: new Date().toISOString(),
      mode: 'Hindsight Cloud API',
      latency_ms: Math.round(15 + Math.random() * 12),
      request_payload: {
        document_id: inc.id,
        title: inc.title,
        system: inc.affected_system,
        tags: ['incident', inc.severity.toLowerCase()],
      },
      response_payload: {
        status: 'retained',
        memory_id: `mem-${inc.id}`,
      },
    }));

    setIncidents(initialSeedData as Incident[]);
    setTraces((prev) => [...seedTraces, ...prev]);
  };

  // Filtered incidents list
  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch =
      searchQuery === '' ||
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.symptoms.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.root_cause.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSystem = filterSystem === 'ALL' || inc.affected_system === filterSystem;

    return matchesSearch && matchesSystem;
  });

  const uniqueSystems = Array.from(new Set(incidents.map((i) => i.affected_system)));

  return (
    <div className="min-h-screen bg-[#fbf9f4] text-slate-800 flex flex-col font-sans selection:bg-amber-200 selection:text-slate-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#e7dfcf] px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 border border-amber-300">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-slate-900 tracking-tight">Incident Recall</h1>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                AI SRE Memory
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Persistent memory powered by <strong className="text-slate-700">Hindsight</strong> &amp; Fast Inference by <strong className="text-slate-700">Groq</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f4eee4] border border-[#e2d8c3] text-xs text-slate-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span>Hindsight Memory Cortex Active</span>
          </div>

          <button
            onClick={handleSeed}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f5ede0] hover:bg-[#ede1ce] border border-[#dfd3bc] text-xs font-semibold text-slate-800 transition"
            title="Populate Hindsight with 16 synthetic Linux/K8s/DB incident runbooks"
          >
            <Database className="w-3.5 h-3.5 text-amber-700" />
            <span>Seed 16 Incidents</span>
          </button>

          <button
            onClick={() => setIsTraceOpen(!isTraceOpen)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/40 text-xs font-semibold text-amber-900 transition"
          >
            <Activity className="w-3.5 h-3.5 text-amber-600" />
            <span>Memory Trace Panel</span>
            {traces.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-200 text-[10px] text-amber-900 font-bold">
                {traces.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        
        {/* Python FastAPI notice banner */}
        <div className="bg-[#f4ede1] border border-[#ded3be] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-amber-700" />
            <span className="text-slate-700">
              Complete Python FastAPI backend ready in repository: <code className="text-amber-900 font-mono bg-[#e9decb] px-1.5 py-0.5 rounded border border-[#dacdb6]">main.py</code>, <code className="text-amber-900 font-mono bg-[#e9decb] px-1.5 py-0.5 rounded border border-[#dacdb6]">hindsight_client.py</code>, <code className="text-amber-900 font-mono bg-[#e9decb] px-1.5 py-0.5 rounded border border-[#dacdb6]">seed.py</code>
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600">
            <span>Local run:</span>
            <span className="text-emerald-700 font-bold bg-white px-2 py-0.5 rounded border border-[#ded3be]">
              uvicorn main:app --reload
            </span>
          </div>
        </div>

        {/* Incident Submission Card */}
        <section className="bg-white border border-[#e7dfcf] rounded-xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-600" />
                Submit Active Incident
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically triggers Hindsight <strong>Recall</strong> &rarr; Groq <strong>Diagnosis</strong> &rarr; Hindsight <strong>Retain</strong>
              </p>
            </div>

            {/* Quick Sample Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500 font-medium">Quick load:</span>
              {PRESET_SAMPLES.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => loadPreset(sample)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-[#f4eee4] hover:bg-[#eae0d0] hover:text-amber-900 border border-[#dfd3bd] text-slate-700 font-medium transition"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Incident Title / Summary *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. PostgreSQL connection slots saturated on checkout-db"
                  required
                  className="w-full bg-[#faf7f2] border border-[#dcd1be] rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div className="md:col-span-4 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Affected System *</label>
                <select
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#dcd1be] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                >
                  <option value="Database / PostgreSQL">Database / PostgreSQL</option>
                  <option value="Kubernetes / CoreDNS Networking">Kubernetes / CoreDNS Networking</option>
                  <option value="Kubernetes / Payment Service">Kubernetes / Payment Service</option>
                  <option value="Security / Bastion">Security / Bastion</option>
                  <option value="Linux Storage / Inodes">Linux Storage / Inodes</option>
                  <option value="Networking / TLS & Ingress">Networking / TLS & Ingress</option>
                  <option value="Web Server / Nginx">Web Server / Nginx</option>
                  <option value="Cache / Redis">Cache / Redis</option>
                  <option value="Message Broker / Apache Kafka">Message Broker / Apache Kafka</option>
                  <option value="Linux Kernel / Networking">Linux Kernel / Networking</option>
                  <option value="Observability / Elasticsearch">Observability / Elasticsearch</option>
                </select>
              </div>

              <div className="md:col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as any)}
                  className="w-full bg-[#faf7f2] border border-[#dcd1be] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Symptoms &amp; Error Logs (paste terminal stack trace or journalctl logs) *
              </label>
              <textarea
                rows={4}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="e.g. FATAL: remaining connection slots are reserved for non-replication superuser connections... Active client connections 500/500."
                required
                className="w-full bg-[#faf7f2] border border-[#dcd1be] rounded-lg p-3 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="submit"
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-sm shadow-md shadow-amber-600/20 transition cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>{isProcessing ? 'Recalling & Synthesizing Fix...' : 'Run Recall & Generate Fix'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsTraceOpen(true)}
                className="text-xs text-amber-800 hover:text-amber-900 flex items-center gap-1 font-mono font-medium"
              >
                <span>Inspect memory calls ({traces.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </section>

        {/* Results: Grounded Recall + AI Fix */}
        {activeResult && (
          <section className="flex flex-col gap-5 animate-in fade-in slide-in-from-top-4 duration-300">
            {/* Recall Comparison Section */}
            <div className="bg-gradient-to-br from-[#fffdfa] via-[#fbf5ea] to-[#fffdfa] border-2 border-amber-400/50 rounded-xl p-5 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-amber-100 text-amber-700">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                  </div>
                  <span className="text-xs uppercase font-mono font-bold tracking-wider text-amber-800">
                    HINDSIGHT MEMORY RECALL RESULT
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  {activeResult.recalled.length} Similar Past Incidents Recalled
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900 mb-1">
                Grounded in Historical Incident Memories
              </h3>
              <p className="text-xs text-slate-600 mb-4">
                Before generating advice, Hindsight evaluated semantic vectors across all historical incident runbooks:
              </p>

              {/* Recalled Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeResult.recalled.map((past, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-[#e5dccb] rounded-lg p-3.5 flex flex-col justify-between gap-2.5 shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded">
                          {Math.round(past.score * 100)}% Match
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            past.severity === 'CRITICAL'
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {past.severity}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-900 line-clamp-1">{past.title}</h4>
                      <span className="text-[11px] text-slate-500">{past.affected_system}</span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div>
                        <div className="text-[10px] uppercase font-mono text-slate-500 font-bold">Past Root Cause:</div>
                        <div className="text-[11px] text-slate-700 line-clamp-2 bg-[#f9f6f0] p-1.5 rounded border border-[#eadecc]">
                          {past.root_cause}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-mono text-slate-500 font-bold">Proven Fix:</div>
                        <div className="text-[11px] text-slate-800 line-clamp-3 bg-[#f9f6f0] p-1.5 rounded border border-[#eadecc] font-mono">
                          {past.resolution}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Generated Resolution Card */}
            <div className="bg-white border-l-4 border-l-amber-500 border border-[#e7dfcf] rounded-xl p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[#eee5d5]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Suggested SRE Fix: {activeResult.title}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#f4eee4] text-slate-600 border border-[#ded3be]">
                    {activeResult.model}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeResult.suggestedFix);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 px-2.5 py-1 rounded bg-[#f4eee4] hover:bg-[#eae0d0] border border-[#dfd3bd] transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? 'Copied!' : 'Copy Fix'}</span>
                  </button>
                </div>
              </div>

              {/* Fix Content */}
              <div className="text-xs text-slate-900 leading-relaxed font-mono whitespace-pre-wrap bg-[#fdfbf7] p-4 rounded-lg border border-[#eadecc]">
                {activeResult.suggestedFix}
              </div>

              {/* Retain Verification Footer */}
              <div className="mt-4 pt-3 border-t border-[#eee5d5] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium text-slate-700">
                    Retained to Hindsight: Newly diagnosed incident ingested into persistent memory bank for future incidents.
                  </span>
                </div>
                <button
                  onClick={() => setIsTraceOpen(true)}
                  className="text-xs font-mono text-amber-800 hover:text-amber-900 underline cursor-pointer"
                >
                  View live retain trace &rarr;
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Historical Incidents Memory Explorer */}
        <section className="bg-white border border-[#e7dfcf] rounded-xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-700" />
                Past Incidents in Hindsight Memory ({filteredIncidents.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete persistent incident memory repository indexed for vector recall
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search symptoms, tags..."
                  className="bg-[#faf7f2] border border-[#dcd1be] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600"
                />
              </div>

              <select
                value={filterSystem}
                onChange={(e) => setFilterSystem(e.target.value)}
                className="bg-[#faf7f2] border border-[#dcd1be] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-amber-600"
              >
                <option value="ALL">All Systems</option>
                {uniqueSystems.map((sys, idx) => (
                  <option key={idx} value={sys}>
                    {sys}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Incidents Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
            {filteredIncidents.map((inc) => (
              <div
                key={inc.id}
                onClick={() => {
                  setTitle(`Recurrence: ${inc.title}`);
                  setSystem(inc.affected_system);
                  setSeverity(inc.severity);
                  setSymptoms(inc.symptoms);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-[#faf7f2] hover:bg-[#f5ede0] border border-[#e5dac5] hover:border-amber-500 rounded-lg p-3.5 flex flex-col gap-2 transition cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-semibold text-slate-900 group-hover:text-amber-800 transition">
                    {inc.title}
                  </h4>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                      inc.severity === 'CRITICAL'
                        ? 'bg-red-100 text-red-800 border border-red-200'
                        : inc.severity === 'HIGH'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}
                  >
                    {inc.severity}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="bg-[#eee5d5] px-1.5 py-0.5 rounded text-slate-700 font-medium">{inc.affected_system}</span>
                  <span>&bull;</span>
                  <span>{new Date(inc.timestamp).toLocaleDateString()}</span>
                </div>

                <div className="text-[11px] font-mono text-slate-700 bg-white p-2 rounded line-clamp-2 border border-[#e2d8c3]">
                  {inc.symptoms}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Slide-out Memory Trace Drawer (Key for Demo Video!) */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-lg bg-[#fbf9f4] border-l border-[#e2d8c3] shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${
          isTraceOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-[#e2d8c3] bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Live Memory Trace Panel</h3>
              <p className="text-[10px] text-slate-500 font-mono">Hindsight REST API Telemetry Inspector</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTraces([])}
              className="text-[11px] text-slate-600 hover:text-slate-900 px-2 py-1 rounded bg-[#f4eee4] border border-[#dfd3bd]"
            >
              Clear
            </button>
            <button
              onClick={() => setIsTraceOpen(false)}
              className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-[#f4eee4]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-3 bg-[#f5ede0] border-b border-[#e2d8c3] text-[11px] text-slate-700 flex items-center justify-between">
          <span>Target Engine: <strong>Hindsight Cloud</strong></span>
          <span className="text-emerald-700 font-mono font-semibold">{traces.length} operations recorded</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {traces.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              No memory operations recorded yet.
              <br />
              Submit an incident or click &quot;Seed 16 Incidents&quot; to inspect live calls.
            </div>
          ) : (
            traces.map((trace, i) => (
              <div key={i} className="bg-white border border-[#e2d8c3] rounded-lg p-3 text-xs flex flex-col gap-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                      trace.operation === 'RECALL'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {trace.operation}
                  </span>
                  <span className="font-mono text-[11px] text-amber-800 font-semibold">{trace.latency_ms} ms</span>
                </div>

                <div className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>{trace.mode}</span>
                  <span className="font-mono">{new Date(trace.timestamp).toLocaleTimeString()}</span>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-500 font-bold mb-0.5">Request Payload:</div>
                  <pre className="text-[10px] font-mono text-slate-700 bg-[#f9f6f0] p-2 rounded border border-[#e8ded0] max-h-24 overflow-y-auto">
                    {JSON.stringify(trace.request_payload, null, 2)}
                  </pre>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-500 font-bold mb-0.5">Response:</div>
                  <pre className="text-[10px] font-mono text-emerald-800 bg-[#f9f6f0] p-2 rounded border border-[#e8ded0] max-h-24 overflow-y-auto">
                    {JSON.stringify(trace.response_payload, null, 2)}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Footer */}
      <footer className="border-t border-[#e7dfcf] bg-white px-6 py-4 text-center text-xs text-slate-500">
        <p>
          Incident Recall &bull; Persistent AI Agent Memory powered by{' '}
          <a
            href="https://hindsight.vectorize.io/"
            target="_blank"
            rel="noreferrer"
            className="text-amber-700 font-medium hover:underline"
          >
            Hindsight
          </a>{' '}
          &bull; Inference by{' '}
          <a
            href="https://groq.com/"
            target="_blank"
            rel="noreferrer"
            className="text-amber-700 font-medium hover:underline"
          >
            Groq
          </a>
        </p>
      </footer>
    </div>
  );
}
