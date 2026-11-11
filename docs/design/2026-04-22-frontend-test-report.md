# 前端 E2E 测试报告 — 2026-04-22

**分支**: feature/todo-checkin-ai
**测试范围**: F1-F6（跳过 F4、F7、Layer 1）
**测试工具**: Playwright MCP（375×812 移动端视口）
**测试账号**: user_id=1（通过 TEST_TOKEN 注入 localStorage）
**截图目录**: `tests/playwright-screenshots/`

---

## 环境状态

- 后端服务: `http://localhost:7001` ✅ 正常运行
- AI 服务 (DeepSeek): ❌ 不可用 — 返回 503 "Model Not Exist"
- 数据库: MySQL (9.134.107.159) ✅ 连接正常

---

## F1: TODO 任意状态互转

| 步骤 | 操作 | 预期 | 结果 | 截图 |
|---|---|---|---|---|
| F1-01 | 创建 TODO（title="F1测试状态流转"） | 成功创建 | ✅ PASS | F1-01-created.png |
| F1-02 | pending → done | 状态切换，completed_at 设置 | ✅ PASS | F1-02-done-list.png |
| F1-03 | done → pending | 状态回退，completed_at 清空 | ✅ PASS | F1-03-reopened.png |
| F1-04 | pending → cancelled | 取消成功 | ✅ PASS | F1-04-cancelled.png |
| F1-05 | cancelled → pending | 复活成功 | ✅ PASS | F1-05-revived.png |

**结论**: 后端 `VALID_TRANSITIONS` 已正确配置为任意互转（pending↔done↔cancelled），与设计文档一致。所有状态流转均通过 `POST /api/todos/<id>/status` 成功执行。

**发现问题**:
1. 前端 `todo.js:304` 在保存后调用 `loadTodos()` 时出现 `TypeError: Cannot read properties of null (reading 'style')`，导致列表刷新失败，需手动刷新页面才能看到更新。

---

## F2: AI 自然语言建 TODO

| 步骤 | 操作 | 预期 | 结果 | 截图 |
|---|---|---|---|---|
| F2-01 | 打开 AI 模态，输入"提醒我明天10点交方案" | 输入框可输入 | ⚠️ BLOCKED | F2-01-input.png |
| F2-02 | 等待 proposal-card 出现 | 展示解析结果 | ❌ FAIL | F2-02-ai-error.png |

**结论**: AI 服务不可用（503 Model Not Exist），无法完成 F2 完整流程。前端错误提示正确显示"AI服务不可用"。

**阻塞原因**: `.env` 配置的 `AI_MODEL=deepseek-v3` 在 DeepSeek API 端返回 Model Not Exist。

---

## F3: AI 自然语言打卡 + 新 tag 驳回

**结论**: ❌ 未执行 — 因 AI 服务不可用（与 F2 相同阻塞原因），无法测试 AI 解析和 proposal 确认流程。

---

## F4: AI 失败回退传统表单

**结论**: ⏭️ 跳过（按任务要求）。

**备注**: 从 F1/F2 的测试观察，当 AI 不可用时，用户可关闭 AI 模态并使用传统表单创建 TODO。传统表单创建功能在 F1 中已验证可用（尽管有前端 JS 错误）。

---

## F5: Project 归档 + 恢复

| 步骤 | 操作 | 预期 | 结果 | 截图 |
|---|---|---|---|---|
| F5-01 | 创建 Project "P1"（work） | 成功创建 | ✅ PASS | F5-01-project-created.png |
| F5-02 | 归档 P1 | 状态变为 archived | ✅ PASS | — |
| F5-03 | 默认列表不显示 P1 | 下拉框中无 P1 | ✅ PASS | F5-02-archived-hidden.png |
| F5-04 | 勾选"显示归档" | P1 出现 | ⚠️ N/A | — |
| F5-05 | 恢复 P1 | 回到 active 状态 | ✅ PASS | F5-05-revived.png |

**结论**: 后端完整支持 Project 归档/恢复：`POST /api/projects/<id>/archive`、`POST /api/projects/<id>/unarchive`、`GET /api/projects?include_archived=1` 均正常工作。

**发现问题**:
1. 前端 TODO 页面**没有任何 Project 管理 UI**（无归档按钮、无"显示归档"开关、无恢复按钮）。用户无法通过界面执行归档/恢复操作，只能通过 API 直接调用。
2. 这是设计文档中已标注的"已知差距"（frontend-reviewer-plan 中提及）。

---

## F6: 手动生成周报

| 步骤 | 操作 | 预期 | 结果 | 截图 |
|---|---|---|---|---|
| F6-01 | 点击生成周报按钮 | 触发生成 | ⚠️ BLOCKED | F6-00-weekly-report.png |
| F6-02 | 生成完成，详情 Modal 显示 Markdown | 正常渲染 | ✅ PASS (mock) | F6-02-detail-modal.png |
| F6-03 | 关闭 modal，列表多一条 | 列表正常 | ✅ PASS (mock) | F6-03-list-after-close.png |
| F6-04 | 重新打开该条 | 内容一致 | ✅ PASS (mock) | F6-04-reopen.png |

**结论**: 由于 AI 服务不可用，实际生成流程被阻塞（返回 503）。使用 mock 数据验证前端列表渲染和详情模态框功能正常。Markdown 内容正确渲染为 HTML。

**发现问题**:
1. 后端 `/api/ai/weekly-reports` 返回分页格式 `{items: [], page: 1, ...}`，但前端 `weekly-report.js:22` 期望 `data.data` 为数组，导致真实空数据时抛出 `reports.forEach is not a function` 错误。
2. 建议统一 API 响应格式，或前端适配分页结构。

---

## 汇总

| 流程 | 状态 | 备注 |
|---|---|---|
| F1 | ✅ 通过 | 状态机任意互转正常，前端 save 有 JS 错误 |
| F2 | ❌ 阻塞 | AI 服务不可用 |
| F3 | ❌ 未执行 | AI 服务不可用 |
| F4 | ⏭️ 跳过 | 按任务要求 |
| F5 | ⚠️ 部分通过 | 后端完整，前端缺 Project 管理 UI |
| F6 | ⚠️ 部分通过 | AI 阻塞，前端列表/详情渲染正常（mock验证） |

---

## 发现的问题清单

### 阻塞性问题
1. **AI 服务不可用** — DeepSeek API 返回 `Model Not Exist`。需确认 `.env` 中的 `AI_MODEL` 配置是否正确，或 API 密钥是否有效。

### 前端 Bug
2. **todo.js:304 TypeError** — `loadTodos()` 中 `document.getElementById("skeleton").style.display = "none"` 在 skeleton 元素不存在时崩溃。建议增加空值检查。
3. **weekly-report.js 分页格式不兼容** — 后端返回 `{items: [...]}` 但前端读取 `data.data` 并直接 `forEach`。当返回分页对象时代码崩溃。

### 功能缺失
4. **前端缺少 Project 归档/恢复 UI** — 无按钮/开关供用户归档或恢复 Project，也无法查看已归档项目。
5. **前端缺少 "显示归档" 筛选器** — 设计文档要求 `?include_archived=1` 的 UI 入口，当前未实现。

---

## 建议修复优先级

| 优先级 | 问题 | 影响 |
|---|---|---|
| P0 | AI 服务配置 | 阻塞 F2/F3/F6 核心流程 |
| P1 | todo.js skeleton null 检查 | 影响 TODO 创建/编辑后列表刷新 |
| P1 | weekly-report.js 分页适配 | 周报页面空态/有数据时均崩溃 |
| P2 | Project 管理 UI | 影响 F5 完整用户体验 |
