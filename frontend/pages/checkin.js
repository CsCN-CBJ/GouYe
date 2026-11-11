// 打卡页面逻辑

let checkins = [];
let tags = [];
let editingCheckinId = null;
let selectedTagIds = new Set();

const checkinCategoryIcons = {
    sport: "🏃", reading: "📚", health: "💊", work: "💼",
    learning: "🎓", life: "🏠", other: "📋"
};

const checkinCategoryNames = {
    sport: "运动", reading: "阅读", health: "健康", work: "工作",
    learning: "学习", life: "生活", other: "其他"
};

// ========== 加载数据 ==========

async function loadCheckins() {
    const params = new URLSearchParams();
    const category = document.getElementById("filterCategory").value;
    const tagId = document.getElementById("filterTag").value;

    if (category) params.append("category", category);
    if (tagId) params.append("tag_id", tagId);

    const data = await request(`/checkins?${params.toString()}`);
    document.getElementById("skeleton").style.display = "none";
    const container = document.getElementById("checkinList");

    if (!data || !data.data || data.data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-check text-4xl text-gray-200 mb-4"></i>
                <p class="text-sm">暂无打卡记录</p>
                <p class="text-xs text-gray-300 mt-1">点击右下角 + 新建</p>
            </div>`;
        return;
    }

    checkins = data.data;
    let html = '<div class="space-y-3">';
    checkins.forEach((c) => {
        html += renderCheckinItem(c);
    });
    html += "</div>";
    container.innerHTML = html;
}

async function loadTags() {
    const data = await request("/tags");
    if (data && data.data) {
        tags = data.data;
        populateTagSelects();
    }
}

// ========== 渲染 ==========

function renderCheckinItem(checkin) {
    const cat = checkin.category || "other";
    const icon = checkinCategoryIcons[cat] || "📋";
    const catName = checkinCategoryNames[cat] || "其他";

    let tagsHtml = "";
    if (checkin.tags && checkin.tags.length > 0) {
        checkin.tags.forEach((tag) => {
            tagsHtml += `<span class="tag tag-neutral">#${escapeHtml(tag.tag_name)}</span>`;
        });
    }

    let payloadPreview = "";
    if (checkin.payload && Object.keys(checkin.payload).length > 0) {
        const p = checkin.payload;
        const parts = [];
        if (p.duration !== undefined) parts.push(`${p.duration}${p.duration_unit || "分钟"}`);
        if (p.distance !== undefined) parts.push(`${p.distance}${p.distance_unit || "km"}`);
        if (p.value !== undefined) parts.push(`${p.value}`);
        if (parts.length > 0) payloadPreview = `<span class="text-xs text-gray-400 ml-2">${parts.join(" / ")}</span>`;
    }

    return `
        <div class="checkin-item" data-id="${checkin.id}">
            <div class="flex items-start gap-3">
                <div class="checkin-icon ${cat}">${icon}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <span class="checkin-title">${escapeHtml(checkin.title)}</span>
                            ${payloadPreview}
                        </div>
                        <div class="checkin-actions">
                            <button class="checkin-action-btn" onclick="event.stopPropagation(); openCheckinModal(${checkin.id})">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="checkin-action-btn" onclick="event.stopPropagation(); deleteCheckin(${checkin.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="checkin-time">
                        <span class="category-badge category-${cat}">${catName}</span>
                        <span class="ml-2">${formatDateTime(checkin.occurred_at)}</span>
                    </div>
                    <div class="checkin-tags">${tagsHtml}</div>
                </div>
            </div>
        </div>`;
}

function formatDateTime(dt) {
    const d = new Date(dt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((target - today) / 86400000);

    let dayLabel = "";
    if (diff === 0) dayLabel = "今天";
    else if (diff === 1) dayLabel = "明天";
    else if (diff === -1) dayLabel = "昨天";
    else dayLabel = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${dayLabel} ${time}`;
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ========== 筛选控件 ==========

function populateTagSelects() {
    const filterSelect = document.getElementById("filterTag");
    let filterHtml = '<option value="">全部标签</option>';
    tags.forEach((t) => {
        filterHtml += `<option value="${t.tag_id}">${escapeHtml(t.tag_name)}</option>`;
    });
    const current = filterSelect.value;
    filterSelect.innerHTML = filterHtml;
    filterSelect.value = current;

    // Modal tag chips
    const container = document.getElementById("checkinTagSelector");
    container.innerHTML = tags
        .map((t) => {
            const selected = selectedTagIds.has(t.tag_id) ? "selected" : "";
            return `<span class="tag-chip ${selected}" data-id="${t.tag_id}" onclick="toggleTagChip(this)">${escapeHtml(t.tag_name)}</span>`;
        })
        .join("");
}

function toggleTagChip(el) {
    const id = parseInt(el.dataset.id);
    if (selectedTagIds.has(id)) {
        selectedTagIds.delete(id);
        el.classList.remove("selected");
    } else {
        selectedTagIds.add(id);
        el.classList.add("selected");
    }
}

// ========== 弹窗 ==========

function openCheckinModal(checkinId) {
    editingCheckinId = checkinId || null;
    selectedTagIds.clear();

    const title = document.getElementById("checkinModalTitle");
    const saveBtn = document.getElementById("saveCheckinBtn");

    title.textContent = editingCheckinId ? "编辑打卡" : "新建打卡";
    saveBtn.textContent = editingCheckinId ? "保存" : "创建";

    if (editingCheckinId) {
        const checkin = checkins.find((c) => c.id === editingCheckinId);
        if (checkin) {
            document.getElementById("checkinTitle").value = checkin.title || "";
            document.getElementById("checkinCategory").value = checkin.category || "other";
            document.getElementById("checkinOccurredAt").value = checkin.occurred_at ? checkin.occurred_at.slice(0, 16) : "";
            document.getElementById("checkinPayload").value = JSON.stringify(checkin.payload || {}, null, 2);
            if (checkin.tags) {
                checkin.tags.forEach((t) => selectedTagIds.add(t.tag_id));
            }
        }
    } else {
        document.getElementById("checkinTitle").value = "";
        document.getElementById("checkinCategory").value = "sport";
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById("checkinOccurredAt").value = now.toISOString().slice(0, 16);
        document.getElementById("checkinPayload").value = "{}";
    }

    populateTagSelects();
    openModal("checkinModal");
}

function closeCheckinModal() {
    closeModal("checkinModal", () => {
        editingCheckinId = null;
        selectedTagIds.clear();
    });
}

// ========== CRUD ==========

async function saveCheckin() {
    const title = document.getElementById("checkinTitle").value.trim();
    if (!title) {
        showToast("请输入标题");
        return;
    }

    const btn = document.getElementById("saveCheckinBtn");
    btn.disabled = true;

    let payload = {};
    try {
        payload = JSON.parse(document.getElementById("checkinPayload").value || "{}");
    } catch (e) {
        showToast("详情 JSON 格式错误");
        btn.disabled = false;
        return;
    }

    let occurredAt = document.getElementById("checkinOccurredAt").value;
    if (occurredAt && !/(Z|[+-]\d{2}:?\d{2})$/.test(occurredAt)) {
        occurredAt += '+08:00';
    }

    const body = {
        title,
        category: document.getElementById("checkinCategory").value,
        occurred_at: occurredAt,
        tag_ids: Array.from(selectedTagIds),
        payload,
    };

    let data;
    if (editingCheckinId) {
        data = await request(`/checkins/${editingCheckinId}`, {
            method: "PUT",
            body: JSON.stringify(body),
        });
    } else {
        data = await request("/checkins", {
            method: "POST",
            body: JSON.stringify(body),
        });
    }

    btn.disabled = false;

    if (data && (data.code === 200 || data.code === 201)) {
        showToast(editingCheckinId ? "保存成功" : "创建成功");
        closeCheckinModal();
        await loadCheckins();
    } else if (data) {
        showToast(data.message || "操作失败");
    }
}

async function deleteCheckin(id) {
    if (!confirm("确定删除这条打卡记录吗？")) return;
    const data = await request(`/checkins/${id}`, { method: "DELETE" });
    if (data && data.code === 200) {
        showToast("删除成功");
        await loadCheckins();
    } else if (data) {
        showToast(data.message || "删除失败");
    }
}

// ========== AI Modal ==========

function openAIModal() {
    openModal("aiModal");
}

function closeAIModal() {
    closeModal("aiModal");
}

// ========== Proposal 事件 ==========

document.addEventListener("ai-proposal", (e) => {
    closeAIModal();
    document.getElementById("proposalCard").show(e.detail);
});

document.addEventListener("ai-error", () => {
    closeAIModal();
    setTimeout(() => openCheckinModal(), 300);
});

document.addEventListener("proposal-confirmed", () => {
    loadCheckins();
});

document.addEventListener("proposal-manual", (e) => {
    const kind = e.detail?.kind;
    if (kind === "todo") {
        location.href = "/pages/todo.html";
    } else {
        openCheckinModal();
    }
});

// ========== 事件绑定 ==========

document.getElementById("toggleFilterBtn").addEventListener("click", () => {
    const bar = document.getElementById("filterBar");
    bar.classList.toggle("hidden");
});

document.getElementById("filterCategory").addEventListener("change", loadCheckins);
document.getElementById("filterTag").addEventListener("change", loadCheckins);

document.getElementById("checkinModalOverlay").addEventListener("click", closeCheckinModal);
document.getElementById("saveCheckinBtn").addEventListener("click", saveCheckin);

document.getElementById("checkinTitle").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveCheckin();
});

// ========== 初始化 ==========

if (!state.token) {
    document.getElementById("skeleton").style.display = "none";
    document.getElementById("checkinList").innerHTML = `
        <div class="empty-state">
            <i class="fas fa-user-lock text-4xl text-gray-200 mb-4"></i>
            <p class="text-sm">请先登录</p>
        </div>`;
} else {
    loadCheckins();
    loadTags();
}
