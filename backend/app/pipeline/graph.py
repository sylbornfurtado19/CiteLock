"""LangGraph StateGraph definition for the CiteLock audited RAG pipeline.

Topology::

    START -> query_input -> evidence_retrieval -> answer_generation -> claim_decomposition
          -> claim_verification -> verification_router --(conditional)--> finalize / correct / abstain / error

    correct:  self_correction -> re_verification --(conditional)--> correct / finalize / abstain / error
    abstain:  abstention -> final_answer_generation
    finalize: final_answer_generation -> database_persistence --(conditional)--> END / error_handler
    error:    error_handler -> END

Every working node also branches to ``error_handler`` when it records an error in the shared state.
"""

from functools import lru_cache
from typing import Any, Dict, Optional

from langgraph.graph import END, START, StateGraph

from app.pipeline import nodes
from app.pipeline.state import (
    HARD_MAX_CORRECTION_ROUNDS,
    ROUTE_ABSTAIN,
    ROUTE_CORRECT,
    ROUTE_ERROR,
    ROUTE_FINALIZE,
    PipelineState,
)

NODE_ERROR = "error_handler"


def _next_or_error(next_node: str):
    """Build a conditional edge that proceeds to next_node unless the state carries an error."""

    def route(state: PipelineState) -> str:
        return NODE_ERROR if state.get("error") else next_node

    return route


def _route_by_decision(state: PipelineState) -> str:
    """Conditional edge reading the routing decision recorded by the router or re-verification node."""
    if state.get("error"):
        return ROUTE_ERROR
    return state.get("route", ROUTE_ERROR)


def build_pipeline_graph() -> StateGraph:
    """Assemble the (uncompiled) StateGraph."""
    graph = StateGraph(PipelineState)

    graph.add_node("query_input", nodes.query_input)
    graph.add_node("evidence_retrieval", nodes.evidence_retrieval)
    graph.add_node("answer_generation", nodes.answer_generation)
    graph.add_node("claim_decomposition", nodes.claim_decomposition)
    graph.add_node("claim_verification", nodes.claim_verification)
    graph.add_node("verification_router", nodes.verification_router)
    graph.add_node("self_correction", nodes.self_correction)
    graph.add_node("re_verification", nodes.re_verification)
    graph.add_node("abstention", nodes.abstention)
    graph.add_node("final_answer_generation", nodes.final_answer_generation)
    graph.add_node("database_persistence", nodes.database_persistence)
    graph.add_node(NODE_ERROR, nodes.error_handler)

    graph.add_edge(START, "query_input")

    linear_steps = [
        ("query_input", "evidence_retrieval"),
        ("evidence_retrieval", "answer_generation"),
        ("answer_generation", "claim_decomposition"),
        ("claim_decomposition", "claim_verification"),
        ("claim_verification", "verification_router"),
        ("self_correction", "re_verification"),
    ]
    for source, target in linear_steps:
        graph.add_conditional_edges(source, _next_or_error(target), {target: target, NODE_ERROR: NODE_ERROR})

    decision_map = {
        ROUTE_FINALIZE: "final_answer_generation",
        ROUTE_CORRECT: "self_correction",
        ROUTE_ABSTAIN: "abstention",
        ROUTE_ERROR: NODE_ERROR,
    }
    graph.add_conditional_edges("verification_router", _route_by_decision, decision_map)
    graph.add_conditional_edges("re_verification", _route_by_decision, decision_map)

    graph.add_edge("abstention", "final_answer_generation")
    graph.add_conditional_edges(
        "final_answer_generation",
        _next_or_error("database_persistence"),
        {"database_persistence": "database_persistence", NODE_ERROR: NODE_ERROR},
    )
    # A failed commit is still a failure worth recording, so it goes through the error handler like any other.
    graph.add_conditional_edges(
        "database_persistence",
        lambda state: NODE_ERROR if state.get("error") else END,
        {NODE_ERROR: NODE_ERROR, END: END},
    )
    graph.add_edge(NODE_ERROR, END)
    return graph


@lru_cache(maxsize=1)
def get_pipeline_graph():
    """Return the compiled graph (compiled once per process)."""
    return build_pipeline_graph().compile()


def recursion_limit_for(max_correction_rounds: int) -> int:
    """Upper bound on graph steps: fixed nodes plus two nodes per correction round, with headroom."""
    rounds = max(0, min(max_correction_rounds, HARD_MAX_CORRECTION_ROUNDS))
    return 16 + 3 * rounds


def run_graph(
    initial_state: Dict[str, Any],
    runtime: Dict[str, Any],
    max_correction_rounds: Optional[int] = None,
) -> PipelineState:
    """Execute the compiled graph and return the final shared state."""
    rounds = HARD_MAX_CORRECTION_ROUNDS if max_correction_rounds is None else max_correction_rounds
    return get_pipeline_graph().invoke(
        initial_state,
        config={"configurable": runtime, "recursion_limit": recursion_limit_for(rounds)},
    )
