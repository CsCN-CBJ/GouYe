package com.gouye.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.text.TextUtils;
import android.util.LruCache;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import com.gouye.app.update.AppUpdater;
import com.gouye.app.sync.GouyeSync;
import com.gouye.app.usage.UsageBackupJob;
import com.gouye.app.usage.UsageStatistics;
import com.gouye.app.usage.UsageStatistics.Period;
import com.gouye.app.usage.UsageStore;
import com.gouye.app.usage.UsageTimeline;
import com.gouye.app.usage.UsageTimeline.Hour;
import com.gouye.app.usage.UsageTimeline.Session;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public final class MainActivity extends Activity {
    private enum Page { TODAY, HISTORY, DAY, SETTINGS }

    private static final int PAPER = 0xfffbfaf7;
    private static final int WHITE = Color.WHITE;
    private static final int GREEN = 0xff17463c;
    private static final int INK = 0xff18312a;
    private static final int MUTED = 0xff53675e;
    private static final int TINT = 0xffe8f1ea;
    private static final int LINE = 0xffdce5dd;
    private static final int NO_BAR = -1;
    private static final String BACKFILL = "background_backfill";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("M月d日");
    private static final DateTimeFormatter FULL_DATE = DateTimeFormatter.ofPattern("yyyy年M月d日");
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter SECONDS = DateTimeFormatter.ofPattern("HH:mm:ss");

    private final ExecutorService usageWorker = Executors.newSingleThreadExecutor();
    private final ExecutorService updateWorker = Executors.newSingleThreadExecutor();
    private final ExecutorService syncWorker = Executors.newSingleThreadExecutor();
    private final LruCache<String, AppIdentity> applications = new LruCache<>(120);
    private final Set<String> desktopPackages = new HashSet<>();
    private UsageStore store;
    private AppUpdater updater;
    private GouyeSync gouyeSync;
    private SharedPreferences preferences;
    private Page page = Page.TODAY;
    private Page settingsOrigin = Page.TODAY;
    private LocalDate detailDate;
    private LocalDate statisticsDate;
    private Period statisticsPeriod = Period.DAY;
    private boolean todayTimeline;
    private boolean detailTimeline;
    private boolean allowed;
    private boolean scheduled;
    private int pendingRead;

    private FrameLayout content;
    private TextView title;
    private Button topAction;
    private Button back;
    private Button todayNav;
    private Button historyNav;

    private TextView status;
    private TextView total;
    private TextView empty;
    private Button refresh;
    private Button byApp;
    private Button byTime;
    private ListView recordList;
    private RecordAdapter adapter;
    private HourAdapter hourAdapter;
    private UsageStore.Day shownDay;
    private TextView comparison;
    private TextView chartSelection;
    private TextView rankingHeading;
    private UsageChart usageChart;

    private boolean checking;
    private boolean downloadReady;
    private String updateMessage = "";
    private TextView updateStatus;
    private Button checkUpdate;
    private Button installUpdate;
    private Button syncNow;
    private Button syncAccount;
    private TextView syncStatus;
    private boolean syncBusy;
    private String syncMessage = "";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        store = new UsageStore(this);
        updater = new AppUpdater(this);
        gouyeSync = new GouyeSync(this);
        preferences = getSharedPreferences("usage_settings", MODE_PRIVATE);
        detailDate = LocalDate.now(UsageStore.REPORT_ZONE);
        if (state != null) {
            page = Page.valueOf(state.getString("page", Page.TODAY.name()));
            settingsOrigin = Page.valueOf(state.getString("settingsOrigin", Page.TODAY.name()));
            detailDate = LocalDate.ofEpochDay(state.getLong("detailDate", detailDate.toEpochDay()));
            String date = state.getString("statisticsDate");
            if (date != null) statisticsDate = LocalDate.parse(date);
            statisticsPeriod = Period.valueOf(state.getString("statisticsPeriod", Period.DAY.name()));
            todayTimeline = state.getBoolean("todayTimeline");
            detailTimeline = state.getBoolean("detailTimeline");
            updateMessage = state.getString("updateMessage", "");
        }
        buildShell();
    }

    @Override protected void onResume() {
        super.onResume();
        desktopPackages.clear();
        desktopPackages.add("com.miui.home");
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo launcher : getPackageManager().queryIntentActivities(home, PackageManager.MATCH_DEFAULT_ONLY)) {
            if (launcher.activityInfo != null) desktopPackages.add(launcher.activityInfo.packageName);
        }
        configureBackfill();
        showPage(page != Page.SETTINGS);
        if (!checking) {
            updateWorker.execute(() -> {
                boolean ready = updater.hasDownloadedUpdate();
                runOnUiThread(() -> {
                    if (isDestroyed() || checking) return;
                    downloadReady = ready;
                    updateControls();
                });
            });
        }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        state.putString("page", page.name());
        state.putString("settingsOrigin", settingsOrigin.name());
        state.putLong("detailDate", detailDate.toEpochDay());
        state.putString("statisticsDate", statisticsDate == null ? null : statisticsDate.toString());
        state.putString("statisticsPeriod", statisticsPeriod.name());
        state.putBoolean("todayTimeline", todayTimeline);
        state.putBoolean("detailTimeline", detailTimeline);
        state.putString("updateMessage", updateMessage);
        super.onSaveInstanceState(state);
    }

    @Override protected void onDestroy() {
        usageWorker.shutdown();
        updateWorker.shutdown();
        syncWorker.shutdown();
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        switch (page) {
            case SETTINGS:
                navigate(settingsOrigin);
                break;
            case DAY:
                navigate(Page.HISTORY);
                break;
            case HISTORY:
                navigate(Page.TODAY);
                break;
            default:
                super.onBackPressed();
        }
    }

    private void buildShell() {
        LinearLayout root = column();
        root.setBackgroundColor(PAPER);
        LinearLayout toolbar = row();
        toolbar.setPadding(dp(12), dp(6), dp(12), dp(2));
        back = button("返回", this::onBackPressed);
        toolbar.addView(back);
        title = label("", 28, INK, true);
        title.setPadding(dp(12), 0, 0, 0);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(50), 1));
        topAction = button("设置", () -> {
            if (page == Page.SETTINGS) return;
            settingsOrigin = page;
            navigate(Page.SETTINGS);
        });
        toolbar.addView(topAction);
        root.addView(toolbar);

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        View rule = new View(this);
        rule.setBackgroundColor(LINE);
        root.addView(rule, new LinearLayout.LayoutParams(-1, dp(1)));

        LinearLayout nav = row();
        nav.setPadding(dp(14), dp(5), dp(14), dp(6));
        todayNav = button("今天", () -> navigate(Page.TODAY));
        historyNav = button("历史", () -> navigate(Page.HISTORY));
        nav.addView(todayNav, new LinearLayout.LayoutParams(0, dp(49), 1));
        LinearLayout.LayoutParams other = new LinearLayout.LayoutParams(0, dp(49), 1);
        other.leftMargin = dp(8);
        nav.addView(historyNav, other);
        root.addView(nav);
        setContentView(root);
    }

    private void navigate(Page target) {
        if (target == Page.TODAY && page != Page.SETTINGS) {
            statisticsDate = null;
            statisticsPeriod = Period.DAY;
        }
        page = target;
        showPage(target == Page.TODAY);
    }

    private void showPage(boolean importEvents) {
        int request = ++pendingRead;
        content.removeAllViews();
        shownDay = null;
        back.setVisibility(page == Page.DAY || page == Page.SETTINGS ? View.VISIBLE : View.GONE);
        topAction.setVisibility(page == Page.SETTINGS ? View.INVISIBLE : View.VISIBLE);
        Page navPage = page == Page.SETTINGS ? settingsOrigin : page;
        selectStyle(todayNav, navPage == Page.TODAY);
        selectStyle(historyNav, navPage == Page.HISTORY || navPage == Page.DAY);

        if (page == Page.SETTINGS) {
            title.setText("设置");
            showSettings();
            return;
        }
        boolean history = page == Page.HISTORY;
        boolean statistics = !history && !timelineSelected();
        LocalDate today = LocalDate.now(UsageStore.REPORT_ZONE);
        LocalDate pageDate = page == Page.DAY ? detailDate : today;
        LocalDate date = statistics && statisticsDate != null
                ? (statisticsDate.isAfter(today) ? today : statisticsDate) : pageDate;
        Period period = statisticsPeriod;
        title.setText(history ? "历史" : page == Page.DAY ? "当天记录" : "今天");
        buildRecords(history, statistics, date);
        boolean readUsage = importEvents && allowed;
        usageWorker.execute(() -> {
            try {
                if (readUsage) store.importRecentEvents();
                if (statistics) {
                    UsageStatistics result = store.readStatistics(period, date);
                    runOnUiThread(() -> {
                        if (isDestroyed() || pendingRead != request) return;
                        renderStatistics(result);
                    });
                    return;
                }
                List<UsageStore.Day> days = history
                        ? store.readRecentDays(date, 7)
                        : Collections.singletonList(store.readDay(date));
                runOnUiThread(() -> {
                    if (isDestroyed() || pendingRead != request) return;
                    if (history) renderHistory(days);
                    else renderDay(days.get(0));
                });
            } catch (RuntimeException error) {
                runOnUiThread(() -> {
                    if (isDestroyed() || pendingRead != request) return;
                    empty.setText("读取记录失败，请重试");
                    empty.setVisibility(View.VISIBLE);
                    refresh.setText("重试");
                    refresh.setEnabled(true);
                });
            }
        });
    }

    private void buildRecords(boolean history, boolean statistics, LocalDate date) {
        LinearLayout panel = column();
        LinearLayout header = column();
        header.setPadding(dp(24), 0, dp(24), dp(4));
        LinearLayout intro = row();
        status = label("", 13, MUTED, false);
        TextView caption = statistics ? status : label(history ? "最近 7 天" : FULL_DATE.format(date), 14, MUTED, false);
        intro.addView(caption, new LinearLayout.LayoutParams(0, -2, 1));
        refresh = button("刷新", () -> showPage(true));
        refresh.setEnabled(false);
        intro.addView(refresh);
        if (!statistics && (history || page == Page.DAY)) intro.addView(button("选日期", this::chooseDate));
        header.addView(intro);

        if (history) {
            addGap(header, status, 2);
        } else {
            if (!statistics) {
                LinearLayout summary = row();
                summary.setPadding(dp(14), dp(9), dp(14), dp(9));
                summary.setBackground(shape(TINT, 14));
                LinearLayout summaryText = column();
                summaryText.addView(label("总时长", 14, GREEN, true));
                addGap(summaryText, status, 3);
                summary.addView(summaryText, new LinearLayout.LayoutParams(0, -2, 1));
                total = label("—", 24, INK, true);
                total.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
                summary.addView(total);
                header.addView(summary);
            }

            LinearLayout choices = row();
            choices.setPadding(dp(3), dp(2), dp(3), dp(2));
            choices.setBackground(shape(WHITE, 14));
            byApp = button("统计", () -> changeView(false));
            byTime = button("时间线", () -> changeView(true));
            choices.addView(byApp, new LinearLayout.LayoutParams(0, -2, 1));
            choices.addView(byTime, new LinearLayout.LayoutParams(0, -2, 1));
            addGap(header, choices, statistics ? 0 : 8);
            syncViewButtons();
        }

        if (!allowed) {
            Button grant = button("开启使用情况访问权限", this::openUsagePermission);
            selectStyle(grant, true);
            addGap(header, grant, 6);
        }
        empty = label("正在读取记录…", 15, MUTED, false);
        empty.setPadding(0, dp(12), 0, dp(8));
        header.addView(empty);
        panel.addView(header);

        recordList = new ListView(this);
        recordList.setDivider(null);
        recordList.setClipToPadding(false);
        recordList.setPadding(dp(24), dp(4), dp(24), dp(12));
        recordList.setSelector(new RippleDrawable(ColorStateList.valueOf(0x1717463c), null, shape(WHITE, 9)));
        if (statistics) recordList.addHeaderView(buildStatisticsPanel(date), null, false);
        adapter = new RecordAdapter();
        hourAdapter = new HourAdapter();
        recordList.setAdapter(adapter);
        recordList.setOnItemClickListener((parent, view, position, id) -> {
            Object value = parent.getItemAtPosition(position);
            if (value instanceof RecordRow && ((RecordRow) value).date != null) {
                showDate(((RecordRow) value).date);
            } else if (value instanceof Hour && shownDay != null) {
                showHour((Hour) value, shownDay.date);
            }
        });
        panel.addView(recordList, new LinearLayout.LayoutParams(-1, 0, 1));
        content.addView(panel, new FrameLayout.LayoutParams(-1, -1));
    }

    private void renderHistory(List<UsageStore.Day> days) {
        empty.setVisibility(View.GONE);
        long saved = days.isEmpty() ? 0 : days.get(0).importedThrough;
        status.setText(savedLabel(saved));
        refresh.setEnabled(allowed);
        List<RecordRow> rows = new ArrayList<>(days.size());
        LocalDate now = LocalDate.now(UsageStore.REPORT_ZONE);
        for (UsageStore.Day day : days) {
            String caption = day.date.equals(now) ? "今天 · " + DATE.format(day.date) : DATE.format(day.date);
            String value = day.sessions.isEmpty() ? "暂无记录" : duration(day.total);
            rows.add(new RecordRow(caption, "", value + "   ›", NO_BAR, day.date, null));
        }
        adapter.replace(rows);
    }

    private View buildStatisticsPanel(LocalDate anchor) {
        LinearLayout panel = column();
        LinearLayout card = column();
        card.setPadding(dp(12), dp(9), dp(12), dp(8));
        card.setBackground(shape(WHITE, 16));
        LinearLayout periods = row();
        periods.setBackground(shape(PAPER, 12));
        for (Period item : Period.values()) {
            Button option = button(item.label, () -> {
                if (statisticsPeriod == item) return;
                statisticsDate = anchor;
                statisticsPeriod = item;
                showPage(false);
            });
            selectStyle(option, item == statisticsPeriod);
            periods.addView(option, new LinearLayout.LayoutParams(0, dp(38), 1));
        }
        card.addView(periods);
        LinearLayout dates = row();
        Button previous = button("‹", () -> openStatistics(statisticsPeriod.shift(anchor, -1)));
        previous.setContentDescription("上一个统计时段");
        Button next = button("›", () -> openStatistics(statisticsPeriod.shift(anchor, 1)));
        next.setContentDescription("下一个统计时段");
        LocalDate today = LocalDate.now(UsageStore.REPORT_ZONE);
        if (!anchor.isBefore(today)) {
            next.setEnabled(false);
            next.setAlpha(0.38f);
        }
        dates.addView(previous, new LinearLayout.LayoutParams(dp(44), dp(40)));
        Button pick = button(periodLabel(statisticsPeriod, anchor), () -> pickDate(anchor, this::openStatistics));
        pick.setTextSize(14);
        dates.addView(pick, new LinearLayout.LayoutParams(0, dp(40), 1));
        dates.addView(next, new LinearLayout.LayoutParams(dp(44), dp(40)));
        card.addView(dates);

        LinearLayout totals = row();
        total = label("—", 24, INK, true);
        totals.addView(total);
        comparison = label("", 12, MUTED, false);
        comparison.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        comparison.setPadding(dp(8), 0, 0, 0);
        totals.addView(comparison, new LinearLayout.LayoutParams(0, -2, 1));
        card.addView(totals);
        usageChart = new UsageChart(this, GREEN, MUTED, LINE);
        card.addView(usageChart, new LinearLayout.LayoutParams(-1, dp(124)));
        chartSelection = label("", 13, MUTED, false);
        chartSelection.setVisibility(View.GONE);
        card.addView(chartSelection);
        panel.addView(card);

        rankingHeading = label("应用排行", 16, INK, true);
        rankingHeading.setAccessibilityHeading(true);
        rankingHeading.setPadding(0, dp(9), 0, dp(5));
        rankingHeading.setVisibility(View.GONE);
        panel.addView(rankingHeading);
        return panel;
    }

    private static String periodLabel(Period period, LocalDate date) {
        if (period == Period.DAY) return FULL_DATE.format(date);
        if (date.equals(LocalDate.now(UsageStore.REPORT_ZONE))) return "近 " + period.days + " 天";
        return DATE.format(period.start(date)) + "–" + DATE.format(date);
    }

    private void openStatistics(LocalDate date) {
        LocalDate today = LocalDate.now(UsageStore.REPORT_ZONE);
        statisticsDate = date.isAfter(today) ? today : date;
        showPage(false);
    }

    private void renderStatistics(UsageStatistics data) {
        empty.setVisibility(View.GONE);
        status.setText(savedLabel(data.importedThrough));
        refresh.setEnabled(allowed);
        boolean hasRecords = data.recordedBuckets > 0;
        boolean daily = data.period == Period.DAY;
        long displayed = daily ? data.total : data.dailyAverage;
        String amount = displayed == 0 ? "0分" : duration(displayed);
        total.setText(!hasRecords ? "—" : daily ? amount : "日均 " + amount);
        String compared = "";
        if (data.difference != null) {
            String earlier = daily ? "较昨日同期" : "较上周期日均";
            if (data.difference == 0) compared = earlier + "持平";
            else compared = earlier + (data.difference > 0 ? "增加" : "减少") + duration(Math.abs(data.difference));
        } else if (!daily && hasRecords && data.recordedBuckets < data.period.days) {
            compared = "按 " + data.recordedBuckets + " 天记录计算";
        }
        comparison.setText(compared);
        chartSelection.setText(hasRecords ? "" : "该时段暂无使用记录");
        chartSelection.setVisibility(hasRecords ? View.GONE : View.VISIBLE);
        usageChart.show(data, index -> {
            String time = data.period == Period.DAY
                    ? clockRange(data.startDate.atStartOfDay(UsageStore.REPORT_ZONE).toInstant().toEpochMilli()
                            + index * UsageStatistics.HOUR,
                            data.startDate.atStartOfDay(UsageStore.REPORT_ZONE).toInstant().toEpochMilli()
                            + (index + 1) * UsageStatistics.HOUR, data.startDate, CLOCK)
                    : DATE.format(data.startDate.plusDays(index));
            String value = !data.recorded[index] ? "暂无记录"
                    : data.buckets[index] == 0 ? "0分" : duration(data.buckets[index]);
            chartSelection.setText(time + " · " + value);
            chartSelection.setVisibility(View.VISIBLE);
        });

        List<Map.Entry<String, Long>> apps = new ArrayList<>(data.apps.entrySet());
        apps.sort((a, b) -> {
            int rank = Long.compare(b.getValue(), a.getValue());
            return rank == 0 ? a.getKey().compareTo(b.getKey()) : rank;
        });
        List<RecordRow> rows = new ArrayList<>(apps.size());
        long max = apps.isEmpty() ? 1 : apps.get(0).getValue();
        for (Map.Entry<String, Long> app : apps) {
            int bar = (int) (app.getValue() * 1000 / max);
            rows.add(new RecordRow(appIdentity(app.getKey()).label, "", duration(app.getValue()),
                    bar, null, app.getKey()));
        }
        rankingHeading.setText(daily ? "应用排行" : data.period.days + " 天应用排行");
        rankingHeading.setVisibility(rows.isEmpty() ? View.GONE : View.VISIBLE);
        adapter.replace(rows);
    }

    private void renderDay(UsageStore.Day data) {
        shownDay = data;
        total.setText(data.sessions.isEmpty() ? "—" : duration(data.total));
        status.setText(savedLabel(data.importedThrough));
        refresh.setEnabled(allowed);
        empty.setText("当天暂无使用记录");
        empty.setVisibility(data.sessions.isEmpty() ? View.VISIBLE : View.GONE);
        renderTimeline(data);
    }

    private void renderTimeline(UsageStore.Day day) {
        long from = day.date.atStartOfDay(UsageStore.REPORT_ZONE).toInstant().toEpochMilli();
        long end = day.date.plusDays(1).atStartOfDay(UsageStore.REPORT_ZONE).toInstant().toEpochMilli();
        List<Hour> hours = day.sessions.isEmpty() ? Collections.emptyList()
                : UsageTimeline.hourlySummary(day.sessions, from, end,
                        Math.min(day.importedThrough, System.currentTimeMillis()), desktopPackages);
        if (recordList.getAdapter() != hourAdapter) recordList.setAdapter(hourAdapter);
        hourAdapter.replace(day.date, hours);
    }

    private void showHour(Hour hour, LocalDate date) {
        if (hour.sessions.isEmpty()) return;
        List<RecordRow> details = new ArrayList<>();
        List<RecordRow> main = new ArrayList<>();
        for (Session session : UsageTimeline.joinedForDisplay(hour.sessions)) {
            RecordRow row = new RecordRow(appIdentity(session.app).label,
                    clockRange(session.start, session.end, date, SECONDS), duration(session.duration()),
                    NO_BAR, null, session.app);
            details.add(row);
            if (session.duration() >= UsageTimeline.SHORT_SESSION_MILLIS) main.add(row);
        }
        LinearLayout body = column();
        body.setPadding(dp(20), 0, dp(20), 0);
        Switch all = new Switch(this);
        all.setText("显示所有片段");
        all.setTextColor(INK);
        all.setMinHeight(dp(44));
        body.addView(all);
        TextView emptyDetails = label("该时段都是短记录", 14, MUTED, false);
        emptyDetails.setVisibility(View.GONE);
        body.addView(emptyDetails);
        ListView list = new ListView(this);
        list.setDivider(null);
        list.setNestedScrollingEnabled(true);
        RecordAdapter rows = new RecordAdapter();
        list.setAdapter(rows);
        int height = Math.min(400, Math.max(120, getResources().getConfiguration().screenHeightDp - 225));
        body.addView(list, new LinearLayout.LayoutParams(-1, dp(height)));
        all.setVisibility(main.size() == details.size() ? View.GONE : View.VISIBLE);
        all.setChecked(main.isEmpty());
        rows.replace(all.isChecked() ? details : main);
        all.setOnCheckedChangeListener((view, checked) -> {
            rows.replace(checked ? details : main);
            emptyDetails.setVisibility(!checked && main.isEmpty() ? View.VISIBLE : View.GONE);
        });
        new AlertDialog.Builder(this)
                .setTitle(clockRange(hour.start, hour.end, date, CLOCK))
                .setView(body).setPositiveButton("关闭", null).show();
    }

    private void changeView(boolean timeline) {
        if (timelineSelected() == timeline) return;
        if (page == Page.DAY) detailTimeline = timeline;
        else todayTimeline = timeline;
        showPage(false);
    }

    private boolean timelineSelected() {
        return page == Page.DAY ? detailTimeline : todayTimeline;
    }

    private void syncViewButtons() {
        selectStyle(byApp, !timelineSelected());
        selectStyle(byTime, timelineSelected());
    }

    private void showDate(LocalDate date) {
        detailDate = date;
        statisticsDate = null;
        statisticsPeriod = Period.DAY;
        navigate(Page.DAY);
    }

    private void chooseDate() {
        LocalDate today = LocalDate.now(UsageStore.REPORT_ZONE);
        LocalDate initial = page == Page.DAY ? detailDate : today;
        pickDate(initial, this::showDate);
    }

    private void pickDate(LocalDate initial, Consumer<LocalDate> action) {
        LocalDate today = LocalDate.now(UsageStore.REPORT_ZONE);
        DatePickerDialog picker = new DatePickerDialog(this, (view, year, month, day) ->
                action.accept(LocalDate.of(year, month + 1, day)),
                initial.getYear(), initial.getMonthValue() - 1, initial.getDayOfMonth());
        picker.getDatePicker().setMaxDate(today.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli());
        picker.show();
    }

    private void showSettings() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout body = column();
        body.setPadding(dp(24), dp(10), dp(24), dp(24));
        scroll.addView(body);

        LinearLayout capture = settingsCard("时间记录");
        TextView access = label(allowed ? "使用情况访问已开启" : "使用情况访问未开启", 15, MUTED, false);
        LinearLayout permission = row();
        permission.addView(access, new LinearLayout.LayoutParams(0, -2, 1));
        permission.addView(button(allowed ? "管理权限" : "去授权", this::openUsagePermission));
        capture.addView(permission);
        Switch backfill = new Switch(this);
        backfill.setText("后台定期补存");
        backfill.setTextColor(INK);
        backfill.setTextSize(16);
        backfill.setMinHeight(dp(48));
        backfill.setChecked(preferences.getBoolean(BACKFILL, true));
        backfill.setEnabled(allowed);
        capture.addView(backfill);
        TextView jobStatus = label(backfillLabel(), 14, MUTED, false);
        capture.addView(jobStatus);
        backfill.setOnCheckedChangeListener((view, checked) -> {
            preferences.edit().putBoolean(BACKFILL, checked).apply();
            configureBackfill();
            jobStatus.setText(backfillLabel());
        });
        addGap(body, capture, 4);

        LinearLayout sync = settingsCard("同步到 GouYe");
        syncStatus = label("", 14, MUTED, false);
        addGap(sync, syncStatus, 8);
        LinearLayout syncActions = row();
        syncNow = button("立即同步", this::uploadToGouye);
        selectStyle(syncNow, true);
        syncAccount = button("登录 GouYe", this::openSyncAccount);
        syncActions.addView(syncNow);
        syncActions.addView(syncAccount);
        addGap(sync, syncActions, 8);
        addGap(body, sync, 16);

        LinearLayout releases = settingsCard("应用更新");
        addGap(releases, label("当前版本 " + updater.versionName(), 15, MUTED, false), 8);
        LinearLayout buttons = row();
        checkUpdate = button("检查更新", this::checkForUpdate);
        selectStyle(checkUpdate, true);
        installUpdate = button("安装新版", this::openUpdateInstaller);
        buttons.addView(checkUpdate, new LinearLayout.LayoutParams(0, dp(48), 1));
        buttons.addView(installUpdate, new LinearLayout.LayoutParams(0, dp(48), 1));
        addGap(releases, buttons, 10);
        updateStatus = label("", 14, MUTED, false);
        addGap(releases, updateStatus, 6);
        addGap(body, releases, 16);
        content.addView(scroll);
        updateControls();
        updateSyncControls();
    }

    private void openSyncAccount() {
        if (syncBusy) return;
        LinearLayout fields = column();
        fields.setPadding(dp(24), 0, dp(24), 0);
        EditText server = syncField("HTTPS 地址", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        server.setText(gouyeSync.serverForSignIn());
        EditText account = syncField("GouYe 用户名", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PERSON_NAME);
        account.setText(gouyeSync.username());
        EditText password = syncField("GouYe 密码", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        fields.addView(server);
        fields.addView(account);
        fields.addView(password);
        AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle("登录 GouYe").setView(fields)
                .setNegativeButton("取消", null).setPositiveButton("登录", (ignored, action) -> {
                    String enteredServer = server.getText().toString();
                    String enteredAccount = account.getText().toString();
                    String enteredPassword = password.getText().toString();
                    password.getText().clear();
                    syncBusy = true;
                    syncMessage = "正在登录…";
                    updateSyncControls();
                    syncWorker.execute(() -> {
                        try {
                            gouyeSync.signIn(enteredServer, enteredAccount, enteredPassword);
                            finishSync("已连接，点「立即同步」上传");
                        } catch (IOException | RuntimeException error) {
                            finishSync(syncFailure(error));
                        }
                    });
                });
        if (gouyeSync.isSignedIn()) {
            dialog.setNeutralButton("退出登录", (ignored, action) -> {
                syncBusy = true;
                syncWorker.execute(() -> {
                    gouyeSync.signOut();
                    finishSync("已退出登录");
                });
            });
        }
        dialog.show();
    }

    private EditText syncField(String hint, int inputType) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setInputType(inputType);
        field.setSingleLine();
        return field;
    }

    private void uploadToGouye() {
        if (syncBusy) return;
        syncBusy = true;
        syncMessage = "正在整理并上传记录…";
        updateSyncControls();
        syncWorker.execute(() -> {
            try {
                finishSync(gouyeSync.uploadSavedDays(store));
            } catch (IOException | RuntimeException error) {
                finishSync(syncFailure(error));
            }
        });
    }

    private String syncFailure(Exception error) {
        if (error instanceof javax.net.ssl.SSLException) return "无法建立安全连接，请核对 HTTPS 地址及证书";
        if (error instanceof IOException && error.getMessage() != null) return error.getMessage();
        return "同步失败，请重试";
    }

    private void finishSync(String message) {
        runOnUiThread(() -> {
            if (isDestroyed()) return;
            syncBusy = false;
            syncMessage = message;
            updateSyncControls();
        });
    }

    private void updateSyncControls() {
        if (page != Page.SETTINGS || syncStatus == null) return;
        boolean connected = gouyeSync.isSignedIn();
        String status = connected ? "已登录 " + gouyeSync.username() : "登录后可手动上传使用记录";
        long last = gouyeSync.lastSync();
        if (last > 0) {
            java.time.ZonedDateTime time = Instant.ofEpochMilli(last).atZone(UsageStore.REPORT_ZONE);
            status += "\n上次同步 " + DATE.format(time) + " " + CLOCK.format(time);
        }
        if (!syncMessage.isEmpty()) status += "\n" + syncMessage;
        syncStatus.setText(status);
        syncNow.setVisibility(connected ? View.VISIBLE : View.GONE);
        syncNow.setEnabled(!syncBusy);
        syncAccount.setText(connected ? "管理登录" : "登录 GouYe");
        syncAccount.setEnabled(!syncBusy);
    }

    private void configureBackfill() {
        allowed = UsageStore.hasAccess(this);
        scheduled = UsageBackupJob.configure(this, preferences.getBoolean(BACKFILL, true));
    }

    private String backfillLabel() {
        if (!allowed) return "授权后可开启后台补存";
        if (scheduled) return "约每两小时由系统择机保存";
        return preferences.getBoolean(BACKFILL, true)
                ? "后台任务未启用，打开狗爷时仍可补存" : "打开狗爷或手动刷新时补存";
    }

    private void openUsagePermission() {
        try {
            startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        } catch (RuntimeException error) {
            Toast.makeText(this, "请在安卓设置中开启「使用情况访问权限」", Toast.LENGTH_LONG).show();
        }
    }

    private void checkForUpdate() {
        if (checking) return;
        checking = true;
        updateMessage = "正在检查更新…";
        updateControls();
        updateWorker.execute(() -> {
            String result;
            try {
                String name = updater.checkForUpdate();
                result = name == null ? "当前已是最新版本" : "已下载 " + name + "，可安装新版";
            } catch (IOException error) {
                result = error.getMessage() == null ? "检查更新失败，请重试" : error.getMessage();
            } catch (RuntimeException error) {
                result = "检查更新失败，请重试";
            }
            boolean ready = updater.hasDownloadedUpdate();
            String message = result;
            runOnUiThread(() -> {
                if (isDestroyed()) return;
                checking = false;
                updateMessage = message;
                downloadReady = ready;
                updateControls();
            });
        });
    }

    private void updateControls() {
        if (page != Page.SETTINGS || updateStatus == null) return;
        updateStatus.setText(updateMessage);
        updateStatus.setVisibility(updateMessage.isEmpty() ? View.GONE : View.VISIBLE);
        checkUpdate.setEnabled(!checking);
        checkUpdate.setAlpha(checking ? 0.5f : 1f);
        installUpdate.setVisibility(downloadReady ? View.VISIBLE : View.GONE);
        installUpdate.setEnabled(!checking);
    }

    private void openUpdateInstaller() {
        try {
            if (!getPackageManager().canRequestPackageInstalls()) {
                updateMessage = "授权后返回，点「安装新版」继续";
                updateControls();
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())));
                return;
            }
            startActivity(updater.installIntent());
        } catch (IOException | RuntimeException error) {
            updateMessage = "无法打开安装界面，请再检查一次更新";
            updateControls();
        }
    }

    private AppIdentity appIdentity(String packageName) {
        AppIdentity saved = applications.get(packageName);
        if (saved != null) return saved;
        String name = packageName;
        Drawable.ConstantState icon = null;
        try {
            PackageManager packages = getPackageManager();
            ApplicationInfo app = packages.getApplicationInfo(packageName, 0);
            CharSequence label = packages.getApplicationLabel(app);
            if (!TextUtils.isEmpty(label)) name = label.toString();
            icon = packages.getApplicationIcon(app).getConstantState();
        } catch (PackageManager.NameNotFoundException | android.content.res.Resources.NotFoundException missing) {
            // Older records can refer to an app that is no longer installed.
        }
        AppIdentity identity = new AppIdentity(name, icon);
        applications.put(packageName, identity);
        return identity;
    }

    private static String savedLabel(long millis) {
        if (millis <= 0) return "暂无保存记录";
        java.time.ZonedDateTime moment = Instant.ofEpochMilli(millis).atZone(UsageStore.REPORT_ZONE);
        String when = CLOCK.format(moment);
        if (!moment.toLocalDate().equals(LocalDate.now(UsageStore.REPORT_ZONE))) when = DATE.format(moment) + " " + when;
        return "上次保存 " + when;
    }

    private static String clockRange(long start, long end, LocalDate date, DateTimeFormatter clock) {
        java.time.ZonedDateTime from = Instant.ofEpochMilli(start).atZone(UsageStore.REPORT_ZONE);
        java.time.ZonedDateTime to = Instant.ofEpochMilli(end).atZone(UsageStore.REPORT_ZONE);
        return clock.format(from) + "–" + (to.toLocalDate().isAfter(date)
                ? (clock == SECONDS ? "24:00:00" : "24:00") : clock.format(to));
    }

    private static String duration(long millis) {
        long seconds = millis / 1000;
        if (seconds == 0) return "<1秒";
        if (seconds < 60) return seconds + "秒";
        long minutes = seconds / 60;
        if (minutes < 60) return minutes + "分" + (seconds % 60 == 0 ? "" : seconds % 60 + "秒");
        return minutes / 60 + "小时" + minutes % 60 + "分";
    }

    private static String summaryDuration(long millis) {
        return duration(millis + 500);
    }

    private LinearLayout settingsCard(String heading) {
        LinearLayout card = column();
        card.setBackground(shape(WHITE, 18));
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.addView(label(heading, 18, INK, true));
        return card;
    }

    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private LinearLayout row() {
        LinearLayout layout = new LinearLayout(this);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        return layout;
    }

    private void addGap(LinearLayout parent, View view, int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(top);
        parent.addView(view, params);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView label(String text, int size, int color, boolean bold) {
        TextView value = new TextView(this);
        value.setText(text);
        value.setTextSize(size);
        value.setTextColor(color);
        value.setGravity(Gravity.CENTER_VERTICAL);
        if (bold) value.setTypeface(null, Typeface.BOLD);
        return value;
    }

    private GradientDrawable shape(int color, int radius) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(dp(radius));
        return background;
    }

    private Button button(String name, Runnable action) {
        Button button = new Button(this);
        button.setText(name);
        button.setTextSize(15);
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setMinHeight(dp(44));
        button.setPadding(dp(12), 0, dp(12), 0);
        button.setStateListAnimator(null);
        selectStyle(button, false);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private void selectStyle(Button button, boolean selected) {
        button.setSelected(selected);
        button.setTextColor(selected ? INK : MUTED);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x2217463c),
                shape(selected ? TINT : Color.TRANSPARENT, 12), shape(WHITE, 12)));
    }

    private static final class AppIdentity {
        final String label;
        final Drawable.ConstantState icon;

        AppIdentity(String label, Drawable.ConstantState icon) {
            this.label = label;
            this.icon = icon;
        }
    }

    private static final class RecordRow {
        final String label;
        final String subtitle;
        final String value;
        final int bar;
        final LocalDate date;
        final String app;

        RecordRow(String label, String subtitle, String value, int bar, LocalDate date, String app) {
            this.label = label;
            this.subtitle = subtitle;
            this.value = value;
            this.bar = bar;
            this.date = date;
            this.app = app;
        }
    }

    private final class RecordAdapter extends BaseAdapter {
        private List<RecordRow> records = Collections.emptyList();

        void replace(List<RecordRow> rows) {
            records = rows;
            notifyDataSetChanged();
        }

        @Override public int getCount() { return records.size(); }
        @Override public RecordRow getItem(int index) { return records.get(index); }
        @Override public long getItemId(int index) { return index; }
        @Override public boolean areAllItemsEnabled() { return false; }
        @Override public boolean isEnabled(int index) { return getItem(index).date != null; }

        @Override public View getView(int index, View previous, ViewGroup parent) {
            RecordCell cell = previous == null ? new RecordCell() : (RecordCell) previous;
            cell.bind(getItem(index));
            return cell;
        }
    }

    private final class HourAdapter extends BaseAdapter {
        private LocalDate date;
        private List<Hour> hours = Collections.emptyList();

        void replace(LocalDate date, List<Hour> rows) {
            this.date = date;
            hours = rows;
            notifyDataSetChanged();
        }

        @Override public int getCount() { return hours.size(); }
        @Override public Hour getItem(int index) { return hours.get(index); }
        @Override public long getItemId(int index) { return getItem(index).start; }
        @Override public boolean areAllItemsEnabled() { return false; }
        @Override public boolean isEnabled(int index) { return getItem(index).total > 0; }

        @Override public View getView(int index, View previous, ViewGroup parent) {
            HourCell cell = previous == null ? new HourCell() : (HourCell) previous;
            cell.bind(date, getItem(index));
            return cell;
        }
    }

    private final class HourCell extends LinearLayout {
        private final LinearLayout card;
        private final LinearLayout apps;
        private final TextView time;
        private final TextView total;
        private final TextView other;

        HourCell() {
            super(MainActivity.this);
            setOrientation(VERTICAL);
            setPadding(0, dp(3), 0, dp(8));
            card = column();
            card.setPadding(dp(14), dp(11), dp(14), dp(11));
            addView(card);
            LinearLayout header = row();
            time = label("", 15, INK, true);
            time.setAccessibilityHeading(true);
            header.addView(time, new LinearLayout.LayoutParams(0, -2, 1));
            total = label("", 14, GREEN, true);
            total.setPadding(dp(8), 0, 0, 0);
            header.addView(total);
            card.addView(header);
            apps = column();
            card.addView(apps);
            other = label("", 14, MUTED, false);
            addGap(card, other, 7);
        }

        void bind(LocalDate date, Hour hour) {
            boolean recorded = hour.total > 0;
            card.setBackground(shape(recorded ? WHITE : TINT, 14));
            time.setText(clockRange(hour.start, hour.end, date,
                    hour.end - hour.start < 60_000 ? SECONDS : CLOCK));
            time.setTextColor(recorded ? INK : MUTED);
            total.setTextColor(recorded ? GREEN : MUTED);
            total.setText(recorded ? summaryDuration(hour.total) + "  ›" : "无使用记录");
            apps.removeAllViews();
            other.setVisibility(hour.other > 0 ? VISIBLE : GONE);
            if (hour.other > 0) other.setText("其他 " + summaryDuration(hour.other));

            int columns = getResources().getConfiguration().screenWidthDp < 350
                    || getResources().getConfiguration().fontScale > 1.3f ? 1 : 2;
            ArrayList<Map.Entry<String, Long>> visible = new ArrayList<>(hour.mainApps.entrySet());
            for (int i = 0; i < visible.size(); i += columns) {
                LinearLayout line = row();
                for (int j = 0; j < columns; j++) {
                    int index = i + j;
                    if (index < visible.size()) {
                        Map.Entry<String, Long> usage = visible.get(index);
                        line.addView(hourApp(usage.getKey(), usage.getValue()),
                                new LinearLayout.LayoutParams(0, -2, 1));
                    } else {
                        line.addView(new View(MainActivity.this), new LinearLayout.LayoutParams(0, 0, 1));
                    }
                }
                addGap(apps, line, i == 0 ? 9 : 5);
            }
        }

        private View hourApp(String packageName, long millis) {
            AppIdentity app = appIdentity(packageName);
            LinearLayout cell = row();
            cell.setPadding(0, 0, dp(6), 0);
            AppIcon icon = new AppIcon();
            icon.bind(app);
            LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(dp(25), dp(25));
            size.rightMargin = dp(7);
            cell.addView(icon, size);
            LinearLayout text = column();
            TextView name = label(app.label, 14, INK, false);
            name.setMaxLines(2);
            name.setEllipsize(TextUtils.TruncateAt.END);
            text.addView(name);
            text.addView(label(summaryDuration(millis), 13, MUTED, false));
            cell.addView(text, new LinearLayout.LayoutParams(0, -2, 1));
            return cell;
        }
    }

    private final class AppIcon extends FrameLayout {
        private final ImageView icon;
        private final TextView initial;

        AppIcon() {
            super(MainActivity.this);
            setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            icon = new ImageView(MainActivity.this);
            icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
            addView(icon, new FrameLayout.LayoutParams(-1, -1));
            initial = label("", 14, GREEN, true);
            initial.setGravity(Gravity.CENTER);
            initial.setBackground(shape(TINT, 9));
            addView(initial, new FrameLayout.LayoutParams(-1, -1));
        }

        void bind(AppIdentity app) {
            boolean hasIcon = app.icon != null;
            icon.setImageDrawable(hasIcon ? app.icon.newDrawable(getResources()) : null);
            icon.setVisibility(hasIcon ? VISIBLE : GONE);
            initial.setVisibility(hasIcon ? GONE : VISIBLE);
            if (!hasIcon) initial.setText(app.label.substring(0, app.label.offsetByCodePoints(0, 1)));
        }
    }

    private final class RecordCell extends LinearLayout {
        private final TextView name;
        private final TextView subtitle;
        private final TextView trailing;
        private final AppIcon iconSlot;
        private final ProgressBar progress;
        private final View divider;

        RecordCell() {
            super(MainActivity.this);
            setOrientation(VERTICAL);
            setMinimumHeight(dp(48));
            setPadding(0, dp(5), 0, dp(5));
            LinearLayout line = row();
            iconSlot = new AppIcon();
            LinearLayout.LayoutParams iconSize = new LinearLayout.LayoutParams(dp(30), dp(30));
            iconSize.rightMargin = dp(10);
            line.addView(iconSlot, iconSize);
            LinearLayout leading = column();
            name = label("", 15, INK, true);
            name.setMaxLines(2);
            name.setEllipsize(TextUtils.TruncateAt.END);
            leading.addView(name);
            subtitle = label("", 13, MUTED, false);
            leading.addView(subtitle);
            line.addView(leading, new LinearLayout.LayoutParams(0, -2, 1));
            trailing = label("", 14, GREEN, false);
            trailing.setPadding(dp(12), 0, 0, 0);
            line.addView(trailing);
            addView(line);
            progress = new ProgressBar(MainActivity.this, null, android.R.attr.progressBarStyleHorizontal);
            progress.setProgressTintList(ColorStateList.valueOf(GREEN));
            progress.setProgressBackgroundTintList(ColorStateList.valueOf(LINE));
            progress.setMax(1000);
            LinearLayout.LayoutParams bar = new LinearLayout.LayoutParams(-1, dp(5));
            bar.topMargin = dp(6);
            addView(progress, bar);
            divider = new View(MainActivity.this);
            divider.setBackgroundColor(LINE);
            LinearLayout.LayoutParams rule = new LinearLayout.LayoutParams(-1, dp(1));
            rule.topMargin = dp(6);
            addView(divider, rule);
        }

        void bind(RecordRow item) {
            name.setText(item.label);
            subtitle.setText(item.subtitle);
            subtitle.setVisibility(item.subtitle.isEmpty() ? GONE : VISIBLE);
            divider.setVisibility(item.subtitle.isEmpty() ? VISIBLE : GONE);
            iconSlot.setVisibility(item.app == null ? GONE : VISIBLE);
            if (item.app != null) iconSlot.bind(appIdentity(item.app));
            trailing.setText(item.value);
            progress.setVisibility(item.bar == NO_BAR ? GONE : VISIBLE);
            if (item.bar != NO_BAR) progress.setProgress(item.bar);
        }
    }
}
