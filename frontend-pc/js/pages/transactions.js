// Transactions page

const TransactionsPage = {
    filters: { type: '', category_id: '', tag_id: '', start_date: '', end_date: '' },
    categories: [],
    tags: [],

    async render() {
        // Default to current month
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        this.filters.start_date = `${y}-${m}-01`;
        this.filters.end_date = `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`;

        const content = document.getElementById('page-content');
        content.innerHTML = `
            <div class="mb-6">
                <h2 class="text-2xl font-bold mb-4">记账</h2>
                <div id="tx-summary" class="grid grid-cols-2 gap-4 mb-4"></div>
                <div class="filter-bar mb-4">
                    <input type="month" id="tx-filter-month" value="${y}-${m}">
                    <select id="tx-filter-category"><option value="">全部分类</option></select>
                    <select id="tx-filter-tag"><option value="">全部标签</option></select>
                </div>
            </div>
            <div id="tx-list" class="space-y-3">
                <div class="flex justify-center py-12"><div class="spinner"></div></div>
            </div>
            <div id="tx-pagination" class="flex justify-center gap-2 mt-6"></div>
        `;
        await this._loadFilters();
        this._bindEvents();
        await this._loadData();
    },

    async _loadFilters() {
        try {
            const [categories, tags] = await Promise.all([
                API.get('/categories'),
                API.get('/tags'),
            ]);
            this.categories = categories || [];
            this.tags = tags || [];

            const catSelect = document.getElementById('tx-filter-category');
            this.categories.forEach(c => {
                const typeLabel = c.category_type === 'income' ? '收' : '支';
                catSelect.innerHTML += `<option value="${c.category_id}">[${typeLabel}] ${this._escapeHtml(c.category_name || '')}</option>`;
            });

            const tagSelect = document.getElementById('tx-filter-tag');
            this.tags.forEach(t => {
                tagSelect.innerHTML += `<option value="${t.tag_id}">${this._escapeHtml(t.tag_name || '')}</option>`;
            });
        } catch (e) { /* filters optional */ }
    },

    _bindEvents() {
        document.getElementById('tx-filter-month').addEventListener('change', (e) => {
            const [y, m] = e.target.value.split('-');
            this.filters.start_date = `${y}-${m}-01`;
            this.filters.end_date = `${y}-${m}-${new Date(Number(y), Number(m), 0).getDate()}`;
            this._loadData();
        });
        document.getElementById('tx-filter-category').addEventListener('change', (e) => {
            this.filters.category_id = e.target.value;
            this._loadData();
        });
        document.getElementById('tx-filter-tag').addEventListener('change', (e) => {
            this.filters.tag_id = e.target.value;
            this._loadData();
        });
    },

    async _loadData() {
        const list = document.getElementById('tx-list');
        const summaryEl = document.getElementById('tx-summary');

        // Build query
        let query = `?start_date=${this.filters.start_date}&end_date=${this.filters.end_date}&per_page=100`;
        if (this.filters.category_id) query += `&category_id=${this.filters.category_id}`;
        if (this.filters.tag_id) query += `&tag_id=${this.filters.tag_id}`;

        try {
            const data = await API.get('/transactions' + query);
            const items = data.items || [];

            // Calculate summary from displayed items
            let totalIncome = 0, totalExpense = 0;
            items.forEach(t => {
                const amt = Number(t.amount);
                if (t.transaction_type === 'income') totalIncome += amt;
                else totalExpense += amt;
            });

            // Render summary
            summaryEl.innerHTML = `
                <div class="bg-green-50 rounded-lg p-4">
                    <p class="text-sm text-green-600">收入</p>
                    <p class="text-xl font-bold text-green-700">${totalIncome.toFixed(2)}</p>
                </div>
                <div class="bg-red-50 rounded-lg p-4">
                    <p class="text-sm text-red-600">支出</p>
                    <p class="text-xl font-bold text-red-700">${totalExpense.toFixed(2)}</p>
                </div>
            `;

            // Render list
            if (items.length === 0) {
                list.innerHTML = '<p class="text-gray-400 text-center py-12">暂无数据</p>';
                return;
            }
            list.innerHTML = items.map(t => this._renderCard(t)).join('');
        } catch (e) {
            list.innerHTML = `<p class="text-red-500 text-center py-12">${e.message}</p>`;
        }
    },

    _escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    },

    _withAlpha(color, alphaHex = '22') {
        if (typeof color !== 'string') return null;
        if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alphaHex}`;
        return null;
    },

    _getPillStyle(color) {
        const textColor = color || '#4b5563';
        const backgroundColor = this._withAlpha(color) || '#f3f4f6';
        return `background:${backgroundColor};color:${textColor}`;
    },

    _renderCard(tx) {
        const isIncome = tx.transaction_type === 'income';
        const amountColor = isIncome ? 'text-green-600' : 'text-red-600';
        const amountPrefix = isIncome ? '+' : '-';
        const category = this._escapeHtml(tx.category?.category_name || '未分类');
        const description = this._escapeHtml(tx.description || '无备注');
        const categoryStyle = this._getPillStyle(tx.category?.color || null);
        const tags = (tx.tags || []).map(t =>
            `<span class="tag-pill" style="${this._getPillStyle(t.color || null)}">${this._escapeHtml(t.tag_name || '')}</span>`
        ).join('');

        return `
            <div class="card bg-white rounded-lg border p-4">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs px-2 py-0.5 rounded" style="${categoryStyle}">${category}</span>
                            <span class="text-xs text-gray-400">${new Date(tx.transaction_date).toLocaleDateString()}</span>
                        </div>
                        <p class="text-gray-700 truncate">${description}</p>
                        ${tags ? `<div class="mt-1 flex flex-wrap gap-1">${tags}</div>` : ''}
                    </div>
                    <span class="font-semibold ${amountColor} whitespace-nowrap">${amountPrefix}${Number(tx.amount).toFixed(2)}</span>
                </div>
            </div>
        `;
    },
};
