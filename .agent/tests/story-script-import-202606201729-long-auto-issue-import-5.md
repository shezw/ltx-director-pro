# 测试用例

- 测试 ID: `5`
- 项目: `ltx-director-pro`
- 场景: `story-script-import`
- 目标: `long-auto-issue-import`
- 创建时间: `2026-06-20 17:29`

## 测试验证

1. 执行 `node --check js/story_script.js`。
2. 读取 `/Volumes/cmfui/user/default/workflows/long-auto-issue.json`，通过 `story_script.js` 的真实转换函数生成 story script。
3. 校验 `LTXDirector` 的 `duration_frames` 为 `5847`、`frame_rate` 为 `243.625`，`timeline_data` 可以解析为 JSON 且包含 22 个 segments。
4. 校验导入后的 timeline meta 不包含 `longAutoMemory`，并使用 `video/ltx-director-pro-tail-frame` 与 `video/ltx-director-pro-segment`。
5. 使用旧 entry id/title 与新版节点标题不一致的图结构，验证唯一类型兜底可以写入目标 `LTXDirector.timeline_data`。

## 结果判定

- 返回值: `true`
- 通过条件: 语法检查通过，真实旧 workflow 静态转换与应用仿真均通过。
- 失败处理: 更新 `results.db` 中的 `fails`

## 执行记录

- 最近结果: `true`
- 说明: 静态仿真返回 `{ ok: true, nodes: 3, segments: 22, title: "C01", imported_from_schema: "workflow-0.4" }`。
