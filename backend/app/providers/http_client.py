"""Centralized, persistent HTTP client lifecycle manager for CiteLock model provider adapters.

Eliminates per-request TCP/TLS handshake latency by maintaining reusable connection pools
with configurable keep-alive limits, timeouts, and clean application shutdown handling.
"""

import logging
import threading
from typing import Dict, Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# Verify HTTP/2 library availability in runtime environment
try:
    import h2  # noqa: F401
    HTTP2_AVAILABLE = True
except ImportError:
    HTTP2_AVAILABLE = False

_client_lock = threading.Lock()
_clients: Dict[str, httpx.Client] = {}


def get_http_client(
    pool_name: str = "default",
    timeout: Optional[float] = None,
    connect_timeout: Optional[float] = None,
    read_timeout: Optional[float] = None,
    write_timeout: Optional[float] = None,
    max_keepalive: Optional[int] = None,
    max_connections: Optional[int] = None,
    enable_http2: Optional[bool] = None,
) -> httpx.Client:
    """
    Retrieve or create a thread-safe, persistent httpx.Client with dedicated connection pooling.
    Reuses existing connections across all requests to eliminate TCP socket and TLS negotiation overhead.
    """
    global _clients
    with _client_lock:
        client = _clients.get(pool_name)
        if client is None or client.is_closed:
            settings = get_settings()

            c_timeout = connect_timeout if connect_timeout is not None else getattr(settings, "http_connect_timeout", 5.0)
            r_timeout = read_timeout if read_timeout is not None else (timeout if timeout is not None else getattr(settings, "http_read_timeout", 45.0))
            w_timeout = write_timeout if write_timeout is not None else getattr(settings, "http_write_timeout", 10.0)
            overall_timeout = timeout if timeout is not None else r_timeout

            timeouts = httpx.Timeout(
                timeout=overall_timeout,
                connect=c_timeout,
                read=r_timeout,
                write=w_timeout,
                pool=5.0,
            )

            keepalive = max_keepalive if max_keepalive is not None else getattr(settings, "http_max_keepalive_connections", 20)
            max_conn = max_connections if max_connections is not None else getattr(settings, "http_max_connections", 50)

            limits = httpx.Limits(
                max_keepalive_connections=keepalive,
                max_connections=max_conn,
                keepalive_expiry=30.0,
            )

            configured_http2 = enable_http2 if enable_http2 is not None else getattr(settings, "http_enable_http2", True)
            use_http2 = HTTP2_AVAILABLE and configured_http2

            # Transport-level safe retry for connection-level resets on idle keep-alive sockets
            transport = httpx.HTTPTransport(
                retries=1,
                http2=use_http2,
                limits=limits,
            )

            client = httpx.Client(
                timeout=timeouts,
                limits=limits,
                transport=transport,
                http2=use_http2,
            )
            _clients[pool_name] = client
            logger.info(
                "Initialized persistent HTTP connection pool '%s' (http2=%s, max_conn=%d, max_keepalive=%d)",
                pool_name,
                use_http2,
                max_conn,
                keepalive,
            )

        return client


def close_http_clients() -> None:
    """Cleanly close all active HTTP clients and connection pools during application shutdown."""
    global _clients
    with _client_lock:
        for name, client in list(_clients.items()):
            try:
                if not client.is_closed:
                    client.close()
                    logger.info("Closed HTTP connection pool '%s'", name)
            except Exception as e:
                logger.warning("Error closing HTTP client pool '%s': %s", name, e)
        _clients.clear()


def get_active_client_pools() -> Dict[str, bool]:
    """Return dictionary of active pool names and their open status."""
    with _client_lock:
        return {name: not client.is_closed for name, client in _clients.items()}

