"""Deterministic launcher and loopback health readiness polling subsystem."""

import http.client
import json
import logging
import threading
import time
import webbrowser

logger = logging.getLogger("piddi.launcher")


def poll_health_and_launch_browser(
    host: str = "127.0.0.1",
    port: int = 4111,
    session_token: str = "",
    max_timeout: float = 5.0,
    poll_interval: float = 0.05,
) -> threading.Thread:
    """
    Launch default browser only after verifying authoritative engine readiness on /api/health.

    Runs as a daemon background thread. Periodically sends authenticated HTTP requests to
    http://{host}:{port}/api/health. When HTTP 200 with {"status": "ok"} is received,
    opens the root frontend URL http://{host}:{port}/ in the user's default browser.
    """

    def _worker() -> None:
        start_time = time.monotonic()
        target_url = f"http://{host}:{port}/"
        headers = {
            "Host": f"{host}:{port}",
            "X-Piddi-Token": session_token,
            "Accept": "application/json",
        }

        while time.monotonic() - start_time < max_timeout:
            try:
                conn = http.client.HTTPConnection(host, port, timeout=1.0)
                try:
                    conn.request("GET", "/api/health", headers=headers)
                    res = conn.getresponse()
                    if res.status == 200:
                        raw_body = res.read().decode("utf-8")
                        data = json.loads(raw_body)
                        if data.get("status") == "ok":
                            logger.info(
                                "Engine readiness verified on port %d; opening browser.", port
                            )
                            try:
                                webbrowser.open(target_url)
                            except Exception as browser_err:  # noqa: BLE001
                                logger.warning("Could not auto-launch browser: %s", browser_err)
                            return
                finally:
                    conn.close()
            except (OSError, http.client.HTTPException, json.JSONDecodeError, TimeoutError):
                pass

            time.sleep(poll_interval)

        logger.error(
            "Engine health readiness check timed out after %.1fs on %s. Browser launch aborted.",
            max_timeout,
            target_url,
        )

    thread = threading.Thread(target=_worker, name="PiddiHealthPoller", daemon=True)
    thread.start()
    return thread
