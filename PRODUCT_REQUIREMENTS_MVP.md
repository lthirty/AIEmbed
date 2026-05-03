# 嵌入式自动测试与问题证据管理模块需求规格书（MVP草案）

## 1. 产品定位

本产品不再以“AI分析模块”为主卖点，而是定位为：

**面向嵌入式联调和测试阶段的轻量级自动测试、证据采集和问题沉淀工具。**

核心价值不是“AI帮你调试”，而是：

- 提高自动测试覆盖率
- 降低人工重复测试成本
- 自动采集结构化证据
- 统一管理问题 session
- 沉淀团队 case 资产
- 在此基础上引入 AI 做摘要、归类和推荐

一句话主线：

**测试自动化 + 问题证据闭环 + 团队经验积累**

## 2. 产品目标

MVP阶段核心目标：

1. 能连接 DUT 并稳定采集基础调试信息
2. 能执行基础自动测试用例
3. 能自动形成 PASS / FAIL 结果
4. 能在失败时自动创建问题 session
5. 能把证据、过程和结论结构化保存
6. 能在问题关闭后转成 case

AI 在 MVP 中只承担辅助角色，不作为主链路依赖。

## 3. 典型场景

### 3.1 固件回归测试

场景流程：

1. 工程师选择 DUT 和测试集
2. 系统连接串口
3. 发送串口命令或等待启动日志
4. 读取关键寄存器或 I2C 返回
5. 按规则判断 PASS / FAIL
6. 自动生成测试报告
7. FAIL 时自动生成 session

价值：

- 把“人工看串口”变成“自动执行 + 自动判定”
- 可以持续提升回归覆盖率

### 3.2 驱动 Bring-up

场景流程：

1. 扫描 I2C 地址
2. 读取 Chip ID
3. 读取状态寄存器 / 错误寄存器
4. 对比默认值或规格书预期值
5. 输出初始化检查报告

价值：

- 标准化检查步骤
- 适合 sensor / PMIC / codec / EEPROM 等 bring-up

### 3.3 偶发问题复现

场景流程：

1. 持续采集串口 log
2. 周期性采集关键寄存器
3. 记录时间戳、测试动作、版本信息
4. 异常出现时自动截取前后上下文
5. 生成问题 session

价值：

- 提高偶发问题可回溯性
- 便于后续复盘和根因收敛

### 3.4 团队问题管理

管理视角关注：

- 当前未关闭问题数量
- P0 / P1 问题数量
- 重复问题
- 与特定版本关联的问题
- 问题类型分布：I2C / UART / Power / WiFi / Sensor

价值：

- 从“工具”提升到“团队问题资产管理”

## 4. MVP边界

### 4.1 MVP必须包含

1. Web 页面
2. UART 串口连接与日志采集
3. I2C 只读
4. 自动测试用例
5. 测试报告
6. 问题 session
7. AI log 摘要

### 4.2 MVP明确不做

1. SPI / CAN / JTAG
2. I2C 写操作
3. 板端本地 AI
4. 复杂权限系统
5. 多租户
6. 云端大规模向量检索

## 5. 模块分层

### 5.1 设备连接模块

首版支持：

- UART
- I2C 只读
- GPIO 状态读取，可选
- 电源状态输入，可选

设计原则：

- 默认安全
- 第一版尽量只读
- 禁止误发命令和误写寄存器

### 5.2 自动测试模块

这是 MVP 核心。

能力包括：

- 测试用例定义
- 步骤编排
- 串口命令发送
- 串口关键字匹配
- I2C 寄存器读取
- PASS / FAIL 判定
- 测试报告生成

建议测试用例格式：

```json
{
  "case_id": "I2C_SENSOR_001",
  "name": "Check sensor chip id",
  "target": "sensor_xxx",
  "steps": [
    {
      "type": "i2c_read",
      "addr": "0x68",
      "reg": "0x75",
      "len": 1,
      "expect": "0x71"
    },
    {
      "type": "serial_expect",
      "pattern": "sensor init ok",
      "timeout_ms": 3000
    }
  ],
  "pass_rule": "all_steps_pass"
}
```

建议第一版步骤类型：

- `serial_expect`
- `serial_capture`
- `i2c_scan`
- `i2c_read`
- `delay`
- `assert`

### 5.3 证据采集模块

每次测试或问题 session 自动保存：

- 原始串口 log
- I2C 读数
- 设备版本
- 固件版本
- 测试时间
- 测试人员
- 测试环境
- 失败截图 / 备注
- AI 摘要

原则：

- 结构化保存优先于“保存得多”

### 5.4 问题 Session 管理模块

每次 FAIL 或异常生成 session。

建议字段：

```json
{
  "session_id": "BUG-20260503-001",
  "project": "ESP32-S3 Debug Module",
  "board_version": "EVT1",
  "firmware_version": "v0.1.3",
  "issue_type": "I2C",
  "symptom": "sensor init failed",
  "reproduce_rate": "3/10",
  "severity": "P1",
  "status": "open",
  "evidence": [
    "serial_log_001",
    "i2c_read_001",
    "test_report_001"
  ],
  "analysis": "",
  "root_cause": "",
  "solution": "",
  "owner": ""
}
```

### 5.5 AI辅助分析模块

AI 只做四件事：

1. log 摘要
2. 异常点提取
3. 可能原因排序
4. 推荐下一步验证动作

要求：

- AI 不直接下根因结论
- AI 输出必须结构化
- AI 必须引用已有证据，不得臆造

### 5.6 Case积累模块

关闭问题后把 session 升格为 case。

建议结构：

```json
{
  "case_id": "CASE-I2C-0001",
  "title": "I2C SCL stuck low caused by slave device abnormal state",
  "symptom": "I2C read timeout, SCL line stuck low",
  "environment": {
    "board": "EVT1",
    "firmware": "v0.1.3",
    "i2c_freq": "400kHz"
  },
  "root_cause": "0x50 slave device entered abnormal state and held SCL low",
  "verification": "Disconnect 0x50 device, bus recovery succeeded",
  "solution": "Add bus recovery and reduce I2C speed to 100kHz",
  "tags": ["I2C", "SCL_LOW", "BUS_STUCK", "SENSOR"]
}
```

## 6. 页面信息架构

### 6.1 Dashboard

显示：

- 当前连接设备
- 最近测试结果
- 当前未关闭问题
- 最近失败测试
- 问题分类统计

### 6.2 Device 页面

功能：

- 选择串口
- 设置波特率
- 连接 / 断开
- 实时查看 log
- I2C scan
- I2C read register

### 6.3 Test Case 页面

功能：

- 新建测试用例
- 编辑测试步骤
- 执行测试
- 查看 PASS / FAIL
- 失败后创建 session

### 6.4 Session 页面

功能：

- 查看问题现象
- 查看证据
- 查看 AI 摘要
- 记录分析过程
- 填写根因
- 转成 Case

### 6.5 Case Library 页面

功能：

- 查看历史案例
- 按标签搜索
- 按接口类型搜索
- 按板卡版本搜索
- 按错误类型搜索

## 7. 数据结构建议

建议核心对象：

- `device`
- `test_case`
- `test_run`
- `evidence`
- `session`
- `analysis`
- `case`

建议最小字段如下。

### 7.1 device

```json
{
  "device_id": "DUT-001",
  "project": "Project A",
  "board_version": "EVT1",
  "firmware_version": "v0.1.3",
  "serial_port": "COM3",
  "baud_rate": 115200,
  "notes": ""
}
```

### 7.2 test_case

```json
{
  "case_id": "I2C_SENSOR_001",
  "name": "Check sensor chip id",
  "category": "I2C",
  "target": "sensor_xxx",
  "steps": [],
  "pass_rule": "all_steps_pass",
  "enabled": true
}
```

### 7.3 test_run

```json
{
  "run_id": "RUN-20260504-001",
  "case_id": "I2C_SENSOR_001",
  "device_id": "DUT-001",
  "started_at": "",
  "ended_at": "",
  "result": "fail",
  "fail_step": "step_2",
  "report_path": ""
}
```

### 7.4 evidence

```json
{
  "evidence_id": "EVI-001",
  "session_id": "BUG-20260503-001",
  "kind": "serial_log",
  "title": "boot log",
  "content_text": "",
  "file_path": "",
  "meta": {}
}
```

## 8. 当前仓库与目标架构的映射

当前仓库已经具备的基础：

- 本地 Web 页面
- session 概念
- evidence 存储
- AI 结构化分析
- 串口自动抓取
- 导入信息 / 文档附件

当前仓库还缺的关键能力：

1. `test_case` 数据模型
2. `test_run` 数据模型
3. 自动执行引擎
4. I2C 只读接口与采样记录
5. PASS / FAIL 判定器
6. session 自动创建逻辑
7. case 升格与检索
8. Dashboard 统计

## 9. 当前仓库的下一阶段实施顺序

建议按下面顺序推进，而不是同时做所有东西。

### 阶段1：测试执行基础

1. 新增 `test_case` 表
2. 新增 `test_run` 表
3. 实现串口关键字匹配步骤
4. 实现基础 PASS / FAIL 报告

### 阶段2：I2C 只读采集

1. 新增 I2C 设备连接抽象
2. 实现 `i2c_scan`
3. 实现 `i2c_read`
4. 把读数写入 evidence

### 阶段3：问题闭环

1. FAIL 自动生成 session
2. Session 页面增加分析过程、根因、解决方案字段
3. Session 转 Case

### 阶段4：AI 辅助增强

1. AI log 摘要
2. AI 异常点提取
3. AI 相似 case 推荐

## 10. MVP成功标准

MVP 成功不看“AI是否聪明”，看下面几点：

1. 是否能稳定跑通一条自动测试用例
2. 是否能自动采集串口和 I2C 证据
3. 是否能输出明确的 PASS / FAIL
4. FAIL 后是否能自动生成 session
5. session 是否能沉淀成可复用 case

## 11. 结论

当前产品方向应该明确调整为：

**嵌入式自动测试与问题证据管理模块**

AI 是增强项，不是主卖点。

MVP 的关键不在于“能聊天”，而在于：

- 自动测试是否可执行
- 证据是否可追溯
- 问题是否可沉淀
- 团队是否能复用经验
