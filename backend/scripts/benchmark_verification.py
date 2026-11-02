"""Benchmark script measuring Sequential vs Concurrent claim verification performance.

Evaluates:
- Sequential execution (workers=1)
- Concurrent execution (workers=5)
- Different claim counts (1, 3, 5, 8, 10)
- Simulated LLM provider latencies (50ms, 150ms, 300ms)
- Concurrency limiting / rate-limit behavior
"""

import os
os.environ["ENVIRONMENT"] = "test"
os.environ["LLM_PROVIDER"] = "mock"

import time
from typing import Dict, Any, List
from app.services.verification.engine import verify_claims
from app.providers.base import MockLLMProvider
import app.providers.base as providers_base


class LatencySimulatingLLM(MockLLMProvider):
    def __init__(self, latency_sec: float = 0.10):
        super().__init__()
        self.latency_sec = latency_sec

    def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
        time.sleep(self.latency_sec)
        return super().structured_judge(claim, evidence_passages)


def run_benchmark():
    passages = [
        {"id": "doc1-chunk1", "content": "CiteLock verifies factual propositions using structured LLM judges and pgvector."},
        {"id": "doc1-chunk2", "content": "The system bounds self-correction iterations to prevent infinite regression."},
    ]

    claim_counts = [1, 3, 5, 8, 10]
    latencies = [0.05, 0.15, 0.30]  # 50ms, 150ms, 300ms

    print("=========================================================================================")
    print("                    CITELOCK CLAIM VERIFICATION CONCURRENCY BENCHMARK                   ")
    print("=========================================================================================")

    all_results = []

    for latency in latencies:
        provider = LatencySimulatingLLM(latency_sec=latency)
        providers_base.get_llm_provider = lambda p=provider: p

        print(f"\n--- Testing with Provider Latency: {int(latency * 1000)}ms per claim ---")
        print(f"{'Claims':<8} | {'Sequential (1 worker)':<24} | {'Concurrent (5 workers)':<24} | {'Speedup':<10} | {'Efficiency'}")
        print("-" * 85)

        for count in claim_counts:
            claims = [
                {"claim_index": i, "claim_text": f"CiteLock validates factual proposition #{i}."}
                for i in range(count)
            ]

            # 1. Sequential execution
            t0 = time.perf_counter()
            res_seq = verify_claims(claims, passages, max_workers=1)
            t_seq = time.perf_counter() - t0
            assert len(res_seq["claims"]) == count

            # 2. Concurrent execution (up to 5 workers)
            t0 = time.perf_counter()
            res_con = verify_claims(claims, passages, max_workers=5)
            t_con = time.perf_counter() - t0
            assert len(res_con["claims"]) == count

            speedup = t_seq / t_con if t_con > 0 else 1.0
            efficiency = f"{(speedup / min(count, 5)) * 100:.1f}%"

            print(
                f"{count:<8} | {t_seq * 1000:>8.1f} ms ({t_seq/count*1000:>5.1f}ms/c)   | "
                f"{t_con * 1000:>8.1f} ms ({t_con/count*1000:>5.1f}ms/c)   | "
                f"{speedup:>7.2f}x   | {efficiency}"
            )

            all_results.append({
                "latency_ms": int(latency * 1000),
                "claim_count": count,
                "sequential_ms": round(t_seq * 1000, 1),
                "concurrent_ms": round(t_con * 1000, 1),
                "speedup": round(speedup, 2),
            })

    print("\n=========================================================================================")
    print("BENCHMARK COMPLETED SUCCESSFULLY.")
    print("=========================================================================================")
    return all_results


if __name__ == "__main__":
    run_benchmark()
