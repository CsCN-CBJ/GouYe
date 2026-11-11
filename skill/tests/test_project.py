"""Project module tests — 9 cases (inc. v1.5.0 regression K3, K4, K6)"""

import uuid
import requests
import api_client


def test_create_project():
    resp = api_client.create_project(f"prj_{uuid.uuid4().hex[:6]}", "work")
    assert resp.get("code") == 0
    d = resp["data"]
    assert d["status"] == "active"
    assert d["domain"] == "work"
    assert "project_id" in d


def test_create_duplicate_domain():
    pname = f"dup_{uuid.uuid4().hex[:6]}"
    api_client.create_project(pname, "work")
    resp = api_client.create_project(pname, "work")
    assert resp.get("code") == 1
    assert resp.get("message") == "project with this name already exists in domain"
    assert resp.get("data") is not None
    assert resp["data"]["name"] == pname


def test_create_missing_fields():
    assert api_client.create_project("", "work").get("code") == 1


def test_get_projects():
    api_client.create_project(f"gp_{uuid.uuid4().hex[:6]}", "life")
    resp = api_client.get_projects()
    assert resp.get("code") == 0
    assert len(resp["data"]) >= 1


def test_get_projects_filter_status():
    api_client.create_project(f"as_{uuid.uuid4().hex[:6]}", "work")
    resp = api_client.get_projects(status="active")
    assert resp.get("code") == 0
    assert all(p["status"] == "active" for p in resp["data"])


def test_delete_project():
    resp = api_client.create_project(f"delme_{uuid.uuid4().hex[:6]}", "work")
    p_id = resp["data"]["project_id"]
    assert api_client.delete_project(p_id).get("code") == 0
    assert api_client.delete_project(p_id).get("code") == 1


# ── v1.5.0 BREAKING ──

def test_K3_update_project_status_via_put():
    """K3: update_project(id, status='archived') — 200"""
    resp = api_client.create_project(f"archme_{uuid.uuid4().hex[:6]}", "work")
    p_id = resp["data"]["project_id"]
    upd = api_client.update_project(p_id, status="archived")
    assert upd.get("code") == 0
    assert upd["data"]["status"] == "archived"


def test_K4_archive_route_returns_404():
    """K4: POST /api/projects/{id}/archive — 404"""
    resp = api_client.create_project(f"narch_{uuid.uuid4().hex[:6]}", "work")
    p_id = resp["data"]["project_id"]
    r = requests.post(
        f"{api_client.API_BASE}/api/projects/{p_id}/archive",
        headers={"Authorization": f"Bearer {api_client.JWT_TOKEN}"},
    )
    assert r.status_code == 404


def test_K6_archive_project_function_gone():
    """K6: archive_project does not exist in api_client (v1.5.0 regression)"""
    import api_client
    assert getattr(api_client, 'archive_project', None) is None
    assert getattr(api_client, 'unarchive_project', None) is None
