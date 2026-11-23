package com.gouye.app.update;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.net.ssl.HttpsURLConnection;

public final class AppUpdater {
    private static final long MAX_PACKAGE_BYTES = 64L * 1024 * 1024;
    private static final int MAX_MANIFEST_BYTES = 64 * 1024;
    private final Context context;
    private final PackageManager packages;
    private final PackageInfo installed;

    public AppUpdater(Context context) {
        this.context = context.getApplicationContext();
        packages = context.getPackageManager();
        try {
            installed = packages.getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
        } catch (PackageManager.NameNotFoundException missing) {
            throw new IllegalStateException("无法读取当前应用版本", missing);
        }
    }

    public String versionName() {
        return installed.versionName;
    }

    /** Returns the downloaded version, or null when already current. */
    public String checkForUpdate() throws IOException {
        String base = releaseBase();
        JSONObject release;
        HttpsURLConnection connection = open(base + "latest.json");
        try (InputStream input = connection.getInputStream()) {
            release = new JSONObject(readText(input, MAX_MANIFEST_BYTES));
        } catch (JSONException invalid) {
            throw new IOException("更新清单格式有误。", invalid);
        } finally {
            connection.disconnect();
        }
        try {
            if (!installed.packageName.equals(release.getString("applicationId"))) {
                throw new IOException("更新清单的应用不匹配。");
            }
            long version = release.getLong("versionCode");
            if (version <= 0) throw new IOException("更新版本号无效。");
            if (version <= installed.getLongVersionCode()) return null;
            String name = release.getString("versionName");
            if (name.isEmpty() || name.length() > 48) throw new IOException("更新版本名称无效。");
            download(base, release, version);
            return name;
        } catch (JSONException invalid) {
            throw new IOException("更新清单缺少必要信息。", invalid);
        }
    }

    public boolean hasDownloadedUpdate() {
        try {
            return packageMatches(packageFile(), null);
        } catch (RuntimeException invalidArchive) {
            return false;
        }
    }

    public Intent installIntent() throws IOException {
        if (!hasDownloadedUpdate()) throw new IOException("请先下载新版。");
        Uri uri = Uri.parse("content://" + installed.packageName + ".packagefile/update.apk");
        Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, PackageFileProvider.APK_TYPE);
        install.setClipData(ClipData.newRawUri("狗爷更新安装包", uri));
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return install;
    }

    private void download(String base, JSONObject release, long version) throws IOException, JSONException {
        String path = "versions/" + version + "/gouye-v" + version + ".zip";
        if (!path.equals(release.getString("zipPath"))) throw new IOException("更新路径与版本不匹配。");
        File archive = File.createTempFile("update-", ".zip", context.getCacheDir());
        File partial = null;
        try {
            partial = File.createTempFile("update-", ".apk", context.getCacheDir());
            HttpsURLConnection connection = open(base + path);
            try (InputStream input = connection.getInputStream()) {
                copyAndVerify(input, archive, release.getLong("zipBytes"), release.getString("zipSha256"));
            } finally {
                connection.disconnect();
            }
            try (ZipInputStream zip = new ZipInputStream(new FileInputStream(archive))) {
                ZipEntry entry = zip.getNextEntry();
                if (entry == null || entry.isDirectory() || !"app.apk".equals(entry.getName())) {
                    throw new IOException("更新压缩包缺少安装文件。");
                }
                copyAndVerify(zip, partial, release.getLong("apkBytes"), release.getString("apkSha256"));
                if (zip.getNextEntry() != null) throw new IOException("更新压缩包含多余文件。");
            }
            if (!packageMatches(partial, version)) throw new IOException("安装包的签名、版本或应用不匹配。");
            if (!partial.renameTo(packageFile())) throw new IOException("保存更新包失败。");
        } finally {
            archive.delete();
            if (partial != null) partial.delete();
        }
    }

    private static void copyAndVerify(InputStream input, File target, long expectedLength, String expectedHash)
            throws IOException {
        if (expectedLength <= 0 || expectedLength > MAX_PACKAGE_BYTES || !expectedHash.matches("[a-f0-9]{64}")) {
            throw new IOException("安装文件的大小或校验值无效。");
        }
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException(missing);
        }
        DigestInputStream source = new DigestInputStream(input, digest);
        long length = 0;
        try (FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = source.read(buffer)) != -1) {
                length += read;
                if (length > expectedLength) throw new IOException("更新内容超过预期大小。");
                output.write(buffer, 0, read);
            }
        }
        StringBuilder hash = new StringBuilder(64);
        for (byte value : digest.digest()) {
            hash.append(Character.forDigit((value & 255) >>> 4, 16));
            hash.append(Character.forDigit(value & 15, 16));
        }
        if (length != expectedLength || !expectedHash.contentEquals(hash)) {
            throw new IOException("更新包校验失败，请重新检查更新。");
        }
    }

    private boolean packageMatches(File file, Long version) {
        if (!file.isFile()) return false;
        PackageInfo candidate = packages.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
        if (candidate == null || !installed.packageName.equals(candidate.packageName)) return false;
        long code = candidate.getLongVersionCode();
        if (code <= installed.getLongVersionCode() || (version != null && code != version)) return false;
        Signature[] expected = installed.signingInfo.getApkContentsSigners();
        Signature[] actual = candidate.signingInfo == null ? null : candidate.signingInfo.getApkContentsSigners();
        return actual != null && new HashSet<>(Arrays.asList(expected)).equals(new HashSet<>(Arrays.asList(actual)));
    }

    private File packageFile() {
        return new File(context.getCacheDir(), "update.apk");
    }

    private String releaseBase() throws IOException {
        try (InputStream input = context.getAssets().open("release-base.txt")) {
            String base = readText(input, 1024).trim();
            Uri uri = Uri.parse(base);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getEncodedQuery() != null || uri.getEncodedFragment() != null || !base.endsWith("/")) {
                throw new IOException("应用更新地址配置有误。");
            }
            return base;
        } catch (FileNotFoundException missing) {
            throw new IOException("当前应用未配置更新地址。", missing);
        }
    }

    private static String readText(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = input.read(buffer)) != -1) {
            if (bytes.size() + read > limit) throw new IOException("更新配置超过大小限制。");
            bytes.write(buffer, 0, read);
        }
        return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
    }

    private static HttpsURLConnection open(String address) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(address).openConnection();
        try {
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(16000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            int code = connection.getResponseCode();
            if (code == 404 || code == 403) throw new IOException("更新目录暂不可用。");
            if (code != 200) throw new IOException("更新服务返回 HTTP " + code + "。");
            return connection;
        } catch (IOException error) {
            connection.disconnect();
            throw error;
        }
    }
}
