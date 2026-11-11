#!/usr/bin/env python3
"""
Gouye API 客户端
封装后端 API 调用，用于 Skill 内部使用

**所有时间参数默认按北京时间（Asia/Shanghai, +08:00）解释**，调用方无需自己处理时区。
"""

import os
import sys
import re
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta

# ========== 配置加载 ==========

def _load_env_file(path):
    """从 .env 文件加载环境变量"""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("'\"\"")
                if key and key not in os.environ:
                    os.environ[key] = val

def _save_token_to_env(token):
    """将 token 保存到 ~/.gouye.env 文件"""
    env_path = os.path.expanduser("~/.gouye.env")
    env_vars = {}
    
    # 先读取已有的配置
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    env_vars[key.strip()] = val.strip().strip("'\"")
    
    # 更新 token
    env_vars["GOUYE_JWT_TOKEN"] = token
    
    # 写回文件
    with open(env_path, "w", encoding="utf-8") as f:
        for key, val in env_vars.items():
            f.write(f"{key}={val}\n")

# 尝试从 ~/.gouye.env 加载配置
_load_env_file(os.path.expanduser("~/.gouye.env"))

# 配置（可以通过环境变量覆盖）
API_BASE = os.environ.get("GOUYE_API_BASE", "http://127.0.0.1:5000")
JWT_TOKEN = os.environ.get("GOUYE_JWT_TOKEN", "")
GOUYE_USERNAME = os.environ.get("GOUYE_USERNAME", "")
GOUYE_PASSWORD = os.environ.get("GOUYE_PASSWORD", "")

# ========== Token 注入（测试用） ==========

def set_token(token, base_url=None):
    """注入 token 和 base_url（供测试 fixture 使用，向后兼容）"""
    global JWT_TOKEN, API_BASE
    JWT_TOKEN = token
    if base_url:
        API_BASE = base_url

# ========== 内部请求函数 ==========

def _raw_request(method, path, data=None, params=None, headers=None, use_token=True):
    """底层 HTTP 请求，可选是否带 token"""
    url = f"{API_BASE}{path}"
    if params:
        query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        if query:
            url = f"{url}?{query}"
    
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    if use_token and JWT_TOKEN:
        req_headers["Authorization"] = f"Bearer {JWT_TOKEN}"
    
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except:
            return {"code": e.code, "message": str(e.reason)}
    except Exception as e:
        return {"code": 500, "message": str(e)}

def _login():
    """调用登录接口获取新 token"""
    global JWT_TOKEN
    if not GOUYE_USERNAME or not GOUYE_PASSWORD:
        return {"code": 500, "message": "未配置 GOUYE_USERNAME 或 GOUYE_PASSWORD，请在 ~/.gouye.env 中设置"}
    
    result = _raw_request("POST", "/api/users/login", {
        "username": GOUYE_USERNAME,
        "password": GOUYE_PASSWORD
    }, use_token=False)
    
    if result.get("code") == 0:
        JWT_TOKEN = result.get("data", {}).get("token", "")
        if JWT_TOKEN:
            _save_token_to_env(JWT_TOKEN)
            os.environ["GOUYE_JWT_TOKEN"] = JWT_TOKEN
    return result

def _ensure_token():
    """确保 JWT_TOKEN 有效，为空时自动登录"""
    global JWT_TOKEN
    if not JWT_TOKEN:
        return _login()
    return {"code": 0, "message": "Token 已存在"}

def _request(method, path, data=None, params=None):
    """发送 HTTP 请求，支持自动登录和 401 重试"""
    # 首次确保有 token
    if not JWT_TOKEN:
        login_result = _login()
        if login_result.get("code") != 0:
            return login_result
    
    result = _raw_request(method, path, data, params)
    
    # 遇到 401 自动刷新 token 并重试一次
    status = result.get("code") or result.get("status")
    if status == 401 or result.get("msg") == "Invalid crypto padding" or result.get("message") == "Signature verification failed":
        login_result = _login()
        if login_result.get("code") == 0:
            result = _raw_request(method, path, data, params)
    
    return result


# ========== 时区辅助 ==========

def _ensure_tz(s, default_tz="+08:00"):
    """若时间字符串不含时区后缀（Z / ±HH:MM / ±HHMM），自动追加默认时区。"""
    if not isinstance(s, str) or not s.strip():
        return s
    if re.search(r'(Z|[+-]\d{2}:?\d{2})$', s):
        return s
    if not re.search(r'[T ]\d{2}:\d{2}', s):
        s = s + 'T00:00:00'
    return s + default_tz


# ========== 用户 API ==========

def register(username, password, avatar_url=None):
    """用户注册（不需要登录态）"""
    data = {"username": username, "password": password}
    if avatar_url:
        data["avatar_url"] = avatar_url
    return _raw_request("POST", "/api/users/register", data, use_token=False)


def login(username, password):
    """用户登录"""
    return _request("POST", "/api/users/login", {
        "username": username,
        "password": password
    })


def get_profile():
    """获取用户信息"""
    return _request("GET", "/api/users/me")


# ========== 记账 API ==========

def get_categories(category_type=None, keyword=None):
    """获取分类列表"""
    params = {}
    if category_type:
        params["type"] = category_type
    if keyword:
        params["keyword"] = keyword
    return _request("GET", "/api/categories", params=params)


def create_category(name, category_type, icon=None, color=None):
    """创建分类"""
    data = {
        "category_name": name,
        "category_type": category_type
    }
    if icon:
        data["icon"] = icon
    if color:
        data["color"] = color
    return _request("POST", "/api/categories", data)


def get_transactions(transaction_type=None, start_date=None, end_date=None, 
                     category_id=None, tag_id=None, page=1, per_page=20, keyword=None):
    """获取流水列表"""
    params = {
        "type": transaction_type,
        "start_date": start_date,
        "end_date": end_date,
        "category_id": category_id,
        "tag_id": tag_id,
        "keyword": keyword,
        "page": page,
        "per_page": per_page
    }
    return _request("GET", "/api/transactions", params=params)


def create_transaction(category_id, amount, transaction_type, transaction_date, 
                       description=None, images=None, tag_ids=None):
    """创建流水"""
    data = {
        "category_id": category_id,
        "amount": float(amount),
        "transaction_type": transaction_type,
        "transaction_date": _ensure_tz(transaction_date)
    }
    if description:
        data["description"] = description
    if images:
        data["images"] = images
    if tag_ids:
        data["tag_ids"] = tag_ids
    return _request("POST", "/api/transactions", data)


def get_transaction_summary(start_date=None, end_date=None):
    """获取收支汇总"""
    params = {}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    return _request("GET", "/api/transactions/summary", params=params)


def update_transaction(transaction_id, **kwargs):
    """修改流水"""
    if 'transaction_date' in kwargs:
        kwargs['transaction_date'] = _ensure_tz(kwargs['transaction_date'])
    return _request("PUT", f"/api/transactions/{transaction_id}", kwargs)


def delete_transaction(transaction_id):
    """删除流水"""
    return _request("DELETE", f"/api/transactions/{transaction_id}")


# ========== 标签 API ==========

def get_tags(keyword=None):
    """获取标签列表"""
    params = {}
    if keyword:
        params["keyword"] = keyword
    return _request("GET", "/api/tags", params=params)


def create_tag(tag_name, color=None):
    """创建标签"""
    data = {"tag_name": tag_name}
    if color:
        data["color"] = color
    return _request("POST", "/api/tags", data)


# ========== TODO API ==========

def get_todos(domain=None, status=None, project_id=None, tag_id=None, group_by=None, keyword=None):
    """
    获取待办列表。
    - status: 'not_started' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'，不传则返回全部
    - group_by='project' 时按项目分组聚合返回
    """
    params = {}
    if domain:
        params["domain"] = domain
    if status:
        params["status"] = status
    if project_id:
        params["project_id"] = project_id
    if tag_id:
        params["tag_id"] = tag_id
    if group_by:
        params["group_by"] = group_by
    if keyword:
        params["keyword"] = keyword
    return _request("GET", "/api/todos", params=params)


def create_todo(title, domain, project_id=None, due_at=None, tag_ids=None, comment=None):
    """
    创建待办。
    - project_id: 关联已有项目
    - comment: 备注，可选（不传为 NULL，空字符串视为 NULL）
    """
    data = {
        "title": title,
        "domain": domain
    }
    if project_id:
        data["project_id"] = project_id
    if due_at:
        data["due_at"] = _ensure_tz(due_at)
    if tag_ids:
        data["tag_ids"] = tag_ids
    if comment is not None:
        data["comment"] = comment
    return _request("POST", "/api/todos", data)


def update_todo(todo_id, comment, **kwargs):
    """修改待办（comment 必填）"""
    if 'due_at' in kwargs and kwargs['due_at']:
        kwargs['due_at'] = _ensure_tz(kwargs['due_at'])
    kwargs["comment"] = comment
    return _request("PUT", f"/api/todos/{todo_id}", kwargs)


def delete_todo(todo_id):
    """删除待办"""
    return _request("DELETE", f"/api/todos/{todo_id}")


def get_todo_versions(todo_id, order="desc", limit=50):
    """获取 TODO 的版本历史列表（按 version_number 排序）。"""
    params = {"order": order, "limit": limit}
    return _request("GET", f"/api/todos/{todo_id}/versions", params=params)


def get_todo_version(todo_id, version_number):
    """获取 TODO 指定版本号的完整快照。"""
    return _request("GET", f"/api/todos/{todo_id}/versions/{version_number}")


# ========== 项目 API（已废弃，请使用 /api/todos?group_by=project）==========

def get_projects(domain=None, status=None, keyword=None):
    """⚠️ 已废弃。请使用 get_todos(group_by='project')"""
    params = {}
    if domain:
        params["domain"] = domain
    if status:
        params["status"] = status
    if keyword:
        params["keyword"] = keyword
    return _request("GET", "/api/projects", params=params)


def create_project(name, domain):
    """创建项目"""
    return _request("POST", "/api/projects", {
        "name": name,
        "domain": domain
    })


def update_project(project_id, **kwargs):
    """⚠️ 已废弃"""
    return _request("PUT", f"/api/projects/{project_id}", kwargs)


def delete_project(project_id):
    """⚠️ 已废弃"""
    return _request("DELETE", f"/api/projects/{project_id}")


# ========== 打卡模板 API（v2.0, 2026-04-30） ==========

def get_checkin_templates(keyword=None):
    """获取打卡模板列表"""
    params = {}
    if keyword:
        params["keyword"] = keyword
    return _request("GET", "/api/checkin-templates", params=params)


def get_checkin_template(template_id):
    """查看单个模板详情"""
    return _request("GET", f"/api/checkin-templates/{template_id}")


def create_checkin_template(name, fields_schema, icon=None):
    """
    创建打卡模板。
    fields_schema 示例：
      [{"key": "distance", "label": "距离", "type": "number",
        "required": true, "unit": "km", "min": 0, "decimals": 2}]
    """
    data = {"name": name, "fields_schema": fields_schema}
    if icon:
        data["icon"] = icon
    return _request("POST", "/api/checkin-templates", data)


def update_checkin_template(template_id, **kwargs):
    """更新模板（支持 name / icon / fields_schema）"""
    return _request("PUT", f"/api/checkin-templates/{template_id}", kwargs)


def delete_checkin_template(template_id):
    """删除模板（有打卡引用时会被后端拒绝）"""
    return _request("DELETE", f"/api/checkin-templates/{template_id}")


def resolve_checkin_template(name_or_id):
    """将模板名称解析为 template_id；支持 int/str 数字/str 模板名"""
    if isinstance(name_or_id, int):
        return name_or_id
    if isinstance(name_or_id, str) and name_or_id.isdigit():
        return int(name_or_id)
    result = get_checkin_templates()
    if result.get("code") != 0:
        return None
    for tpl in result.get("data", []):
        if tpl.get("name") == name_or_id:
            return tpl.get("id")
    return None


# ========== 打卡记录 API ==========

def get_checkins(template_id=None, tag_id=None):
    """
    获取打卡记录。
    template_id 可传 int / str 数字 / 模板名（会自动解析为 id）。
    """
    params = {}
    if template_id is not None:
        tid = resolve_checkin_template(template_id) if not isinstance(template_id, int) else template_id
        if tid:
            params["template_id"] = tid
    if tag_id:
        params["tag_id"] = tag_id
    return _request("GET", "/api/checkins", params=params)


def create_checkin(template_id, payload, occurred_at=None, tag_ids=None):
    """
    创建打卡记录（模板化版本）。
    - template_id: int 或模板名（自动解析为 id）
    - payload: dict，必须满足模板的 fields_schema 严格校验
      · required 字段必须有值
      · 不得包含 schema 之外的未知字段
    - occurred_at: DateTime，展示给用户时叫"时间"而非"日期"
    - comment 字段（备注）由模板自带，可放在 payload 中。
    """
    tid = resolve_checkin_template(template_id) if not isinstance(template_id, int) else template_id
    if tid is None:
        return {"code": 404, "message": f"模板不存在: {template_id}"}
    data = {
        "template_id": tid,
        "payload": payload or {},
    }
    if occurred_at:
        data["occurred_at"] = _ensure_tz(occurred_at)
    if tag_ids:
        data["tag_ids"] = tag_ids
    return _request("POST", "/api/checkins", data)


def update_checkin(checkin_id, **kwargs):
    """修改打卡记录"""
    return _request("PUT", f"/api/checkins/{checkin_id}", kwargs)


def delete_checkin(checkin_id):
    """删除打卡记录"""
    return _request("DELETE", f"/api/checkins/{checkin_id}")


# ========== 辅助函数 ==========

def resolve_category(name_or_id, category_type=None):
    """将分类名称解析为 category_id"""
    if isinstance(name_or_id, int) or name_or_id.isdigit():
        return int(name_or_id)
    
    result = get_categories(category_type)
    if result.get("code") != 0:
        return None
    
    for cat in result.get("data", []):
        if cat["category_name"] == name_or_id:
            return cat["category_id"]
    return None


def get_today():
    """获取今天日期字符串"""
    return datetime.now().strftime("%Y-%m-%d")


def get_yesterday():
    """获取昨天日期字符串"""
    return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")


def get_week_dates():
    """获取本周日期范围"""
    today = datetime.now()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday.strftime("%Y-%m-%d"), sunday.strftime("%Y-%m-%d")


if __name__ == "__main__":
    # 测试脚本
    print("Gouye API Client")
    print(f"API Base: {API_BASE}")
    print(f"Token: {'已配置' if JWT_TOKEN else '未配置'}")
    print("\n可用函数:")
    print("  login(username, password)")
    print("  get_categories()")
    print("  get_transactions()")
    print("  create_transaction(...)")
    print("  get_todos()")
    print("  create_todo(...)")
    print("  get_checkin_templates()")
    print("  create_checkin_template(name, fields_schema, icon=None)")
    print("  update_checkin_template(template_id, **kwargs)")
    print("  get_checkins(template_id=None)")
    print("  create_checkin(template_id, payload, occurred_at=None, tag_ids=None)")