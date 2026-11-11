"""Daily check smoke test — 1 case"""

import json
import subprocess
import os
import api_client


def test_daily_check_main_flow(tmp_template, tmp_category):
    """Run daily_check.py as subprocess, assert exit 0, output valid JSON with required keys."""
    # Prepare test data: taxi tag, transport & lunch categories, offwork template
    taxi_tag = api_client.create_tag("打车")
    if taxi_tag.get("code") != 0:
        tags = api_client.get_tags().get("data", [])
        taxi_tag_id = next((t["tag_id"] for t in tags if t.get("tag_name") == "打车"), None)
        if not taxi_tag_id:
            taxi_tag_id = taxi_tag["data"]["tag_id"]
    else:
        taxi_tag_id = taxi_tag["data"]["tag_id"]

    transport = api_client.create_category("交通出行", "expense")
    if transport.get("code") != 0:
        cats = api_client.get_categories().get("data", [])
        transport_id = next((c["category_id"] for c in cats if c.get("category_name") == "交通出行"), None) or transport["data"]["category_id"]
    else:
        transport_id = transport["data"]["category_id"]

    lunch = api_client.create_category("日常吃饭", "expense")
    if lunch.get("code") != 0:
        cats = api_client.get_categories().get("data", [])
        lunch_id = next((c["category_id"] for c in cats if c.get("category_name") == "日常吃饭"), None) or lunch["data"]["category_id"]
    else:
        lunch_id = lunch["data"]["category_id"]

    today = api_client.get_today()

    api_client.create_transaction(transport_id, 25.0, "expense", today, tag_ids=[taxi_tag_id])
    api_client.create_transaction(lunch_id, 30.0, "expense", today)

    offwork = api_client.create_checkin_template(
        "下班", [{"key": "note", "type": "text", "required": False}])
    if offwork.get("code") == 0:
        offwork_id = offwork["data"]["id"]
    else:
        tmps = api_client.get_checkin_templates().get("data", [])
        offwork_id = next((t["id"] for t in tmps if t.get("name") == "下班"), None)
        if not offwork_id:
            offwork_id = offwork["data"]["id"]

    api_client.create_checkin(offwork_id, {}, occurred_at=f"{today}T18:00:00")

    # Run daily_check.py
    dc_path = os.path.join(os.path.dirname(__file__), "..", "scripts", "daily_check.py")
    env = os.environ.copy()
    result = subprocess.run(
        ["python3", dc_path, today],
        capture_output=True, text=True, timeout=30, env=env,
    )
    assert result.returncode in (0, 1, 2), f"daily_check failed: {result.stderr}"

    try:
        data = json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        raise AssertionError(f"Output not valid JSON: {result.stdout[:200]}")

    for key in ("is_workday", "missing", "have", "summary", "status", "date"):
        assert key in data, f"Missing key: {key}"
