"""Checkin template module tests — 8 cases"""

import uuid
import requests
import api_client


SCHEMA = [{"key": "reps", "label": "次数", "type": "number", "required": True, "min": 1}]


def test_create_template():
    resp = api_client.create_checkin_template(f"tpl_{uuid.uuid4().hex[:6]}", SCHEMA)
    assert resp.get("code") == 0
    assert resp["data"]["name"].startswith("tpl_")
    assert "id" in resp["data"]


def test_create_duplicate_name():
    name = f"dup_{uuid.uuid4().hex[:6]}"
    api_client.create_checkin_template(name, SCHEMA)
    assert api_client.create_checkin_template(name, SCHEMA).get("code") == 1


def test_create_missing_fields():
    assert api_client.create_checkin_template("", []).get("code") == 1


def test_create_reserved_comment_key():
    resp = api_client.create_checkin_template(
        f"res_{uuid.uuid4().hex[:6]}",
        [{"key": "comment", "type": "text", "required": False}],
    )
    assert resp.get("code") == 1


def test_get_templates():
    api_client.create_checkin_template(f"gt_{uuid.uuid4().hex[:6]}", SCHEMA)
    resp = api_client.get_checkin_templates()
    assert resp.get("code") == 0
    assert len(resp["data"]) >= 1


def test_get_single_template():
    t = api_client.create_checkin_template(f"gs_{uuid.uuid4().hex[:6]}", SCHEMA)
    t_id = t["data"]["id"]
    resp = api_client.get_checkin_template(t_id)
    assert resp.get("code") == 0
    assert resp["data"]["id"] == t_id


def test_update_template():
    t = api_client.create_checkin_template(f"up_{uuid.uuid4().hex[:6]}", SCHEMA)
    upd = api_client.update_checkin_template(t["data"]["id"], name="renamed")
    assert upd.get("code") == 0
    assert upd["data"]["name"] == "renamed"


def test_delete_template_with_checkins(tmp_template):
    requests.post(
        f"{api_client.API_BASE}/api/checkins",
        json={"template_id": tmp_template["id"], "payload": {"distance": 5}},
        headers={"Authorization": f"Bearer {api_client.JWT_TOKEN}"},
    )
    assert api_client.delete_checkin_template(tmp_template["id"]).get("code") == 1
