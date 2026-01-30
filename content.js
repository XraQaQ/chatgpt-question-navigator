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
    const candidates = [];

    // 策略 A：常见可访问性标记（不同版本可能有）
    const a11ySelectors = [
      '[aria-label="You"]',
      '[aria-label="you"]',
      '[aria-label="User"]',
      '[aria-label="user"]',
      '[aria-label="你"]',
      '[data-author="user"]',
      '[data-sender="user"]'
    ];
    a11ySelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(n => {
        // 有些节点只是 label，不包含正文，尝试上探到更大的容器
        const container = n.closest('article, [role="article"], [role="listitem"], div');
        if (container) candidates.push(container);
      });
    });

    // 策略 B：在对话区域里找“更像用户输入”的块（启发式）
    // 重点：用户消息通常更短，且不包含“Gemini/模型”提示按钮区
    const possibleBubbles = Array.from(document.querySelectorAll('main *'))
      .filter(n => n instanceof HTMLElement)
      .filter(n => {
        const t = (n.innerText || "").trim();
        if (!t) return false;
        if (t.length < 2) return false;
        if (t.length > 800) return false; // 用户提问一般不至于超长（兜底）
        // 避免把页面菜单/按钮当作消息
        const tag = n.tagName.toLowerCase();
        if (["button", "input", "textarea", "nav"].includes(tag)) return false;
        return true;
      });

    // 进一步挑选“像消息”的容器：优先有换行/段落的块
    for (const n of possibleBubbles) {
      // 只收集较大的文本块（减少噪音）
      const t = n.innerText.trim();
      if (t.length < 10) continue;

      // Gemini 输出经常包含“复制/赞/踩/分享”等控件附近文本，尽量排除
      const badHints = ["复制", "Copy", "分享", "Share", "赞", "踩", "Regenerate", "重新生成"];
      if (badHints.some(h => t.includes(h))) continue;

      // 倾向选择块级容器（减少选到单个 span）
      const isBlockish = ["div", "article", "section", "mat-card"].includes(n.tagName.toLowerCase());
      if (!isBlockish) continue;

      candidates.push(n);
    }

    // 去重 + 过滤：只保留“看起来不像嵌套子节点”的（移除完全包含关系里更小的）
    const uniq = Array.from(new Set(candidates)).filter(n => n.innerText && n.innerText.trim().length > 0);

    // 移除被更大节点完全包住且文本相同的子节点，减少重复
    const cleaned = uniq.filter(n => {
      const t = n.innerText.trim();
      const parent = n.parentElement;
      if (!parent) return true;
      const pt = (parent.innerText || "").trim();
      return pt !== t; // 如果父节点文本完全相同，优先父节点，丢掉子节点
    });

    // 最后再限制到“主内容区”附近（如果能找到 main）
    const main = document.querySelector("main");
    return main ? cleaned.filter(n => main.contains(n)) : cleaned;
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
