# Incident Recall — AI SRE Agent with Persistent Long-Term Memory

**Incident Recall** is an AI Site Reliability Engineering (SRE) agent that remembers historical infrastructure and security incidents. When a new incident strikes, the agent semantically recalls similar past outages—their symptoms, root causes, and proven fixes—and feeds them directly into an LLM prompt (Groq's `openai/gpt-oss-120b`). Instead of hallucinating generic textbook advice, the agent provides an immediate, grounded diagnosis and runbook fix based on verified past resolutions, before retaining the new incident into persistent memory.

Persistent long-term agent memory is powered by [Hindsight](https://hindsight.vectorize.io/).

---

## Architecture & How Hindsight is Used

Hindsight operates as the external, durable memory cortex of the agent. The memory lifecycle follows three key stages:

```
                  +----------------------------------------------+
                  |           Active Incident Ingestion          |
                  |     (Title, Symptoms/Logs, System Tag)       |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------------------------------+
                  |         1. HINDSIGHT RECALL STAGE            |
                  |  - Queries Hindsight semantic memory bank    |
                  |  - Vector similarity search over symptoms    |
                  |  - Retrieves Top-K similar past incidents    |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------------------------------+
                  |             2. GROQ LLM INFERENCE            |
                  |  - Model: openai/gpt-oss-120b                |
                  |  - Grounded prompt includes recalled cases:  |
                  |    * Historical Symptoms                     |
                  |    * Historical Root Causes                  |
                  |    * Proven Runbook Resolutions              |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------------------------------+
                  |         3. HINDSIGHT RETAIN STAGE            |
                  |  - Ingests newly resolved incident into      |
                  |    Hindsight memory with system/severity tags|
                  |  - Live Memory Trace logged for audit/demo   |
                  +----------------------------------------------+
```

### 1. Retain (`hindsight_client.py` &rarr; `retain()`)
Every incident record contains:
- `document_id`: unique incident identifier (`inc-YYYYMMDD-xxxx`)
- `content`: formatted semantic document embedding symptoms, system, severity, root cause, and remediation runbooks
- `metadata`: structured tags (`incident_id`, `system`, `severity`, `timestamp`)
- `tags`: system tags (e.g. `["incident", "database-postgresql", "critical"]`)

### 2. Recall (`hindsight_client.py` &rarr; `recall()`)
When an outage happens, the incoming error logs and symptoms are dispatched to Hindsight. Vector similarity surfaces past incidents with matching signatures (e.g. PgBouncer pool starvation, Kubernetes OOMKilled cgroup limits, or DNS packet drop).

### 3. Live Telemetry / Memory Trace
Every `RETAIN` and `RECALL` call logs its execution time (latency in ms), request payload, and raw Hindsight response into the **Memory Trace Panel**, enabling transparent auditing and high-impact live demos.

---

## Tech Stack

- **Backend**: Python 3.11+, FastAPI
- **LLM**: Groq API (`openai/gpt-oss-120b` or `llama-3.3-70b-versatile`)
- **Memory Engine**: Hindsight Cloud REST API (`https://api.hindsight.vectorize.io`) with automatic local vector engine fallback
- **Frontend**: Single-page plain HTML, vanilla JavaScript, minimal CSS (served directly by FastAPI)
- **Seed Data**: 16 realistic synthetic Linux/K8s/DB/Network incident runbooks (`seed_data.json`)

---

## Quickstart & Setup Instructions

### 1. Clone & Set Up Environment

```bash
git clone <your-repo-url>
cd incident-recall

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```ini
# Groq API Key (https://console.groq.com/)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Hindsight Cloud Credentials (https://hindsight.vectorize.io/)
HINDSIGHT_API_KEY=your_hindsight_api_key_here
HINDSIGHT_PROJECT_ID=your_hindsight_project_id_here
HINDSIGHT_API_BASE_URL=https://api.hindsight.vectorize.io
```

> **Note on Offline / Zero-Key Mode**: If `GROQ_API_KEY` or `HINDSIGHT_API_KEY` are not set, Incident Recall will run smoothly using its built-in local vector similarity memory engine and grounded runbook synthesizer. You can start demonstrating immediately!

### 3. Seed Realistic Historical Incidents

Run the seed script to preload 16 production incident scenarios into Hindsight:

```bash
python seed.py
```

*Output:*
```
==================================================
  Incident Recall — Hindsight Memory Seeding Tool
==================================================
Loading 16 incidents into Hindsight...
[01/16] Retaining: PostgreSQL Connection Pool Exhaustion on Primary DB...
[02/16] Retaining: SSH Distributed Brute Force & pam_tally2 Lockout...
...
✅ Successfully retained 16 incidents into Hindsight memory.
```

*(You can also click the **"⚡ Seed 16 Past Incidents"** button directly in the web UI at any time).*

### 4. Start the Application

```bash
uvicorn main:app --reload --port 8000
```

Open your browser at **`http://localhost:8000`**.

---

## API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/incidents` | Submit a new incident. Triggers Hindsight recall &rarr; Groq LLM grounded fix &rarr; Hindsight retain. |
| `GET` | `/incidents` | Lists all past retained incidents in Hindsight memory (supports `?search=` and `?system=`). |
| `POST` | `/seed` | Ingests the 16 synthetic incidents from `seed_data.json` into Hindsight. |
| `GET` | `/traces` | Returns recent Hindsight `RETAIN` and `RECALL` telemetry traces. |
| `GET` | `/health` | Integration health check (Hindsight mode, Groq status, memory count). |

---

## Live Demo Video Walkthrough Guide

1. **Open the Web UI**: Point your browser to `http://localhost:8000`.
2. **Open the Memory Trace Panel**: Click **"📡 Memory Trace Panel"** in the top right to open the slide-out telemetry inspector.
3. **Seed Data**: Click **"⚡ Seed 16 Past Incidents"** and watch the 16 `RETAIN` calls stream live into the drawer.
4. **Test an Incident**:
   - Click one of the quick preset chips (e.g. **"Postgres Pool Full"** or **"K8s OOMKilled"**).
   - Click **"⚡ Run Recall & Generate Fix"**.
5. **Show the Before & After**:
   - Highlight the **"⚡ HINDSIGHT MEMORY RECALL"** section showing the exact past incident recalled, its semantic similarity percentage, and proven resolution.
   - Point out how the **LLM Incident Commander** tailored the diagnosis directly to that recalled runbook.
   - Show the green **"Retained to Hindsight"** verification and examine the raw JSON request/response in the **Memory Trace Drawer**.
