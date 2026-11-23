package com.gouye.app.sync;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.gouye.app.usage.UsageStore;
import com.gouye.app.usage.UsageTimeline.Session;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

/** Manual upload of saved, ungrouped app-use sessions. */
public final class GouyeSync {
    private static final String KEY_ALIAS = "gouye-user-session-v1";
    private static final Object LOCK = new Object();
    private static final DateTimeFormatter TIME = DateTimeFormatter
            .ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSSXXX", Locale.ROOT).withZone(UsageStore.REPORT_ZONE);

    private final Context context;
    private final SharedPreferences account;
    private final SharedPreferences progress;

    public GouyeSync(Context context) {
        this.context = context.getApplicationContext();
        account = this.context.getSharedPreferences("gouye_account", Context.MODE_PRIVATE);
        progress = this.context.getSharedPreferences("gouye_sync_progress", Context.MODE_PRIVATE);
    }

    public boolean isSignedIn() {
        return account.contains("token") && account.getInt("user_id", 0) > 0;
    }

    public String server() {
        return account.getString("server", "");
    }

    public String serverForSignIn() {
        String savedServer = server();
        if (!savedServer.isEmpty()) return savedServer;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                context.getAssets().open("sync-server.txt"), StandardCharsets.UTF_8))) {
            String configuredServer = reader.readLine();
            return configuredServer == null ? "" : configuredServer.trim();
        } catch (IOException missing) {
            return "";
        }
    }

    public String username() {
        return account.getString("username", "");
    }

    public long lastSync() {
        int user = account.getInt("user_id", 0);
        return user == 0 ? 0 : progress.getLong("last/" + channelKey(server(), user), 0);
    }

    public void signIn(String address, String username, String password) throws IOException {
        synchronized (LOCK) {
            String base = serverBase(address);
            if (username.trim().isEmpty() || password.isEmpty()) throw new IOException("请填写 GouYe 账号和密码");
            try {
                JSONObject login = new JSONObject().put("username", username.trim()).put("password", password);
                JSONObject data = request(base + "/api/users/login", "POST", login, null);
                JSONObject user = data.getJSONObject("user");
                int userId = user.getInt("user_id");
                String token = data.getString("token");
                if (userId <= 0 || token.isEmpty()) throw new IOException("GouYe 登录响应缺少账号信息");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, key(true));
                byte[] savedToken = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
                boolean saved = account.edit()
                        .putString("server", base)
                        .putString("username", user.getString("username"))
                        .putInt("user_id", userId)
                        .putString("token", Base64.encodeToString(savedToken, Base64.NO_WRAP))
                        .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                        .commit();
                if (!saved) throw new IOException("无法保存 GouYe 的登录状态");
            } catch (JSONException | GeneralSecurityException error) {
                throw new IOException("GouYe 登录状态保存失败", error);
            }
        }
    }

    public void signOut() {
        synchronized (LOCK) {
            clearSession();
        }
    }

    public String uploadSavedDays(UsageStore store) throws IOException {
        synchronized (LOCK) {
            if (!isSignedIn()) throw new IOException("请先登录 GouYe");
            String base = server();
            String token = readToken();
            String channel = channelKey(base, account.getInt("user_id", 0));
            String device = progress.getString("device", null);
            if (device == null) {
                device = UUID.randomUUID().toString();
                save(progress.edit().putString("device", device));
            }
            store.importRecentEvents();
            List<PendingDay> upNext = prepareDays(store.readSavedDays(), channel);
            if (upNext.isEmpty()) return "没有待上传的日期";
            int done = 0;
            for (PendingDay day : upNext) {
                try {
                    JSONObject result = request(base + "/api/app-usage/devices/" + device + "/days/" + day.date,
                            "PUT", day.payload, token);
                    String status = result.optString("status");
                    if ("stale".equals(status)) throw new IOException(day.date + " 的远程版本较新");
                    if ((!status.equals("applied") && !status.equals("duplicate"))
                            || !day.date.equals(result.optString("date"))
                            || day.revision != result.optInt("revision")) {
                        throw new IOException("GouYe 返回的同步确认不匹配");
                    }
                    save(progress.edit().putString(day.key + "/ack", day.digest)
                            .putLong("last/" + channel, System.currentTimeMillis()));
                    done++;
                } catch (IOException error) {
                    if (error instanceof RemoteError && ((RemoteError) error).status == 401) clearSession();
                    throw new IOException("已同步 " + done + " 天，待传 " + (upNext.size() - done)
                            + " 天。 " + error.getMessage(), error);
                }
            }
            return "已同步 " + done + " 天";
        }
    }

    private List<PendingDay> prepareDays(List<UsageStore.Day> days, String channel) throws IOException {
        List<PendingDay> pending = new ArrayList<>();
        Map<String, String> appNames = new HashMap<>();
        for (UsageStore.Day day : days) {
            try {
                JSONArray sessions = new JSONArray();
                for (Session session : day.sessions) {
                    String name = appNames.computeIfAbsent(session.app, this::appName);
                    sessions.put(new JSONObject().put("package_name", session.app).put("app_name", name)
                            .put("started_at", TIME.format(Instant.ofEpochMilli(session.start)))
                            .put("ended_at", TIME.format(Instant.ofEpochMilli(session.end))));
                }
                String digest = hash(sessions.toString());
                String key = channel + "/" + day.date;
                String previous = progress.getString(key + "/candidate", "");
                int revision = progress.getInt(key + "/revision", 0);
                if (!digest.equals(previous)) {
                    // A day can return to a previously acknowledged value after a lost response.
                    // Reserve a new revision whenever its latest candidate changes.
                    revision++;
                    save(progress.edit().putString(key + "/candidate", digest)
                            .putInt(key + "/revision", revision).remove(key + "/ack"));
                }
                if (digest.equals(progress.getString(key + "/ack", ""))) continue;
                JSONObject payload = new JSONObject().put("revision", revision).put("sessions", sessions);
                pending.add(new PendingDay(key, day.date.toString(), digest, revision, payload));
            } catch (JSONException error) {
                throw new IOException("无法组装 " + day.date + " 的同步记录", error);
            }
        }
        return pending;
    }

    private String appName(String packageName) {
        PackageManager packages = context.getPackageManager();
        try {
            ApplicationInfo app = packages.getApplicationInfo(packageName, 0);
            CharSequence label = packages.getApplicationLabel(app);
            if (label != null && label.length() > 0) return label.toString();
        } catch (PackageManager.NameNotFoundException | android.content.res.Resources.NotFoundException missing) {
            // Historical records can refer to a package that is no longer installed.
        }
        return packageName;
    }

    private void clearSession() {
        account.edit().remove("token").remove("iv").commit();
    }

    private String readToken() throws IOException {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            byte[] iv = Base64.decode(account.getString("iv", ""), Base64.NO_WRAP);
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
            byte[] encrypted = Base64.decode(account.getString("token", ""), Base64.NO_WRAP);
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            clearSession();
            throw new IOException("请重新登录 GouYe", error);
        }
    }

    private static SecretKey key(boolean create) throws GeneralSecurityException, IOException {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        SecretKey existing = (SecretKey) store.getKey(KEY_ALIAS, null);
        if (existing != null) return existing;
        if (!create) throw new GeneralSecurityException("登录密钥不存在");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    private static String serverBase(String candidate) throws IOException {
        try {
            URI url = new URI(candidate.trim()).normalize();
            if (!"https".equalsIgnoreCase(url.getScheme()) || url.getHost() == null || url.getRawUserInfo() != null
                    || url.getRawQuery() != null || url.getRawFragment() != null) {
                throw new IOException("请填写 GouYe 的 HTTPS 地址");
            }
            return url.toASCIIString().replaceAll("/+$", "");
        } catch (URISyntaxException invalid) {
            throw new IOException("GouYe 地址格式无效", invalid);
        }
    }

    private static JSONObject request(String url, String method, JSONObject payload, String token) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(url).openConnection();
        try {
            connection.setConnectTimeout(12_000);
            connection.setReadTimeout(25_000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }
            int status = connection.getResponseCode();
            if (status == 401) {
                throw new RemoteError(status, token == null ? "登录失败，请核对账号或密码" : "登录已过期，请重新登录 GouYe");
            }
            if (status != 200 && status != 201) {
                if (status == 409) throw new RemoteError(status, "同一同步版本的数据冲突");
                throw new RemoteError(status, "GouYe 返回 HTTP " + status);
            }
            try (InputStream input = connection.getInputStream()) {
                ByteArrayOutputStream text = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096];
                int count;
                while ((count = input.read(chunk)) != -1) {
                    if (text.size() + count > 65536) throw new IOException("GouYe 返回内容过大");
                    text.write(chunk, 0, count);
                }
                JSONObject result = new JSONObject(new String(text.toByteArray(), StandardCharsets.UTF_8));
                if (result.getInt("code") != 0) throw new IOException("GouYe 未确认本次请求");
                return result.getJSONObject("data");
            } catch (JSONException invalid) {
                throw new IOException("GouYe 返回格式有误", invalid);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static void save(SharedPreferences.Editor changes) throws IOException {
        if (!changes.commit()) throw new IOException("无法保存本次上传进度");
    }

    private static String channelKey(String base, int userId) {
        return hash(base + "/" + userId);
    }

    private static String hash(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder text = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                text.append(Character.forDigit((b & 255) >>> 4, 16));
                text.append(Character.forDigit(b & 15, 16));
            }
            return text.toString();
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException(error);
        }
    }

    private static final class PendingDay {
        final String key;
        final String date;
        final String digest;
        final int revision;
        final JSONObject payload;

        PendingDay(String key, String date, String digest, int revision, JSONObject payload) {
            this.key = key;
            this.date = date;
            this.digest = digest;
            this.revision = revision;
            this.payload = payload;
        }
    }

    private static final class RemoteError extends IOException {
        final int status;

        RemoteError(int status, String message) {
            super(message);
            this.status = status;
        }
    }
}
