# ESP32 AI辅助嵌入式设备项目交接与调试记录

## 1. 项目目的

本目录用于管理基于 `ESP32` 模块的嵌入式设备开发、烧录、串口监视和后续功能迭代。

当前阶段目标已经完成：

- 建立可用的 `VS Code + PlatformIO` 开发工程
- 成功识别串口设备
- 成功编译并烧录测试固件
- 通过串口日志确认固件已经在目标板运行
- 已实现 Wi-Fi 配网热点和路由器局域网访问

本文件用于后续人员快速接手项目，避免重复踩坑。

## 2. 当前目录结构

当前项目最小可用结构如下：

```text
12.AI辅助嵌入式设备/
|- .gitignore
|- CHANGELOG.md
|- platformio.ini
|- PROJECT_ONBOARDING.md
|- start_ai_viewer.bat
|- viewer_server.py
|- local_data/                  # 本地 SQLite、上传资料、抓拍证据，默认不提交
`- webapp/
   |- logs.html
   |- index.html
   |- app.js
   `- styles.css
`- src/
   `- main.cpp
```

文件说明：

- `platformio.ini`
  PlatformIO 工程配置文件，定义板卡、串口、上传速率、监视速率等
- `CHANGELOG.md`
  项目版本记录，要求每次功能改动都追加记录
- `src/main.cpp`
  当前主固件，提供 ESP32-CAM 网页视频服务
- `viewer_server.py`
  本地调试工作台服务，负责页面托管、会话/证据/分析存储、资料导入、抓拍代理和 AI 自动分析
- `webapp/*`
  本地浏览器页面，围绕会话、资料、日志、人工备注和结构化分析结果工作
- `start_ai_viewer.bat`
  双击快速启动本地页面和代理服务
- `local_data/*`
  本地 SQLite 数据库、客户资料上传文件、抓拍图片证据；默认不提交到 GitHub
- `PROJECT_ONBOARDING.md`
  本交接文档

## 3. 当前硬件信息

本次实际识别到的设备信息：

- 串口号：`COM3`
- USB 转串口芯片：`CH340`
- 芯片型号：`ESP32-D0WDQ6`
- 芯片修订版本：`revision v1.0`
- MAC：`24:6f:28:7b:1f:50`

说明：

- 当前系统环境是 Windows
- 当前接入设备通过 `CH340` 提供 USB 串口
- 后续如果更换 USB 口，`COM` 端口号可能变化

## 4. 开发环境

### 4.1 软件环境

已验证可用的软件环境如下：

- `VS Code`
- `PlatformIO IDE` 扩展
- `PlatformIO Core 6.1.19`

本机 PlatformIO 可执行文件实际位置：

```powershell
C:\Users\lthir\.platformio\penv\Scripts\platformio.exe
```

如果系统环境变量里没有 `pio`，可以直接用完整路径调用。

### 4.2 Python 依赖修复

本次调试中，PlatformIO 初次编译时缺少 `intelhex`，已补齐。

补齐命令：

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pip.exe" install intelhex
```

如果后续再次遇到 `ModuleNotFoundError`，优先检查 PlatformIO 自带 Python 环境，而不是系统 Python。

## 5. PlatformIO 工程配置

当前 `platformio.ini` 内容对应的核心逻辑：

- 板卡：`AI Thinker ESP32-CAM`
- 框架：`Arduino`
- 串口：`COM3`
- 上传速率：`115200`
- 串口监视波特率：`115200`

当前配置适合目标：

- 先打通 `upload + monitor`
- 快速验证硬件、串口和工程链路

不适合的目标：

- 不包含 JTAG 断点调试
- 不包含摄像头功能初始化
- 不包含 Wi-Fi、HTTP、图像采集等业务逻辑

## 6. 当前固件说明

当前 `src/main.cpp` 是 `ESP32-CAM` 网页视频查看固件，作用是：

- 初始化 `AI Thinker ESP32-CAM` 摄像头
- 启动 `WiFiManager` 配网热点和配置页面
- 自动连接用户配置的路由器 Wi-Fi
- 在路由器局域网内提供浏览器可访问的视频查看页面
- 提供视频流和抓拍接口
- 通过串口重复输出设备 IP，便于客户直接抄录访问地址

程序输出内容包括：

- 固件启动标识
- 固件版本号
- 配网热点信息
- 路由器连接结果
- Web 访问地址
- 摄像头初始化失败信息
- 周期性的 IP 信息回显

典型输出示例：

```text
Booting ESP32-CAM web viewer...
Firmware version: v0.5.0
Starting Wi-Fi provisioning flow...
If needed, connect to setup AP: ESP32-CAM-Setup
Setup password: 12345678
Open setup page: http://192.168.4.1/
Wi-Fi connected
========== DEVICE NETWORK INFO ==========
Firmware: v0.5.0
SSID: YourRouterWiFi
IP: 192.168.1.123
Viewer: http://192.168.1.123/
Stream: http://192.168.1.123/stream
Snapshot: http://192.168.1.123/capture
Type 'ip' or 'info' in the serial terminal to print this again.
```

浏览器访问方式：

- 首次使用时，连接热点 `ESP32-CAM-Setup`
- 密码：`12345678`
- 打开 `http://192.168.4.1/`
- 在配网页面中选择并填写路由器 Wi-Fi
- 设备连上路由器后，改用串口打印出的局域网 IP 访问

串口辅助说明：

- 设备连上 Wi-Fi 后会打印完整访问地址
- 在串口终端输入 `ip` 或 `info`，设备会重新打印一次
- 固件还会每 30 秒自动重复输出一次 IP 信息

## 7. 日常使用流程

### 7.1 编译

在当前项目目录执行：

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run
```

### 7.2 烧录

在当前项目目录执行：

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run -t upload
```

### 7.3 打开串口监视

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" device monitor -p COM3 -b 115200
```

### 7.4 在 VS Code 中操作

如果使用 VS Code 图形界面，可直接：

1. 打开本目录
2. 等待 PlatformIO 加载工程
3. 点击 `Build`
4. 点击 `Upload`
5. 点击 `Monitor`

## 8. ESP32-CAM 烧录注意事项

这块板子属于 `ESP32-CAM` 类型，下载模式经常需要手动控制。

### 8.1 进入下载模式

如果上传失败，按下面顺序操作：

1. 将 `GPIO0` 接 `GND`
2. 按一下 `RST`，或者重新上电
3. 执行烧录命令

### 8.2 烧录完成后恢复运行模式

1. 断开 `GPIO0` 和 `GND`
2. 再按一次 `RST` 或重新上电
3. 打开串口监视

如果不把 `GPIO0` 松开，板子可能会一直留在 bootloader/download 模式，导致程序虽然已经烧录成功，但不会进入用户固件正常运行流程。

## 9. Wi-Fi 配网与访问流程

推荐使用流程：

1. 烧录固件
2. 断开 `GPIO0-GND` 并复位
3. 手机或电脑连接热点 `ESP32-CAM-Setup`
4. 密码输入 `12345678`
5. 打开 `http://192.168.4.1/`
6. 在配网页面中选择目标路由器并输入密码
7. 等待设备自动切换到 `STA` 模式连接路由器
8. 查看串口日志中的设备局域网 IP
9. 在同一路由器网络下浏览器访问该 IP

说明：

- 首次配网成功后，Wi-Fi 信息会由 `WiFiManager` 保存
- 以后重启时，设备会优先自动连接已保存的 Wi-Fi
- 只有在连接失败或未保存 Wi-Fi 时，才会再次打开配网热点

如果需要重新配网：

- 访问 `http://设备IP/resetwifi`
- 设备会清空保存的 Wi-Fi 并重启进入配网模式

## 10. 常见问题与处理方法

### 9.1 `pio` 或 `platformio` 命令找不到

现象：

```text
The term 'pio' is not recognized
```

处理：

- 不要假设系统已经配置 PATH
- 直接使用完整路径：

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe"
```

### 9.2 串口被占用

现象：

```text
Could not open COM3
PermissionError(13, '拒绝访问')
```

原因：

- 串口监视器没关
- 其他串口工具占用了 `COM3`
- 上一次 PlatformIO/Python 进程残留

处理：

- 关闭所有串口工具
- 关闭 Arduino IDE / VS Code 串口窗口
- 必要时结束残留进程

可用于排查的 PowerShell：

```powershell
Get-Process | Where-Object {
  $_.ProcessName -match 'platformio|pio|python|putty|ttermpro|SecureCRT|CoolTerm'
} | Select-Object ProcessName, Id, Path
```

### 9.3 无法连接 ESP32

现象：

```text
Failed to connect to ESP32: No serial data received
```

优先检查：

- 板子是否已进入下载模式
- `GPIO0` 是否正确接地
- 是否按过 `RST`
- USB 转串口线接法是否正确
- 供电是否稳定

### 9.4 烧录成功但串口没日志

可能原因：

- `GPIO0` 没松开，板子仍在下载模式
- 波特率不对
- 串口监视器没连到正确端口
- 板子没有复位

处理顺序：

1. 断开 `GPIO0-GND`
2. 按 `RST`
3. 用 `115200` 重新打开 `COM3`

### 9.5 手机连接热点后没有自动弹出配网页面

处理：

- 手动打开 `http://192.168.4.1/`
- 某些手机内嵌浏览器不会稳定处理 Captive Portal 跳转

### 9.6 忘记原来的路由器配置，想重新配网

处理：

- 访问 `http://设备IP/resetwifi`
- 或在代码里后续增加物理按键清网逻辑

### 9.7 启动时前面有乱码

这是正常现象之一。ESP32 上电启动 ROM 日志和用户程序串口初始化之间可能出现短暂乱码。只要后续用户日志正常，比如 `alive: ...`，就说明程序已正常运行。

## 11. 本地 Web 调试工作台

本项目新增一个运行在电脑本地的调试工作台。

作用：

- 创建客户调试会话
- 导入客户资料
- 粘贴串口日志
- 记录人工备注
- 可选从 ESP32-CAM 抓拍一张证据图
- 让 AI 基于资料、日志、备注和抓拍证据做结构化自动分析
- 保存历史分析结果，便于后续回放和案例沉淀
- 打开独立日志页查看后台请求、抓拍、AI 请求和错误细节

### 11.1 启动方式

启动本地服务：

```powershell
python viewer_server.py
```

打开浏览器：

```text
http://127.0.0.1:8000/
```

### 11.2 使用方式

1. 先填写 AI 提供方名称、`API Base URL`、`API Key`、`Model`
2. 点击“保存 AI 设置”
3. 创建一个新会话，填写会话标题、客户名称、设备 IP
4. 导入客户资料
5. 粘贴串口日志
6. 填写人工备注
7. 如有需要，抓拍一张设备当前画面作为辅助证据
8. 点击“开始分析”
9. 页面会显示 AI 分析关键步骤和结构化 JSON 结果
10. 历史分析会按时间留存在当前会话下面

### 11.3 设计限制

- 当前主分析链路以文本资料、日志和人工备注为主，抓拍图片只是辅助证据
- 当前客户资料的自动文本抽取重点支持 `txt/md/log/json/csv/yaml/pdf`
- 抓拍失败不会影响资料导入和日志分析，但会影响“带抓拍补充证据”的那一轮分析
- AI 配置保存在本地 `ai_provider_config.json`
- 会话、证据和分析历史保存在本地 `local_data/assistant.db`
- 上传文件和抓拍图片保存在 `local_data/uploads/`
- 可直接双击 `start_ai_viewer.bat` 启动本地页面和代理服务
- 日志页地址：`http://127.0.0.1:8000/logs.html`

当前默认预设：

- 提供方：`MiniMax Token Plan`
- API Base URL：`https://api.minimaxi.com/v1/chat/completions`
- Model：`MiniMax-M2.7`

说明：

- MiniMax 当前在本项目里主要承担文本型结构化分析
- 页面保存 AI 设置后会自动做一次文本接口连通性验证
- 如果未保存 API Key，页面会弹窗提醒
- 工作流日志会区分会话读取、抓拍补证、AI 请求和 JSON 解析几个阶段
- 当前结构化分析已经实测可基于日志和人工备注输出 `phenomenon_summary / possible_causes / validation_steps / missing_information`

## 12. 本次实际调试记录

以下记录对应本次接手调试过程，便于后续排查历史问题。

### 10.1 2026-05-03 初始状态

- 当前目录基本为空，仅有 `.vs`
- 未发现现成 PlatformIO 工程
- PlatformIO IDE 已安装，但 `pio` 未进入系统 PATH

### 10.2 识别环境

确认结果：

- PlatformIO Core 可通过完整路径调用
- 实际设备串口为 `COM3`
- 设备描述为 `USB-SERIAL CH340`

### 10.3 建立最小工程

已创建：

- `platformio.ini`
- `src/main.cpp`
- `.gitignore`

工程策略：

- 使用 `Arduino` 框架
- 目标先完成 `upload + monitor`
- 不直接迁移旧 ESP-IDF 摄像头工程

选择原因：

- 先验证板子、串口、烧录链路是否正常
- 避免把“环境问题”和“业务代码问题”混在一起

### 10.4 修复编译环境

首次编译失败原因：

```text
ModuleNotFoundError: No module named 'intelhex'
```

已处理：

- 安装 `intelhex`

结果：

- 编译成功

### 10.5 解决串口占用

上传过程中多次遇到：

```text
PermissionError(13, '拒绝访问')
```

已处理：

- 关闭残留 `platformio/python` 进程

结果：

- 串口恢复可用

### 10.6 成功烧录

最终成功烧录时的关键信息：

```text
Chip is ESP32-D0WDQ6 (revision v1.0)
MAC: 24:6f:28:7b:1f:50
Hash of data verified.
Leaving...
Hard resetting via RTS pin...
```

说明：

- 目标板已被真实识别
- Flash 写入完成并校验通过

### 10.7 串口确认程序已运行

在松开 `GPIO0` 并复位后，成功读取到串口日志：

```text
alive: 16997 ms, loop=15
alive: 17997 ms, loop=16
alive: 18997 ms, loop=17
alive: 19997 ms, loop=18
alive: 20997 ms, loop=19
alive: 21997 ms, loop=20
alive: 22997 ms, loop=21
alive: 23997 ms, loop=22
```

结论：

- 当前测试固件已经在设备上正常运行
- 当前开发链路 `编译 -> 烧录 -> 串口验证` 已打通

### 10.8 Wi-Fi 配网与局域网访问改造

本次改造目标：

- 不再要求电脑长期连接设备热点
- 改为首次通过热点配网
- 后续通过同一路由器下的局域网 IP 访问视频页面

实现方案：

- 参考 `MCSmallDesktopDisplay` 项目，引入 `WiFiManager`
- 开机执行 `autoConnect()`
- 未配置或连接失败时启动热点 `ESP32-CAM-Setup`
- 配网成功后自动切到路由器网络
- 增加 `/resetwifi` 以便重新配网

## 13. 接手人员建议工作顺序

建议不要一上来就接入复杂业务代码，按下面顺序推进：

1. 先用当前测试工程确认自己电脑也能 `upload + monitor`
2. 确认串口号是否仍为 `COM3`
3. 确认自己掌握 `GPIO0 + RST` 的下载模式操作
4. 在当前测试程序基础上增加简单功能
5. 再接入摄像头、Wi-Fi、网络服务等模块

这样做的好处：

- 能快速区分“硬件链路问题”和“业务代码问题”
- 降低多人接手时的排查成本

## 14. 后续建议

后续建议按优先级推进：

### 12.1 短期

- 把测试程序扩展成 `LED / GPIO / Wi-Fi` 自检程序
- 固化一套标准接线图
- 记录实际使用的供电方式

### 12.2 中期

- 接入 `ESP32-CAM` 摄像头初始化代码
- 明确板级引脚定义
- 将串口日志格式统一，便于排查

### 12.3 长期

- 补充正式 `README`
- 引入版本管理规范
- 将烧录命令、接线、日志判定标准流程化

## 15. 版本与 GitHub 同步规范

后续每次修改都执行以下约定：

1. 先修改代码或文档
2. 同步更新 `CHANGELOG.md`
3. 如果涉及固件行为变化，同步更新 `src/main.cpp` 中的版本号和版本历史注释
4. 如果涉及使用方式变化，同步更新本文件
5. 提交到 git
6. 同步推送到 GitHub

建议提交信息格式：

```text
feat: add xxx
fix: resolve xxx
docs: update onboarding and changelog
```

## 16. 快速检查清单

新成员接手时，可按以下顺序快速自检：

- 能打开本目录并识别 PlatformIO 工程
- 能执行 `platformio run`
- 能识别到串口设备
- 能进入下载模式
- 能执行 `upload`
- 能在 `115200` 波特率看到 `alive: ...`

只要这几项全部通过，就说明项目基础开发环境已经可用。
