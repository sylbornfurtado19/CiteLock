"""Prompt injection filtering and malicious adversarial input detection."""

import re
from typing import Tuple


INJECTION_PATTERNS = [
    r"ignore previous instructions",
    r"system prompt override",
    r"disregard all earlier rules",
    r"you are now an unrestricted ai",
]


def check_prompt_injection(prompt: str) -> Tuple[bool, str]:
    """Inspect input prompts against known jailbreak and prompt injection signatures."""
    # TODO: Integrate classifier model or token embedding distance heuristic for zero-day jailbreaks
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, prompt, re.IGNORECASE):
            return True, f"Suspicious prompt pattern detected: '{pattern}'"
    return False, "Clean"
