# 贡献指南

欢迎贡献代码、报告问题或建议新功能。

## 快速上手

```bash
git clone git@github.com:zhongshuyi/2048.git
cd 2048/backend
pip install -r requirements.txt
python server.py   # → http://localhost:8081
```

前端为纯静态文件，修改 `frontend/` 目录后刷新浏览器即可生效。

## 项目结构

```
frontend/js/        # 前端 JS（game-engine, renderer, app, input, storage, battle-client）
backend/            # Python FastAPI + WebSocket 后端
desktop/            # Tauri v2 桌面应用
```

### 前端架构

- `game-engine.js` — 纯逻辑引擎，不可变状态，不依赖 DOM
- `ui-renderer.js` — PixiJS Canvas 渲染 + tween 动画系统
- `app.js` — 主控制器，模式切换、状态锁
- `input.js` — 键盘/触摸/鼠标归一化
- `battle-client.js` — WebSocket 对战客户端

### 后端架构

- `server.py` — FastAPI 入口，WebSocket + REST + SPA 静态服务
- `game/engine.py` — Python 版引擎（与 JS 引擎逻辑一致）
- `game/room_manager.py` — 房间/匹配管理（内存版）
- `game/room_manager_redis.py` — Redis 版（多 worker 扩展）

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式
refactor: 重构
chore: 构建/工具
```

## Pull Request 流程

1. 从 `main` 分支创建 feature/ 或 fix/ 分支
2. 保持变更聚焦，一个 PR 解决一个问题
3. 前后端逻辑需同步时，在 PR 描述中说明
4. 确保描述清楚动机而非仅罗列改动

## 联系方式

- [GitHub Issues](https://github.com/zhongshuyi/2048/issues)
