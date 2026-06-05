# 2048 对战版

经典 2048 游戏 + 实时双人对战。

## 功能

- **单人模式** — 经典 2048，支持 4×4 / 5×5 / 6×6 网格
- **创建房间** — 选择计时赛/竞速赛，生成房间码分享给朋友
- **快速匹配** — 自动配对在线玩家
- **加入房间** — 输入 6 位房间码加入对局
- **计时赛** — 1/3/5 分钟限时，时间到比分定胜负
- **竞速赛** — 先合成 2048 者立即获胜
- **实时同步** — 对手棋盘缩略图 + 分数实时更新

## 快速开始

```bash
# 1. 安装后端依赖
pip install fastapi uvicorn websockets

# 2. 启动后端 (端口 8081)
python -m uvicorn server:app --host 0.0.0.0 --port 8081

# 3. 启动前端 (端口 8080)
python -m http.server 8080

# 4. 浏览器打开
# http://localhost:8080
```

打开两个浏览器窗口即可对战。

## 技术栈

- **前端** — PixiJS v7 (Canvas 渲染)、原生 JS
- **后端** — Python FastAPI + WebSocket
- **状态同步** — 客户端本地计算 + 节流推送、服务端转发

## 项目结构

```
index.html          # 入口页面
js/
  game-engine.js    # 游戏引擎（纯逻辑）
  ui-renderer.js    # PixiJS 渲染 + 动画
  app.js            # 主控制器
  input.js          # 键盘/触摸/拖拽输入
  storage.js        # localStorage 持久化
  battle-client.js  # WebSocket 对战客户端
game/
  engine.py         # Python 版游戏引擎
  room_manager.py   # 房间/匹配状态管理
server.py           # FastAPI 服务端
assets/
  main.css          # 样式
  favicon.svg       # 图标
```

## 许可

MIT
