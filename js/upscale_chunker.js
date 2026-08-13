const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;

const SHEZW_UPSCALE_STYLES = `
  .shezw-upscale-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: 6px;
    background: #1f1f1f;
    border: 1px solid #111;
    color: #ddd;
    font: 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .shezw-upscale-row {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }
  .shezw-upscale-btn {
    background: #263243;
    border: 1px solid #5f83b6;
    color: #f2f7ff;
    border-radius: 4px;
    padding: 7px 10px;
    cursor: pointer;
    font-weight: 600;
  }
  .shezw-upscale-btn:disabled {
    opacity: 0.55;
    cursor: progress;
  }
  .shezw-upscale-status {
    color: #aaa;
    line-height: 1.45;
    word-break: break-word;
  }
  .shezw-upscale-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.62);
  }
  .shezw-upscale-dialog {
    width: min(480px, calc(100vw - 32px));
    padding: 18px;
    border: 1px solid #555;
    border-radius: 6px;
    background: #202124;
    color: #eee;
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.45);
    font: 13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .shezw-upscale-dialog-title {
    margin-bottom: 10px;
    font-size: 15px;
    font-weight: 700;
  }
  .shezw-upscale-dialog-message {
    color: #ccc;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .shezw-upscale-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  .shezw-upscale-dialog-actions button {
    min-width: 88px;
    padding: 8px 12px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #303238;
    color: #eee;
    cursor: pointer;
  }
  .shezw-upscale-dialog-actions button[data-choice="yes"] {
    border-color: #6f9bd1;
    background: #294665;
  }
`;

if (!document.getElementById("shezw-upscale-chunker-styles")) {
  const style = document.createElement("style");
  style.id = "shezw-upscale-chunker-styles";
  style.textContent = SHEZW_UPSCALE_STYLES;
  document.head.appendChild(style);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findWidget(node, name, fallbackIndex = -1) {
  if (!node?.widgets) return null;
  return node.widgets.find((w) => w.name === name) || (fallbackIndex >= 0 ? node.widgets[fallbackIndex] : null);
}

function setWidgetValue(node, name, value, fallbackIndex = -1) {
  const widget = findWidget(node, name, fallbackIndex);
  if (!widget) throw new Error(`Widget ${name} not found on ${node?.title || node?.type}`);
  widget.value = value;
  if (Array.isArray(node.widgets_values) && fallbackIndex >= 0) {
    node.widgets_values[fallbackIndex] = value;
  } else if (node.widgets_values && typeof node.widgets_values === "object") {
    node.widgets_values[name] = value;
  }
  const previewParams = node.widgets_values?.videopreview?.params;
  if (previewParams && typeof previewParams === "object") {
    if (name === "video") previewParams.filename = value;
    if (name === "force_rate" || name === "frame_load_cap" || name === "skip_first_frames") {
      previewParams[name] = value;
    }
  }
  if (widget.callback) {
    try { widget.callback(value, app.canvas, node, null, null); } catch (_) { }
  }
}

function getWidgetValue(node, name, fallbackIndex = -1, fallback = null) {
  const widget = findWidget(node, name, fallbackIndex);
  return widget ? widget.value : fallback;
}

function getNumberWidgetValue(node, name, fallbackIndex, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const raw = getWidgetValue(node, name, fallbackIndex, fallback);
  const text = typeof raw === "string" ? raw.trim() : raw;
  let value = text === "" || text === null || text === undefined ? fallback : Number(text);
  if (!Number.isFinite(value)) value = fallback;
  if (integer) value = Math.floor(value);
  value = Math.min(max, Math.max(min, value));
  if (raw !== value) {
    try { setWidgetValue(node, name, value, fallbackIndex); } catch (_) { }
  }
  return value;
}

function normalizeVideoRef(value, fallback = {}) {
  if (!value) return null;
  const videoExtRE = /\.(mp4|webm|mov|mkv)$/i;
  let filename = "";
  let type = fallback.type || "output";
  let subfolder = fallback.subfolder || "";

  if (typeof value === "string") {
    const text = value.trim().replace(/\\/g, "/");
    if (!videoExtRE.test(text)) return null;
    const typeMatch = text.match(/^(input|output|temp)\/(.+)$/i);
    const pathText = typeMatch ? typeMatch[2] : text;
    const slashIdx = pathText.lastIndexOf("/");
    filename = slashIdx >= 0 ? pathText.slice(slashIdx + 1) : pathText;
    subfolder = slashIdx >= 0 ? pathText.slice(0, slashIdx) : subfolder;
    type = typeMatch ? typeMatch[1].toLowerCase() : type;
  } else if (typeof value === "object") {
    filename = value.filename || value.file || value.name || "";
    type = value.type || type;
    subfolder = value.subfolder || subfolder;
  }

  if (!filename || !videoExtRE.test(filename)) return null;
  return { filename, type, subfolder };
}

function collectValues(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectValues(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectValues(item, out);
  }
  return out;
}

function extractVideoFromHistory(history, prefix) {
  const outputs = history?.outputs || {};
  const normalizedPrefix = (prefix || "").replace(/\\/g, "/").toLowerCase();
  for (const nodeOutput of Object.values(outputs)) {
    const candidates = [
      ...(nodeOutput?.gifs || []),
      ...(nodeOutput?.videos || []),
      ...(nodeOutput?.ui?.gifs || []),
      ...(nodeOutput?.ui?.videos || []),
    ];
    for (const item of candidates) {
      const video = normalizeVideoRef(item);
      const haystack = `${video?.subfolder || ""}/${video?.filename || ""}`.toLowerCase();
      if (video && (!normalizedPrefix || haystack.includes(normalizedPrefix))) return video;
    }

    for (const item of collectValues(nodeOutput)) {
      const video = normalizeVideoRef(item);
      const haystack = `${video?.subfolder || ""}/${video?.filename || ""}`.toLowerCase();
      if (video && (!normalizedPrefix || haystack.includes(normalizedPrefix))) return video;
    }
  }
  return null;
}

function collectInputNodeIds(value, out = new Set()) {
  if (Array.isArray(value)) {
    if ((typeof value[0] === "string" || typeof value[0] === "number") && typeof value[1] === "number") {
      out.add(String(value[0]));
      return out;
    }
    for (const item of value) collectInputNodeIds(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectInputNodeIds(item, out);
  }
  return out;
}

function collectPromptDependencyIds(promptOutput, terminalIds) {
  const keep = new Set();
  const visit = (id) => {
    const key = String(id);
    if (keep.has(key) || !promptOutput[key]) return;
    keep.add(key);
    const inputs = promptOutput[key]?.inputs || {};
    for (const inputId of collectInputNodeIds(inputs)) visit(inputId);
  };
  for (const id of terminalIds) visit(id);
  return keep;
}

function sanitizePromptOutputs(prompt, outputNodeIds = []) {
  if (!prompt?.output) throw new Error("ComfyUI graphToPrompt returned an empty prompt.");
  const chunkerIds = new Set((app?.graph?._nodes || [])
    .filter((node) => node?.type === "ShezwUpscaleChunker")
    .map((node) => String(node.id)));

  for (const id of chunkerIds) delete prompt.output[id];

  if (outputNodeIds.length) {
    const keep = collectPromptDependencyIds(prompt.output, outputNodeIds.map((id) => String(id)));
    prompt.output = Object.fromEntries(
      Object.entries(prompt.output).filter(([id]) => keep.has(String(id)))
    );
  }

  if (!Object.keys(prompt.output).length) {
    throw new Error("没有可提交的分段视频输出节点。请确认工作流里存在 VHS_VideoCombine。");
  }
  return prompt;
}

async function queueGraphPrompt(outputNodeIds = [], { preserveModelCache = false } = {}) {
  if (!app?.graphToPrompt || !api) throw new Error("ComfyUI graphToPrompt API is unavailable.");
  const prompt = sanitizePromptOutputs(await app.graphToPrompt(), outputNodeIds);
  const resp = await api.fetchApi("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: api.clientId,
      prompt: prompt.output,
      extra_data: {
        extra_pnginfo: { workflow: prompt.workflow },
        shezw_upscale_chunk: true,
        shezw_preserve_model_cache: preserveModelCache,
        shezw_unload_models_after_prompt: !preserveModelCache,
      },
    }),
  });
  const data = await resp.json();
  if (data?.node_errors && Object.keys(data.node_errors).length) {
    throw new Error(`ComfyUI rejected the prompt: ${JSON.stringify(data.node_errors)}`);
  }
  const promptId = data?.prompt_id || data?.promptId || data?.id;
  if (!promptId) throw new Error(`ComfyUI did not return prompt_id: ${JSON.stringify(data)}`);
  return String(promptId);
}

async function waitForHistory(promptId, timeoutMs = 1000 * 60 * 60 * 8) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const resp = await api.fetchApi(`/history/${encodeURIComponent(promptId)}`);
    if (resp.ok) {
      const data = await resp.json();
      const item = data?.[promptId] || data;
      if (item?.status?.status_str === "error") throw new Error(`ComfyUI prompt ${promptId} failed.`);
      if (item?.outputs && Object.keys(item.outputs).length) return item;
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for prompt ${promptId}.`);
}

async function freeComfyMemory(promptId = null, waitSeconds = 12, preserveModels = false) {
  const wait = Math.max(0, Math.min(60, Number(waitSeconds) || 0));
  try {
    const cleanupResp = await api.fetchApi("/shezw/upscale/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_id: promptId,
        wait_seconds: wait,
        unload_models: !preserveModels,
        preserve_models: preserveModels,
      }),
    });
    if (cleanupResp.ok) return;
  } catch (err) {
    console.warn("[Shezw Upscale Chunker] backend cleanup request failed", err);
  }

  if (promptId) {
    try {
      await api.fetchApi("/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete: [promptId] }),
      });
    } catch (err) {
      console.warn("[Shezw Upscale Chunker] history cleanup failed", err);
    }
  }

  if (preserveModels) {
    if (wait > 0) await sleep(wait * 1000);
    return;
  }

  try {
    await api.fetchApi("/free", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
  } catch (err) {
    console.warn("[Shezw Upscale Chunker] Comfy memory free request failed", err);
  }
  if (wait > 0) await sleep(wait * 1000);
}

async function findExistingSegments(segmentPrefix, count, contiguousStart = 0) {
  if (!count) return { found: [], missing: [] };
  const params = new URLSearchParams({
    segment_prefix: segmentPrefix,
    count: String(count),
    contiguous_start: String(contiguousStart),
  });
  const resp = await api.fetchApi(`/shezw/upscale/find_segments?${params.toString()}`);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "查找已有分段失败");
  return {
    found: Array.isArray(data.found) ? data.found : [],
    missing: Array.isArray(data.missing) ? data.missing : [],
    nextAvailable: Number.isFinite(Number(data.next_available))
      ? Number(data.next_available)
      : contiguousStart,
  };
}

function askSegmentConflict({ requestedStart, lastExisting, suggestedStart }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "shezw-upscale-dialog-backdrop";
    const dialog = document.createElement("div");
    dialog.className = "shezw-upscale-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const title = document.createElement("div");
    title.className = "shezw-upscale-dialog-title";
    title.textContent = "Segment files already exist / 分段文件已存在";
    const message = document.createElement("div");
    message.className = "shezw-upscale-dialog-message";
    message.textContent = `起始分段 ${requestedStart} 已存在，当前前缀下最后一个已有分段是 ${lastExisting}。\n是否从 ${suggestedStart} 开始？\n\n“否”会保持起始序号不变并继续生成；“取消生成”会直接结束本次批处理。`;

    const actions = document.createElement("div");
    actions.className = "shezw-upscale-dialog-actions";
    const choices = [
      ["cancel", "取消生成 / Cancel"],
      ["no", "否 / No"],
      ["yes", "是 / Yes"],
    ];
    let settled = false;
    const finish = (choice) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown, true);
      backdrop.remove();
      resolve(choice);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") finish("cancel");
    };
    for (const [choice, label] of choices) {
      const choiceButton = document.createElement("button");
      choiceButton.type = "button";
      choiceButton.dataset.choice = choice;
      choiceButton.textContent = label;
      choiceButton.addEventListener("click", () => finish(choice));
      actions.appendChild(choiceButton);
    }
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) finish("cancel");
    });
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKeyDown, true);
    actions.querySelector('[data-choice="yes"]')?.focus();
  });
}

function findUpscaleNodes() {
  const nodes = app?.graph?._nodes || [];
  const loadNode = nodes.find((node) => node.type === "VHS_LoadVideo" || `${node.title || ""}`.toLowerCase().includes("load video"));
  const combineNode = nodes.find((node) => node.type === "VHS_VideoCombine" || (`${node.title || ""}`.toLowerCase().includes("save") && node.widgets?.some((w) => w.name === "filename_prefix")));
  if (!loadNode) throw new Error("没有找到 VHS_LoadVideo 节点。");
  if (!combineNode) throw new Error("没有找到 VHS_VideoCombine 节点。");
  return { loadNode, combineNode };
}

function installUpscaleQueueHook() {
  if (!app || typeof app.queuePrompt !== "function" || app.__shezwUpscaleQueueHookInstalled) return;
  app.__shezwUpscaleQueueHookInstalled = true;
  const originalQueuePrompt = app.queuePrompt.bind(app);
  app.queuePrompt = async function (...args) {
    const chunker = (app.graph?._nodes || []).find((node) => node?.type === "ShezwUpscaleChunker");
    if (chunker?.__shezwQueueChunks) {
      return await chunker.__shezwQueueChunks({ source: "run" });
    }
    return await originalQueuePrompt(...args);
  };
}

app.registerExtension({
  name: "Shezw.UpscaleChunker",
  async setup() {
    installUpscaleQueueHook();
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    installUpscaleQueueHook();
    if (nodeData.name !== "ShezwUpscaleChunker") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      if (onNodeCreated) onNodeCreated.apply(this, arguments);
      const node = this;

      const container = document.createElement("div");
      container.className = "shezw-upscale-wrap";

      const row = document.createElement("div");
      row.className = "shezw-upscale-row";
      const title = document.createElement("div");
      title.textContent = "Chunked Upscale";
      title.style.fontWeight = "700";
      const button = document.createElement("button");
      button.className = "shezw-upscale-btn";
      button.textContent = "Batch Process / 批量处理";
      row.appendChild(title);
      row.appendChild(button);

      const status = document.createElement("div");
      status.className = "shezw-upscale-status";
      status.textContent = "Uses VHS_LoadVideo frame_load_cap / skip_first_frames, then concatenates outputs.";

      container.appendChild(row);
      container.appendChild(status);

      const setStatus = (text) => { status.textContent = text; };

      const queueChunks = async () => {
        if (node._isQueueingChunks) return { queued: false, reason: "already-running" };
        node._isQueueingChunks = true;
        button.disabled = true;
        const restore = [];
        let batchStarted = false;
        let cleanupWaitSeconds = 12;
        try {
          if (typeof window.shezwApplyGlobalPrefixToGraph === "function") {
            window.shezwApplyGlobalPrefixToGraph();
          }
          const chunkSeconds = getNumberWidgetValue(node, "chunk_seconds", 0, 10, { min: 0.01, max: 300, integer: false });
          const segmentPrefix = `${getWidgetValue(node, "segment_prefix", 1, "video/upscale-segment") || "video/upscale-segment"}`.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
          const outputPrefix = `${getWidgetValue(node, "output_prefix", 2, "video/upscale-merged") || "video/upscale-merged"}`.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
          cleanupWaitSeconds = getNumberWidgetValue(node, "cleanup_wait_seconds", 3, 12, { min: 0, max: 60, integer: true });
          const requestedStartSegment = getNumberWidgetValue(node, "start_segment_index", 4, 0, { min: 0, max: 100000, integer: true });
          const preserveModelCache = node.properties?.shezw_preserve_model_cache === true;
          const { loadNode, combineNode } = findUpscaleNodes();

          const video = `${getWidgetValue(loadNode, "video", 0, "") || ""}`;
          const forceRate = Number(getWidgetValue(loadNode, "force_rate", 1, 0)) || 0;
          if (!video) throw new Error("VHS_LoadVideo 没有选择输入视频。");

          const infoParams = new URLSearchParams({ filename: video, type: "input", force_rate: String(forceRate) });
          const infoResp = await api.fetchApi(`/shezw/upscale/video_info?${infoParams.toString()}`);
          const info = await infoResp.json();
          if (!infoResp.ok) throw new Error(info.error || "读取视频信息失败");

          const fps = Math.max(1, Number(info.fps || 24));
          const totalFrames = Math.max(1, Number(info.frame_count || Math.round((info.duration || 0) * fps)));
          const chunkFrames = Math.max(1, Math.round(chunkSeconds * fps));
          const totalChunks = Math.ceil(totalFrames / chunkFrames);
          let startSegment = Math.min(requestedStartSegment, totalChunks);

          const watched = [
            [loadNode, "frame_load_cap", 4],
            [loadNode, "skip_first_frames", 5],
            [combineNode, "filename_prefix", 2],
          ];
          for (const [n, name, index] of watched) {
            restore.push([n, name, index, getWidgetValue(n, name, index)]);
          }

          const scanned = await findExistingSegments(segmentPrefix, totalChunks, startSegment);
          const foundIndices = new Set(scanned.found.map((item) => Number(item.index)));
          if (scanned.nextAvailable > startSegment) {
            const suggestedStart = scanned.nextAvailable;
            const lastExisting = suggestedStart - 1;
            const choice = await askSegmentConflict({
              requestedStart: startSegment,
              lastExisting,
              suggestedStart,
            });
            if (choice === "cancel") {
              setStatus("Cancelled: no chunks were queued. / 已取消：未提交任何分段。");
              return { queued: false, cancelled: true };
            }
            if (choice === "yes") {
              startSegment = suggestedStart;
              setWidgetValue(node, "start_segment_index", startSegment, 4);
            }
          }

          const existing = {
            found: scanned.found.filter((item) => Number(item.index) < Math.min(startSegment, totalChunks)),
            missing: Array.from({ length: Math.min(startSegment, totalChunks) }, (_, index) => index)
              .filter((index) => !foundIndices.has(index)),
          };
          if (existing.missing.length) {
            console.warn("[Shezw Upscale Chunker] missing previous segments", existing.missing);
          }

          setStatus(`Preparing memory cleanup before chunks ${startSegment}-${totalChunks - 1} (${chunkSeconds}s each, cleanup ${cleanupWaitSeconds}s).`);
          await freeComfyMemory(null, Math.min(cleanupWaitSeconds, 5));
          batchStarted = true;

          setStatus(startSegment < totalChunks
            ? `Queueing chunks ${startSegment}-${totalChunks - 1} of ${totalChunks} (${totalFrames} frames total, cleanup ${cleanupWaitSeconds}s).`
            : `All ${totalChunks} source chunks already exist. Concatenating without new generation.`);
          const videos = [...existing.found];
          for (let i = startSegment; i < totalChunks; i++) {
            const start = i * chunkFrames;
            const cap = Math.min(chunkFrames, totalFrames - start);
            const prefix = `${segmentPrefix}_${String(i).padStart(5, "0")}`;
            setStatus(`Chunk ${i + 1}/${totalChunks}: frames ${start}-${start + cap - 1}`);

            setWidgetValue(loadNode, "skip_first_frames", start, 5);
            setWidgetValue(loadNode, "frame_load_cap", cap, 4);
            setWidgetValue(combineNode, "filename_prefix", prefix, 2);
            app.graph.setDirtyCanvas(true, true);
            console.info("[Shezw Upscale Chunker] queue chunk", {
              index: i,
              start,
              cap,
              prefix,
              outputNode: combineNode.id,
            });

            const promptId = await queueGraphPrompt([combineNode.id], { preserveModelCache });
            const history = await waitForHistory(promptId);
            const videoRef = extractVideoFromHistory(history, prefix);
            if (!videoRef) throw new Error(`Chunk ${i + 1} 完成但没有找到分段视频输出。`);
            videos.push(videoRef);
            setStatus(preserveModelCache
              ? `Chunk ${i + 1}/${totalChunks} saved. Releasing history and reusing fixed model cache...`
              : `Chunk ${i + 1}/${totalChunks} saved. Cleaning memory for ${cleanupWaitSeconds}s...`);
            await freeComfyMemory(promptId, preserveModelCache ? 0 : cleanupWaitSeconds, preserveModelCache);
          }

          const missingNote = existing.missing.length ? ` (${existing.missing.length} previous chunks missing)` : "";
          setStatus(`Concatenating ${videos.length} chunks${missingNote}...`);
          const concatResp = await api.fetchApi("/shezw/upscale/concat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videos, output_prefix: outputPrefix }),
          });
          const concatData = await concatResp.json();
          if (!concatResp.ok) throw new Error(concatData.error || "拼接失败");
          const finalPath = [concatData.subfolder, concatData.filename].filter(Boolean).join("/");
          setStatus(`Done: output/${finalPath} (${concatData.method}, ${concatData.count} chunks)`);
          return { queued: true, output: concatData };
        } catch (err) {
          console.error("[Shezw Upscale Chunker]", err);
          setStatus(`Error: ${err.message || err}`);
          return { queued: false, error: err };
        } finally {
          if (batchStarted) {
            try { await freeComfyMemory(null, Math.min(cleanupWaitSeconds, 5), false); } catch (_) { }
          }
          for (const [n, name, index, value] of restore.reverse()) {
            try { setWidgetValue(n, name, value, index); } catch (_) { }
          }
          app.graph.setDirtyCanvas(true, true);
          button.disabled = false;
          node._isQueueingChunks = false;
        }
      };

      node.__shezwQueueChunks = queueChunks;
      button.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await queueChunks({ source: "button" });
      });

      setTimeout(() => {
        node.domWidget = node.addDOMWidget("UpscaleChunker", "div", container);
        node.domWidget.computeSize = () => [360, 108];
        if (node.size[0] < 420) node.size[0] = 420;
        if (node.size[1] < 210) node.size[1] = 210;
        app.graph.setDirtyCanvas(true, true);
      }, 100);
    };
  },
});
