const config = window.PAGE_CONFIG || {};
const tagDefinitions = [
  { id: "private_training", label: "私教" },
  { id: "group_class", label: "团课" },
  { id: "equipment", label: "器械" },
  { id: "environment", label: "环境" },
  { id: "atmosphere", label: "氛围" },
  { id: "front_desk", label: "前台服务" },
  { id: "shower", label: "淋浴更衣" },
  { id: "training_effect", label: "训练效果" },
];
const tagLabels = Object.fromEntries(tagDefinitions.map((tag) => [tag.id, tag.label]));
const copiedStorageKey = "comment-center-copied-v1";
let activeTags = new Set();
let shuffleOffset = 0;

function boot() {
  document.querySelectorAll("[data-config]").forEach((node) => {
    const key = node.dataset.config;
    node.textContent = config[key] || node.textContent;
  });

  document.querySelectorAll(".js-copy").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = config[button.dataset.copyConfig] || "";
      await copyText(value);
      const original = button.textContent;
      button.textContent = "已复制";
      setTimeout(() => {
        button.textContent = original;
      }, 1200);
    });
  });

  const wifiQr = document.querySelector("#wifiQr");
  if (wifiQr) {
    renderQr(
      wifiQr,
      `WIFI:T:WPA;S:${escapeWifi(config.wifiSsid || "")};P:${escapeWifi(config.wifiPassword || "")};;`,
    );
  }

  const entryQr = document.querySelector("#entryQr");
  if (entryQr) {
    const entryUrl = config.entryUrl || new URL("./", location.href).href;
    document.querySelector("#entryUrl").textContent = entryUrl;
    renderQr(entryQr, entryUrl);
    document.querySelector("#fileWarning")?.classList.toggle("show", location.protocol === "file:");
  }

  const tagGrid = document.querySelector("#tagGrid");
  if (tagGrid) {
    renderTags();
    renderComments();
    document.querySelector("#shuffleButton").addEventListener("click", () => {
      shuffleOffset += 1;
      renderComments();
    });
    document.querySelector("#resetCopiedButton").addEventListener("click", () => {
      localStorage.removeItem(copiedStorageKey);
      renderComments();
    });
  }
}

function renderQr(container, value) {
  if (typeof qrcode !== "function") {
    container.innerHTML = '<p class="qr-fallback">二维码库未加载，请检查 qrcode.js 是否已上传。</p>';
    return;
  }
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  container.innerHTML = qr.createSvgTag({ cellSize: 7, margin: 2, scalable: true });
}

function escapeWifi(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(":", "\\:");
}

function renderTags() {
  const tagGrid = document.querySelector("#tagGrid");
  tagGrid.innerHTML = "";
  tagDefinitions.forEach((tag) => {
    const button = document.createElement("button");
    button.className = "tag-button";
    button.type = "button";
    button.textContent = tag.label;
    button.setAttribute("aria-pressed", activeTags.has(tag.id) ? "true" : "false");
    if (activeTags.has(tag.id)) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      if (activeTags.has(tag.id)) {
        activeTags.delete(tag.id);
      } else {
        activeTags.add(tag.id);
      }
      shuffleOffset = 0;
      renderTags();
      renderComments();
    });
    tagGrid.appendChild(button);
  });
}

function renderComments() {
  const allComments = Array.isArray(window.COMMENT_BANK) ? window.COMMENT_BANK : [];
  const selectedTags = [...activeTags];
  const copiedIds = getCopiedIds();
  const bucket = currentRotationBucket();
  const currentSlot = currentTimeSlot();
  const perView = Number(config.commentsPerView || 6);
  const rotationHours = Number(config.rotationHours || 6);
  const commentGrid = document.querySelector("#commentGrid");
  const emptyState = document.querySelector("#emptyState");
  const notice = document.querySelector("#notice");
  const poolInfo = document.querySelector("#poolInfo");
  const rotationInfo = document.querySelector("#rotationInfo");

  const visiblePool = allComments.filter((comment) => !copiedIds.has(comment.id));
  let filtered = visiblePool.filter((comment) => matchesTags(comment, selectedTags));
  const timeMatched = filtered.filter((comment) => comment.timeSlot === currentSlot);
  if (timeMatched.length >= perView) {
    filtered = timeMatched;
  }

  const seed = `${bucket}:${currentSlot}:${selectedTags.join(",")}:${shuffleOffset}`;
  const selected = seededShuffle(filtered, seed).slice(0, perView);
  const nextRefresh = new Date((bucket + 1) * rotationHours * 60 * 60 * 1000);

  rotationInfo.textContent = `当前推荐：${timeSlotLabel(currentSlot)}体验`;
  poolInfo.textContent = `${formatTime(nextRefresh)} 左右自动换新`;
  notice.classList.remove("show");
  if (copiedIds.size > 0) {
    notice.textContent = `已复制的草稿已为你临时收起，避免重复选择。`;
    notice.classList.add("show");
  }

  commentGrid.innerHTML = "";
  emptyState.classList.toggle("show", selected.length === 0);
  selected.forEach((comment) => {
    const card = document.createElement("article");
    card.className = "comment-card";
    card.innerHTML = `
      <div>
        <p class="comment-text">${escapeHtml(comment.text)}</p>
        <div class="chip-row">${comment.tags
          .map((tag) => `<span class="chip">${escapeHtml(tagLabels[tag] || tag)}</span>`)
          .join("")}</div>
      </div>
      <button class="btn teal copy-comment" type="button">复制草稿</button>
    `;
    card.querySelector(".copy-comment").addEventListener("click", async () => {
      await copyText(comment.text);
      markCopied(comment.id);
      notice.textContent = "已复制。即将打开抖音门店页，发布前可以再调整一下。";
      notice.classList.add("show");
      renderComments();
      window.setTimeout(openDouyinPoi, 350);
    });
    commentGrid.appendChild(card);
  });
}

function openDouyinPoi() {
  if (!config.douyinPoiUrl) {
    return;
  }
  window.location.href = config.douyinPoiUrl;
}

function matchesTags(comment, selectedTags) {
  if (selectedTags.length === 0) {
    return true;
  }
  return selectedTags.every((tag) => comment.tags.includes(tag));
}

function currentRotationBucket() {
  const rotationHours = Number(config.rotationHours || 6);
  return Math.floor(Date.now() / (rotationHours * 60 * 60 * 1000));
}

function currentTimeSlot() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "noon";
  if (hour >= 15 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function timeSlotLabel(slot) {
  return {
    morning: "早训",
    noon: "午间",
    afternoon: "下午",
    evening: "晚高峰",
    night: "夜训",
  }[slot] || "当前时段";
}

function formatTime(date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function seededShuffle(items, seedText) {
  const itemsWithScore = items.map((item) => ({
    item,
    score: hashString(`${seedText}:${item.id}`),
  }));
  itemsWithScore.sort((a, b) => a.score - b.score);
  return itemsWithScore.map((entry) => entry.item);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getCopiedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(copiedStorageKey) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function markCopied(commentId) {
  const copiedIds = getCopiedIds();
  copiedIds.add(commentId);
  localStorage.setItem(copiedStorageKey, JSON.stringify([...copiedIds]));
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      // Fall back for browsers that block clipboard on non-HTTPS LAN pages.
    }
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();
  document.execCommand("copy");
  input.remove();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

boot();
