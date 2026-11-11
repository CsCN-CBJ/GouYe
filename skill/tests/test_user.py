"""User module tests — 6 cases"""

import uuid
import requests
import api_client


def test_register_success(api_base_url):
    name = f"newbie_{uuid.uuid4().hex[:6]}"
    resp = api_client.register(name, "Pass1234!")
    assert resp.get("code") == 0
    assert resp["data"]["username"] == name
    assert "user_id" in resp["data"]


def test_register_duplicate(api_base_url):
    name = f"dup_{uuid.uuid4().hex[:6]}"
    api_client.register(name, "Pass1234!")
    resp = api_client.register(name, "Pass1234!")
    assert resp.get("code") == 1


def test_register_missing_fields(api_base_url):
    r = requests.post(f"{api_base_url}/api/users/register", json={"username": "x"})
    assert r.status_code == 400
    r = requests.post(f"{api_base_url}/api/users/register", json={"password": "x"})
    assert r.status_code == 400


def test_login_success(api_base_url):
    name = f"loginok_{uuid.uuid4().hex[:6]}"
    api_client.register(name, "RightPass1")
    resp = api_client.login(name, "RightPass1")
    assert resp.get("code") == 0
    assert "token" in resp.get("data", {})


def test_login_wrong_password(api_base_url):
    name = f"badpw_{uuid.uuid4().hex[:6]}"
    api_client.register(name, "Correct1!")
    resp = api_client.login(name, "WrongOne1")
    assert resp.get("code") != 0


def test_login_nonexistent(api_base_url):
    resp = api_client.login(f"ghost_{uuid.uuid4().hex[:6]}", "whatever")
    assert resp.get("code") != 0
