package com.gouye.app.usage;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.util.Log;

import java.util.concurrent.TimeUnit;

/** Periodic device-only import; no continuously running service or notification. */
public final class UsageBackupJob extends JobService {
    private static final int JOB = 11221;
    private JobParameters active;

    public static boolean configure(Context context, boolean enabled) {
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        if (jobs == null) return false;
        if (!enabled || !UsageStore.hasAccess(context)) {
            jobs.cancel(JOB);
            return false;
        }
        if (jobs.getPendingJob(JOB) != null) return true;
        JobInfo work = new JobInfo.Builder(JOB, new ComponentName(context, UsageBackupJob.class))
                .setPeriodic(TimeUnit.HOURS.toMillis(2))
                .setPersisted(true)
                .build();
        return jobs.schedule(work) == JobScheduler.RESULT_SUCCESS;
    }

    @Override public boolean onStartJob(JobParameters params) {
        if (!UsageStore.hasAccess(this)) return false;
        active = params;
        new Thread(() -> {
            try {
                new UsageStore(this).importRecentEvents();
            } catch (RuntimeException error) {
                Log.w("UsageBackupJob", "这次补存未完成", error);
            } finally {
                new android.os.Handler(getMainLooper()).post(() -> {
                    if (active == params) {
                        active = null;
                        jobFinished(params, false);
                    }
                });
            }
        }, "usage-backfill").start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        active = null;
        return false;
    }
}
