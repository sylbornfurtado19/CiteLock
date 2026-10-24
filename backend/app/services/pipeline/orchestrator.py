"""Service wrapper re-exporting run_pipeline for services/pipeline path compatibility."""

from app.pipeline.orchestrator import run_pipeline

__all__ = ["run_pipeline"]
