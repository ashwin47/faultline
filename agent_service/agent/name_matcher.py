"""Name normalization utilities for cross-platform resource matching."""

import re

COMMON_SUFFIXES = [
    "service", "svc", "app", "api", "lambda", "function",
    "db", "database", "instance", "project", "prod", "staging", "dev",
    "server", "cluster", "cache", "queue", "worker", "handler",
]

SUFFIX_PATTERN = re.compile(
    r"(?:[-_\s.](?:" + "|".join(COMMON_SUFFIXES) + r"))+$",
    re.IGNORECASE,
)


def normalize_name(name: str) -> str:
    """Normalize a resource name for cross-platform matching.

    "Payment API" → "paymentapi"
    "payment-api-service" → "paymentapi"
    """
    normalized = SUFFIX_PATTERN.sub("", name)
    normalized = re.sub(r"[-_\s.]+", "", normalized).lower()
    return normalized
