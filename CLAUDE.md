# CLAUDE.md

AI 开发助手上下文文件。包含运维速查和协作规范。

## 技术栈速查

| 组件 | 版本/说明 |
|------|----------|
| Node.js | 22.x |
| TypeScript | ESM, strict mode |
| Express | Web 框架 |
| Prisma | ORM |
| MySQL | 数据库（utf8mb4） |
| JWT | jsonwebtoken |
| 前端 | 原生 HTML/CSS/JS |
| 运行时 | tsx（esbuild-based） |
| 进程管理 | pm2 |

## 常用命令

```bash
# 安装依赖
npm install

# 启动开发服务器（热更新）
npm run dev

# 生产启动
npm run start

# Prisma 相关
npm run prisma:pull      # 从现有 DB 拉 schema
npm run prisma:generate  # 生成 Prisma Client

# pm2 部署
pm2 start ecosystem.config.cjs

# 数据库字符集修复
mysql -u <user> -p < sql/fix_collation_utf8mb4.sql
```

## 项目结构

```
src/                    # 后端源码
├── app.ts              # Express 入口
├── middleware/auth.ts  # JWT 认证
├── routes/             # API 路由（8 个模块）
├── services/           # 业务逻辑
├── prisma.ts           # Prisma Client 单例
├── types.ts            # 类型定义
└── utils.ts            # 响应工具
prisma/schema.prisma    # 数据库 schema
frontend-pc/            # PC 前端（主力）
frontend/               # 移动端前端（Legacy）
scripts/                # 部署脚本
```

## 项目约定

- API 路由统一以 `/api` 为前缀
- 数据库使用 utf8mb4 字符集，排序规则 utf8mb4_0900_ai_ci
- 环境变量通过 `.env` 文件管理（参考 `.env.example`）
- 前端为单页面应用，非 API 路由返回 index.html
- 打卡基于模板机制：先创建 `CheckinTemplate`（含字段 schema），再基于模板创建打卡记录，payload 严格校验
- TODO 支持版本管理：每次创建/更新/状态变更自动写入 `TodoVersion` 快照，含 `change_summary` 摘要
- 响应格式：成功 `{code: 0, data, message}`，失败 `{code: 1, message}`
- BigInt 字段在响应中转为 Number
- 日期字段返回 ISO 8601 格式
- **数据库 schema 改动铁律**：所有 schema 改动必须新建 `prisma/migrations/<timestamp>_<topic>/migration.sql`（timestamp 格式 `YYYYMMDDhhmmss`）。`scripts/watch-pull.sh` 检测到该目录变更后自动 `prisma migrate deploy` 同步线上库。**禁止**手写 `sql/*.sql`（绕过迁移机制），**禁止**手动登录数据库执行 `ALTER`/`UPDATE` 等结构变更
- **数据库 schema 改动铁律**：所有 schema 改动必须新建 `prisma/migrations/<timestamp>_<topic>/migration.sql`（timestamp 格式 `YYYYMMDDhhmmss`）。`scripts/watch-pull.sh` 检测到该目录变更后自动 `prisma migrate deploy` 同步线上库。**禁止**手写 `sql/*.sql`（绕过迁移机制），**禁止**手动登录数据库执行 `ALTER`/`UPDATE` 等结构变更

## 部署

- 定时任务 cron 每分钟 `git pull`，tsx --watch 自动检测文件变化并重启
- pm2 保活进程，崩溃自动恢复
- 每天凌晨 4 点 pm2 restart 兜底
- 详见 `scripts/watch-pull.sh` 和 `scripts/crontab.example`

## 协作规范

- 功能迭代前在 `docs/design/` 编写设计文档
- 临时执行计划放 `docs/plans/`，完成后删除
- 架构文档不贴代码，描述"是什么"和"为什么"

## 工作流（planner → executor → reviewer → commit）

本项目按下述四阶段流转。AI 助手严格按此分工，不串台。

### 1. Planner（Claude 主对话）
- 与用户对齐需求 → 写设计文档到 `docs/design/YYYY-MM-DD-<topic>.md`
- **不直接看实现代码、不直接改代码**（仅文档 / 配置 / CLAUDE.md / scripts/cb.sh 等可直接动）
- 设计文档结构：
  - 核心诉求
  - 方案
  - 涉及文件清单
  - 测试与验收（含具体测试用例 ID + 期望）
  - 验收 checklist（"应该消失"和"应该存在"两组）
  - 不包含的内容
- 设计前主动问清楚需求歧义；不替用户拍板有多个合理选择的关键决策
- **主动挖隐藏问题**：方案对齐前必须列举至少 3 个用户没提但可能踩坑的点（边界值、并发、回滚、空数据、相关路由是否同病、historic data 残留等），由用户决定接不接
- **主动统一化、规范化**：发现"同一类问题在多处以不同方式处理"或"局部修法不彻底"时，主动提出统一方案（抽工具函数 / 扩范围到所有同病路由 / 写死规则杜绝再漂），不要给一个 issue 只打补丁式特殊处理
- **API 改动必须同步 skill**：任何 API 接口变更（新增/修改/删除参数、行为变化、错误响应变化）必须**同步更新**：
  - `skill/scripts/api_client.py`：函数签名 + docstring
  - `skill/SKILL.md` 与 `skill/references/*.md`：用户意图表、参数表、关键规则——这是 AI 调 skill 时的唯一入口，光改 .py 没用
  - 设计文档"涉及文件清单"必须列出对应的 skill 文档

### 2. Executor（codebuddy）
- 统一通过 `scripts/cb.sh`：模型 `deepseek-v4-pro-ioa`，fallback `glm-5.1-ioa`，自动 `-y`
- 超时档位：
  - `small`=300s（重试 2 次）：单文件读、回答简单问题
  - `medium`=1800s（重试 2 次，默认）：写测试、改单文件、批量小修
  - `large`=7200s（不重试）：跨文件改造
  - `huge`=21600s（不重试）：按设计文档全量执行
  - 自定义秒数：`-t 600`
- **prompt 纪律**：
  - 控制在"读 X，回答 Y 一个具体问题"粒度
  - 大任务由主对话拆步骤调度，每步单独一次 codebuddy
  - 明确说"只修上述列出的内容，不要顺手改别的，不要重构"
  - 输出要求：每条改动一行确认 + 测试结果尾部 5 行
- **上下文隔离铁律（核心宗旨）**：写代码、写测试、review **三件事必须三次独立的 codebuddy 调用**，不能让同一个 codebuddy 既写代码又写测试，更不能让它 review 自己写的东西。
  - 实现代码 → 一次 cb.sh
  - 写测试 → 另一次 cb.sh（新上下文，只看代码 diff 和设计文档的测试用例表）
  - review（A 完整性、B 代码质量）→ 各自独立的 cb.sh，不沿用 executor / tester 的上下文
- **后台执行硬规则**：Bash 工具单次 timeout 上限 10 分钟（600000ms）。所以：
  - `small`（≤300s）：可前台跑
  - `medium / large / huge`：**必须** `run_in_background: true`，否则会被 10 分钟超时杀掉
  - 后台任务通过 task-notification 自动通知完成，主对话再读取输出
- 主对话不直接读代码，让 codebuddy 读并返回结构化结论

### 3. Reviewer（多轮，可并行）
所有 review 在 codebuddy 提交修改后立即触发：

- **轮 A — 实现完整性**（必跑）：`cb.sh` 让 codebuddy 对照设计文档「验收 checklist」逐项打勾，输出结构化报告
- **轮 B — 代码质量**（必跑）：**必须用独立的 cb.sh 调用让 codebuddy 看 diff 给意见**，主对话不自己审查代码（自己审会跟 planner 上下文混，且容易乐观偏差）
- **轮 C — 测试**（必跑）：主对话直接 `npm test`，走 `.env.test`，0 failures 才算过
- **轮 D — 安全**（涉及权限/认证/SQL/外部输入时跑）：`ecc:security-review`
- A / B / C 在后台并行（`run_in_background: true`）
- **关键约束**：codebuddy 不能 review 自己写的代码（会乐观偏差），必须由主对话或独立 reviewer 评估

### 4. Review 后续处理
- reviewer 发现问题 → 主对话快速扫一遍意见
- 没有明显胡说 → **直接 `cb.sh` 让 codebuddy 修，不再问用户**
- **修完后必须重新跑一轮 review**（实现完整性 + 代码质量 + 测试），直到 review 没大意见才停
- 如果 review 意见看起来不合理（与设计文档冲突、误解需求），才向用户请示
- **遇到难解决的问题或与设计文档不符 → send-msg 通知用户**

### 5. Commit
- 单个任务完成（review 干净 + 测试通过）→ **自主在 feature 分支 commit**
- commit 粒度自由把握（业务/基建可分可合）
- 提交信息署名：`Co-Authored-By: claude-code + codebuddy`
- commit 完成后 send-msg 通知用户
- **合并到 master 必须用户审批**，AI 不自动合并

## 测试数据库

- 配置在 `.env.test`（键名 `DATABASE_URL`、`JWT_SECRET_KEY`、`PORT`）
- `vitest.config.ts` 顶部 `dotenv.config({ path: '.env.test' })` 自动加载
- 不要把 `DATABASE_URL` 硬编码到 `vitest.config.ts` 或代码中
- **严禁查看** `.env`（生产凭证）

## 线上数据库

- 真正的线上数据库连接配置在 `.env.local` 中
- **未经用户明确允许，禁止修改 `.env.local` 内容、禁止用其凭证执行任何写入/结构变更操作**
- 排查问题时若需读取线上数据，先向用户请示
- 只读访问可直接用账号 `ai` / 密码 `wdnmd` 连 `9.134.107.159:3306/gouye`（仅 SELECT 权限，安全可用）

## 编码规范

### 命令执行
- 所有看代码 / 写代码 / 跑工具任务走 `scripts/cb.sh`，不直接 Read 大量代码、不直接 Bash 跑 build
- 测试除外：`npm test` 主对话直接跑，因为不需要 LLM
- 并行可在后台执行的任务用 `run_in_background: true`

### 错误响应
- HTTP 状态码用语义正确的（409 冲突、403 权限、404 找不到、400 参数错误）
- 错误信息用**英文**（已统一规则，service 层与 route 层都遵守）
- 响应格式：成功 `{code: 0, data, message}`，失败 `{code: 1, message}`，**不要加额外字段**（如 deprecation_warning）

### REST 设计
- 资源状态变更**合到主资源 PUT**，不走子资源动作（v1.5.0 已统一）
- 写文档前先核对实现实际行为，不写理想化描述

### 代码风格（与现有代码一致）
- TypeScript ESM strict
- BigInt → Number 在 toDict 里完成
- 日期统一 ISO 8601
- 不在 PR 中"顺手"改无关代码
- 修复 review 问题时严格按列表执行，不扩展范围

## 重要提醒

- **严禁查看 `.env` 文件** — 包含敏感信息，查看后将导致无法工作

## 前端现状

- PC 前端 (`frontend-pc/`)：主力界面，原生 HTML + Tailwind CSS，SPA 架构（hash 路由），4 个页面（需求/TODO/记账/打卡），响应式布局
- 移动端前端 (`frontend/`)：Legacy 界面，通过 `/legacy` 路径访问
- 前端均为纯静态文件，由 Express 直接 serve
- **前端纯只读**：所有前端页面只展示数据，不提供任何创建/修改/删除 UI（无表单、无编辑按钮、无颜色选择器等）。所有数据写入操作通过 skill 或直接调用 API 完成。设计前端功能时不要规划编辑入口
