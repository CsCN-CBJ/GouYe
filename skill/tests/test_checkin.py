"""Checkin module tests — 8 cases"""

import uuid
import api_client


def test_create_checkin(tmp_template):
    resp = api_client.create_checkin(tmp_template["id"], {"distance": 10})
    assert resp.get("code") == 0
    assert resp["data"]["payload"]["distance"] == 10


def test_create_checkin_template_not_found():
    resp = api_client.create_checkin(99999, {"distance": 1})
    assert resp.get("code") != 0


def test_create_checkin_invalid_payload(tmp_template):
    resp = api_client.create_checkin(tmp_template["id"], {"unknown": 1})
    assert resp.get("code") == 1


def test_create_checkin_missing_required(tmp_template):
    resp = api_client.create_checkin(tmp_template["id"], {})
    assert resp.get("code") == 1


def test_get_checkins(tmp_template):
    api_client.create_checkin(tmp_template["id"], {"distance": 5})
    resp = api_client.get_checkins(tmp_template["id"])
    assert resp.get("code") == 0
    assert len(resp["data"]) >= 1


def test_update_checkin(tmp_template):
    r = api_client.create_checkin(tmp_template["id"], {"distance": 3})
    c_id = r["data"]["id"]
    upd = api_client.update_checkin(c_id, payload={"distance": 8})
    assert upd.get("code") == 0
    assert upd["data"]["payload"]["distance"] == 8


def test_delete_checkin(tmp_template):
    r = api_client.create_checkin(tmp_template["id"], {"distance": 2})
    c_id = r["data"]["id"]
    assert api_client.delete_checkin(c_id).get("code") == 0
    assert api_client.delete_checkin(c_id).get("code") == 1


def test_delete_checkin_not_found():
    assert api_client.delete_checkin(99999).get("code") == 1
