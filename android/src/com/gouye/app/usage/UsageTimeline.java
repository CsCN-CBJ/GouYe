package com.gouye.app.usage;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Reconstructs the visible foreground intervals from Android usage events. */
public final class UsageTimeline {
    private static final long SAME_APP_GAP_MILLIS = 2_000;
    private static final long HOUR_MILLIS = 60 * 60_000L;
    private static final long MAIN_APP_MILLIS = 5 * 60_000L;
    public static final long SHORT_SESSION_MILLIS = 10_000;
    enum Type {
        RESET, FOREGROUND, BACKGROUND, SCREEN_ON, SCREEN_OFF, LOCKED, UNLOCKED
    }

    static final class Event {
        final long time;
        final Type type;
        final String app;
        final int activity;

        Event(long time, Type type, String app, int activity) {
            this.time = time;
            this.type = type;
            this.app = app;
            this.activity = activity;
        }
    }

    public static final class Session {
        public final String app;
        public final long start;
        public final long end;

        private final int screenPeriod;
        private final long activeMillis;

        private Session(String app, long start, long end, int screenPeriod, long activeMillis) {
            this.app = app;
            this.start = start;
            this.end = end;
            this.screenPeriod = screenPeriod;
            this.activeMillis = activeMillis;
        }

        public long duration() {
            return activeMillis;
        }
    }

    public static List<Session> joinedForDisplay(List<Session> sessions) {
        List<Session> joined = new ArrayList<>();
        for (Session next : sessions) append(joined, next, SAME_APP_GAP_MILLIS);
        return joined;
    }

    public static final class Hour {
        public final long start;
        public final long end;
        public final long total;
        public final long other;
        public final Map<String, Long> mainApps;
        public final List<Session> sessions;

        Hour(long start, long end, long total, long other, Map<String, Long> mainApps, List<Session> sessions) {
            this.start = start;
            this.end = end;
            this.total = total;
            this.other = other;
            this.mainApps = Collections.unmodifiableMap(mainApps);
            this.sessions = Collections.unmodifiableList(sessions);
        }
    }

    /** Summarizes unmerged usage by the hour, including the actual part of a session in each hour. */
    public static List<Hour> hourlySummary(List<Session> sessions, long dayStart, long dayEnd,
                                           long importedThrough, Set<String> desktopPackages) {
        List<Hour> result = new ArrayList<>();
        int cursor = 0;
        long cutoff = Math.min(dayEnd, importedThrough);
        for (long start = dayStart; start < cutoff; start += HOUR_MILLIS) {
            long end = Math.min(dayEnd, start + HOUR_MILLIS);
            long recordedEnd = Math.min(end, cutoff);
            List<Session> inside = new ArrayList<>();
            while (cursor < sessions.size()) {
                Session session = sessions.get(cursor);
                if (session.start >= recordedEnd) break;
                long from = Math.max(start, session.start);
                long to = Math.min(recordedEnd, session.end);
                if (to > from) inside.add(new Session(session.app, from, to, session.screenPeriod, to - from));
                if (session.end > recordedEnd) break;
                cursor++;
            }
            if (inside.isEmpty() && !result.isEmpty() && result.get(result.size() - 1).total == 0) {
                int previous = result.size() - 1;
                result.set(previous, new Hour(result.get(previous).start, recordedEnd,
                        0, 0, Collections.emptyMap(), Collections.emptyList()));
            } else {
                result.add(summarizeHour(start, inside.isEmpty() ? recordedEnd : end, inside, desktopPackages));
            }
        }
        return result;
    }

    private static Hour summarizeHour(long start, long end, List<Session> sessions, Set<String> desktopPackages) {
        Map<String, Long> totals = new HashMap<>();
        long total = 0;
        for (Session session : sessions) {
            totals.merge(session.app, session.duration(), Long::sum);
            total += session.duration();
        }
        List<Map.Entry<String, Long>> ranked = new ArrayList<>(totals.entrySet());
        ranked.sort((left, right) -> {
            int order = Long.compare(right.getValue(), left.getValue());
            return order != 0 ? order : left.getKey().compareTo(right.getKey());
        });
        Map<String, Long> main = new LinkedHashMap<>();
        long other = total;
        for (Map.Entry<String, Long> app : ranked) {
            if (app.getValue() < MAIN_APP_MILLIS) break;
            if (!desktopPackages.contains(app.getKey())) {
                main.put(app.getKey(), app.getValue());
                other -= app.getValue();
            }
        }
        return new Hour(start, end, total, other, main, sessions);
    }

    static List<Session> sessions(Iterable<Event> events, long from, long until) {
        List<Session> result = new ArrayList<>();
        if (until <= from) return result;
        String foreground = "";
        int activity = 0;
        boolean screenOn = true;
        boolean locked = false;
        int screenPeriod = 0;
        long cursor = from;
        for (Event event : events) {
            if (event.time >= until) break;
            add(result, foreground, screenOn && !locked, cursor, event.time, screenPeriod);
            cursor = Math.max(cursor, event.time);
            switch (event.type) {
                case RESET:
                    screenPeriod++;
                    foreground = "";
                    screenOn = true;
                    locked = false;
                    break;
                case FOREGROUND:
                    foreground = event.app;
                    activity = event.activity;
                    break;
                case BACKGROUND:
                    if (foreground.equals(event.app)
                            && (activity == 0 || event.activity == 0 || activity == event.activity)) {
                        foreground = "";
                    }
                    break;
                case SCREEN_OFF:
                    screenPeriod++;
                    screenOn = false;
                    break;
                case SCREEN_ON: screenOn = true; break;
                case LOCKED:
                    screenPeriod++;
                    locked = true;
                    break;
                case UNLOCKED: locked = false; break;
            }
        }
        add(result, foreground, screenOn && !locked, cursor, until, screenPeriod);
        return result;
    }

    private static void add(List<Session> sessions, String app, boolean active, long from, long until, int screenPeriod) {
        if (!active || app.isEmpty() || until <= from) return;
        append(sessions, new Session(app, from, until, screenPeriod, until - from), 0);
    }

    private static void append(List<Session> sessions, Session next, long maxGap) {
        int lastIndex = sessions.size() - 1;
        if (lastIndex >= 0) {
            Session last = sessions.get(lastIndex);
            long gap = next.start - last.end;
            if (gap >= 0 && gap <= maxGap && last.screenPeriod == next.screenPeriod && last.app.equals(next.app)) {
                sessions.set(lastIndex,
                        new Session(last.app, last.start, next.end, last.screenPeriod, last.duration() + next.duration()));
                return;
            }
        }
        sessions.add(next);
    }
}
