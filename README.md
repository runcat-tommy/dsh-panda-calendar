# dsh-panda-calendar

DeepSeek Harness Web 的**免 token 日历与天气插件**：在会话页头新增「熊猫日历」标签页（与「对话」「轨迹」「诗词」同级，排在诗词之后），一站式提供 **公历 / 农历 / 干支 / 生肖 / 节气 / 节日 / 中国法定节假日（含调休）/ 多城市天气**。

<p align="center"><img src="https://raw.githubusercontent.com/runcat-tommy/dsh-panda-calendar/main/assets/preview-zh.jpg" alt="熊猫日历 界面预览" width="85%"></p>

- 农历引擎：内置 1900–2100 离线算法数据表（由 [lunar-javascript](https://github.com/6tail/lunar-javascript)（6tail，MIT）生成并逐日校验），**断网也可用**，无需任何 API Key
- 法定节假日：免费公共数据源 [holiday-cn](https://github.com/imldres/holiday-cn)（MIT，依据国务院公告），带 **2025 / 2026 内置快照**与规则兜底
- 天气 / 定位：Open-Meteo（实时 + 3 天预报）、BigDataCloud 逆地理编码、ip-api.com 兜底——全部免费、无需注册、无 API Key
- 纯前端实现（无后端）；收藏与状态均本地保存
- 要求：`dsh web` 支持 client-plugin 的版本（与 dsh-chinese-poetry 同机制）

English: [README.en.md](README.en.md)

## 功能

- **今日信息卡**：本地公历日期 / 周几 → 农历（**北京时间口径**）· 干支年/月/日 · 生肖 → 节气 → 节日 chips（中文为主、英文附注）→ 🇨🇳 法定状态（放假 / 调休上班，含「假期第 N/M 天」）→ **✍ 发送到对话**（把该日摘要写入输入框，回车即可让 AI 接着聊）
- **月历网格**：6×7 月历，格内 公历日 + 农历 / 节气 / 节日小字；🔴「休」/ 灰「班」法定徽标；今日描边；点击任意一天在今日卡查看详情（含跨月翻跳）
- **城市天气**：定位链（浏览器 → ip-api → 默认城市）+ 手动搜索添加城市（Open-Meteo Geocoding，`language=zh`，带国家消歧）、城市切换 / 删除、实时 + 3 天、刷新；**城市列表与当前城市持久化在 localStorage**，插件更新 / 重装后你添加的城市依然保留
- **法定节假日**：红色「休」= 放假，灰色「班」= 调休上班；年份未公布 / 断网自动回退内置快照与节日规则，并注明数据来源
- **界面双语**：zh / en 随 dsh UI 语言切换

## 安装

### 方式一：npm 包（发布后可用）

```sh
dsh plugin --profile web add dsh-panda-calendar
```

### 方式二：本地源码安装（开发 / 调试）

```sh
cd dsh-panda-calendar
dsh plugin --profile web add .
```

开发调试建议用活链接，改动源码即时生效（仍需重启 Web UI）：

```sh
dsh plugin --profile web add link:.
```

安装完成后**重启 `dsh web`**，打开任意会话，页头标签栏会出现 **「熊猫日历」** 标签。

> 没有 pnpm 时先安装：`npm i -g pnpm`（`dsh plugin` 依赖 pnpm）。

## 使用

1. 打开一个会话，点击页头 **「熊猫日历」** 标签。
2. 今日卡默认显示今天：农历、干支、生肖、节气、节日、法定状态一目了然。
3. 点 **✍ 发送到对话**，该日摘要写入输入框（**不自动发送**），切回对话视图按回车即可让 AI 解读 / 安排。
4. 月历支持翻月 / 「今天」/ 点选日期查看任意一天；天气卡可搜索添加任意城市、点击城市切换。

## 数据基座与致谢

| 数据 | 来源 | 许可 |
| --- | --- | --- |
| 农历 / 干支 / 生肖 / 节气（1900–2100 内置数据表） | [6tail/lunar-javascript](https://github.com/6tail/lunar-javascript) | MIT |
| 中国法定节假日（年度 JSON，国务院公告口径） | [imldres/holiday-cn](https://github.com/imldres/holiday-cn) | MIT |
| 天气（当前 + 每日 3 天） | [Open-Meteo](https://open-meteo.com/) | CC-BY 4.0（数据）、免费 API |
| 逆地理编码（经纬度 → 城市名） | [BigDataCloud reverse-geocode-client](https://www.bigdatacloud.com/docs/api/free-reverse-geocode-to-city-api) | 免费、无 Key |
| IP 定位兜底 | [ip-api.com](https://ip-api.com/) | 免费、无 Key（非商用） |

## 更新法定节假日数据（给插件使用者 / 维护者）

插件内置了已公布的法定节假日数据（离线也能显示休/班）。**每年国务院发布新一年的放假安排后**，可以运行一条命令把最新安排更新进插件：

```sh
node tools/gen-holiday-snapshot.mjs
```

这条命令会拉取最新安排、写入内置数据并自动更新测试夹具；跑完后**请重启 `dsh web`**（Ctrl+C → 重新 `dsh web`）才会生效。

> 💡 插件页面里也会出现同样的白话提示（含「复制命令」按钮）——当内置数据还不包含**明年**时，页面底部会提醒你。按一下复制、去终端运行、重启即可，无需手动记命令。

## 开发

```sh
npm test          # node --test（eval 客户端包 + stub react/fetch，零网络、确定性）
```

单测覆盖：历法引擎（911 组逐日 fixtures + 闰月 / 春节换年 / 节气口径 / 双向换算 / 越界）、节日规则（含复活节与农历年边界）、法定数据规整与徽标、天气解析与城市搜索、视图模型（月历网格 / 今日卡 / 发送文本）与注册冒烟。

目录结构：

```
dsh-panda-calendar/
├── package.json          # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml      # profile 层 bundle patch
├── LICENSE               # MIT
├── lib/
│   ├── index.js          # node 半部（无操作 host）
│   └── client.js         # 浏览器半部：ModuleLoader bundle（单文件、免构建）
├── tools/                # 引擎数据表 / 法定快照生成脚本（可复现）
├── test/                 # node --test 套件
└── docs/                 # 可行性 / 问卷 / 方案设计（含实施备忘）
```

## 功能路线图

- [x] M0：插件骨架 + 「熊猫日历」标签页注册（order 30，排在诗词之后）
- [x] M1：CalendarCore（农历 / 干支 / 生肖 / 节气，1900–2100 逐日校验）+ 节日规则
- [x] M2：法定节假日层（holiday-cn 主链路 + 2025/2026 内置快照 + 规则兜底）；天气层（Open-Meteo + 城市管理）
- [x] M3：视图——今日卡 + 月历（休 / 班徽标、节气、节日）+ 城市天气；点选日期详情
- [x] M4：定位链（浏览器 → ip-api → 默认城市）＋ 天气按城市列表自动刷新
- [x] M5：发送到对话（setDraft + 切对话视图）、README 中英、CHANGELOG、npm 发布准备

## 变更记录

见 [CHANGELOG.md](CHANGELOG.md)。
