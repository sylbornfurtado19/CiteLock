"""Prompt injection filtering, adversarial input detection, and untrusted passage sanitization."""

import re
from typing import Tuple

# High-confidence adversarial imperative commands, jailbreak signatures, and delimiter injections
INJECTION_DIRECTIVES = [
    r"(?i)\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+)?(?:previous|prior|earlier|above)\s+(?:instructions|rules|prompts|directives|constraints|guardrails)\b",
    r"(?i)\b(?:system\s+prompt\s+override|admin\s+override\s+mode|developer\s+mode\s+enabled)\b",
    r"(?i)\b(?:you\s+are\s+now|act\s+as)\s+(?:dan\b|(?:an?\s+)?(?:unrestricted|jailbroken|unfiltered|dan)\s*(?:ai|model|assistant|bot)?)\b",
    r"(?i)\b(?:reveal|print|output|display|show|leak)\s+(?:the\s+|your\s+)?(?:system\s+prompt|initial\s+instructions|secret\s+key|api\s+key|credentials)\b",
    r"(?i)<\s*(?:system|instruction|admin|override)\s*>",
    r"(?i)\[\s*(?:system\s+instruction|system_prompt)\s*\]",
]

# Structural markers that indicate an inquiry/educational question rather than an imperative command
BENIGN_QUESTION_PATTERNS = [
    r"(?i)^\s*(?:why|how\s+does|what\s+causes|can\s+you\s+explain\s+why|does\s+the|is\s+it\s+true\s+that)\b",
]


def check_prompt_injection(prompt: str) -> Tuple[bool, str]:
    """
    Inspect input prompts against known jailbreak signatures, directive overrides, and delimiter breakouts.
    Differentiates active imperative attacks from benign domain questions inquiring about mechanisms.
    """
    if not prompt or not prompt.strip():
        return False, "Clean"

    normalized = prompt.strip()

    # Check for direct imperative injection attacks
    for pattern in INJECTION_DIRECTIVES:
        match = re.search(pattern, normalized)
        if match:
            # Check if this is an exploratory/academic question about the concept rather than an execution command
            is_inquiry = any(re.search(bp, normalized) for bp in BENIGN_QUESTION_PATTERNS)
            has_secondary_attack = bool(re.search(r"(?i)\b(delete|drop\s+table|leak|hack|bypass|jailbreak|exfiltrate|secret|password)\b", normalized))

            if is_inquiry and not has_secondary_attack and "?" in normalized:
                # Legitimate research inquiry about the topic
                continue

            return True, f"Suspicious prompt injection directive detected: '{match.group(0)}'"

    return False, "Clean"


def sanitize_untrusted_passage(text: str) -> str:
    """
    Neutralize synthetic prompt breakout tags, instruction headers, and command overrides
    embedded inside untrusted source document passages before passing to synthesis LLMs.
    """
    if not text:
        return ""
    # Strip or neutralize tag boundaries mimicking system or instruction blocks
    sanitized = re.sub(r"(?i)<\s*/?\s*(?:system|admin|instruction|override|untrusted_passage)\s*>", "[tag_neutralized]", text)
    sanitized = re.sub(r"(?i)\[\s*(?:SYSTEM\s+INSTRUCTION|SYSTEM_PROMPT)\s*\]", "[instruction_neutralized]", sanitized)
    return sanitized
