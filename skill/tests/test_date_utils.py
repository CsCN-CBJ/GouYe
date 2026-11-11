"""Date utils module tests — 3 cases"""

import datetime
import api_client


def test_get_today():
    today_str = api_client.get_today()
    expected = datetime.datetime.now().strftime("%Y-%m-%d")
    assert today_str == expected


def test_get_yesterday():
    yesterday = api_client.get_yesterday()
    expected = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    assert yesterday == expected


def test_get_week_dates():
    monday, sunday = api_client.get_week_dates()
    today = datetime.datetime.now()
    expected_monday = today - datetime.timedelta(days=today.weekday())
    assert monday == expected_monday.strftime("%Y-%m-%d")
    assert sunday == (expected_monday + datetime.timedelta(days=6)).strftime("%Y-%m-%d")
