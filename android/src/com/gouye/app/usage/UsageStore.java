package com.gouye.app.usage;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.os.Process;
import android.os.UserManager;

import java.time.LocalDate;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class UsageStore {
    public static final ZoneId REPORT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final long LOOKBACK = TimeUnit.HOURS.toMillis(48);
    private static final long OVERLAP = TimeUnit.SECONDS.toMillis(5);
    private static final Object IMPORT_LOCK = new Object();
    private static final String KEY_THROUGH = "imported_through";
    private final Context context;

    public UsageStore(Context context) { this.context = context.getApplicationContext(); }

    public static boolean hasAccess(Context context) {
        AppOpsManager ops = context.getSystemService(AppOpsManager.class);
        return ops != null && ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(), context.getPackageName()) == AppOpsManager.MODE_ALLOWED;
    }

    public void importRecentEvents() {
        synchronized (IMPORT_LOCK) {
            UserManager users = context.getSystemService(UserManager.class);
            UsageStatsManager usage = context.getSystemService(UsageStatsManager.class);
            if (!hasAccess(context) || users == null || !users.isUserUnlocked() || usage == null) return;
            long now = System.currentTimeMillis();
            try (Database storage = new Database(context)) {
                SQLiteDatabase db = storage.getWritableDatabase();
                long previous = through(db);
                if (now <= previous) return;
                long oldest = now - LOOKBACK;
                boolean gap = previous < oldest;
                long since = Math.max(oldest, previous - OVERLAP);
                try (Cursor coverage = db.rawQuery("SELECT 1 FROM import_windows LIMIT 1", null)) {
                    if (!coverage.moveToFirst()) since = oldest;
                }
                UsageEvents events = usage.queryEvents(since, now);
                if (events == null || !hasAccess(context)) return;
                db.beginTransaction();
                try {
                    if (gap) {
                        if (previous > 0) insert(db, previous, UsageTimeline.Type.RESET, "", 0);
                        insert(db, since, UsageTimeline.Type.RESET, "", 0);
                    }
                    UsageEvents.Event entry = new UsageEvents.Event();
                    while (events.hasNextEvent() && events.getNextEvent(entry)) {
                        UsageTimeline.Type type = translate(entry.getEventType());
                        if (type == null) continue;
                        String app = "";
                        int activity = 0;
                        if (type == UsageTimeline.Type.FOREGROUND || type == UsageTimeline.Type.BACKGROUND) {
                            app = entry.getPackageName();
                            if (app == null || app.isEmpty()) continue;
                            String activityName = entry.getClassName();
                            if (activityName != null) activity = activityName.hashCode();
                        }
                        insert(db, entry.getTimeStamp(), type, app, activity);
                    }
                    saveCoverage(db, since, now);
                    ContentValues checkpoint = new ContentValues();
                    checkpoint.put("name", KEY_THROUGH);
                    checkpoint.put("value", now);
                    long updated = db.insertWithOnConflict("checkpoints", null, checkpoint, SQLiteDatabase.CONFLICT_REPLACE);
                    if (updated < 0) throw new IllegalStateException("无法保存记录时间");
                    db.setTransactionSuccessful();
                } finally {
                    db.endTransaction();
                }
            }
        }
    }

    public UsageStatistics readStatistics(UsageStatistics.Period period, LocalDate date) {
        synchronized (IMPORT_LOCK) {
            try (Database storage = new Database(context)) {
                SQLiteDatabase db = storage.getReadableDatabase();
                long last = through(db);
                LocalDate startDate = period.start(date);
                long begin = startOfDay(startDate);
                long through = Math.min(startOfDay(date.plusDays(1)), Math.min(last, System.currentTimeMillis()));
                long previousStart = startOfDay(period.shift(startDate, -1));
                long previousEnd = previousStart + Math.max(0, through - begin);
                List<UsageStatistics.Coverage> windows = readCoverage(db, previousStart, through);
                Long previousTotal = null;
                if (previousEnd <= begin && UsageStatistics.covers(windows, previousStart, previousEnd)
                        && UsageStatistics.covers(windows, begin, through)) {
                    previousTotal = 0L;
                    for (UsageTimeline.Session session : readSessions(db, previousStart, previousEnd)) {
                        previousTotal += session.duration();
                    }
                }
                return UsageStatistics.summarize(period, startDate, begin, through, last,
                        readSessions(db, begin, through), windows, previousTotal);
            }
        }
    }

    private static long startOfDay(LocalDate date) {
        return date.atStartOfDay(REPORT_ZONE).toInstant().toEpochMilli();
    }

    private static List<UsageStatistics.Coverage> readCoverage(SQLiteDatabase db, long from, long through) {
        List<UsageStatistics.Coverage> windows = new ArrayList<>();
        try (Cursor rows = db.rawQuery("SELECT start_stamp,end_stamp FROM import_windows "
                + "WHERE start_stamp<? AND end_stamp>? ORDER BY start_stamp",
                new String[]{Long.toString(through), Long.toString(from)})) {
            while (rows.moveToNext()) windows.add(new UsageStatistics.Coverage(rows.getLong(0), rows.getLong(1)));
        }
        return windows;
    }

    private static void saveCoverage(SQLiteDatabase db, long start, long end) {
        String overlap = "start_stamp<=? AND end_stamp>=?";
        String[] limits = {Long.toString(end), Long.toString(start)};
        try (Cursor row = db.rawQuery("SELECT min(start_stamp),max(end_stamp) FROM import_windows WHERE " + overlap, limits)) {
            if (row.moveToFirst() && !row.isNull(0)) {
                start = Math.min(start, row.getLong(0));
                end = Math.max(end, row.getLong(1));
            }
        }
        db.delete("import_windows", overlap, limits);
        db.execSQL("INSERT INTO import_windows(start_stamp,end_stamp) VALUES(?,?)", new Object[]{start, end});
    }

    public Day readDay(LocalDate day) {
        synchronized (IMPORT_LOCK) {
            try (Database storage = new Database(context)) {
                SQLiteDatabase db = storage.getReadableDatabase();
                return readDay(db, day, REPORT_ZONE, through(db), System.currentTimeMillis());
            }
        }
    }

    public List<Day> readRecentDays(LocalDate endDay, int count) {
        synchronized (IMPORT_LOCK) {
            try (Database storage = new Database(context)) {
                SQLiteDatabase db = storage.getReadableDatabase();
                long last = through(db);
                long now = System.currentTimeMillis();
                List<Day> days = new ArrayList<>(count);
                for (int i = 0; i < count; i++) {
                    days.add(readDay(db, endDay.minusDays(i), REPORT_ZONE, last, now));
                }
                return days;
            }
        }
    }

    public List<Day> readSavedDays() {
        synchronized (IMPORT_LOCK) {
            try (Database storage = new Database(context)) {
                SQLiteDatabase db = storage.getReadableDatabase();
                long last = through(db);
                long now = System.currentTimeMillis();
                List<Day> days = new ArrayList<>();
                try (Cursor oldest = db.rawQuery("SELECT min(stamp) FROM events WHERE type=?",
                        new String[]{UsageTimeline.Type.FOREGROUND.name()})) {
                    if (!oldest.moveToFirst() || oldest.isNull(0)) return days;
                    LocalDate day = Instant.ofEpochMilli(oldest.getLong(0)).atZone(REPORT_ZONE).toLocalDate();
                    LocalDate latest = Instant.ofEpochMilli(Math.min(last, now)).atZone(REPORT_ZONE).toLocalDate();
                    for (; !day.isAfter(latest); day = day.plusDays(1)) {
                        Day record = readDay(db, day, REPORT_ZONE, last, now);
                        if (!record.sessions.isEmpty()) days.add(record);
                    }
                }
                return days;
            }
        }
    }

    private static Day readDay(SQLiteDatabase db, LocalDate day, ZoneId zone, long last, long now) {
        long start = day.atStartOfDay(zone).toInstant().toEpochMilli();
        long end = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
        long cutoff = Math.min(end, Math.min(last, now));
        return new Day(day, readSessions(db, start, cutoff), last);
    }

    private static List<UsageTimeline.Session> readSessions(SQLiteDatabase db, long start, long cutoff) {
        List<UsageTimeline.Event> events = new ArrayList<>();
        if (cutoff > start) {
            try (Cursor rows = db.query("events", new String[]{"stamp", "type", "package", "activity"},
                    "stamp>=? AND stamp<?", new String[]{Long.toString(start - LOOKBACK), Long.toString(cutoff)},
                    null, null, "stamp, id")) {
                while (rows.moveToNext()) {
                    events.add(new UsageTimeline.Event(rows.getLong(0),
                            UsageTimeline.Type.valueOf(rows.getString(1)), rows.getString(2), rows.getInt(3)));
                }
            }
        }
        return UsageTimeline.sessions(events, start, cutoff);
    }

    public static final class Day {
        public final LocalDate date;
        public final List<UsageTimeline.Session> sessions;
        public final Map<String, Long> apps;
        public final long total;
        public final long importedThrough;

        Day(LocalDate date, List<UsageTimeline.Session> sessions, long importedThrough) {
            this.date = date;
            this.sessions = Collections.unmodifiableList(sessions);
            Map<String, Long> durations = new LinkedHashMap<>();
            long totalDuration = 0;
            for (UsageTimeline.Session session : sessions) {
                durations.merge(session.app, session.duration(), Long::sum);
                totalDuration += session.duration();
            }
            this.apps = Collections.unmodifiableMap(durations);
            this.total = totalDuration;
            this.importedThrough = importedThrough;
        }
    }

    private static void insert(SQLiteDatabase db, long time, UsageTimeline.Type type, String app, int activity) {
        db.execSQL("INSERT OR IGNORE INTO events(stamp,type,package,activity) VALUES(?,?,?,?)",
                new Object[]{time, type.name(), app, activity});
    }

    private static long through(SQLiteDatabase db) {
        try (Cursor result = db.query("checkpoints", new String[]{"value"}, "name=?",
                new String[]{KEY_THROUGH}, null, null, null)) {
            return result.moveToFirst() ? result.getLong(0) : 0;
        }
    }

    private static UsageTimeline.Type translate(int type) {
        switch (type) {
            case UsageEvents.Event.ACTIVITY_RESUMED: return UsageTimeline.Type.FOREGROUND;
            case UsageEvents.Event.ACTIVITY_PAUSED: return UsageTimeline.Type.BACKGROUND;
            case UsageEvents.Event.SCREEN_INTERACTIVE: return UsageTimeline.Type.SCREEN_ON;
            case UsageEvents.Event.SCREEN_NON_INTERACTIVE: return UsageTimeline.Type.SCREEN_OFF;
            case UsageEvents.Event.KEYGUARD_SHOWN: return UsageTimeline.Type.LOCKED;
            case UsageEvents.Event.KEYGUARD_HIDDEN: return UsageTimeline.Type.UNLOCKED;
            case UsageEvents.Event.DEVICE_SHUTDOWN:
            case UsageEvents.Event.DEVICE_STARTUP: return UsageTimeline.Type.RESET;
            default: return null;
        }
    }

    private static final class Database extends SQLiteOpenHelper {
        Database(Context context) { super(context, "usage.db", null, 2); }

        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE events (id INTEGER PRIMARY KEY, stamp INTEGER NOT NULL, "
                    + "type TEXT NOT NULL, package TEXT NOT NULL, activity INTEGER NOT NULL, "
                    + "UNIQUE(stamp,type,package,activity))");
            db.execSQL("CREATE TABLE checkpoints (name TEXT PRIMARY KEY, value INTEGER NOT NULL)");
            createCoverage(db);
        }

        @Override public void onUpgrade(SQLiteDatabase db, int from, int to) {
            if (from == 1) createCoverage(db);
        }

        private static void createCoverage(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE import_windows (start_stamp INTEGER PRIMARY KEY, end_stamp INTEGER NOT NULL)");
        }
    }
}
