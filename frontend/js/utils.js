const API_BASE = "/api";

// 全局状态
const state = {
    token: localStorage.getItem("token") || "",
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    selectedYear: new Date().getFullYear(),
};

// Toast 提示
function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2000);
}

// 统一请求
async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
    try {
        const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
        const data = await res.json();
        if (data.code === 401) {
            showToast("请先登录");
            return null;
        }
        return data;
    } catch (e) {
        showToast("网络错误，请稍后重试");
        return null;
    }
}

// 格式化金额
function formatAmount(amount, type) {
    const num = parseFloat(amount);
    const formatted = Math.abs(num).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return type === "income" ? `+${formatted}` : `-${formatted}`;
}

// 格式化日期
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (target.getTime() === today.getTime()) return "今天";
    if (target.getTime() === yesterday.getTime()) return "昨天";
    return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// 分类图标映射
const categoryIcons = {
    "工资": "💰", "兼职": "💼", "理财": "📈", "红包": "🧧",
    "餐饮": "🍜", "买菜": "🥩", "交通": "🚗", "购物": "🛒",
    "娱乐": "🎮", "住房": "🏠", "通讯": "📱", "医疗": "🏥",
    "教育": "📚", "旅行": "✈️", "运动": "🏃", "宠物": "🐱",
    "服饰": "👔", "美容": "💄", "社交": "🍻", "其他": "📋",
};

function getCategoryIcon(name) {
    for (const [key, icon] of Object.entries(categoryIcons)) {
        if (name.includes(key)) return icon;
    }
    return "📋";
}

// 获取当月日期范围
function getMonthRange(year, month) {
    const m = String(month).padStart(2, "0");
    const startDate = `${year}-${m}-01`;
    const endDate = `${year}-${m}-${new Date(year, month, 0).getDate()}`;
    return { startDate, endDate };
}

// ========== 统一 Modal 管理 ==========

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    const content = modal.querySelector(".modal-content");
    if (!modal || !content) return;

    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
        content.style.opacity = "1";
        content.style.transform = "translate(-50%, -50%) scale(1)";
    });
}

function closeModal(modalId, onAfterClose) {
    const modal = document.getElementById(modalId);
    const content = modal.querySelector(".modal-content");
    if (!modal || !content) return;

    content.style.opacity = "0";
    content.style.transform = "translate(-50%, -50%) scale(0.95)";
    setTimeout(() => {
        modal.classList.add("hidden");
        document.body.style.overflow = "";
        if (onAfterClose) onAfterClose();
    }, 300);
}
