"""Todo module tests — 14 cases (inc. v1.5.0 regression K1, K2, K5)"""

import uuid
import requests
import api_client


def _put(path, data):
    return requests.put(f"{api_client.API_BASE}{path}", json=data,
                        headers={"Authorization": f"Bearer {api_client.JWT_TOKEN}"}).json()


def test_create_todo():
    resp = api_client.create_todo("买牛奶", "life")
    assert resp.get("code") == 0
    d = resp["data"]
    assert d["title"] == "买牛奶"
    assert d["status"] == "not_started"
    assert d["current_version"] == 1


def test_create_todo_with_project():
    pname = f"prj_{uuid.uuid4().hex[:6]}"
    proj_resp = api_client.create_project(pname, "work")
    assert proj_resp.get("code") == 0
    resp = api_client.create_todo("写报告", "work", project_id=proj_resp["data"]["project_id"])
    assert resp.get("code") == 0
    assert resp["data"]["project"] is not None


def test_create_todo_missing_fields():
    assert api_client.create_todo("", "life").get("code") == 1


def test_get_todos():
    api_client.create_todo("任务A", "work")
    resp = api_client.get_todos()
    assert resp.get("code") == 0
    assert len(resp["data"]) >= 1


def test_get_todos_filter_status():
    api_client.create_todo("进行中任务", "work")
    todo = api_client.get_todos()["data"][0]
    _put(f"/api/todos/{todo['id']}", {"status": "in_progress", "comment": "开始进行"})
    resp = api_client.get_todos(status="in_progress")
    assert all(t["status"] == "in_progress" for t in resp["data"])


def test_get_todos_group_by_project():
    pname = f"gprj_{uuid.uuid4().hex[:6]}"
    proj_resp = api_client.create_project(pname, "work")
    assert proj_resp.get("code") == 0
    api_client.create_todo("分组任务", "work", project_id=proj_resp["data"]["project_id"])
    resp = api_client.get_todos(group_by="project")
    assert resp.get("code") == 0
    assert len(resp["data"]) >= 1
    assert "project" in resp["data"][0]
    assert "todos" in resp["data"][0]


def test_get_todo_versions():
    resp = api_client.create_todo("版本测试", "work")
    t_id = resp["data"]["id"]
    _put(f"/api/todos/{t_id}", {"title": "版本测试_改", "comment": "改标题"})
    ver_resp = api_client.get_todo_versions(t_id)
    assert ver_resp.get("code") == 0
    assert len(ver_resp["data"]) >= 2


def test_get_todo_single_version():
    resp = api_client.create_todo("单版本", "life")
    t_id = resp["data"]["id"]
    v = api_client.get_todo_version(t_id, 1)
    assert v.get("code") == 0
    assert v["data"]["version_number"] == 1


def test_update_todo():
    resp = api_client.create_todo("原始标题", "work")
    t_id = resp["data"]["id"]
    upd = api_client.update_todo(t_id, "改标题", title="新标题")
    assert upd.get("code") == 0
    assert upd["data"]["title"] == "新标题"


def test_delete_todo():
    resp = api_client.create_todo("待删除", "life")
    t_id = resp["data"]["id"]
    r = api_client.delete_todo(t_id)
    assert r.get("code") == 0
    assert api_client.delete_todo(t_id).get("code") == 1


# ── v1.5.0 BREAKING 回归 ──

def test_K1_update_todo_status_via_put():
    """K1: update_todo(id, '完成', status='completed') via PUT — completed_at set"""
    resp = api_client.create_todo("v150测试", "work")
    t_id = resp["data"]["id"]
    upd = api_client.update_todo(t_id, "完成", status="completed")
    assert upd.get("code") == 0
    assert upd["data"]["status"] == "completed"
    assert upd["data"]["completed_at"] is not None


def test_K2_status_route_returns_404():
    """K2: POST /api/todos/{id}/status — 404"""
    resp = api_client.create_todo("404测试", "work")
    t_id = resp["data"]["id"]
    r = requests.post(
        f"{api_client.API_BASE}/api/todos/{t_id}/status",
        json={"status": "completed"},
        headers={"Authorization": f"Bearer {api_client.JWT_TOKEN}"},
    )
    assert r.status_code == 404


def test_K5_update_todo_status_function_gone():
    """K5: update_todo_status does not exist in api_client"""
    assert getattr(api_client, "update_todo_status", None) is None


def test_todo_not_found():
    assert api_client.delete_todo(99999).get("code") == 1


# ── v1.7.0 comment field ──

def test_S1_update_todo_missing_comment_typeerror():
    """S1: update_todo(id) without comment → TypeError"""
    resp = api_client.create_todo("S1 test", "work")
    t_id = resp["data"]["id"]
    try:
        api_client.update_todo(t_id)  # missing required comment
        assert False, "Expected TypeError"
    except TypeError:
        pass  # expected


def test_S2_update_todo_with_comment():
    """S2: update_todo(id, comment='完成了') → 200"""
    resp = api_client.create_todo("S2 test", "work")
    t_id = resp["data"]["id"]
    upd = api_client.update_todo(t_id, "完成了")
    assert upd.get("code") == 0
    # check version has comment
    v = api_client.get_todo_versions(t_id)
    assert v["data"][0]["comment"] == "完成了"


def test_S3_create_todo_without_comment():
    """S3: create_todo without comment → 201, comment NULL"""
    resp = api_client.create_todo("S3 test", "work")
    assert resp.get("code") == 0
    assert resp["data"].get("comment") is None


# ── v1.8.0: project_name removed ──

def test_S1_v180_project_name_typeerror():
    """S1: create_todo(..., project_name=...) should raise TypeError"""
    try:
        api_client.create_todo("test", "work", project_name="foo")
        assert False, "Expected TypeError"
    except TypeError:
        pass  # expected: project_name is no longer a parameter


def test_S2_v180_create_project_then_todo():
    """S2: create_project then create_todo with project_id → 201"""
    pname = f"v180_{uuid.uuid4().hex[:6]}"
    proj_resp = api_client.create_project(pname, "work")
    assert proj_resp.get("code") == 0
    pid = proj_resp["data"]["project_id"]

    resp = api_client.create_todo("S2 todo", "work", project_id=pid)
    assert resp.get("code") == 0
    assert resp["data"]["project_id"] == pid


def test_S3_v180_duplicate_project_409_with_data():
    """S3: same domain + same name create_project twice → 409 with data"""
    pname = f"dup_{uuid.uuid4().hex[:6]}"
    r1 = api_client.create_project(pname, "work")
    assert r1.get("code") == 0

    r2 = api_client.create_project(pname, "work")
    assert r2.get("code") == 1
    assert r2.get("message") == "project with this name already exists in domain"
    assert r2.get("data") is not None
    assert r2["data"]["name"] == pname
