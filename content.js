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

  const composer =
    document.querySelector("textarea") ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector('div[role="textbox"]');

  // 1) 更强的“模型回复块”识别：从反馈按钮往上找能包含正文的祖先
  const feedbackBtns = Array.from(
    main.querySelectorAll(
      "button[aria-label*='Like'],button[aria-label*='Dislike'],button[aria-label*='赞'],button[aria-label*='踩'],button[aria-label*='Copy'],button[aria-label*='复制']"
    )
  );

  function pickAssistantBlock(btn) {
    let cur = btn;
    for (let i = 0; i < 12 && cur; i++) {
      const el = cur instanceof HTMLElement ? cur : cur.parentElement;
      if (!el) break;

      const t = (el.innerText || "").trim();
      // 这几个条件的目的：祖先块要“像一条完整回复”，而不是按钮工具条
      const hasSomeText = t.length >= 20;
      const notTooHuge = t.length <= 8000;
      const hasNotOnlyUI = !/^(\s*(Like|Dislike|Copy|分享|复制|赞|踩|更多|More)\s*)+$/i.test(t);
      const containsBtn = el.querySelector("button") !== null;

      if (hasSomeText && notTooHuge && hasNotOnlyUI && containsBtn) {
        // 再确保它确实包含这个反馈按钮
        if (el.contains(btn)) return el;
      }
      cur = el.parentElement;
    }
    return btn.closest("[role='listitem'], article, section, div") || btn.parentElement;
  }

  const assistantBlocks = new Set();
  for (const b of feedbackBtns) {
    const block = pickAssistantBlock(b);
    if (block) assistantBlocks.add(block);
  }

  // 2) 限定搜索范围：尽量在“对话正文区域”里找，减少抓到 header / sidebar
  //    找一个同时包含：至少一个 assistantBlock 且靠近输入框 的容器
  let scope = null;
  const firstAssistant = assistantBlocks.values().next().value;

  if (firstAssistant) {
    let cur = firstAssistant;
    for (let i = 0; i < 10 && cur; i++) {
      const el = cur instanceof HTMLElement ? cur : cur.parentElement;
      if (!el) break;

      const hasAssistant = el.querySelector(
        "button[aria-label*='Like'],button[aria-label*='Dislike'],button[aria-label*='赞'],button[aria-label*='踩']"
      );
      const hasComposer = composer ? el.contains(composer) : true;

      // 选一个“像正文区”的：包含回复按钮、并且尽量不要把整个 header/sidebar 包进来
      if (hasAssistant && hasComposer) {
        scope






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
