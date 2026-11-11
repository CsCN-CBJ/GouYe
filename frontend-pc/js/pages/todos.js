// TODO page (domain=life)

const TodosPage = {
    filters: { statuses: ['not_started', 'in_progress', 'blocked'], project_id: '', tag_id: '' },
    groupBy: 'status',
    projects: [],
    tags: [],
    colors: ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'],

    STATUS_ORDER_MAP: { in_progress: 0, blocked: 1, not_started: 2, completed: 3, cancelled: 4 },
    STATUS_LABELS: { in_progress: '进行中', blocked: '已阻塞', not_started: '未开始', completed: '已完成', cancelled: '已取消' },

    async render() {
        const content = document.getElementById('page-content');
        this.groupBy = GroupToggle.getValue('gouye:todos:groupBy', 'status');

        content.innerHTML = `
            <div class="mb-6">
                <h2 class="text-2xl font-bold mb-4">TODO</h2>
                <div id="todo-group-toggle-container" class="mb-3"></div>
                <div id="todo-filter-container" class="mb-4"></div>
                <div class="filter-bar mb-4">
                    <select id="todo-filter-project"><option value="">全部项目</option></select>
                    <select id="todo-filter-tag"><option value="">全部标签</option></select>
                </div>
            </div>
            <div id="todo-list">
                <div class="flex justify-center py-12"><div class="spinner"></div></div>
            </div>
        `;

        // Render group toggle
        GroupToggle.render({
            container: document.getElementById('todo-group-toggle-container'),
            storageKey: 'gouye:todos:groupBy',
            defaultValue: 'status',
            onChange: (value) => {
                this.groupBy = value;
                this._loadData();
            },
        });

        // Render multi-select filter
        MultiSelectFilter.render({
            container: document.getElementById('todo-filter-container'),
            selected: this.filters.statuses,
            onChange: (statuses) => {
                this.filters.statuses = statuses.length > 0 ? statuses : ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled'];
                this._loadData();
            },
        });

        await this._loadFilters();
        this._bindEvents();
        await this._loadData();
    },

    async _loadFilters() {
        try {
            const [projects, tags] = await Promise.all([
                API.get('/projects'),
                API.get('/tags'),
            ]);
            this.projects = projects || [];
            this.tags = tags || [];

            const projSelect = document.getElementById('todo-filter-project');
            this.projects.forEach(p => {
                if (p.domain === 'life') {
                    projSelect.innerHTML += `<option value="${p.project_id}">${p.name}</option>`;
                }
            });

            const tagSelect = document.getElementById('todo-filter-tag');
            this.tags.forEach(t => {
                tagSelect.innerHTML += `<option value="${t.tag_id}">${t.tag_name}</option>`;
            });
        } catch (e) { /* filters optional */ }
    },

    _bindEvents() {
        document.getElementById('todo-filter-project').addEventListener('change', (e) => {
            this.filters.project_id = e.target.value;
            this._loadData();
        });
        document.getElementById('todo-filter-tag').addEventListener('change', (e) => {
            this.filters.tag_id = e.target.value;
            this._loadData();
        });
    },

    /** Sort todos: by status priority, then updated_at desc */
    _sortByStatusPriority(todos) {
        return todos.slice().sort((a, b) => {
            const orderA = this.STATUS_ORDER_MAP[a.status] ?? 99;
            const orderB = this.STATUS_ORDER_MAP[b.status] ?? 99;
            if (orderA !== orderB) return orderA - orderB;
            return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
        });
    },

    _sortByUpdatedAt(todos) {
        return todos.slice().sort((a, b) => {
            return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
        });
    },

    /** Group by status with fixed order */
    _groupByStatus(todos) {
        const groups = {};
        const statusOrder = ['in_progress', 'blocked', 'not_started', 'completed', 'cancelled'];
        statusOrder.forEach(s => { groups[s] = []; });

        todos.forEach(t => {
            if (groups[t.status]) {
                groups[t.status].push(t);
            }
        });

        // Sort each group by updated_at desc
        Object.keys(groups).forEach(s => {
            groups[s] = this._sortByUpdatedAt(groups[s]);
        });

        // Filter out empty groups
        return statusOrder.filter(s => groups[s].length > 0).map(s => [s, groups[s]]);
    },

    /** Group by project with sorting rules per design doc */
    _groupByProject(todos) {
        const NONE_KEY = '__none__';
        const groups = {};
        todos.forEach(t => {
            const key = t.project ? t.project.id + '::' + t.project.name : NONE_KEY;
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        });

        // Sort items within each group by updated_at desc
        Object.keys(groups).forEach(key => {
            groups[key] = this._sortByUpdatedAt(groups[key]);
        });

        // Sort groups: by latest updated_at desc, "未归类" last
        const withLatest = Object.entries(groups).map(([key, items]) => {
            const latest = Math.max(...items.map(t => new Date(t.updated_at || t.created_at).getTime()));
            return { key, items, latest };
        });
        withLatest.sort((a, b) => {
            if (a.key === NONE_KEY) return 1;
            if (b.key === NONE_KEY) return -1;
            return b.latest - a.latest;
        });

        return withLatest.map(g => [g.key, g.items]);
    },

    _renderGroupHeader(key, count, colorIndex, isUncategorized, project) {
        const color = (project && project.color) ? project.color : this.colors[colorIndex % this.colors.length];
        const displayName = isUncategorized ? '未归类' : key.split('::')[1] || key;
        return `
            <div class="group-header">
                <span class="color-bar" style="background:${color}"></span>
                <span class="group-name">${displayName}</span>
                <span class="group-count">(${count})</span>
            </div>
        `;
    },

    _renderStatusGroupHeader(status, count) {
        const label = this.STATUS_LABELS[status] || status;
        return `
            <div class="group-header status-group-header">
                <span class="group-name">${label}</span>
                <span class="group-count">(${count})</span>
            </div>
        `;
    },

    async _loadData() {
        const list = document.getElementById('todo-list');
        let query = '?domain=life';
        if (this.filters.project_id) query += `&project_id=${this.filters.project_id}`;
        if (this.filters.tag_id) query += `&tag_id=${this.filters.tag_id}`;

        try {
            const data = await API.get('/todos' + query);
            let todos = Array.isArray(data) ? data : (data.items || []);

            // Filter by selected statuses
            const sel = this.filters.statuses;
            todos = todos.filter(t => sel.includes(t.status));

            if (todos.length === 0) {
                list.innerHTML = '<p class="text-gray-400 text-center py-12">暂无数据</p>';
                return;
            }

            let html = '';
            if (this.groupBy === 'status') {
                const groups = this._groupByStatus(todos);
                groups.forEach(([status, items]) => {
                    html += '<div class="group-section" data-testid="group-section" data-group-type="status" data-group-key="' + status + '">';
                    html += this._renderStatusGroupHeader(status, items.length);
                    html += '<div class="todo-grid">';
                    items.forEach(t => { html += TodoCard.renderCard(t, { showProject: this.groupBy !== 'project' }); });
                    html += '</div>';
                    html += '</div>';
                });
            } else {
                const groups = this._groupByProject(todos);
                groups.forEach(([key, items], idx) => {
                    const isUncategorized = key === '__none__';
                    const groupKey = isUncategorized ? '__none__' : key.split('::')[0];
                    html += '<div class="group-section" data-testid="group-section" data-group-type="project" data-group-key="' + groupKey + '">';
                    html += this._renderGroupHeader(key, items.length, idx, isUncategorized, items[0].project);
                    html += '<div class="todo-grid">';
                    items.forEach(t => { html += TodoCard.renderCard(t, { showProject: this.groupBy !== 'project' }); });
                    html += '</div>';
                    html += '</div>';
                });
            }
            list.innerHTML = html;

            // Load versions for all cards in parallel
            const cardIds = todos.map(t => t.id);
            await Promise.allSettled(cardIds.map(id => TodoCard.loadVersions(id)));
        } catch (e) {
            list.innerHTML = `<p class="text-red-500 text-center py-12">${e.message}</p>`;
        }
    },
};
