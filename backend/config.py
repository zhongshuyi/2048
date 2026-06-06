"""Load configuration from config.toml, overridable by env vars."""
import os
import sys
import tomllib
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "config.toml"

try:
    with open(CONFIG_PATH, "rb") as f:
        _cfg = tomllib.load(f)
except FileNotFoundError:
    print(f"[config] {CONFIG_PATH} not found, using defaults")
    _cfg = {}

# ---- Server ----
_host = os.environ.get("HOST") or _cfg.get("server", {}).get("host", "0.0.0.0")
_port = int(os.environ.get("PORT") or _cfg.get("server", {}).get("port", 8081))
_static_dir = os.environ.get("STATIC_DIR") or _cfg.get("server", {}).get("static_dir", "../frontend")
_max_games = int(os.environ.get("MAX_GAMES") or _cfg.get("server", {}).get("max_games", 0))
_cleanup = int(os.environ.get("CLEANUP_INTERVAL") or _cfg.get("server", {}).get("cleanup_interval", 300))

HOST = _host
PORT = _port
STATIC_DIR = str(Path(__file__).parent / _static_dir) if _static_dir else None
MAX_GAMES = _max_games
CLEANUP_INTERVAL = _cleanup

# ---- Redis ----
_redis_enabled = os.environ.get("REDIS_ENABLED") or _cfg.get("redis", {}).get("enabled", False)
_redis_url = os.environ.get("REDIS_URL") or _cfg.get("redis", {}).get("url", "redis://localhost:6379")

REDIS_ENABLED = str(_redis_enabled).lower() in ("true", "1", "yes")
REDIS_URL = _redis_url

# ---- Logging ----
LOG_LEVEL = os.environ.get("LOG_LEVEL") or _cfg.get("logging", {}).get("level", "info")

# Print config on startup
def _print_config():
    print(f"[config] host={HOST} port={PORT}")
    print(f"[config] static_dir={STATIC_DIR}")
    print(f"[config] max_games={MAX_GAMES if MAX_GAMES else 'unlimited'}")
    print(f"[config] redis={'enabled' if REDIS_ENABLED else 'disabled'}")
    if REDIS_ENABLED:
        print(f"[config] redis_url={REDIS_URL}")
