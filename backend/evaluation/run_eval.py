"""Evaluation test suite runner benchmarking CiteLock against RAG baselines."""

import os
import json
import uuid
import time
import argparse
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from evaluation.baselines import run_plain_rag, run_single_verify, run_citelock_rag
from evaluation.metrics import aggregate_system_benchmark


DEFAULT_DATASET_PATH = os.path.join(
    os.path.dirname(__file__), "datasets", "benchmark_cases.json"
)


def load_benchmark_dataset(dataset_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load benchmark cases from JSON dataset file."""
    path = dataset_path or DEFAULT_DATASET_PATH
    if not os.path.exists(path):
        raise FileNotFoundError(f"Benchmark dataset file not found at: {path}")

    with open(path, "r", encoding="utf-8") as f:
        cases = json.load(f)

    if not isinstance(cases, list) or not cases:
        raise ValueError("Benchmark dataset must be a non-empty list of test cases.")

    return cases


def run_benchmark_suite(
    dataset_path: Optional[str] = None,
    sample_size: Optional[int] = None,
    db: Any = None,
    workspace_id: Any = None,
) -> Dict[str, Any]:
    """
    Execute comparative benchmark across Plain RAG, Single-Pass Verify, and CiteLock Self-Correcting RAG.
    Executes actual model completions and factual verification audits for every test case.
    """
    total_t0 = time.perf_counter()
    cases = load_benchmark_dataset(dataset_path)

    if sample_size and sample_size > 0:
        cases = cases[:sample_size]

    plain_rag_runs = []
    single_verify_runs = []
    citelock_runs = []

    for case in cases:
        query = case["query"]
        passages = case["passages"]

        # 1. Baseline A: Plain RAG
        p_res = run_plain_rag(query, passages)
        plain_rag_runs.append(p_res)

        # 2. Baseline B: Single-Pass Verify
        s_res = run_single_verify(query, passages)
        single_verify_runs.append(s_res)

        # 3. System C: CiteLock Self-Correcting RAG
        c_res = run_citelock_rag(query, passages, db=db, workspace_id=workspace_id)
        citelock_runs.append(c_res)

    # Compute aggregate metrics
    plain_metrics = aggregate_system_benchmark(plain_rag_runs)
    single_metrics = aggregate_system_benchmark(single_verify_runs)
    citelock_metrics = aggregate_system_benchmark(citelock_runs)

    # Hallucination reduction: (plain_hr - citelock_hr) / plain_hr
    plain_hr = plain_metrics["hallucination_rate"]
    cite_hr = citelock_metrics["hallucination_rate"]
    reduction_pct = 0.0
    if plain_hr > 0:
        reduction_pct = round(((plain_hr - cite_hr) / plain_hr) * 100, 1)
    elif cite_hr == 0:
        reduction_pct = 100.0

    total_latency_ms = max(1.0, round((time.perf_counter() - total_t0) * 1000, 2))

    run_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    results: Dict[str, Any] = {
        "id": run_id,
        "workspace_id": str(workspace_id) if workspace_id else None,
        "dataset_name": "CiteLock Grounded Truth Benchmark v1",
        "total_test_cases": len(cases),
        "created_at": now_iso,
        "execution_time_ms": total_latency_ms,
        "hallucination_reduction_pct": reduction_pct,
        "systems": {
            "plain_rag": {
                "system_id": "plain_rag",
                "name": "Baseline A: Plain RAG",
                "description": "Standard prompt-based synthesis without factual claim verification",
                **plain_metrics,
            },
            "single_verify": {
                "system_id": "single_verify",
                "name": "Baseline B: Single-Pass Verify",
                "description": "RAG generation with single claim audit pass, no iterative self-correction",
                **single_metrics,
            },
            "citelock": {
                "system_id": "citelock",
                "name": "CiteLock: Self-Correcting RAG",
                "description": "Claim decomposition + structured judge + provenance alignment + bounded multi-pass self-correction",
                **citelock_metrics,
            },
        },
    }

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CiteLock Evaluation Runner")
    parser.add_argument("--dataset", type=str, default=None, help="Path to evaluation dataset")
    parser.add_argument("--sample", type=int, default=None, help="Sample size limit")
    args = parser.parse_args()
    res = run_benchmark_suite(args.dataset, sample_size=args.sample)
    print(json.dumps(res, indent=2))
