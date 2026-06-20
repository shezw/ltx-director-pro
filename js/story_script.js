import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function getWidget(node, name) {
  return node?.widgets?.find((w) => w.name === name);
}

function widgetValue(node, name, fallback = "") {
  const widget = getWidget(node, name);
  return widget ? widget.value : fallback;
}

function setWidgetValue(node, name, value) {
  const widget = getWidget(node, name);
  if (!widget) return false;
  widget.value = value;
  if (typeof widget.callback === "function") widget.callback(value);
  return true;
}

function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text || "");
    return value && typeof value === "object" ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function getStoryNode() {
  return (app?.graph?._nodes || []).find((node) => node.type === "ShezwStoryScript");
}

function getGlobalPrefix() {
  if (typeof window.shezwGetGlobalPrefix === "function") return window.shezwGetGlobalPrefix();
  const node = (app?.graph?._nodes || []).find((n) => n.type === "ShezwGlobalPrefix");
  return `${widgetValue(node, "global_prefix", "") || ""}`.trim();
}

function getAllowedStruct(storyNode) {
  const raw = widgetValue(storyNode, "ss_struct", "{}");
  const parsed = parseJson(raw, {});
  return Array.isArray(parsed.fields) ? parsed : { fields: [] };
}

function getAllowedWidgets(struct, node) {
  const entries = struct.fields.filter((field) => {
    if (field.node_id !== undefined && String(field.node_id) !== String(node.id)) return false;
    if (field.node_type && field.node_type !== node.type) return false;
    if (field.title && field.title !== node.title) return false;
    return field.widgets || field.widget;
  });
  const names = new Set();
  for (const entry of entries) {
    if (entry.widget) names.add(entry.widget);
    for (const name of entry.widgets || []) names.add(name);
  }
  return names;
}

function collectStoryScript(storyNode) {
  if (typeof window.shezwApplyGlobalPrefixToGraph === "function") window.shezwApplyGlobalPrefixToGraph();
  const workflowId = `${widgetValue(storyNode, "workflow_id", "ltx-director-pro") || "ltx-director-pro"}`.trim();
  const struct = getAllowedStruct(storyNode);
  const nodes = [];
  for (const node of app?.graph?._nodes || []) {
    const allowed = getAllowedWidgets(struct, node);
    if (!allowed.size) continue;
    const widgets = {};
    for (const widget of node.widgets || []) {
      if (allowed.has(widget.name)) widgets[widget.name] = widget.value;
    }
    if (Object.keys(widgets).length) {
      nodes.push({
        id: String(node.id),
        type: node.type,
        title: node.title || "",
        widgets,
      });
    }
  }
  return {
    schema: "ltx-director-pro.story-script.v1",
    workflow_id: workflowId,
    global_prefix: getGlobalPrefix(),
    created_at: new Date().toISOString(),
    ss_struct: struct,
    nodes,
  };
}

function applyStoryScript(story, storyNode) {
  const nodeList = app?.graph?._nodes || [];
  const byId = new Map(nodeList.map((node) => [String(node.id), node]));
  for (const entry of story.nodes || []) {
    let node = byId.get(String(entry.id));
    if (!node) {
      node = nodeList.find((candidate) => candidate.type === entry.type && (!entry.title || candidate.title === entry.title));
    }
    if (!node) continue;
    for (const [name, value] of Object.entries(entry.widgets || {})) {
      setWidgetValue(node, name, value);
    }
  }
  if (story.global_prefix) {
    const prefixNode = nodeList.find((node) => node.type === "ShezwGlobalPrefix");
    setWidgetValue(prefixNode, "global_prefix", story.global_prefix);
  }
  setWidgetValue(storyNode, "story_script", JSON.stringify(story, null, 2));
  if (typeof window.shezwApplyGlobalPrefixToGraph === "function") window.shezwApplyGlobalPrefixToGraph();
  app.graph?.setDirtyCanvas(true, true);
}

function storyFilename(storyNode, story) {
  const raw = `${widgetValue(storyNode, "script_name", "") || story?.workflow_id || "story"}`.trim() || "story";
  if (raw.endsWith("-ss.json")) return raw;
  return `${raw.replace(/\.json$/i, "")}-ss.json`;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function saveStoryScript(storyNode, exportDir = "") {
  const story = collectStoryScript(storyNode);
  const filename = storyFilename(storyNode, story);
  setWidgetValue(storyNode, "story_script", JSON.stringify(story, null, 2));
  const resp = await api.fetchApi("/shezw/story_script/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename,
      export_dir: exportDir,
      story_script: story,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) throw new Error(data.error || "Story script save failed");
  return data;
}

app.registerExtension({
  name: "Shezw.StoryScript",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "ShezwStoryScript") return;
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
      const node = this;

      const wrap = document.createElement("div");
      Object.assign(wrap.style, { display: "flex", gap: "6px", flexWrap: "wrap", width: "100%" });
      const status = document.createElement("div");
      Object.assign(status.style, { width: "100%", color: "#aaa", fontSize: "11px" });
      status.textContent = "Story Script";

      const makeButton = (label) => {
        const btn = document.createElement("button");
        btn.textContent = label;
        Object.assign(btn.style, {
          border: "1px solid #444",
          background: "#222",
          color: "#eee",
          borderRadius: "4px",
          padding: "5px 9px",
          cursor: "pointer",
          fontSize: "11px",
        });
        return btn;
      };

      const importBtn = makeButton("Import");
      const storeBtn = makeButton("Store");
      const exportBtn = makeButton("Export");
      wrap.append(importBtn, storeBtn, exportBtn, status);

      importBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            const story = JSON.parse(await file.text());
            applyStoryScript(story, node);
            setWidgetValue(node, "script_name", file.name);
            status.textContent = `Imported ${file.name}`;
          } catch (err) {
            console.error("[Shezw StoryScript] import failed", err);
            status.textContent = `Import failed: ${err.message || err}`;
          }
        });
        input.click();
      });

      storeBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        storeBtn.disabled = true;
        try {
          const data = await saveStoryScript(node, "");
          status.textContent = `Stored ${data.filename}`;
        } catch (err) {
          console.error("[Shezw StoryScript] store failed", err);
          status.textContent = `Store failed: ${err.message || err}`;
        } finally {
          storeBtn.disabled = false;
        }
      });

      exportBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        exportBtn.disabled = true;
        try {
          const story = collectStoryScript(node);
          const filename = storyFilename(node, story);
          const exportDir = `${widgetValue(node, "export_dir", "") || ""}`.trim();
          if (exportDir) {
            const data = await saveStoryScript(node, exportDir);
            status.textContent = `Exported ${data.filename}`;
          } else {
            setWidgetValue(node, "story_script", JSON.stringify(story, null, 2));
            downloadJson(filename, story);
            status.textContent = `Downloaded ${filename}`;
          }
        } catch (err) {
          console.error("[Shezw StoryScript] export failed", err);
          status.textContent = `Export failed: ${err.message || err}`;
        } finally {
          exportBtn.disabled = false;
        }
      });

      setTimeout(() => {
        const domWidget = node.addDOMWidget("story_script_tools", "div", wrap, { serialize: false });
        domWidget.computeSize = () => [340, 60];
        if (node.size[0] < 420) node.size[0] = 420;
        app.graph?.setDirtyCanvas(true, true);
      }, 50);
      return r;
    };
  },
});
