/*
    ltx-director-pro
    js/image_batch.js    2026-08-13

    @link    : https://shezw.com
    @author  : shezw
    @email   : hello@shezw.com
*/

const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;

const IMAGE_BATCH_STYLES = `
  .shezw-image-batch {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border: 1px solid #111;
    border-radius: 6px;
    background: #1f1f1f;
    color: #ddd;
    font: 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .shezw-image-batch-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .shezw-image-batch button {
    min-height: 32px;
    padding: 7px 11px;
    border: 1px solid #526b8e;
    border-radius: 4px;
    background: #263243;
    color: #f2f7ff;
    cursor: pointer;
    font-weight: 600;
  }
  .shezw-image-batch button[data-action="process"] {
    flex: 1;
    border-color: #6b98cf;
    background: #294665;
  }
  .shezw-image-batch button:disabled {
    cursor: progress;
    opacity: 0.55;
  }
  .shezw-image-batch-status {
    min-height: 34px;
    color: #aaa;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;

if (!document.getElementById("shezw-image-batch-styles")) {
  const style = document.createElement("style");
  style.id = "shezw-image-batch-styles";
  style.textContent = IMAGE_BATCH_STYLES;
  document.head.appendChild(style);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findWidget(node, name) {
  return node?.widgets?.find((widget) => widget.name === name) || null;
}

function setWidgetValue(node, name, value) {
  const widget = findWidget(node, name);
  if (!widget) throw new Error(`Widget ${name} not found on ${node?.title || node?.type}`);
  widget.value = value;
  if (typeof widget.callback === "function") {
    try { widget.callback(value, app.canvas, node, null, null); } catch (_) { }
  }
}

function selectedFiles(node) {
  try {
    const files = JSON.parse(`${findWidget(node, "files_json")?.value || "[]"}`);
    return Array.isArray(files) ? files.filter((path) => typeof path === "string" && path.trim()) : [];
  } catch (_) {
    return [];
  }
}

function basename(path) {
  return `${path || ""}`.split(/[\\/]/).filter(Boolean).pop() || "image";
}

function dirname(path) {
  const text = `${path || ""}`;
  const index = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"));
  return index > 0 ? text.slice(0, index) : "";
}

function collectInputNodeIds(value, output = new Set()) {
  if (Array.isArray(value)) {
    if ((typeof value[0] === "string" || typeof value[0] === "number") && typeof value[1] === "number") {
      output.add(String(value[0]));
      return output;
    }
    for (const item of value) collectInputNodeIds(item, output);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectInputNodeIds(item, output);
  }
  return output;
}

function keepPromptDependencies(promptOutput, terminalIds) {
  const keep = new Set();
  const visit = (id) => {
    const key = String(id);
    if (keep.has(key) || !promptOutput[key]) return;
    keep.add(key);
    for (const inputId of collectInputNodeIds(promptOutput[key]?.inputs || {})) visit(inputId);
  };
  for (const terminalId of terminalIds) visit(terminalId);
  return Object.fromEntries(Object.entries(promptOutput).filter(([id]) => keep.has(String(id))));
}

async function queueImagePrompt(terminalNodeIds, saveNodeId, isFinalImage) {
  if (!app?.graphToPrompt || !api) throw new Error("ComfyUI graphToPrompt API is unavailable.");
  const prompt = await app.graphToPrompt();
  if (!prompt?.output) throw new Error("ComfyUI returned an empty prompt.");
  const output = keepPromptDependencies(prompt.output, terminalNodeIds.map((id) => String(id)));
  if (!Object.keys(output).length || !output[String(saveNodeId)]) {
    throw new Error("HD save node is missing from the executable prompt.");
  }

  const response = await api.fetchApi("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: api.clientId,
      prompt: output,
      extra_data: {
        extra_pnginfo: { workflow: prompt.workflow },
        shezw_image_batch: true,
        shezw_cleanup_after_prompt: true,
        shezw_preserve_model_cache: true,
        shezw_clear_executor_cache_after_prompt: isFinalImage,
        shezw_unload_models_after_prompt: isFinalImage,
      },
    }),
  });
  const data = await response.json();
  if (!response.ok || (data?.node_errors && Object.keys(data.node_errors).length)) {
    throw new Error(data?.error || `ComfyUI rejected the prompt: ${JSON.stringify(data?.node_errors || data)}`);
  }
  const promptId = data?.prompt_id || data?.promptId || data?.id;
  if (!promptId) throw new Error(`ComfyUI did not return prompt_id: ${JSON.stringify(data)}`);
  return String(promptId);
}

async function waitForHistory(promptId, timeoutMs = 1000 * 60 * 60 * 4) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await api.fetchApi(`/history/${encodeURIComponent(promptId)}`);
    if (response.ok) {
      const data = await response.json();
      const item = data?.[promptId] || data;
      if (item?.status?.status_str === "error") {
        throw new Error(`ComfyUI prompt ${promptId} failed.`);
      }
      if (item?.outputs && Object.keys(item.outputs).length) return item;
    }
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for image prompt ${promptId}.`);
}

async function cleanupPrompt(promptId = null, preserveModels = false, waitSeconds = 0) {
  try {
    await api.fetchApi("/shezw/prompt/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_id: promptId,
        wait_seconds: waitSeconds,
        unload_models: !preserveModels,
        preserve_models: preserveModels,
        clear_executor_cache: !preserveModels,
      }),
    });
  } catch (error) {
    console.warn("[Shezw Image Batch] cleanup failed", error);
  }
}

function findBatchSaveNode() {
  return (app.graph?._nodes || []).find((node) => node.type === "ShezwImageBatchSave");
}

function findImageTerminalNodeIds(saveNode) {
  const compareNodes = (app.graph?._nodes || []).filter((node) => node.type === "ImageCompare");
  return [saveNode.id, ...compareNodes.map((node) => node.id)];
}

function installImageBatchQueueHook() {
  if (!app || typeof app.queuePrompt !== "function" || app.__shezwImageBatchQueueHookInstalled) return;
  app.__shezwImageBatchQueueHookInstalled = true;
  const originalQueuePrompt = app.queuePrompt.bind(app);
  app.queuePrompt = async function (...args) {
    const source = (app.graph?._nodes || []).find((node) => node.type === "ShezwImageBatchSource");
    if (source?.__shezwQueueImages) return await source.__shezwQueueImages({ source: "run" });
    return await originalQueuePrompt(...args);
  };
}

app.registerExtension({
  name: "Shezw.ImageBatch",
  async setup() {
    installImageBatchQueueHook();
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    installImageBatchQueueHook();
    if (nodeData.name !== "ShezwImageBatchSource") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
      const node = this;
      const filesWidget = findWidget(node, "files_json");
      const indexWidget = findWidget(node, "current_index");
      for (const widget of [filesWidget, indexWidget]) {
        if (!widget) continue;
        widget.computeSize = () => [0, 0];
      }

      const container = document.createElement("div");
      container.className = "shezw-image-batch";
      const controls = document.createElement("div");
      controls.className = "shezw-image-batch-row";
      const selectButton = document.createElement("button");
      selectButton.textContent = "Select Images / 选择图片";
      const clearButton = document.createElement("button");
      clearButton.textContent = "Clear / 清空";
      const processButton = document.createElement("button");
      processButton.dataset.action = "process";
      processButton.textContent = "Batch Process / 批量处理";
      const status = document.createElement("div");
      status.className = "shezw-image-batch-status";
      controls.appendChild(selectButton);
      controls.appendChild(clearButton);
      container.appendChild(controls);
      container.appendChild(processButton);
      container.appendChild(status);

      const setStatus = (message) => { status.textContent = message; };
      const refreshStatus = () => {
        const files = selectedFiles(node);
        if (!files.length) {
          setStatus("No images selected. Outputs use <source>/HD/<same filename>. / 尚未选择图片。输出到原目录 HD 子文件夹并保持同名。");
          return;
        }
        const sample = files.length === 1 ? basename(files[0]) : `${basename(files[0])} ...`;
        setStatus(`${files.length} image(s): ${sample}. Existing HD files will be replaced.`);
      };
      if (filesWidget) {
        const originalFilesCallback = filesWidget.callback;
        filesWidget.callback = function () {
          const callbackResult = originalFilesCallback
            ? originalFilesCallback.apply(this, arguments)
            : undefined;
          refreshStatus();
          return callbackResult;
        };
      }

      selectButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        selectButton.disabled = true;
        try {
          const current = selectedFiles(node);
          const response = await api.fetchApi("/shezw/image_batch/select", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initial_directory: current.length ? dirname(current[0]) : "" }),
          });
          const data = await response.json();
          if (!response.ok || !data?.ok) throw new Error(data?.error || "Image selection failed");
          if (data.cancelled) {
            refreshStatus();
            return;
          }
          setWidgetValue(node, "files_json", JSON.stringify(data.files || []));
          setWidgetValue(node, "current_index", 0);
          refreshStatus();
          app.graph?.setDirtyCanvas(true, true);
        } catch (error) {
          console.error("[Shezw Image Batch]", error);
          setStatus(`Selection error: ${error.message || error}`);
        } finally {
          selectButton.disabled = false;
        }
      });

      clearButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setWidgetValue(node, "files_json", "[]");
        setWidgetValue(node, "current_index", 0);
        refreshStatus();
        app.graph?.setDirtyCanvas(true, true);
      });

      const queueImages = async () => {
        if (node.__shezwBatchRunning) return { queued: false, reason: "already-running" };
        node.__shezwBatchRunning = true;
        selectButton.disabled = true;
        clearButton.disabled = true;
        processButton.disabled = true;
        let batchStarted = false;
        let finalStatus = "";
        try {
          const files = selectedFiles(node);
          if (!files.length) throw new Error("Select at least one source image first.");
          const saveNode = findBatchSaveNode();
          if (!saveNode) throw new Error("ShezwImageBatchSave is missing from this workflow.");
          const terminalNodeIds = findImageTerminalNodeIds(saveNode);
          if (typeof window.shezwApplyGlobalPrefixToGraph === "function") {
            window.shezwApplyGlobalPrefixToGraph();
          }

          batchStarted = true;
          for (let index = 0; index < files.length; index += 1) {
            setWidgetValue(node, "current_index", index);
            app.graph?.setDirtyCanvas(true, true);
            setStatus(`Processing ${index + 1}/${files.length}: ${basename(files[index])}`);
            const promptId = await queueImagePrompt(
              terminalNodeIds,
              saveNode.id,
              index === files.length - 1,
            );
            await waitForHistory(promptId);
            await cleanupPrompt(promptId, true);
          }
          finalStatus = `Done: ${files.length} image(s) saved beside their sources in HD folders.`;
          setStatus(finalStatus);
          return { queued: true, count: files.length };
        } catch (error) {
          console.error("[Shezw Image Batch]", error);
          finalStatus = `Error: ${error.message || error}`;
          setStatus(finalStatus);
          return { queued: false, error };
        } finally {
          if (batchStarted) {
            setStatus("Final memory cleanup... / 正在完成最终内存释放...");
            await cleanupPrompt(null, false, 5);
          }
          if (finalStatus) setStatus(finalStatus);
          try { setWidgetValue(node, "current_index", 0); } catch (_) { }
          app.graph?.setDirtyCanvas(true, true);
          selectButton.disabled = false;
          clearButton.disabled = false;
          processButton.disabled = false;
          node.__shezwBatchRunning = false;
        }
      };

      node.__shezwQueueImages = queueImages;
      processButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        await queueImages({ source: "button" });
      });

      setTimeout(() => {
        node.addDOMWidget("image_batch_controls", "div", container, { serialize: false });
        refreshStatus();
        if (node.size[0] < 480) node.size[0] = 480;
        if (node.size[1] < 190) node.size[1] = 190;
        app.graph?.setDirtyCanvas(true, true);
      }, 100);
      return result;
    };
  },
});
