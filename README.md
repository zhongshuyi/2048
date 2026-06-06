<div align="center">

# 2048

**经典数字游戏 + 实时双人对战**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/) [![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/) [![WebSocket](https://img.shields.io/badge/WebSocket-real--time-010101?style=flat-square&logo=socket.io&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) [![PixiJS](https://img.shields.io/badge/PixiJS-v7-ea1e63?style=flat-square)](https://pixijs.com/) [![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=black)](https://v2.tauri.app/) [![Redis](https://img.shields.io/badge/Redis-可选-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/) [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)

</div>

---

## 功能

<table>
<tr>
<td width="50%">

### 单人模式
- 经典 2048，支持 **4×4 / 5×5 / 6×6** 网格自由切换
- **Ctrl+Z** 撤销操作
- 最佳分数 localStorage 持久化

### 对战模式
- **创建房间** — 自选计时赛 / 竞速赛 + 网格大小，生成 6 位房间码
- **快速匹配** — 按 `模式 + 时间 + 网格` 自动配对在线玩家
- **加入房间** — 输入房间码加入对局

</td>
<td width="50%">

### 赛制
- **计时赛** — 1 / 3 / 5 分钟限时，倒计时结束比分定胜负
- **竞速赛** — 先合成 2048 者立即获胜，对手棋盘满则判负

### 体验
- 对手 **110px 迷你棋盘**与分数实时显示
- 双方点击"再来一局"自动重开，无需重新创房
- **Tauri v2** 桌面应用，Windows 原生 exe（WebView2）

</td>
</tr>
</table>

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/<user>/2048.git && cd 2048

# 2. 安装依赖（Python ≥3.11）
cd backend && pip install -r requirements.txt

# 3. 启动服务（单端口提供前端 + WebSocket）
python server.py
```

浏览器打开 **http://localhost:8081**，打开两个窗口即可测试对战。

## 技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                        浏览器客户端                           │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  │
│  │  Input   │  │  App     │  │  Engine   │  │  Renderer  │  │
│  │ 键盘/触摸 │──▶ 控制器   │──▶ 纯逻辑   │──▶ PixiJS     │  │
│  │ 归一化    │  │ 状态锁   │  │ 不可变   │  │ Canvas动画  │  │
│  └──────────┘  └──────────┘  └───────────┘  └────────────┘  │
│                                      │                       │
│                              BattleClient (WebSocket)        │
└──────────────────────────────────────┼───────────────────────┘
                                       │
                         ws://host:8081/ws/play
                                       │
┌──────────────────────────────────────┼───────────────────────┐
│                              服务端 (FastAPI)                 │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐   │
│  │  REST API    │  │  RoomManager    │  │   Engine      │   │
│  │  /api/rooms  │  │  房间/匹配/再来  │  │  校验&创建    │   │
│  └──────────────┘  └─────────────────┘  └───────────────┘   │
│                            │                                 │
│                  ┌─────────┴──────────┐                      │
│                  │  In-Memory (默认)   │  Redis (多 worker)  │
│                  └────────────────────┴──────────────────────│
└─────────────────────────────────────────────────────────────┘
```

| 层级 | 技术栈 |
|---|---|
| 渲染引擎 | [![PixiJS](https://img.shields.io/badge/PixiJS-v7.4.2-ea1e63?style=flat-square)](https://pixijs.com/) Canvas2D legacy，自定义 cubic-bezier tween 系统 |
| 前端逻辑 | 原生 JavaScript (IIFE)，零依赖（除 PixiJS） |
| 后端 | [![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square)](https://fastapi.tiangolo.com/) + WebSocket + REST，单端口一体化服务 |
| 配置 | TOML + 环境变量覆盖，`config.toml` / `config.prod.toml` |
| 扩展 | [![Redis](https://img.shields.io/badge/Redis-可选-DC382D?style=flat-square)](https://redis.io/) Pub/Sub + Hash，支持多 worker 横向扩展 |
| 桌面 | [![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square)](https://v2.tauri.app/) Rust + WebView2，javascript-obfuscator 代码混淆 |

### 对战协议

客户端权威模型 — 服务端信任客户端计算结果，仅做转发与仲裁。

| 客户端 → 服务端 | 用途 | 服务端 → 客户端 | 用途 |
|---|---|---|---|
| `create_room` | 创建房间，获取 6 位房间码 | `waiting` | 排队中 / 房间创建成功 |
| `join_room` | 凭房间码加入 | `start` | 游戏开始（双方棋盘 + 对手昵称） |
| `join_match` | 进入快速匹配队列 | `opponent_move` | 对手移动（数值网格 + 分数） |
| `move` | 发送本地计算后的棋盘状态 | `opponent_dead` | 对手棋盘无合法移动 |
| `rematch` | 请求再来一局（双方同意则重开） | `game_over` | 游戏结束（胜负 + 原因 + 比分） |
| `cancel` | 取消匹配 / 离开房间 | `error` | 服务端错误信息 |

### 动画系统

基于 PixiJS ticker 的 Promise-based tween 引擎。自定义 **128 采样点 cubic-bezier 查找表**精确复现 CSS `ease-out` / `ease` 曲线：

| 阶段 | 时长 | 缓动 | 效果 |
|---|---|---|---|
| 滑动 | 80ms | ease-out | 方块移动到目标位置 |
| 合并弹跳 | 120ms | ease | 容器 1→1.15→1 + 文字 0→1 |
| 新方块出现 | 120ms | ease | 渐入缩放 |

可通过 CSS 变量 `--move-ms` / `--pop-ms` / `--appear-ms` 覆盖动画时长。

### 状态管理

`Engine2048.move()` 深拷贝状态后计算，返回 `{state, moved, scoreGained, reached2048, gameOver, events}`。`events` 为增量描述：`{moves, merges, spawns, removes}` — 渲染层据此驱动动画，不触碰 DOM。

### 输入锁

动画播放期间 `app.locked = true`，新按键存入单深度队列 `pendingDirection`。动画结束回调释放锁并消费队列中的下一次输入，保证快节奏操作不丢帧。

## 配置

`backend/config.toml` 为默认值，环境变量同名覆盖。生产环境部署使用 `backend/config.prod.toml`。

```toml
[server]
host = "0.0.0.0"
port = 8081
static_dir = "../frontend"     # 前端静态文件目录
max_games = 0                  # 最大并发游戏数，0 = 无限制
cleanup_interval = 300         # 已结束游戏清理间隔（秒）

[redis]
enabled = false                # true = 启用 Redis 多 worker 横向扩展
url = "redis://localhost:6379"

[logging]
level = "info"
```

```bash
# 环境变量覆盖示例
PORT=9000 MAX_GAMES=100 REDIS_ENABLED=true python server.py
```

## 项目结构

```
2048/
├── frontend/                      # 前端 — 纯静态文件
│   ├── index.html                 # 入口，Rubik 字体 + CSS + 6 JS
│   ├── assets/main.css            # 全局样式、CSS 变量、响应式
│   ├── js/
│   │   ├── game-engine.js         # 纯逻辑引擎，不可变状态
│   │   ├── ui-renderer.js         # PixiJS 渲染 + 动画系统
│   │   ├── app.js                 # 主控：模式切换、状态锁、撤销
│   │   ├── input.js               # 键盘 / 触摸滑动 / 鼠标拖拽
│   │   ├── storage.js             # localStorage 持久化
│   │   └── battle-client.js       # WebSocket 对战客户端
│   └── vendor/pixi.min.js         # PixiJS v7.4.2 legacy (Canvas2D)
│
├── backend/                       # 后端 — Python FastAPI
│   ├── server.py                  # 入口：WebSocket + REST + SPA 静态服务
│   ├── config.py                  # TOML + env 配置加载
│   ├── config.toml                # 默认配置
│   ├── config.prod.toml           # 生产环境配置（高并发 + Redis）
│   ├── requirements.txt
│   └── game/
│       ├── engine.py              # Python 版引擎（与 JS 版逻辑一致）
│       ├── room_manager.py        # 内存版房间/匹配管理
│       └── room_manager_redis.py  # Redis 版（Pub/Sub 横向扩展）
│
└── desktop/                       # 桌面端 — Tauri v2
    ├── package.json
    ├── scripts/
    │   ├── build-dist.mjs         # 前端资源复制 + JS 混淆
    │   └── gen-icons.mjs          # favicon → PNG/ICO 多尺寸图标
    └── src-tauri/                 # Rust 源码 + 图标资源
```

## 桌面构建

```bash
cd desktop
npm install
npm run build:dist       # 前端 → desktop/dist，obfuscator 混淆
npx tauri build          # Tauri 打包 → NSIS installer (.exe)
```

输出目录：`desktop/src-tauri/target/release/bundle/nsis/`

## 许可证

[MIT](./LICENSE)
