// TODO 页面逻辑

let todos = [];
let projects = [];
let tags = [];
let editingTodoId = null;
let selectedTagIds = new Set();

// ========== 加载数据 ==========

async function loadTodos() {
    const params = new URLSearchParams();
    const domain = document.getElementById("filterDomain").value;
    const status = document.getElementById("filterStatus").value;
    const projectId = document.getElementById("filterProject").value;
    const tagId = document.getElementById("filterTag").value;

    if (domain) params.append("domain", domain);
    if (status) params.append("status", status);
    if (projectId) params.append("project_id", projectId);
    if (tagId) params.append("tag_id", tagId);

    const data = await request(`/todos?${params.toString()}`);
    document.getElementById("skeleton").style.display = "none";
    const container = document.getElementById("todoList");

    if (!data || !data.data || data.data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-list text-4xl text-gray-200 mb-4"></i>
                <p class="text-sm">暂无 TODO</p>
                <p class="text-xs text-gray-300 mt-1">点击右下角 + 新建</p>
            </div>`;
        updateStats({ not_started: 0, in_progress: 0, blocked: 0, completed: 0, cancelled: 0 });
        return;
    }

    todos = data.data;
    updateStatsFromTodos(todos);

    let html = '<div class="space-y-3">';
    todos.forEach((todo) => {
        html += renderTodoItem(todo);
    });
    html += "</div>";
    container.innerHTML = html;
}

function updateStatsFromTodos(list) {
    const notStarted = list.filter((t) => t.status === "not_started").length;
    const inProgress = list.filter((t) => t.status === "in_progress").length;
    const blocked = list.filter((t) => t.status === "blocked").length;
    const completed = list.filter((t) => t.status === "completed").length;
    const cancelled = list.filter((t) => t.status === "cancelled").length;
    updateStats({ not_started: notStarted, in_progress: inProgress, blocked, completed, cancelled });
}

function updateStats({ not_started, in_progress, blocked, completed, cancelled }) {
    document.getElementById("statPending").textContent = not_started;
    document.getElementById("statInProgress").textContent = in_progress;
    document.getElementById("statBlocked").textContent = blocked;
    document.getElementById("statDone").textContent = completed;
    document.getElementById("statCancelled").textContent = cancelled;
}

async function loadProjects() {
    const domain = document.getElementById("filterDomain").value;
    const params = domain ? `?domain=${domain}` : "";
    const data = await request(`/projects${params}`);
    if (data && data.data) {
        projects = data.data;
        populateProjectSelects();
    }
}

async function loadTags() {
    const data = await request("/tags");
    if (data && data.data) {
        tags = data.data;
        populateTagSelects();
    }
}

// ========== 渲染 ==========

function renderTodoItem(todo) {
    const statusClass = todo.status === "not_started" ? "not-started" : todo.status === "completed" ? "completed" : todo.status === "cancelled" ? "cancelled" : todo.status === "in_progress" ? "in-progress" : todo.status === "blocked" ? "blocked" : "";
    const statusBtnClass = todo.status === "not_started" ? "not-started" : todo.status === "completed" ? "completed" : todo.status === "cancelled" ? "cancelled" : todo.status === "in_progress" ? "in-progress" : todo.status === "blocked" ? "blocked" : "";
    const statusIcon = todo.status === "completed" ? '<i class="fas fa-check text-[10px]"></i>' : todo.status === "cancelled" ? '<i class="fas fa-times text-[10px]"></i>' : todo.status === "blocked" ? '<i class="fas fa-exclamation text-[10px]"></i>' : todo.status === "in_progress" ? '<i class="fas fa-spinner fa-pulse text-[10px]"></i>' : "";

    const priorityDot = todo.payload?.priority
        ? `<span class="priority-dot priority-${todo.payload.priority}"></span>`
        : "";

    let metaParts = [];
    if (todo.due_at) {
        metaParts.push(`<span><i class="far fa-clock"></i>${formatDateTime(todo.due_at)}</span>`);
    }
    if (todo.project) {
        metaParts.push(`<span><i class="far fa-folder"></i>${todo.project.name}</span>`);
    }

    let tagsHtml = "";
    if (todo.tags && todo.tags.length > 0) {
        todo.tags.forEach((tag) => {
            tagsHtml += `<span class="tag tag-neutral">#${tag.tag_name}</span>`;
        });
    }

    return `
        <div class="todo-item ${statusClass}" data-id="${todo.id}">
            <div class="flex items-start gap-3">
                <div class="todo-status-btn ${statusBtnClass}" onclick="event.stopPropagation(); toggleTodoStatus(${todo.id}, '${todo.status}')">
                    ${statusIcon}
                </div>
                <div class="flex-1 min-w-0" onclick="openTodoModal(${todo.id})">
                    <div class="flex items-center">
                        ${priorityDot}
                        <span class="todo-title truncate">${escapeHtml(todo.title)}</span>
                    </div>
                    <div class="todo-meta flex flex-wrap gap-2 mt-1">${metaParts.join("")}</div>
                    <div class="flex flex-wrap gap-1 mt-1">${tagsHtml}</div>
                </div>
                <div class="todo-actions">
                    <button class="todo-action-btn" onclick="event.stopPropagation(); openTodoModal(${todo.id})">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="todo-action-btn" onclick="event.stopPropagation(); deleteTodo(${todo.id})">
                        <i class="fas fa-trash"></i>
                    </button>
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

function populateProjectSelects() {
    const filterSelect = document.getElementById("filterProject");
    const modalSelect = document.getElementById("todoProject");

    let filterHtml = '<option value="">全部项目</option>';
    let modalHtml = '<option value="">无项目</option>';

    projects.forEach((p) => {
        filterHtml += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
        modalHtml += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
    });

    const currentFilter = filterSelect.value;
    filterSelect.innerHTML = filterHtml;
    filterSelect.value = currentFilter;

    const currentModal = modalSelect.value;
    modalSelect.innerHTML = modalHtml;
    modalSelect.value = currentModal;
}

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
    const container = document.getElementById("todoTagSelector");
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

function openTodoModal(todoId) {
    editingTodoId = todoId || null;
    selectedTagIds.clear();

    const title = document.getElementById("todoModalTitle");
    const saveBtn = document.getElementById("saveTodoBtn");

    title.textContent = editingTodoId ? "编辑 TODO" : "新建 TODO";
    saveBtn.textContent = editingTodoId ? "保存" : "创建";

    if (editingTodoId) {
        const todo = todos.find((t) => t.id === editingTodoId);
        if (todo) {
            document.getElementById("todoTitle").value = todo.title || "";
            document.getElementById("todoDomain").value = todo.domain || "work";
            document.getElementById("todoStatus").value = todo.status || "not_started";
            document.getElementById("todoProject").value = todo.project_id || "";
            document.getElementById("todoDueAt").value = todo.due_at ? todo.due_at.slice(0, 16) : "";
            document.getElementById("todoPriority").value = todo.payload?.priority || "medium";
            if (todo.tags) {
                todo.tags.forEach((t) => selectedTagIds.add(t.tag_id));
            }
        }
    } else {
        document.getElementById("todoTitle").value = "";
        document.getElementById("todoDomain").value = "work";
        document.getElementById("todoStatus").value = "not_started";
        document.getElementById("todoProject").value = "";
        document.getElementById("todoDueAt").value = "";
        document.getElementById("todoPriority").value = "medium";
    }

    populateTagSelects();
    openModal("todoModal");
}

function closeTodoModal() {
    closeModal("todoModal", () => {
        editingTodoId = null;
        selectedTagIds.clear();
    });
}

// ========== CRUD ==========

async function saveTodo() {
    const title = document.getElementById("todoTitle").value.trim();
    if (!title) {
        showToast("请输入标题");
        return;
    }

    const btn = document.getElementById("saveTodoBtn");
    btn.disabled = true;

    let dueAt = document.getElementById("todoDueAt").value;
    if (dueAt && !/(Z|[+-]\d{2}:?\d{2})$/.test(dueAt)) {
        dueAt += '+08:00';
    }

    const payload = {
        title,
        domain: document.getElementById("todoDomain").value,
        status: document.getElementById("todoStatus").value,
        project_id: document.getElementById("todoProject").value || null,
        tag_ids: Array.from(selectedTagIds),
        due_at: dueAt || null,
        payload: { priority: document.getElementById("todoPriority").value },
    };

    let data;
    if (editingTodoId) {
        data = await request(`/todos/${editingTodoId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });
    } else {
        data = await request("/todos", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    btn.disabled = false;

    if (data && (data.code === 200 || data.code === 201)) {
        showToast(editingTodoId ? "保存成功" : "创建成功");
        closeTodoModal();
        await loadTodos();
    } else if (data) {
        showToast(data.message || "操作失败");
    }
}

async function deleteTodo(id) {
    if (!confirm("确定删除这条 TODO 吗？")) return;
    const data = await request(`/todos/${id}`, { method: "DELETE" });
    if (data && data.code === 200) {
        showToast("删除成功");
        await loadTodos();
    } else if (data) {
        showToast(data.message || "删除失败");
    }
}

async function toggleTodoStatus(id, currentStatus) {
    let newStatus;
    if (currentStatus === "not_started") newStatus = "in_progress";
    else if (currentStatus === "in_progress") newStatus = "completed";
    else if (currentStatus === "blocked") newStatus = "in_progress";
    else if (currentStatus === "completed") newStatus = "not_started";
    else if (currentStatus === "cancelled") {
        showToast("已取消的 TODO 无法切换状态");
        return;
    }

    const data = await request(`/todos/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: newStatus }),
    });

    if (data && data.code === 200) {
        await loadTodos();
    } else if (data) {
        showToast(data.message || "更新失败");
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
    // 保持 AI modal 打开或关闭，让用户选择
    closeAIModal();
    // fallback: 打开手动创建
    setTimeout(() => openTodoModal(), 300);
});

document.addEventListener("proposal-confirmed", () => {
    loadTodos();
});

document.addEventListener("proposal-manual", (e) => {
    const kind = e.detail?.kind;
    if (kind === "checkin") {
        location.href = "/pages/checkin.html";
    } else {
        openTodoModal();
    }
});

// ========== 事件绑定 ==========

document.getElementById("toggleFilterBtn").addEventListener("click", () => {
    const bar = document.getElementById("filterBar");
    bar.classList.toggle("hidden");
});

document.getElementById("filterDomain").addEventListener("change", () => {
    loadTodos();
    loadProjects();
});
document.getElementById("filterStatus").addEventListener("change", loadTodos);
document.getElementById("filterProject").addEventListener("change", loadTodos);
document.getElementById("filterTag").addEventListener("change", loadTodos);

document.getElementById("todoModalOverlay").addEventListener("click", closeTodoModal);
document.getElementById("saveTodoBtn").addEventListener("click", saveTodo);
document.getElementById("generateBtn").addEventListener("click", generateReport);

// 回车快捷保存
document.getElementById("todoTitle").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveTodo();
});

// ========== 周报功能 ==========

let reports = [];

function openReportListModal() {
    openModal("reportListModal");
    loadReports();
}

function closeReportListModal() {
    closeModal("reportListModal");
}

async function loadReports() {
    const data = await request("/ai/weekly-reports");
    const container = document.getElementById("reportList");

    if (!data || !data.data || data.data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file-alt text-4xl text-gray-200 mb-4"></i>
                <p class="text-sm">暂无周报记录</p>
                <p class="text-xs text-gray-300 mt-1">点击右上角按钮生成周报</p>
            </div>`;
        return;
    }

    reports = data.data;
    let html = '<div class="space-y-3">';
    reports.forEach((r) => {
        html += renderReportItem(r);
    });
    html += "</div>";
    container.innerHTML = html;
}

function renderReportItem(report) {
    const badgeClass = report.generated_by === "manual" ? "badge-manual" : "badge-scheduled";
    const badgeText = report.generated_by === "manual" ? "手动" : "定时";
    const date = new Date(report.created_at);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    return `
        <div class="report-item" onclick="openReportModal(${report.id})">
            <div class="flex justify-between items-start">
                <div class="flex-1 min-w-0">
                    <p class="report-title truncate">${escapeHtml(report.title)}</p>
                    <p class="report-meta">${dateStr}</p>
                </div>
                <span class="report-badge ${badgeClass} shrink-0 ml-3">${badgeText}</span>
            </div>
        </div>`;
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

async function generateReport() {
    const btn = document.getElementById("generateBtn");
    const stateEl = document.getElementById("generatingState");

    btn.disabled = true;
    stateEl.classList.remove("hidden");

    const data = await request("/ai/weekly-report", {
        method: "POST",
        body: JSON.stringify({}),
    });

    btn.disabled = false;
    stateEl.classList.add("hidden");

    if (data && (data.code === 200 || data.code === 201)) {
        showToast("周报生成成功");
        await loadReports();
        if (data.data) {
            openReportModal(data.data.id);
        }
    } else if (data) {
        showToast(data.message || "生成失败");
    }
}

function openReportModal(reportId) {
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;

    document.getElementById("reportModalTitle").textContent = report.title;
    document.getElementById("reportContent").innerHTML = renderMarkdown(report.content);

    const date = new Date(report.created_at);
    const by = report.generated_by === "manual" ? "手动生成" : "定时生成";
    document.getElementById("reportMeta").textContent = `${by} · ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    openModal("reportModal");
}

function closeReportModal() {
    closeModal("reportModal");
}

function renderMarkdown(md) {
    if (!md) return "";
    let html = md
        .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/^### (.*$)/gim, "<h3>$1</h3>")
        .replace(/^## (.*$)/gim, "<h2>$1</h2>")
        .replace(/^# (.*$)/gim, "<h1>$1</h1>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/~~(.*?)~~/g, "<del>$1</del>")
        .replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>")
        .replace(/^\- (.*$)/gim, "<ul><li>$1</li></ul>")
        .replace(/^\d+\. (.*$)/gim, "<ol><li>$1</li></ol>")
        .replace(/^---$/gim, "<hr>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n/g, "<br>");

    html = html.replace(/<\/ul>\s*<ul>/g, "");
    html = html.replace(/<\/ol>\s*<ol>/g, "");
    html = html.replace(/<\/blockquote>\s*<blockquote>/g, "\n");

    return `<p>${html}</p>`;
}

// ========== 初始化 ==========

if (!state.token) {
    document.getElementById("skeleton").style.display = "none";
    document.getElementById("todoList").innerHTML = `
        <div class="empty-state">
            <i class="fas fa-user-lock text-4xl text-gray-200 mb-4"></i>
            <p class="text-sm">请先登录</p>
        </div>`;
} else {
    loadTodos();
    loadProjects();
    loadTags();
}
