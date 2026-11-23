# 狗爷安卓应用

安卓应用记录手机上的应用使用时长，支持按日、周、月查看统计。登录 GouYe 后，可以在设置中手动上传记录。

## 构建

安装 Python 3、Java 17 或更新版本、Android SDK Platform 35 和构建工具。设置 `ANDROID_HOME`，让 `javac` 在命令路径中可用，或设置 `JAVA_HOME`。

正式版构建使用原签名文件。将 `gouye-release/gouye.p12` 和 `gouye-release/password` 放在本地私有目录，通过 `GOUYE_ANDROID_SIGNING_DIR` 指定该目录，也可以沿用默认的 `android/.signing/`。构建会核对签名证书指纹。

从仓库根目录执行：

```bash
GOUYE_ANDROID_SIGNING_DIR=/path/to/private/signing python3 android/build.py
```

安装包和更新清单位于 `android/构建产物/`。

## 本地配置

在 `android/assets/` 下按需新建以下文件，每个文件写一行地址。

- `sync-server.txt` 填默认同步服务器的 HTTPS 地址。也可以在应用的登录界面直接填写。
- `release-base.txt` 填公开更新目录的 HTTPS 地址，以 `/` 结尾。构建好的应用从这里读取 `latest.json`。

签名资料、地址配置和构建产物由发布机器保存。发布时先上传带版本号的压缩包，验证可下载后再上传 `latest.json`。
