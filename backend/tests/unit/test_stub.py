"""Unit tests for services, schemas, and utility functions."""

import pytest
from app.schemas import Verdict
from app.services.verification.numeric import verify_numeric_precision


def test_verdict_enum():
    """Verify standard verdict classifications exist."""
    assert Verdict.SUPPORTED == "supported"
    assert Verdict.CONTRADICTED == "contradicted"
    assert Verdict.UNSUPPORTED == "unsupported"


def test_numeric_precision_basic():
    """Test numeric checking stub extraction."""
    res = verify_numeric_precision("Revenue rose by 15.5% in 2024", ["Revenue rose 15.5%"])
    assert res["passed"] is True
    assert "15.5%" in res["extracted_numbers"]
