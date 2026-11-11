"""Transaction module tests — 12 cases"""

import uuid
import requests
import api_client


def test_create_transaction(tmp_category):
    resp = api_client.create_transaction(
        category_id=tmp_category["category_id"], amount=100.50,
        transaction_type="expense", transaction_date="2026-06-10",
        description="午餐",
    )
    assert resp.get("code") == 0
    d = resp["data"]
    assert float(d["amount"]) == 100.50
    assert d["transaction_type"] == "expense"
    assert d["category"]["category_name"] == tmp_category["category_name"]


def test_create_income(tmp_category):
    resp = api_client.create_transaction(
        tmp_category["category_id"], 5000, "income", "2026-06-10")
    assert resp.get("code") == 0
    assert resp["data"]["transaction_type"] == "income"


def test_create_missing_fields():
    resp = api_client.create_transaction(99999, 0, "expense", "")
    assert resp.get("code") == 1


def test_create_invalid_type(tmp_category):
    resp = api_client.create_transaction(
        tmp_category["category_id"], 10, "bad", "2026-06-10")
    assert resp.get("code") == 1


def test_get_transactions(tmp_category):
    api_client.create_transaction(tmp_category["category_id"], 50, "expense", "2026-06-10")
    resp = api_client.get_transactions()
    assert resp.get("code") == 0
    assert resp["data"]["total"] >= 1
    assert len(resp["data"]["items"]) >= 1


def test_get_transactions_filter_type(tmp_category):
    ce = api_client.create_category(f"cat_e_{uuid.uuid4().hex[:6]}", "expense")
    ci = api_client.create_category(f"cat_i_{uuid.uuid4().hex[:6]}", "income")
    api_client.create_transaction(ce["data"]["category_id"], 20, "expense", "2026-06-10")
    api_client.create_transaction(ci["data"]["category_id"], 30, "income", "2026-06-10")
    resp = api_client.get_transactions(transaction_type="expense")
    assert resp["data"]["total"] == 1


def test_get_transactions_pagination(tmp_category):
    for i in range(5):
        api_client.create_transaction(tmp_category["category_id"], i + 1, "expense", "2026-06-10")
    resp = api_client.get_transactions(page=1, per_page=2)
    assert len(resp["data"]["items"]) == 2
    assert resp["data"]["page"] == 1


def test_get_summary(tmp_category):
    ce = api_client.create_category(f"sm_e_{uuid.uuid4().hex[:6]}", "expense")
    ci = api_client.create_category(f"sm_i_{uuid.uuid4().hex[:6]}", "income")
    api_client.create_transaction(ce["data"]["category_id"], 80, "expense", "2026-06-10")
    api_client.create_transaction(ci["data"]["category_id"], 200, "income", "2026-06-10")
    resp = api_client.get_transaction_summary("2026-06-01", "2026-06-30")
    assert resp.get("code") == 0
    assert float(resp["data"]["income"]) >= 200
    assert float(resp["data"]["expense"]) >= 80


def test_update_transaction(tmp_category):
    resp = api_client.create_transaction(tmp_category["category_id"], 10, "expense", "2026-06-10")
    t_id = resp["data"]["transaction_id"]
    upd = api_client.update_transaction(t_id, amount=99.99, description="updated")
    assert upd.get("code") == 0
    assert float(upd["data"]["amount"]) == 99.99


def test_delete_transaction(tmp_category):
    resp = api_client.create_transaction(tmp_category["category_id"], 10, "expense", "2026-06-10")
    t_id = resp["data"]["transaction_id"]
    r = api_client.delete_transaction(t_id)
    assert r.get("code") == 0
    r2 = api_client.delete_transaction(t_id)
    assert r2.get("code") == 1


def test_update_not_found():
    assert api_client.update_transaction(99999, amount=1).get("code") == 1


def test_delete_not_found():
    assert api_client.delete_transaction(99999).get("code") == 1
