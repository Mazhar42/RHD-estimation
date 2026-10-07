"""The shared limiter (app/rate_limit.py) is disabled under APP_ENV=test so
the rest of the suite isn't rate-limited against itself (many tests log in
their own fresh user back-to-back from the same TestClient "IP"). This
module re-enables it just long enough to prove /auth/login actually
enforces its 5/minute limit, then restores the disabled state and clears
any counters so no other test observes it."""

import pytest

from app.rate_limit import limiter


@pytest.fixture()
def rate_limiting_enabled():
    limiter.enabled = True
    limiter.reset()
    yield
    limiter.reset()
    limiter.enabled = False


def test_login_is_rate_limited_per_ip(client, rate_limiting_enabled):
    for _ in range(5):
        r = client.post("/auth/login", data={"username": "nobody", "password": "wrong"})
        assert r.status_code == 401

    r = client.post("/auth/login", data={"username": "nobody", "password": "wrong"})
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) == 60
