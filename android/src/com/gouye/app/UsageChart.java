package com.gouye.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.MotionEvent;
import android.view.View;

import com.gouye.app.usage.UsageStatistics;
import com.gouye.app.usage.UsageStore;

import java.time.LocalDate;
import java.util.function.IntConsumer;

final class UsageChart extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float density;
    private final int green;
    private final int muted;
    private final int line;
    private UsageStatistics data;
    private IntConsumer onSelection;
    private int selected = -1;

    UsageChart(Context context, int green, int muted, int line) {
        super(context);
        this.green = green;
        this.muted = muted;
        this.line = line;
        density = getResources().getDisplayMetrics().density;
        setContentDescription("使用时长柱状图");
    }

    void show(UsageStatistics statistics, IntConsumer onSelection) {
        data = statistics;
        this.onSelection = onSelection;
        selected = -1;
        setClickable(true);
        invalidate();
    }

    private float dp(float n) { return n * density; }
    private float plotLeft() { return dp(4); }
    private float plotRight() { return getWidth() - dp(33); }
    private float plotBottom() { return getHeight() - dp(21); }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (data == null || plotRight() <= plotLeft()) return;
        boolean byHour = data.period == UsageStatistics.Period.DAY;
        long max = 0;
        for (long value : data.buckets) max = Math.max(max, value);
        long step = byHour ? UsageStatistics.HOUR : 4 * UsageStatistics.HOUR;
        long ceiling = Math.max(step, (max + step - 1) / step * step);
        float top = dp(9);
        float bottom = plotBottom();
        float width = plotRight() - plotLeft();
        float height = Math.max(1f, bottom - top);
        float column = width / data.buckets.length;
        boolean showMean = !byHour && data.dailyAverage > 0;
        float meanY = bottom - height * data.dailyAverage / ceiling;
        paint.setTextSize(dp(10));
        for (int lineIndex = 0; lineIndex <= 2; lineIndex++) {
            float y = top + height * lineIndex / 2;
            paint.setColor(line);
            canvas.drawLine(plotLeft(), y, plotRight(), y, paint);
            long value = ceiling * (2 - lineIndex) / 2;
            String caption = value == 0 ? "0" : byHour ? value / 60_000 + "分" : value / UsageStatistics.HOUR + "时";
            if (!showMean || Math.abs(y - meanY) >= dp(12)) {
                drawText(canvas, caption, getWidth(), y + dp(3), Paint.Align.RIGHT);
            }
        }
        float barWidth = Math.min(column * 0.64f, dp(22));
        for (int i = 0; i < data.buckets.length; i++) {
            if (!data.recorded[i]) continue;
            long value = data.buckets[i];
            float middle = plotLeft() + column * (i + 0.5f);
            float barHeight = value == 0 ? dp(1) : Math.max(dp(2), height * value / ceiling);
            paint.setColor(i == selected ? green : value == 0 ? line : 0xff3b745e);
            canvas.drawRoundRect(middle - barWidth / 2, bottom - barHeight, middle + barWidth / 2, bottom,
                    dp(2), dp(2), paint);
        }
        if (showMean) {
            paint.setColor(0xff80ad99);
            paint.setStrokeWidth(dp(1.25f));
            canvas.drawLine(plotLeft(), meanY, plotRight(), meanY, paint);
            paint.setStrokeWidth(0);
            drawText(canvas, "平均", getWidth(), meanY + dp(3), Paint.Align.RIGHT);
        }

        float labelY = getHeight() - dp(5);
        if (byHour) {
            String[] labels = {"0时", "6时", "12时", "18时", "24时"};
            for (int i = 0; i < labels.length; i++) {
                Paint.Align align = i == 0 ? Paint.Align.LEFT : i == 4 ? Paint.Align.RIGHT : Paint.Align.CENTER;
                drawText(canvas, labels[i], plotLeft() + width * i / 4, labelY, align);
            }
        } else if (data.period == UsageStatistics.Period.WEEK) {
            String[] weekdays = {"周一", "周二", "周三", "周四", "周五", "周六", "周日"};
            LocalDate today = LocalDate.now(UsageStore.REPORT_ZONE);
            for (int i = 0; i < data.buckets.length; i++) {
                LocalDate date = data.startDate.plusDays(i);
                String label = date.equals(today) ? "今天" : weekdays[date.getDayOfWeek().getValue() - 1];
                drawText(canvas, label, plotLeft() + column * (i + 0.5f), labelY, Paint.Align.CENTER);
            }
        } else {
            int last = data.buckets.length;
            for (int i = 0; i <= 4; i++) {
                int index = (last - 1) * i / 4;
                LocalDate date = data.startDate.plusDays(index);
                Paint.Align align = i == 0 ? Paint.Align.LEFT : i == 4 ? Paint.Align.RIGHT : Paint.Align.CENTER;
                float x = i == 0 ? plotLeft() : i == 4 ? plotRight() : plotLeft() + column * (index + 0.5f);
                drawText(canvas, date.getMonthValue() + "/" + date.getDayOfMonth(), x, labelY, align);
            }
        }
    }

    private void drawText(Canvas canvas, String value, float x, float y, Paint.Align align) {
        paint.setColor(muted);
        paint.setTextAlign(align);
        canvas.drawText(value, x, y, paint);
    }

    @Override public boolean onTouchEvent(MotionEvent event) {
        if (data == null) return false;
        if (event.getAction() == MotionEvent.ACTION_DOWN) {
            return event.getX() >= plotLeft() && event.getX() <= plotRight();
        }
        if (event.getAction() == MotionEvent.ACTION_UP) {
            float ratio = (event.getX() - plotLeft()) / Math.max(1, plotRight() - plotLeft());
            selected = Math.max(0, Math.min(data.buckets.length - 1, (int) (ratio * data.buckets.length)));
            performClick();
            return true;
        }
        return true;
    }

    @Override public boolean performClick() {
        super.performClick();
        if (data == null) return false;
        if (selected == -1) selected = 0;
        onSelection.accept(selected);
        invalidate();
        return true;
    }
}
