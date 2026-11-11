// 获取月度汇总
async function loadSummary() {
    const { startDate, endDate } = getMonthRange(state.currentYear, state.currentMonth);
    const data = await request(`/transactions/summary?start_date=${startDate}&end_date=${endDate}`);

    if (data && data.data) {
        const income = parseFloat(data.data.income);
        const expense = parseFloat(data.data.expense);
        document.getElementById("monthIncome").textContent =
            `+${income.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        document.getElementById("monthExpense").textContent =
            `-${expense.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    } else {
        document.getElementById("monthIncome").textContent = "+0";
        document.getElementById("monthExpense").textContent = "-0";
    }
}

// 渲染单条流水
function renderTransactionItem(item) {
    const icon = item.category ? getCategoryIcon(item.category.category_name) : "📋";
    const isIncome = item.transaction_type === "income";
    const bgClass = isIncome ? "bg-emerald-50" : "bg-gray-50";
    const amountColor = isIncome ? "text-emerald-500" : "text-gray-900";
    const amountText = formatAmount(item.amount, item.transaction_type);
    const dateText = formatDate(item.transaction_date);
    const name = item.description || (item.category ? item.category.category_name : "未分类");

    let tagsHtml = "";
    if (item.category) {
        const tagType = isIncome ? "tag-income" : "tag-expense";
        tagsHtml += `<span class="tag ${tagType}">#${item.category.category_name}</span>`;
    }
    if (item.tags && item.tags.length > 0) {
        item.tags.forEach((tag) => {
            tagsHtml += ` <span class="tag tag-neutral">#${tag.tag_name}</span>`;
        });
    }

    return `
        <div class="transaction-item flex items-start justify-between">
            <div class="flex items-center">
                <div class="w-11 h-11 ${bgClass} rounded-full flex items-center justify-center text-lg mr-4 shrink-0">${icon}</div>
                <div class="min-w-0">
                    <p class="font-bold text-gray-800 truncate">${name}</p>
                    <div class="flex flex-wrap gap-1 mt-1">${tagsHtml}</div>
                </div>
            </div>
            <div class="text-right shrink-0 ml-3">
                <p class="font-bold text-lg ${amountColor}">${amountText}</p>
                <p class="text-[10px] text-gray-400">${dateText}</p>
            </div>
        </div>`;
}

// 获取流水列表
async function loadTransactions() {
    const { startDate, endDate } = getMonthRange(state.currentYear, state.currentMonth);
    const data = await request(`/transactions?start_date=${startDate}&end_date=${endDate}&per_page=50`);

    document.getElementById("skeleton").style.display = "none";
    const container = document.getElementById("transactionList");

    if (!data || !data.data || data.data.items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-receipt text-4xl text-gray-200 mb-4"></i>
                <p class="text-sm">暂无流水记录</p>
                <p class="text-xs text-gray-300 mt-1">点击下方 + 开始记账</p>
            </div>`;
        return;
    }

    let html = '<div class="space-y-2">';
    data.data.items.forEach((item) => {
        html += renderTransactionItem(item);
    });
    html += "</div>";
    container.innerHTML = html;
}

// 更新月份标签
function updateMonthLabel() {
    document.getElementById("monthLabel").textContent =
        `${state.currentYear}年 ${state.currentMonth}月`;
}

// 加载页面数据
async function loadPage() {
    updateMonthLabel();
    if (!state.token) {
        document.getElementById("skeleton").style.display = "none";
        document.getElementById("monthIncome").textContent = "+0";
        document.getElementById("monthExpense").textContent = "-0";
        document.getElementById("transactionList").innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-lock text-4xl text-gray-200 mb-4"></i>
                <p class="text-sm">请先登录</p>
                <p class="text-xs text-gray-300 mt-1">登录后即可查看收支记录</p>
            </div>`;
        return;
    }
    await Promise.all([loadSummary(), loadTransactions()]);
}

// ========== 月份选择器 ==========

function openMonthModal() {
    state.selectedYear = state.currentYear;
    openModal("monthModal");
    renderMonthGrid();
}

function closeMonthModal() {
    closeModal("monthModal");
}

function renderMonthGrid() {
    const grid = document.getElementById("monthGrid");
    document.getElementById("yearLabel").textContent = `${state.selectedYear}年`;
    let html = "";
    for (let m = 1; m <= 12; m++) {
        const isActive = state.selectedYear === state.currentYear && m === state.currentMonth;
        const activeClass = isActive ? "bg-black text-white" : "bg-gray-50 text-gray-700 hover:bg-gray-100";
        html += `<button class="py-3 rounded-xl font-medium text-sm ${activeClass}" onclick="selectMonth(${m})">${m}月</button>`;
    }
    grid.innerHTML = html;
}

function selectMonth(m) {
    state.currentYear = state.selectedYear;
    state.currentMonth = m;
    closeMonthModal();
    document.getElementById("skeleton").style.display = "block";
    loadPage();
}

// ========== AI 输入弹窗 ==========

function openAIModal() {
    openModal("aiModal");
}

function closeAIModal() {
    closeModal("aiModal");
}

// Proposal 事件
document.addEventListener("ai-proposal", (e) => {
    closeAIModal();
    document.getElementById("proposalCard").show(e.detail);
});

document.addEventListener("ai-error", () => {
    closeAIModal();
});

document.addEventListener("proposal-manual", (e) => {
    const kind = e.detail?.kind;
    if (kind === "todo") {
        location.href = "/pages/todo.html";
    } else if (kind === "checkin") {
        location.href = "/pages/checkin.html";
    }
});

// ========== 事件绑定 ==========

document.getElementById("monthSelector").addEventListener("click", openMonthModal);
document.getElementById("monthModalOverlay").addEventListener("click", closeMonthModal);
document.getElementById("prevYear").addEventListener("click", () => {
    state.selectedYear--;
    renderMonthGrid();
});
document.getElementById("nextYear").addEventListener("click", () => {
    state.selectedYear++;
    renderMonthGrid();
});

// ========== 用户面板 ==========

let isLoginMode = true;

function openUserModal() {
    if (state.token) {
        showProfilePanel();
    } else {
        showAuthPanel();
    }
    openModal("userModal");
}

function closeUserModal() {
    closeModal("userModal", () => {
        document.getElementById("authUsername").value = "";
        document.getElementById("authPassword").value = "";
    });
}

function showAuthPanel() {
    document.getElementById("authPanel").classList.remove("hidden");
    document.getElementById("profilePanel").classList.add("hidden");
    document.getElementById("changePwdPanel").classList.add("hidden");
    isLoginMode = true;
    updateAuthUI();
}

function showProfilePanel() {
    document.getElementById("authPanel").classList.add("hidden");
    document.getElementById("profilePanel").classList.remove("hidden");
    document.getElementById("changePwdPanel").classList.add("hidden");
    loadProfile();
}

function updateAuthUI() {
    document.getElementById("authTitle").textContent = isLoginMode ? "登录" : "注册";
    document.getElementById("authSubmitBtn").textContent = isLoginMode ? "登录" : "注册";
    document.getElementById("authSwitchLink").textContent = isLoginMode ? "去注册" : "去登录";
    document.getElementById("authSwitch").innerHTML = isLoginMode
        ? '还没有账号？<span class="text-indigo-500 font-medium cursor-pointer" id="authSwitchLink">去注册</span>'
        : '已有账号？<span class="text-indigo-500 font-medium cursor-pointer" id="authSwitchLink">去登录</span>';
    document.getElementById("authSwitchLink").addEventListener("click", () => {
        isLoginMode = !isLoginMode;
        updateAuthUI();
    });
}

async function handleAuth() {
    const username = document.getElementById("authUsername").value.trim();
    const password = document.getElementById("authPassword").value.trim();

    if (!username || !password) {
        showToast("请输入用户名和密码");
        return;
    }

    const btn = document.getElementById("authSubmitBtn");
    btn.disabled = true;

    const endpoint = isLoginMode ? "/users/login" : "/users/register";
    const data = await request(endpoint, {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });

    btn.disabled = false;

    if (data && data.code === 200 || data && data.code === 201) {
        state.token = data.data.token;
        localStorage.setItem("token", data.data.token);
        showToast(isLoginMode ? "登录成功" : "注册成功");
        closeUserModal();
        loadPage();
    } else if (data) {
        showToast(data.message || "操作失败");
    }
}

async function loadProfile() {
    const data = await request("/users/profile");
    if (data && data.data) {
        document.getElementById("profileName").textContent = data.data.username;
    }
}

function handleLogout() {
    state.token = "";
    localStorage.removeItem("token");
    showToast("已退出登录");
    closeUserModal();
    loadPage();
}

async function handleChangePassword() {
    const newPwd = document.getElementById("newPassword").value.trim();
    const confirmPwd = document.getElementById("confirmPassword").value.trim();

    if (!newPwd) {
        showToast("请输入新密码");
        return;
    }
    if (newPwd !== confirmPwd) {
        showToast("两次密码不一致");
        return;
    }

    const btn = document.getElementById("savePwdBtn");
    btn.disabled = true;

    const data = await request("/users/profile", {
        method: "PUT",
        body: JSON.stringify({ password: newPwd }),
    });

    btn.disabled = false;

    if (data && data.code === 200) {
        showToast("密码修改成功");
        document.getElementById("newPassword").value = "";
        document.getElementById("confirmPassword").value = "";
        showProfilePanel();
    } else if (data) {
        showToast(data.message || "修改失败");
    }
}

// 用户面板事件绑定
document.getElementById("userModalOverlay").addEventListener("click", closeUserModal);
document.getElementById("closeUserModal").addEventListener("click", closeUserModal);
document.getElementById("closeUserModal2").addEventListener("click", closeUserModal);
document.getElementById("authSubmitBtn").addEventListener("click", handleAuth);
document.getElementById("authSwitchLink").addEventListener("click", () => {
    isLoginMode = !isLoginMode;
    updateAuthUI();
});
document.getElementById("logoutBtn").addEventListener("click", handleLogout);
document.getElementById("changePwdBtn").addEventListener("click", () => {
    document.getElementById("profilePanel").classList.add("hidden");
    document.getElementById("changePwdPanel").classList.remove("hidden");
});
document.getElementById("backToProfile").addEventListener("click", showProfilePanel);
document.getElementById("savePwdBtn").addEventListener("click", handleChangePassword);

// 回车提交登录/注册
document.getElementById("authPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAuth();
});

// ========== 初始化 ==========
loadPage();
