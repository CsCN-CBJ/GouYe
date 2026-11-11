"""Category module tests — 8 cases"""

import uuid
import requests
import api_client


def _del(path):
    r = requests.delete(f"{api_client.API_BASE}{path}",
                        headers={"Authorization": f"Bearer {api_client.JWT_TOKEN}"})
    return r.json()


def test_create_category():
    resp = api_client.create_category(f"mystuff_{uuid.uuid4().hex[:6]}", "expense", icon="💰")
    assert resp.get("code") == 0
    d = resp["data"]
    assert d["category_name"].startswith("mystuff_")
    assert d["category_type"] == "expense"
    assert "category_id" in d


def test_create_missing_fields():
    resp = api_client.create_category("", "")
    assert resp.get("code") == 1


def test_create_invalid_type():
    resp = api_client.create_category(f"bad_{uuid.uuid4().hex[:6]}", "invalid")
    assert resp.get("code") == 1


def test_get_categories():
    api_client.create_category(f"c1_{uuid.uuid4().hex[:6]}", "expense")
    api_client.create_category(f"c2_{uuid.uuid4().hex[:6]}", "income")
    resp = api_client.get_categories()
    assert resp.get("code") == 0
    assert len(resp["data"]) == 2


def test_get_categories_filter_type():
    api_client.create_category(f"ce1_{uuid.uuid4().hex[:6]}", "expense")
    api_client.create_category(f"ci1_{uuid.uuid4().hex[:6]}", "income")
    resp = api_client.get_categories(category_type="expense")
    assert resp.get("code") == 0
    assert len(resp["data"]) == 1
    assert resp["data"][0]["category_type"] == "expense"


def test_update_category():
    resp = api_client.create_category(f"orig_{uuid.uuid4().hex[:6]}", "expense")
    cat_id = resp["data"]["category_id"]
    upd = requests.put(
        f"{api_client.API_BASE}/api/categories/{cat_id}",
        json={"category_name": "renamed", "color": "#00ff00"},
        headers={"Authorization": f"Bearer {api_client.JWT_TOKEN}"},
    ).json()
    assert upd.get("code") == 0
    assert upd["data"]["category_name"] == "renamed"


def test_delete_category():
    resp = api_client.create_category(f"todel_{uuid.uuid4().hex[:6]}", "expense")
    cat_id = resp["data"]["category_id"]
    r = _del(f"/api/categories/{cat_id}")
    assert r.get("code") == 0


def test_delete_with_transactions(tmp_category):
    cat_id = tmp_category["category_id"]
    requests.post(
        f"{api_client.API_BASE}/api/transactions",
        json={"category_id": cat_id, "amount": 100, "transaction_type": "expense",
              "transaction_date": "2026-06-10"},
        headers={"Authorization": f"Bearer {api_client.JWT_TOKEN}"},
    )
    r = _del(f"/api/categories/{cat_id}")
    assert r.get("code") == 1
