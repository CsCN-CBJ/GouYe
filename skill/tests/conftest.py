"""pytest fixtures for skill integration tests"""

import os
import sys
import uuid
import subprocess
import pytest
import requests
from dotenv import load_dotenv

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
env_test = os.path.join(repo_root, ".env.test")
if os.path.exists(env_test):
    load_dotenv(env_test)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import api_client


# ── helpers ──────────────────────────────────────────────────────────────────

_TRUNCATE_SQL = """
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE checkin_tags;
TRUNCATE TABLE checkins;
TRUNCATE TABLE checkin_templates;
TRUNCATE TABLE todo_versions;
TRUNCATE TABLE todo_tags;
TRUNCATE TABLE todos;
TRUNCATE TABLE projects;
TRUNCATE TABLE transaction_tags;
TRUNCATE TABLE transactions;
TRUNCATE TABLE categories;
TRUNCATE TABLE tags;
-- users preserved: session-scoped test_user fixture registers once
SET FOREIGN_KEY_CHECKS = 1;
"""


def _truncate_all_via_prisma():
    """Truncate all tables using npx prisma db execute --stdin."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set, skipping DB-required test")
    subprocess.run(
        ["npx", "prisma", "db", "execute", "--stdin"],
        input=_TRUNCATE_SQL,
        text=True,
        capture_output=True,
        cwd=repo_root,
        timeout=30,
        check=True,
    )


def _register_and_login(base_url: str) -> dict:
    username = f"skill_test_{uuid.uuid4().hex[:8]}"
    password = "Test1234!"

    r = requests.post(
        f"{base_url}/api/users/register",
        json={"username": username, "password": password},
    )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Failed to register '{username}': {r.status_code} {r.text}")
    body = r.json()
    if body.get("code") != 0:
        raise RuntimeError(f"Register returned error: {body}")

    r = requests.post(
        f"{base_url}/api/users/login",
        json={"username": username, "password": password},
    )
    if r.status_code != 200 or r.json().get("code") != 0:
        raise RuntimeError(f"Failed to login '{username}': {r.status_code} {r.text}")
    data = r.json()["data"]
    token = data["token"]

    # Get user_id from profile
    r = requests.get(
        f"{base_url}/api/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    if r.status_code != 200 or r.json().get("code") != 0:
        raise RuntimeError(f"Failed to get profile: {r.status_code} {r.text}")
    user_id = r.json()["data"]["user_id"]

    return {"token": token, "user_id": user_id, "username": username}


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def api_base_url():
    return os.environ.get("GOUYE_API_BASE", "http://localhost:7099").rstrip("/")


@pytest.fixture(scope="session", autouse=True)
def test_user(api_base_url):
    """Register + login a skill_test_<uuid> account. Returns {token, user_id, username}.
    Injects token into api_client so all _request calls carry the token."""
    user = _register_and_login(api_base_url)
    # Inject into api_client module so all _request calls carry the token
    api_client.set_token(user["token"], api_base_url)
    # Set module-level vars that _login() reads (import-time snapshot, not env)
    api_client.GOUYE_USERNAME = user["username"]
    api_client.GOUYE_PASSWORD = "Test1234!"
    # Also set env vars for subprocess convenience (daily_check smoke test)
    os.environ["GOUYE_JWT_TOKEN"] = user["token"]
    os.environ["GOUYE_USERNAME"] = user["username"]
    os.environ["GOUYE_PASSWORD"] = "Test1234!"
    return user


@pytest.fixture(autouse=True)
def clean_db(request):
    """Truncate all tables before each test function (skip for pure-python utils)."""
    if "date_utils" in str(request.node.fspath):
        return
    _truncate_all_via_prisma()


@pytest.fixture
def tmp_category(test_user):
    r = api_client.create_category(f"cat_{uuid.uuid4().hex[:6]}", "expense", icon="💰", color="#ff0000")
    if r.get("code") != 0:
        pytest.fail(f"Failed to create category: {r}")
    return r["data"]


@pytest.fixture
def tmp_project(test_user):
    r = api_client.create_project(f"proj_{uuid.uuid4().hex[:6]}", "work")
    if r.get("code") != 0:
        pytest.fail(f"Failed to create project: {r}")
    return r["data"]


@pytest.fixture
def tmp_template(test_user):
    r = api_client.create_checkin_template(
        f"tpl_{uuid.uuid4().hex[:6]}",
        [{"key": "distance", "label": "距离", "type": "number", "required": True, "unit": "km"}],
    )
    if r.get("code") != 0:
        pytest.fail(f"Failed to create template: {r}")
    return r["data"]
