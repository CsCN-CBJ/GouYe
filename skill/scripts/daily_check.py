#!/usr/bin/env python3
"""
Gouye 每日账单三件套检查脚本
===========================

用途：
  每天 22:30 由 cron 触发，检查今天（工作日）是否缺少以下三项之一：
    A. 早上打车记账：分类=交通出行 且 标签含"打车"，时段 06:00–14:00
    B. 中午吃饭记账：分类=日常吃饭，时段 11:00–14:00
    C. 下班打卡：template.name == "下班"

工作日判定：
  使用 NateScarlet/holiday-cn 的 GitHub JSON（无鉴权、无 Cloudflare 盾）
  主源：https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{YEAR}.json
  备源：https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{YEAR}.json
  - date 命中 isOffDay=true  → 节假日（非工作日）
  - date 命中 isOffDay=false → 调休补班（工作日）
  - 未命中 → 回落到 weekday 判定（周一~五为工作日）
  - 两源都失败 → 同样回落 weekday

输出：
  stdout 输出一行 JSON，字段：
    {
      "is_workday": bool,
      "workday_reason": "weekday/holiday_compensate/holiday_off/weekend/fallback",
      "date": "YYYY-MM-DD",
      "missing": ["morning_taxi", "lunch", "offwork_checkin"],  # 缺失的项
      "have":    ["morning_taxi", "lunch", "offwork_checkin"],  # 齐全的项
      "summary": "人话总结",
      "status":  "ok" | "missing" | "skipped" | "error",
      "error":   "...仅 error 时出现..."
    }

退出码：
  0 = 全齐 或 非工作日（无需提醒）
  1 = 有缺失（需要提醒）
  2 = 执行异常（需要提醒异常）

手动使用：
  python3 daily_check.py            # 查今天
  python3 daily_check.py 2026-05-08 # 查指定日期（便于回测）
"""

import json
import sys
import os
import urllib.request
import urllib.error
from datetime import datetime

# 复用 api_client 的登录 / 请求能力
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from api_client import _login, get_transactions, get_checkins  # noqa: E402


# ========== 工作日判定 ==========

HOLIDAY_SOURCES = [
    "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{year}.json",
    "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{year}.json",
]


def _fetch_holiday_json(year, timeout=8):
    """依次尝试多个源，返回 dict 或 None"""
    for tmpl in HOLIDAY_SOURCES:
        url = tmpl.format(year=year)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "gouye-daily-check/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            continue
    return None


def judge_workday(date_str):
    """
    返回 (is_workday: bool, reason: str)
      reason ∈ {holiday_off, holiday_compensate, weekend, weekday, fallback_weekend, fallback_weekday}
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    data = _fetch_holiday_json(dt.year)
    if data and isinstance(data.get("days"), list):
        for d in data["days"]:
            if d.get("date") == date_str:
                if d.get("isOffDay"):
                    return False, "holiday_off"       # 法定放假
                else:
                    return True, "holiday_compensate" # 调休补班
        # 未命中 → 正常按 weekday
        if dt.weekday() >= 5:
            return False, "weekend"
        return True, "weekday"
    # 接口全挂 → 降级
    if dt.weekday() >= 5:
        return False, "fallback_weekend"
    return True, "fallback_weekday"


# ========== 三件套检查 ==========

def _t2minute(time_str):
    """'09:30:00' / '09:30' → 分钟数"""
    parts = time_str.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _extract_hm(dt_str):
    """从 '2026-05-09T09:00:00' 或 '2026-05-09 09:00:00' 提取 HH:MM"""
    # ISO 或 空格格式都兼容
    s = dt_str.replace("T", " ")
    try:
        return s.split(" ")[1][:5]  # 'HH:MM'
    except Exception:
        return "00:00"


def _iter_transactions(resp):
    """兼容 data=list 与 data={items:[...]} 两种返回结构"""
    data = resp.get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("items", data.get("list", []))
    return []


def check_items(date_str):
    """
    返回 dict: {"morning_taxi": bool, "lunch": bool, "offwork_checkin": bool}
    以及用于调试的 details
    """
    tx_resp = get_transactions(start_date=date_str, end_date=date_str)
    ck_resp = get_checkins()

    txs = _iter_transactions(tx_resp)
    checkins = ck_resp.get("data", []) or []

    # A. 早上打车：分类=交通出行 且 标签含打车
    # 注意：transaction_date 精度仅到日期（时间部分为 00:00），无法做时段过滤，跳过时段校验
    has_taxi = False
    for t in txs:
        cat = (t.get("category") or {}).get("category_name")
        if cat != "交通出行":
            continue
        tags = [tg.get("tag_name") for tg in t.get("tags", []) or []]
        if "打车" not in tags:
            continue
        has_taxi = True
        break

    # B. 中午吃饭：分类=日常吃饭
    # 注意：transaction_date 精度仅到日期（时间部分为 00:00），无法做时段过滤，跳过时段校验
    has_lunch = False
    for t in txs:
        cat = (t.get("category") or {}).get("category_name")
        if cat != "日常吃饭":
            continue
        has_lunch = True
        break

    # C. 下班打卡
    has_offwork = False
    for c in checkins:
        occurred = c.get("occurred_at", "") or ""
        if not occurred.startswith(date_str):
            continue
        tpl_name = (c.get("template") or {}).get("name")
        if tpl_name == "下班":
            has_offwork = True
            break

    return {
        "morning_taxi": has_taxi,
        "lunch": has_lunch,
        "offwork_checkin": has_offwork,
    }


# ========== 主流程 ==========

LABEL_MAP = {
    "morning_taxi":    "早上打车记账",
    "lunch":           "中午吃饭记账",
    "offwork_checkin": "下班打卡",
}

REASON_LABEL = {
    "holiday_off":         "法定节假日",
    "holiday_compensate":  "调休补班",
    "weekend":             "周末",
    "weekday":             "工作日",
    "fallback_weekend":    "周末（节假日接口不可用，已降级）",
    "fallback_weekday":    "工作日（节假日接口不可用，已降级）",
}


def main():
    # 参数：可选 date_str（YYYY-MM-DD），默认今天
    if len(sys.argv) >= 2:
        date_str = sys.argv[1]
    else:
        date_str = datetime.now().strftime("%Y-%m-%d")

    result = {"date": date_str}

    try:
        is_workday, reason = judge_workday(date_str)
        result["is_workday"] = is_workday
        result["workday_reason"] = reason

        if not is_workday:
            result["status"] = "skipped"
            result["summary"] = f"{date_str} 非工作日（{REASON_LABEL.get(reason, reason)}），跳过检查 ✅"
            result["missing"] = []
            result["have"] = []
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(0)

        # 登录 + 查数据
        login = _login()
        if login.get("code") != 0:
            result["status"] = "error"
            result["error"] = f"登录失败：{login.get('message')}"
            result["summary"] = f"⚠️ 检查异常：{result['error']}"
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(2)

        items = check_items(date_str)
        missing = [k for k, v in items.items() if not v]
        have = [k for k, v in items.items() if v]
        result["missing"] = missing
        result["have"] = have

        if not missing:
            result["status"] = "ok"
            result["summary"] = (
                f"{date_str} 三件套齐活 ✅\n"
                f"（{' / '.join(LABEL_MAP[k] for k in have)}）"
            )
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(0)

        result["status"] = "missing"
        missing_labels = "\n".join(f"- ❌ {LABEL_MAP[k]}" for k in missing)
        have_labels = ("\n- ✅ " + "\n- ✅ ".join(LABEL_MAP[k] for k in have)) if have else ""
        result["summary"] = (
            f"{date_str} 是工作日（{REASON_LABEL.get(reason, reason)}），检查结果：\n"
            f"{missing_labels}"
            f"{have_labels}\n"
            f"请及时补上～"
        )
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    except Exception as e:
        result["status"] = "error"
        result["error"] = f"{type(e).__name__}: {e}"
        result["summary"] = f"⚠️ 检查异常：{result['error']}"
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(2)


if __name__ == "__main__":
    main()
