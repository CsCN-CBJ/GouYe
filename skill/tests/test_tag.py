"""Tag module tests — 5 cases"""

import uuid
import requests
import api_client


def _del(path):
    r = requests.delete(f"{api_client.API_BASE}{path}",
                        headers={"Authorization": f"Bearer {api_client.JWT_TOKEN}"})
    return r.json()


def test_create_tag():
    resp = api_client.create_tag(f"mytag_{uuid.uuid4().hex[:6]}", color="#ff0000")
    assert resp.get("code") == 0
    data = resp["data"]
    assert data["tag_name"].startswith("mytag_")
    assert "tag_id" in data


def test_create_duplicate():
    name = f"dup_{uuid.uuid4().hex[:6]}"
    api_client.create_tag(name)
    resp = api_client.create_tag(name)
    assert resp.get("code") == 1


def test_create_missing_name():
    resp = api_client.create_tag("")
    assert resp.get("code") == 1


def test_get_tags():
    api_client.create_tag(f"list_{uuid.uuid4().hex[:6]}")
    resp = api_client.get_tags()
    assert resp.get("code") == 0
    assert isinstance(resp["data"], list)
    assert len(resp["data"]) == 1


def test_delete_tag():
    resp = api_client.create_tag(f"del_{uuid.uuid4().hex[:6]}")
    tag_id = resp["data"]["tag_id"]
    r = _del(f"/api/tags/{tag_id}")
    assert r.get("code") == 0
    r2 = _del(f"/api/tags/{tag_id}")
    assert r2.get("code") == 1
