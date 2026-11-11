// Todo card component — renders a single todo card with version history
// Called by requirements.js and todos.js pages

const TodoCard = {
    STATUS_MAP: {
        not_started: '未开始',
        in_progress: '进行中',
        blocked: '已阻塞',
        completed: '已完成',
        cancelled: '已取消',
    },

    STATUS_ORDER: {
        in_progress: 0,
        blocked: 1,
        not_started: 2,
        completed: 3,
        cancelled: 4,
    },

    STATE: {},
    /** Store card state keyed by todoId */
    _state(todoId) {
        if (!this.STATE[todoId]) {
            this.STATE[todoId] = { expanded: false, versions: [], loading: true, error: null };
        }
        return this.STATE[todoId];
    },

    /**
     * Render a single todo card (without version history — loaded async)
     * @param {object} todo - Todo item from API
     * @param {object} [options] - Render options
     * @param {boolean} [options.showProject=true] - Whether to show project name
     * @returns {string} HTML string
     */
    renderCard(todo, options = {}) {
        const showProject = options.showProject !== false;
        const status = todo.status;
        const statusLabel = this.STATUS_MAP[status] || status;
        const badgeClass = `badge-${status.replace(/_/g, '-')}`;
        const isCompleted = status === 'completed' || status === 'cancelled';
        const cardClass = isCompleted ? 'todo-card item-completed' : 'todo-card';
        const titleClass = isCompleted ? 'todo-card-title item-title' : 'todo-card-title';
        const projectId = todo.project ? todo.project.id : '';
        const projectName = todo.project ? todo.project.name : '';
        const projectColor = todo.project && todo.project.color ? todo.project.color : '';
        const projectStyle = projectColor ? ` style="background:${projectColor}20;color:${projectColor}"` : '';
        const updatedAt = todo.updated_at || todo.created_at;
        const createdAt = todo.created_at;

        const tags = (todo.tags || []).map(t =>
            `<span class="tag-pill" style="background:${t.color || '#e5e7eb'}20;color:${t.color || '#6b7280'}">${t.tag_name}</span>`
        ).join('');

        const dueAt = todo.due_at
            ? `<div class="todo-card-meta"><span class="todo-card-meta-item"><i class="fas fa-clock mr-1"></i>截止 ${new Date(todo.due_at).toLocaleDateString()}</span></div>`
            : '';

        return `
            <div class="${cardClass}" data-testid="todo-card" data-todo-id="${todo.id}" data-status="${status}" data-updated-at="${updatedAt}" data-project-id="${projectId}">
                <div class="todo-card-header">
                    <div class="todo-card-header-left">
                        <span class="todo-card-status ${badgeClass}">${statusLabel}</span>
                        ${(showProject && projectName) ? `<span class="todo-card-project"${projectStyle}>${projectName}</span>` : ''}
                    </div>
                    <span class="todo-card-dates">更新 ${new Date(updatedAt).toLocaleDateString()} · 创建 ${new Date(createdAt).toLocaleDateString()}</span>
                </div>
                <h3 class="${titleClass}">${todo.title}</h3>
                ${tags ? `<div class="todo-card-tags">${tags}</div>` : ''}
                ${dueAt}
                <div class="todo-card-divider"></div>
                <div class="todo-card-history" data-testid="version-list" data-loaded="false">
                    <div class="version-loading">加载历史...</div>
                </div>
            </div>
        `;
    },

    /**
     * Load versions for a single todo card and update its history section
     * @param {string} todoId
     */
    async loadVersions(todoId) {
        const state = this._state(todoId);
        const listEl = document.querySelector(`[data-todo-id="${todoId}"] [data-testid="version-list"]`);
        if (!listEl) return;

        state.loading = true;
        state.error = null;
        listEl.innerHTML = '<div class="version-loading">加载历史...</div>';

        try {
            const versions = await API.get(`/todos/${todoId}/versions?order=desc&limit=5`);
            state.versions = Array.isArray(versions) ? versions : [];
            state.loading = false;
            this._renderHistory(todoId, listEl);
        } catch (e) {
            state.loading = false;
            state.error = e.message || '加载失败';
            listEl.innerHTML = `
                <div class="version-error">
                    <span>历史加载失败</span>
                    <button class="version-retry" onclick="TodoCard.loadVersions('${todoId}')">重试</button>
                </div>
            `;
        }
    },

    _renderHistory(todoId, listEl) {
        const state = this._state(todoId);
        const allVersions = state.versions;
        const maxShow = state.expanded ? allVersions.length : Math.min(5, allVersions.length);
        const hasMore = allVersions.length > 5;

        let html = '';
        if (allVersions.length === 0) {
            html = '<div class="version-empty">暂无历史</div>';
        } else {
            for (let i = 0; i < maxShow; i++) {
                const v = allVersions[i];
                const vnum = allVersions.length - i;
                const date = v.created_at ? new Date(v.created_at).toLocaleDateString() : '';
                html += `
                    <div class="version-item" data-testid="version-item" data-version-number="${vnum}">
                        <span class="version-num">v${vnum}</span>
                        <span class="version-summary">${v.comment || '—'}</span>
                        <span class="version-date">${date}</span>
                    </div>
                `;
            }
        }

        if (hasMore) {
            const remaining = allVersions.length - 5;
            const label = state.expanded ? '收起 ▴' : `还有 ${remaining} 条 ▾`;
            html += `
                <button class="version-expand" data-testid="version-expand" data-expanded="${state.expanded}" onclick="TodoCard.toggleExpand('${todoId}')">
                    ${label}
                </button>
            `;
        }

        listEl.innerHTML = html;
        listEl.setAttribute('data-loaded', 'true');
    },

    toggleExpand(todoId) {
        const state = this._state(todoId);
        state.expanded = !state.expanded;
        const listEl = document.querySelector(`[data-todo-id="${todoId}"] [data-testid="version-list"]`);
        if (!listEl) return;

        if (state.expanded && state.versions.length > 5) {
            // Fetch all versions
            listEl.innerHTML = '<div class="version-loading">加载全部历史...</div>';
            API.get(`/todos/${todoId}/versions?order=desc&limit=200`).then(versions => {
                state.versions = Array.isArray(versions) ? versions : [];
                this._renderHistory(todoId, listEl);
            }).catch(() => {
                this._renderHistory(todoId, listEl);
            });
        } else {
            this._renderHistory(todoId, listEl);
        }
    },
};
