package com.gouye.app.usage;

import com.gouye.app.usage.UsageTimeline.Session;

import java.time.LocalDate;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class UsageStatistics {
    public static final long HOUR = 3_600_000L;
    public static final long DAY = 24 * HOUR;

    public enum Period {
        DAY("日", 1), WEEK("周", 7), MONTH("月", 30);

        public final String label;
        public final int days;

        Period(String label, int days) {
            this.label = label;
            this.days = days;
        }

        public LocalDate start(LocalDate lastDate) {
            return lastDate.minusDays(days - 1);
        }

        public LocalDate shift(LocalDate date, int amount) {
            return date.plusDays((long) days * amount);
        }
    }

    static final class Coverage {
        final long start;
        final long end;

        Coverage(long start, long end) {
            this.start = start;
            this.end = end;
        }
    }

    public final Period period;
    public final LocalDate startDate;
    public final long importedThrough;
    public final long[] buckets;
    public final boolean[] recorded;
    public final Map<String, Long> apps;
    public final long total;
    public final int recordedBuckets;
    public final long dailyAverage;
    public final Long difference;

    private UsageStatistics(Period period, LocalDate startDate, long importedThrough,
                            long[] buckets, boolean[] recorded, Map<String, Long> apps, long total,
                            int recordedBuckets, long dailyAverage, Long difference) {
        this.period = period;
        this.startDate = startDate;
        this.importedThrough = importedThrough;
        this.buckets = buckets;
        this.recorded = recorded;
        this.apps = Collections.unmodifiableMap(apps);
        this.total = total;
        this.recordedBuckets = recordedBuckets;
        this.dailyAverage = dailyAverage;
        this.difference = difference;
    }

    static UsageStatistics summarize(Period period, LocalDate startDate, long begin,
                                     long through, long importedThrough, List<Session> sessions,
                                     List<Coverage> coverage, Long previousTotal) {
        long unit = period == Period.DAY ? HOUR : DAY;
        int count = period == Period.DAY ? 24 : period.days;
        long[] buckets = new long[count];
        boolean[] recorded = new boolean[count];
        Map<String, Long> apps = new HashMap<>();
        long total = 0;
        for (Session session : sessions) {
            long start = Math.max(begin, session.start);
            long end = Math.min(through, session.end);
            while (start < end) {
                int index = (int) ((start - begin) / unit);
                long next = Math.min(end, begin + (index + 1) * unit);
                long occupied = next - start;
                buckets[index] += occupied;
                total += occupied;
                apps.merge(session.app, occupied, Long::sum);
                start = next;
            }
        }
        int recordedBuckets = 0;
        for (int i = 0; i < count; i++) {
            long start = begin + i * unit;
            recorded[i] = buckets[i] > 0 || covers(coverage, start, Math.min(start + unit, through));
            if (recorded[i]) recordedBuckets++;
        }
        boolean daily = period == Period.DAY;
        long dailyAverage = daily ? total : total / Math.max(1, recordedBuckets);
        Long difference = null;
        if (previousTotal != null && (daily || recordedBuckets == count) && covers(coverage, begin, through)) {
            difference = daily ? total - previousTotal : dailyAverage - previousTotal / count;
        }
        return new UsageStatistics(period, startDate, importedThrough,
                buckets, recorded, apps, total, recordedBuckets, dailyAverage, difference);
    }

    static boolean covers(List<Coverage> windows, long start, long end) {
        if (end <= start) return false;
        for (Coverage window : windows) {
            if (window.start <= start && window.end >= end) return true;
            if (window.start > start) break;
        }
        return false;
    }
}
