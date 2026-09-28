"""
incident_service.py
===================
Orchestration layer combining:
  1. Hindsight semantic memory recall
  2. Groq LLM reasoning (openai/gpt-oss-120b) grounded in recalled incidents
  3. Hindsight memory retention
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from hindsight_client import HindsightClient, IncidentMemory

# Optional import of groq SDK
try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False


class IncidentSubmission(BaseModel):
    title: str = Field(..., example="502 Bad Gateway under sudden traffic spike")
    symptoms: str = Field(..., example="worker_connections are not enough in nginx error.log")
    affected_system: str = Field(..., example="Web Server / Nginx")
    severity: str = Field(default="HIGH", example="HIGH")


class IncidentResponse(BaseModel):
    incident_id: str
    title: str
    affected_system: str
    severity: str
    symptoms: str
    suggested_fix: str
    recalled_incidents: List[Dict[str, Any]]
    llm_model: str
    hindsight_mode: str
    traces: List[Dict[str, Any]]


class IncidentService:
    def __init__(self, hindsight_client: HindsightClient):
        self.hindsight = hindsight_client
        self.groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
        self.groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        
        self.groq_client = None
        if GROQ_AVAILABLE and self.groq_api_key and self.groq_api_key != "your_groq_api_key_here":
            try:
                self.groq_client = Groq(api_key=self.groq_api_key)
            except Exception as e:
                print(f"[IncidentService] Warning: Could not initialize Groq client: {e}")

    def process_new_incident(self, submission: IncidentSubmission) -> IncidentResponse:
        """
        Full Incident Recall Lifecycle:
          Step 1: RECALL similar past incidents from Hindsight memory
          Step 2: PROMPT Groq LLM with symptoms + recalled incident context
          Step 3: RETAIN the newly submitted incident to Hindsight memory
          Step 4: Return suggestion + recalled incidents + memory traces
        """
        # Step 1: RECALL from Hindsight
        recall_result = self.hindsight.recall(
            query=submission.symptoms,
            affected_system=submission.affected_system,
            limit=3,
            min_score=0.10
        )
        recalled_items = recall_result.get("recalled_items", [])
        recall_trace = recall_result.get("trace")

        # Step 2: Generate Fix using Groq (or grounded fallback if no key)
        suggested_fix, model_used = self._generate_grounded_suggestion(
            submission=submission,
            recalled_incidents=recalled_items
        )

        # Step 3: RETAIN to Hindsight
        new_id = f"inc-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}"
        incident_record = IncidentMemory(
            id=new_id,
            timestamp=datetime.utcnow().isoformat() + "Z",
            title=submission.title,
            symptoms=submission.symptoms,
            root_cause=f"AI-Diagnosed from live symptoms & {len(recalled_items)} recalled incident(s)",
            resolution=suggested_fix,
            severity=submission.severity,
            affected_system=submission.affected_system
        )
        
        retain_result = self.hindsight.retain(incident_record)
        retain_trace = retain_result.get("trace")

        traces = []
        if recall_trace:
            traces.append(recall_trace)
        if retain_trace:
            traces.append(retain_trace)

        return IncidentResponse(
            incident_id=new_id,
            title=submission.title,
            affected_system=submission.affected_system,
            severity=submission.severity,
            symptoms=submission.symptoms,
            suggested_fix=suggested_fix,
            recalled_incidents=recalled_items,
            llm_model=model_used,
            hindsight_mode=self.hindsight.get_traces()[0].mode if self.hindsight.get_traces() else "Hindsight",
            traces=traces
        )

    def _generate_grounded_suggestion(
        self,
        submission: IncidentSubmission,
        recalled_incidents: List[Dict[str, Any]]
    ) -> tuple[str, str]:
        """
        Builds the prompt injecting Hindsight recalled memories, then invokes Groq.
        If Groq API key is not supplied, generates a deterministic grounded SRE runbook
        based strictly on the recalled memories.
        """
        # Format recalled incidents for prompt grounding
        if recalled_incidents:
            memory_context_lines = []
            for idx, past in enumerate(recalled_incidents, 1):
                pct = int(past.get("score", 0.0) * 100)
                memory_context_lines.append(
                    f"--- PAST INCIDENT #{idx} (Similarity: {pct}%) ---\n"
                    f"Title: {past.get('title')}\n"
                    f"System: {past.get('affected_system')} | Severity: {past.get('severity')}\n"
                    f"Past Symptoms: {past.get('symptoms')}\n"
                    f"Past Root Cause: {past.get('root_cause')}\n"
                    f"Proven Resolution:\n{past.get('resolution')}\n"
                )
            recalled_context_str = "\n".join(memory_context_lines)
        else:
            recalled_context_str = "No prior matching incidents found in Hindsight memory for this pattern."

        system_prompt = (
            "You are 'Incident Recall', a senior Site Reliability Engineering (SRE) and Security Incident Commander.\n"
            "Your superpower is long-term memory: you remember exact details of historical infrastructure outages.\n"
            "Whenever a new incident arrives, you receive recalled memories from Hindsight. You MUST ground your diagnosis "
            "and fix on those past incidents, citing the historical solutions and adapting them to the new error logs."
        )

        user_prompt = f"""
NEW ACTIVE INCIDENT:
Title: {submission.title}
Affected System: {submission.affected_system}
Severity: {submission.severity}
Symptoms / Error Log:
{submission.symptoms}

============================================================
RECALLED HISTORICAL INCIDENTS FROM HINDSIGHT PERSISTENT MEMORY:
============================================================
{recalled_context_str}

============================================================
INSTRUCTIONS:
1. Ground your answer in the recalled past incident(s) above if relevant.
2. Provide a clear 3-part response:
   - **Diagnosis**: What is happening under the hood? (Explicitly mention if this mirrors a past incident)
   - **Immediate Remediation Steps**: Concrete shell commands, config tweaks, or runbook steps to recover service immediately.
   - **Verification & Permanent Prevention**: How to verify the fix and prevent recurrence.
"""

        if self.groq_client:
            try:
                # Call Groq API with openai/gpt-oss-120b
                response = self.groq_client.chat.completions.create(
                    model=self.groq_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.2,
                    max_tokens=1500,
                )
                content = response.choices[0].message.content
                return content, f"Groq ({self.groq_model})"
            except Exception as e:
                # If the specific model isn't active on the user's tier, fallback to llama-3.3-70b-versatile or local
                try:
                    fallback_response = self.groq_client.chat.completions.create(
                        model="llama-3.3-70b-versatile",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.2,
                        max_tokens=1500,
                    )
                    return fallback_response.choices[0].message.content, "Groq (llama-3.3-70b-versatile fallback)"
                except Exception as inner_e:
                    print(f"[IncidentService] Groq API call failed: {inner_e}")

        # Grounded Fallback Mode (Runs without requiring API keys or network)
        if recalled_incidents:
            top_past = recalled_incidents[0]
            sim_pct = int(top_past.get("score", 0.0) * 100)
            fallback_text = (
                f"### 🔍 Diagnosis (Grounded in Hindsight Memory)\n"
                f"This incident strongly matches **Past Incident '{top_past.get('title')}'** (Similarity Score: {sim_pct}%).\n"
                f"Root cause in historical memory: *{top_past.get('root_cause')}*.\n"
                f"The active symptoms indicate the same failure signature on `{submission.affected_system}`.\n\n"
                f"### ⚡ Immediate Remediation (Proven Runbook Fix)\n"
                f"Apply the remediation validated in past incident:\n\n"
                f"```bash\n"
                f"# Step 1: Mitigate active bottleneck / lock\n"
                f"{top_past.get('resolution')}\n"
                f"```\n\n"
                f"### 🛡️ Verification & Prevention\n"
                f"- Confirm service recovery and check system metrics.\n"
                f"- Set up alerting threshold in monitoring daemon to catch early warnings.\n"
                f"- Retain this incident resolution to Hindsight to reinforce model recall confidence."
            )
        else:
            fallback_text = (
                f"### 🔍 Diagnosis\n"
                f"Investigating novel incident on `{submission.affected_system}`: '{submission.title}'.\n"
                f"No direct identical incident was recalled in Hindsight memory (symptoms represent a new failure mode).\n\n"
                f"### ⚡ Immediate Remediation\n"
                f"1. Isolate the affected node or pod on `{submission.affected_system}`.\n"
                f"2. Inspect recent deployments and resource saturation via `top`, `dmesg`, and application logs.\n"
                f"3. Once resolved, submit the final resolution to Hindsight so future occurrences are resolved automatically."
            )

        return fallback_text, "Grounded Engine (Hindsight Context Injection)"
