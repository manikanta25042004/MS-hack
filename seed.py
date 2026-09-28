"""
seed.py
=======
Seed script to populate Hindsight memory bank with realistic past infrastructure
and security incidents from seed_data.json.

Can be run directly via:
  python seed.py

Or invoked via FastAPI endpoint:
  POST /seed
"""

import json
import os
import sys
import time
from dotenv import load_dotenv

load_dotenv()

from hindsight_client import HindsightClient, IncidentMemory


def load_seed_incidents(json_path: str = "seed_data.json"):
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"Seed file not found at {json_path}")
    
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    return [IncidentMemory(**item) for item in data]


def seed_hindsight(client: HindsightClient = None, json_path: str = "seed_data.json"):
    if client is None:
        client = HindsightClient()

    incidents = load_seed_incidents(json_path)
    print(f"\n==================================================")
    print(f"  Incident Recall — Hindsight Memory Seeding Tool")
    print(f"==================================================")
    print(f"Target Hindsight Mode: {'Cloud API (' + client.project_id + ')' if client.is_cloud_configured else 'Local In-Memory Vector Engine'}")
    print(f"Loading {len(incidents)} incidents into Hindsight...\n")

    retained_records = []
    start_total = time.perf_counter()

    for idx, inc in enumerate(incidents, 1):
        print(f"[{idx:02d}/{len(incidents):02d}] Retaining: {inc.title[:45]}... ({inc.affected_system})")
        res = client.retain(inc)
        retained_records.append({
            "id": inc.id,
            "title": inc.title,
            "system": inc.affected_system,
            "status": res.get("status")
        })

    total_time = round((time.perf_counter() - start_total) * 1000, 2)
    print(f"\n✅ Successfully retained {len(incidents)} incidents into Hindsight memory in {total_time}ms.")
    return {
        "status": "success",
        "total_seeded": len(incidents),
        "elapsed_ms": total_time,
        "mode": "Hindsight Cloud API" if client.is_cloud_configured else "Local In-Memory Vector Engine",
        "incidents": retained_records
    }


if __name__ == "__main__":
    try:
        seed_hindsight()
    except Exception as e:
        print(f"❌ Error during seeding: {e}", file=sys.stderr)
        sys.exit(1)
