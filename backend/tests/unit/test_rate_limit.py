"""Per-user query rate limiting: window maths, isolation between users, and the HTTP contract."""

from app.config import get_settings
from app.security.rate_limit import SlidingWindowLimiter

PER_MINUTE = [(3, 60.0)]


def test_allows_up_to_the_limit_then_blocks_with_a_retry_time():
    limiter = SlidingWindowLimiter()
    assert [limiter.acquire("u", PER_MINUTE, now=t) for t in (0, 1, 2)] == [None, None, None]

    retry = limiter.acquire("u", PER_MINUTE, now=3)
    assert retry is not None and abs(retry - 57) < 0.01  # oldest hit at t=0 expires at t=60


def test_blocked_requests_do_not_extend_the_penalty():
    limiter = SlidingWindowLimiter()
    for t in (0, 1, 2):
        limiter.acquire("u", PER_MINUTE, now=t)
    for t in (10, 20, 30):
        assert limiter.acquire("u", PER_MINUTE, now=t) is not None
    assert limiter.acquire("u", PER_MINUTE, now=60.5) is None  # window slid past the first hit


def test_users_are_isolated():
    limiter = SlidingWindowLimiter()
    for t in (0, 1, 2):
        limiter.acquire("alice", PER_MINUTE, now=t)
    assert limiter.acquire("alice", PER_MINUTE, now=3) is not None
    assert limiter.acquire("bob", PER_MINUTE, now=3) is None


def test_the_strictest_window_wins_and_zero_disables_a_rule():
    limiter = SlidingWindowLimiter()
    rules = [(100, 60.0), (2, 3600.0)]  # generous per minute, tight per hour
    assert limiter.acquire("u", rules, now=0) is None
    assert limiter.acquire("u", rules, now=100) is None
    retry = limiter.acquire("u", rules, now=200)
    assert retry is not None and retry > 3000

    assert all(limiter.acquire("free", [(0, 60.0), (0, 3600.0)], now=t) is None for t in range(50))


def test_query_endpoints_return_429_with_retry_after(client, workspace_a, monkeypatch):
    monkeypatch.setattr(get_settings(), "query_rate_limit_per_minute", 2)
    monkeypatch.setattr(get_settings(), "query_rate_limit_per_hour", 0)
    url = f"/api/v1/workspaces/{workspace_a.id}/queries"

    first = client.post(url, json={"prompt": "first question", "top_k": 3})
    second = client.post(url, json={"prompt": "second question", "top_k": 3})
    third = client.post(url, json={"prompt": "third question", "top_k": 3})

    assert first.status_code == 201 and second.status_code == 201
    assert third.status_code == 429
    assert int(third.headers["retry-after"]) >= 1
    assert "Too many queries" in third.json()["detail"]
    # the streaming endpoint shares the same budget, so it is blocked before any pipeline work starts
    streamed = client.post(f"{url}/stream", json={"prompt": "streamed question", "top_k": 3})
    assert streamed.status_code == 429


def test_reading_history_is_not_rate_limited(client, workspace_a, monkeypatch):
    monkeypatch.setattr(get_settings(), "query_rate_limit_per_minute", 1)
    for _ in range(5):
        assert client.get(f"/api/v1/workspaces/{workspace_a.id}/queries").status_code == 200
