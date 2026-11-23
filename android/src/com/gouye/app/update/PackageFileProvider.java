package com.gouye.app.update;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public final class PackageFileProvider extends ContentProvider {
    public static final String APK_TYPE = "application/vnd.android.package-archive";

    @Override public boolean onCreate() { return true; }

    private File packageFile(Uri uri) {
        if (!"/update.apk".equals(uri.getPath())) throw new IllegalArgumentException("未知文件");
        return new File(getContext().getCacheDir(), "update.apk");
    }

    @Override public String getType(Uri uri) { packageFile(uri); return APK_TYPE; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("仅允许读取");
        return ParcelFileDescriptor.open(packageFile(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sorted) {
        File file = packageFile(uri);
        String[] columns = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor result = new MatrixCursor(columns);
        MatrixCursor.RowBuilder row = result.newRow();
        for (String column : columns) {
            if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add("update.apk");
            else if (OpenableColumns.SIZE.equals(column)) row.add(file.length());
            else row.add(null);
        }
        return result;
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
