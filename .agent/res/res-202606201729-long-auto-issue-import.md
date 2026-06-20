## 分析结论

`long-auto-issue.json` 位于 `/Volumes/cmfui/user/default/workflows/long-auto-issue.json`。ComfyUI Python log 中没有 Meta Info 导入失败记录；该导入动作由浏览器端前端脚本读取本地 JSON，失败通常只出现在浏览器 console。当前 log 只显示 `ltx-director-pro` 正常加载，另有无关的 `foreach` custom node import failure。

实际问题在旧 workflow 兼容解析：

- 旧文件的 `LTXDirector.inputs` 只声明了 6 个 widget 名称。
- 同一节点的 `widgets_values` 实际有 17 项，`timeline_data` 在第 4 项。
- 旧导入逻辑优先使用 `inputs[].widget.name`，导致第 2 项 `5847` 被当作 `timeline_data`。
- 旧 timeline 的 `meta.longAutoMemory` 还会把已完成分段状态带入新版 story script，导入后可能继承旧的分段完成状态。
- 旧节点标题为 `C01`，新版图中同类型节点标题可能不同，按标题匹配会失败。

修复方向：

- 对已知节点类型使用固定 widget 顺序，避免旧 workflow 输入声明不完整造成错位。
- 导入 long-auto timeline 时剥离旧 `longAutoMemory`，并强制使用新版输出 prefix。
- 应用 story script 时在 id 和标题匹配失败后，允许按唯一节点类型兜底匹配。
