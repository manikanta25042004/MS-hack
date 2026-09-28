"""
main.py
=======
FastAPI application for "Incident Recall"
AI SRE Agent with Persistent Long-Term Memory powered by Hindsight.

Run locally:
  uvicorn main:app --reload --port 8000
"""

import os
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from hindsight_client import HindsightClient, IncidentMemory
from incident_service import IncidentService, IncidentSubmission, IncidentResponse
from seed import seed_hindsight

# Initialize singleton instances
hindsight_client = HindsightClient()
incident_service = IncidentService(hindsight_client)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Pre-populate Hindsight memory with seed incidents if empty
    print("[Incident Recall] Starting up...")
    try:
        if not hindsight_client.list_all():
            print("[Incident Recall] Pre-seeding Hindsight memory with initial incidents...")
            seed_hindsight(hindsight_client)
    except Exception as e:
        print(f"[Incident Recall] Warning during pre-seed: {e}")
    yield
    print("[Incident Recall] Shutting down...")


app = FastAPI(
    title="Incident Recall",
    description="AI SRE Agent powered by Hindsight persistent memory and Groq LLM",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local testing & preview
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Health and status of Hindsight & Groq integrations."""
    return {
        "status": "healthy",
        "hindsight_configured": hindsight_client.is_cloud_configured,
        "hindsight_project_id": hindsight_client.project_id or "local-vector-engine",
        "hindsight_mode": "Cloud REST API" if hindsight_client.is_cloud_configured else "Local In-Memory Vector Engine",
        "groq_configured": bool(incident_service.groq_client),
        "groq_model": incident_service.groq_model,
        "total_retained_memories": len(hindsight_client.list_all())
    }


@app.post("/incidents", response_model=IncidentResponse)
def submit_incident(submission: IncidentSubmission):
    """
    Submits a new incident:
      1. RECALL similar past incidents from Hindsight memory
      2. GENERATE grounded fix using Groq (openai/gpt-oss-120b)
      3. RETAIN new incident back into Hindsight
      4. RETURN diagnosis, fix, recalled incidents, and memory traces
    """
    if not submission.title.strip() or not submission.symptoms.strip():
        raise HTTPException(status_code=400, detail="Title and symptoms are required")
    
    try:
        response = incident_service.process_new_incident(submission)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process incident: {str(e)}")


@app.get("/incidents")
def list_incidents(
    system: Optional[str] = Query(None, description="Filter by affected system"),
    search: Optional[str] = Query(None, description="Search term in title/symptoms")
):
    """Lists all past retained incidents in Hindsight memory."""
    all_incidents = hindsight_client.list_all()
    
    results = all_incidents
    if system:
        results = [inc for inc in results if system.lower() in inc.affected_system.lower()]
    if search:
        s = search.lower()
        results = [
            inc for inc in results
            if s in inc.title.lower() or s in inc.symptoms.lower() or s in inc.root_cause.lower()
        ]
        
    return {
        "total": len(results),
        "incidents": [inc.dict() for inc in results]
    }


@app.post("/seed")
def seed_endpoint():
    """Seeds Hindsight memory with ~16 synthetic realistic past incidents."""
    try:
        result = seed_hindsight(hindsight_client)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to seed Hindsight memory: {str(e)}")


@app.get("/traces")
def get_traces():
    """Returns the latest Hindsight retain/recall traces for the live demo UI."""
    return {
        "traces": [t.dict() for t in hindsight_client.get_traces()]
    }


# Mount static directory for frontend
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
def serve_index():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Incident Recall API is running. Static frontend not yet compiled."}
