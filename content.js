(() => {
  const PANEL_ID = "cqn-panel";
  const HANDLE_ID = "cqn-handle";

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    });
    children.forEach(c => node.appendChild(c));
    return node;
  }

  function createUI() {
    if (document.getElementById(PANEL_ID)) return;

    const handle = el("div", { id: HANDLE_ID, text: "问题目录" });
    handle.addEventListener("click", () => {
      const panel = document.getElementById(PANEL_ID);
      panel.classList.remove("cqn-hidden");
      handle.classList.add("cqn-hidden");
    });
    document.body.appendChild(handle);

    const panel = el("div", { id: PANEL_ID, class: "cqn-hidden" });

    const header = el("div", { id: "cqn-header" }, [
      el("div", { id: "cqn-title", text: "问题目录（你的提问）" }),
      el("button", { id: "cqn-toggle", type: "button", text: "隐藏" })
    ]);

    const search = el("input", {
      id: "cqn-search",
      type: "text",
      placeholder: "搜索问题关键词…"
    });

    const list = el("div", { id: "cqn-list" });

    panel.appendChild(header);
    panel.appendChild(search);
    panel.appendChild(list);
    document.body.appendChild(panel);

    header.querySelector("#cqn-toggle").addEventListener("click", () => {
      panel.classList.add("cqn-hidden");
      handle.classList.remove("cqn-hidden");
    });

    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      list.querySelectorAll(".cqn-item").forEach(item => {
        const txt = item.getAttribute("data-text") || "";
        item.style.display = txt.includes(q) ? "" : "none";
      });
    });
  }

  // ---------- Site detection ----------
  function site() {
    const h = location.hostname;
    if (h === "chatgpt.com") return "chatgpt";
    if (h === "gemini.google.com") return "gemini";
    return "unknown";
  }

  // ---------- Find user messages (ChatGPT) ----------
  function findUserMessageNodesChatGPT() {
    const nodes = [];
    document.querySelectorAll('[data-message-author-role="user"]').forEach(n => nodes.push(n));
    return Array.from(new Set(nodes)).filter(n => n.innerText && n.innerText.trim().length > 0);
  }

  // ---------- Find user messages (Gemini) ----------
  // Gemini 的 DOM 结构会变，下面用“多策略兜底”：
  // 1) 优先找带明显 “You/你” 的消息容器（aria/label）
  // 2) 再找看起来像“对话气泡”的块，过滤掉模型输出
  function findUserMessageNodesGemini() {
  const main = document.querySelector("main") || document.body;

  // ----- A) 优先策略：有“编辑/Edit”按钮就用它定位用户气泡 -----
  const editBtns = Array.from(
    main.querySelectorAll(
      "button[aria-label*='Edit'],button[aria-label*='edit'],button[aria-label*='编辑']"
    )
  );

  const byEdit = [];
  for (const btn of editBtns) {
    const container = btn.closest("[role='listitem'], article, section, div");
    if (!container) continue;

    // 如果这个块里有 Like/Dislike，通常是模型回复块，不要
    const hasFeedback = container.querySelector(
      "button[aria-label*='Like'],button[aria-label*='Dislike'],button[aria-label*='赞'],button[aria-label*='踩']"
    );
    if (hasFeedback) continue;

    const txt = (container.innerText || "").trim();
    if (!txt) continue;

    byEdit.push(container);
  }

  if (byEdit.length) {
    return Array.from(new Set(byEdit));
  }

  // ----- B) fallback：没有编辑按钮时 -----
  // 1) 先找“模型回复块”：它们通常带 Like/Dislike/复制 等操作按钮
  const feedbackButtons = Array.from(
    main.querySelectorAll(
      "button[aria-label*='Like'],button[aria-label*='Dislike'],button[aria-label*='赞'],button[aria-label*='踩'],button[aria-label*='Copy'],button[aria-label*='复制']"
    )
  );

  const assistantBlocks = new Set();
  for (const b of feedbackButtons) {
    const block = b.closest("[role='listitem'], article, section, div");
    if (block) assistantBlocks.add(block);
  }

  // 2) 在 main 内找“像用户气泡”的短文本块：短、独立、且不在 assistantBlocks 内
  const candidates = Array.from(main.querySelectorAll("div, p, span"))
    .filter((n) => n instanceof HTMLElement)
    .filter((n) => !n.closest("nav, aside, header, footer, [role='navigation']"));

  const userNodes = candidates.filter((n) => {
    const t = (n.innerText || "").trim();
    if (!t) return false;

    // 排除免责声明
    if (t.includes("Gemini can make mistakes") || t.includes("double-check")) return false;

    // 用户消息通常比较短（你截图就是一个短 pill）
    if (t.length < 2 || t.length > 250) return false;

    // 避免抓到大容器：如果包含很多子元素/按钮/链接，通常不是气泡本体
    if (n.querySelectorAll("button").length >= 2) return false;
    if (n.querySelectorAll("a[href]").length >= 1) return false;

    // 不能在模型回复块里面
    for (const ab of assistantBlocks) {
      if (ab.contains(n)) return false;
    }

    // 尽量取“更接近叶子”的节点，减少重复
    const parent = n.parentElement;
    if (parent) {
      const pt = (parent.innerText || "").trim();
      if (pt === t && parent.querySelectorAll("div, p, span").length <= 3) {
        return false;
      }
    }

    return true;
  });

  // 3) 去重
  return Array.from(new Set(userNodes));
}





  function findUserMessageNodes() {
    const s = site();
    if (s === "chatgpt") return findUserMessageNodesChatGPT();
    if (s === "gemini") return findUserMessageNodesGemini();
    return [];
  }

  // ---------- Anchors + rendering ----------
  function ensureAnchors(nodes) {
    nodes.forEach((node, idx) => {
      if (!node.dataset.cqnId) {
        node.dataset.cqnId = `cqn-user-${Date.now()}-${idx}`;
      }
    });
  }

  function getQuestionTextFromNode(node) {
    const raw = (node.innerText || "").trim().replace(/\s+\n/g, "\n");
    if (!raw) return "";
    const firstLine = raw.split("\n").map(s => s.trim()).filter(Boolean)[0] || raw;
    const short = firstLine.length > 120 ? firstLine.slice(0, 120) + "…" : firstLine;
    return short;
  }

  function renderList() {
    const list = document.getElementById("cqn-list");
    if (!list) return;

    const nodes = findUserMessageNodes();
    ensureAnchors(nodes);

    const items = nodes
      .map((node, i) => ({
        id: node.dataset.cqnId,
        node,
        text: getQuestionTextFromNode(node),
        index: i + 1
      }))
      .filter(x => x.text);

    list.innerHTML = "";

    items.forEach(item => {
      const div = el("div", { class: "cqn-item" });
      div.setAttribute("data-id", item.id);
      div.setAttribute("data-text", item.text.toLowerCase());
      div.appendChild(el("div", { text: item.text }));
      div.appendChild(el("div", { class: "cqn-meta", text: `#${item.index}` }));

      div.addEventListener("click", () => {
        document.querySelectorAll(".cqn-highlight").forEach(n => n.classList.remove("cqn-highlight"));
        item.node.scrollIntoView({ behavior: "smooth", block: "center" });
        item.node.classList.add("cqn-highlight");
        setTimeout(() => item.node.classList.remove("cqn-highlight"), 1800);
      });

      list.appendChild(div);
    });
  }

  function observeConversation() {
    const obs = new MutationObserver(() => {
      window.clearTimeout(window.__cqnT);
      window.__cqnT = window.setTimeout(renderList, 250);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    createUI();

    // 默认：不挡文字，先隐藏面板，只显示小按钮（你如果想默认展开就互换两行）
    document.getElementById(PANEL_ID).classList.add("cqn-hidden");
    document.getElementById(HANDLE_ID).classList.remove("cqn-hidden");

    renderList();
    observeConversation();
  }

  const start = () => init();
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(start, 500);
  } else {
    window.addEventListener("DOMContentLoaded", () => setTimeout(start, 500));
  }
})();
