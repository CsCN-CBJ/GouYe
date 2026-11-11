// Checkins (打卡) page

const CheckinsPage = {
    filters: { template_id: '', tag_id: '', start_date: '', end_date: '' },
    templates: [],
    tags: [],

    async render() {
        const content = document.getElementById('page-content');
        content.innerHTML = `
            <div class="mb-6">
                <h2 class="text-2xl font-bold mb-4">打卡</h2>
                <div class="filter-bar mb-4">
                    <select id="ck-filter-template"><option value="">全部模板</option></select>
                    <select id="ck-filter-tag"><option value="">全部标签</option></select>
                    <input type="date" id="ck-filter-start" placeholder="开始日期">
                    <input type="date" id="ck-filter-end" placeholder="结束日期">
                </div>
            </div>
            <div id="ck-list" class="space-y-3">
                <div class="flex justify-center py-12"><div class="spinner"></div></div>
            </div>
        `;
        await this._loadFilters();
        this._bindEvents();
        await this._loadData();
    },

    async _loadFilters() {
        try {
            const [templates, tags] = await Promise.all([
                API.get('/checkin-templates'),
                API.get('/tags')
            ]);
            this.templates = templates || [];
            this.tags = tags || [];
            const select = document.getElementById('ck-filter-template');
            this.templates.forEach(t => {
                select.innerHTML += `<option value="${t.id}">${this._escapeHtml(t.icon || '')} ${this._escapeHtml(t.name || '')}</option>`;
            });
            const tagSelect = document.getElementById('ck-filter-tag');
            this.tags.forEach(t => {
                tagSelect.innerHTML += `<option value="${t.tag_id}">${this._escapeHtml(t.tag_name || '')}</option>`;
            });
        } catch (e) { /* optional */ }
    },

    _bindEvents() {
        document.getElementById('ck-filter-template').addEventListener('change', (e) => {
            this.filters.template_id = e.target.value;
            this._loadData();
        });
        document.getElementById('ck-filter-tag').addEventListener('change', (e) => {
            this.filters.tag_id = e.target.value;
            this._loadData();
        });
        document.getElementById('ck-filter-start').addEventListener('change', (e) => {
            this.filters.start_date = e.target.value;
            this._loadData();
        });
        document.getElementById('ck-filter-end').addEventListener('change', (e) => {
            this.filters.end_date = e.target.value;
            this._loadData();
        });
    },

    async _loadData() {
        const list = document.getElementById('ck-list');
        let query = '';
        const params = [];
        if (this.filters.template_id) params.push(`template_id=${this.filters.template_id}`);
        if (params.length) query = '?' + params.join('&');

        try {
            let checkins = await API.get('/checkins' + query);
            checkins = Array.isArray(checkins) ? checkins : [];

            // Client-side date filtering
            if (this.filters.start_date) {
                const start = new Date(this.filters.start_date + 'T00:00:00');
                checkins = checkins.filter(c => new Date(c.occurred_at) >= start);
            }
            if (this.filters.end_date) {
                const end = new Date(this.filters.end_date + 'T23:59:59');
                checkins = checkins.filter(c => new Date(c.occurred_at) <= end);
            }

            // Client-side tag filtering
            if (this.filters.tag_id) {
                checkins = checkins.filter(c =>
                    (c.tags || []).some(t => String(t.id ?? t.tag_id) === String(this.filters.tag_id))
                );
            }

            if (checkins.length === 0) {
                list.innerHTML = '<p class="text-gray-400 text-center py-12">暂无数据</p>';
                return;
            }

            // Group by template
            const groups = this._groupByTemplate(checkins);
            list.innerHTML = groups.map((g, i) => this._renderGroup(g, i)).join('');
            this._bindGroupMore();
        } catch (e) {
            list.innerHTML = `<p class="text-red-500 text-center py-12">${e.message}</p>`;
        }
    },

    _groupByTemplate(checkins) {
        const map = {};
        checkins.forEach(c => {
            const key = c.template ? c.template.id : '__none__';
            if (!map[key]) {
                map[key] = { template: c.template, items: [] };
            }
            map[key].items.push(c);
        });
        const groups = Object.values(map);
        // Sort groups alphabetically by template name
        groups.sort((a, b) => {
            const nameA = a.template?.name || 'zzz';
            const nameB = b.template?.name || 'zzz';
            return nameA.localeCompare(nameB, 'zh-CN');
        });
        // Sort items within each group by occurred_at descending
        groups.forEach(g => {
            g.items.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
        });
        return groups;
    },

    _renderGroup(group, index) {
        const colors = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
        const color = colors[index % colors.length];
        const template = group.template;
        const isNone = !template;
        const name = this._escapeHtml(template ? template.name : '未分类');
        const icon = template && template.icon ? this._safeIconName(template.icon) : '';
        const iconHtml = icon ? `<i class="fas fa-${icon}"></i> ` : '';
        const total = group.items.length;
        const show = group.items.slice(0, 5);
        const hidden = total - 5;

        const headerClass = isNone ? 'group-header uncategorized' : 'group-header';
        const cardsHtml = show.map(c => this._renderCard(c)).join('');
        const moreHtml = hidden > 0
            ? `<div class="group-more" data-group-id="${isNone ? '__none__' : template.id}" data-expanded="false">还有 ${hidden} 条</div>`
            : '';

        return `
            <div class="${headerClass}">
                <span class="color-bar" style="background: ${color}"></span>
                <span class="group-name">${iconHtml}${name}</span>
                <span class="group-count">(${total})</span>
            </div>
            ${cardsHtml}
            <div class="hidden-items" data-group-id="${isNone ? '__none__' : template.id}" style="display:none">
                ${group.items.slice(5).map(c => this._renderCard(c)).join('')}
            </div>
            ${moreHtml}
        `;
    },

    _bindGroupMore() {
        document.querySelectorAll('.group-more').forEach(el => {
            el.addEventListener('click', () => {
                const groupId = el.dataset.groupId;
                const expanded = el.dataset.expanded === 'true';
                const hiddenItems = document.querySelector(`.hidden-items[data-group-id="${groupId}"]`);
                if (expanded) {
                    hiddenItems.style.display = 'none';
                    el.dataset.expanded = 'false';
                    const count = hiddenItems.children.length;
                    el.textContent = `还有 ${count} 条`;
                } else {
                    hiddenItems.style.display = 'block';
                    el.dataset.expanded = 'true';
                    el.textContent = '收起';
                }
            });
        });
    },

    _escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    },

    _resolveOptionLabel(option, fallback) {
        if (option && typeof option === 'object') {
            return option.label || option.value || fallback;
        }
        return option ?? fallback;
    },

    _getTemplateFields(template) {
        const schema = template?.fields_schema ?? template?.fields;
        if (Array.isArray(schema)) return schema;
        if (schema && Array.isArray(schema.fields)) return schema.fields;
        return [];
    },

    _safeIconName(icon) {
        return typeof icon === 'string' && /^[a-z0-9-]+$/i.test(icon) ? icon : '';
    },

    _getFieldKey(field) {
        return field.name || field.key || '';
    },

    _getFieldLabel(field) {
        return field.label || field.name || field.key || '';
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

    _formatFieldValue(field, value) {
        if (value === undefined || value === null || value === '') return null;
        if (Array.isArray(value) && value.length === 0) return null;
        switch (field.type) {
            case 'number':
                if (Number.isNaN(Number(value))) return null;
                return field.unit ? `${value}${field.unit}` : `${value}`;
            case 'select':
                if (field.options && Array.isArray(field.options)) {
                    const opt = field.options.find(o => String((o && typeof o === 'object') ? o.value : o) === String(value));
                    return this._resolveOptionLabel(opt, value);
                }
                return value;
            case 'boolean':
                return value ? '✓' : '✗';
            case 'multi_select':
                if (Array.isArray(value) && field.options) {
                    return value.map(v => {
                        const opt = field.options.find(o => String((o && typeof o === 'object') ? o.value : o) === String(v));
                        return this._resolveOptionLabel(opt, v);
                    }).join(', ');
                }
                return Array.isArray(value) ? value.join(', ') : value;
            case 'rating':
                return `★${value}`;
            case 'array':
                return this._formatArrayValue(field, value);
            case 'text':
            default:
                return value;
        }
    },

    _formatArrayValue(field, value) {
        if (!Array.isArray(value)) return String(value);
        if (value.length === 0) return null;

        const items = value.map(item => {
            if (field.item_fields && Array.isArray(field.item_fields) && item && typeof item === 'object') {
                return field.item_fields.map(subField => {
                    const subKey = this._getFieldKey(subField);
                    if (!subKey) return null;
                    const subValue = item[subKey];
                    if (subValue === undefined || subValue === null) return null;
                    const subFormatted = this._formatFieldValue(subField, subValue);
                    if (subFormatted === null || subFormatted === '') return null;
                    const display = subField.type === 'array' ? `[${subFormatted}]` : subFormatted;
                    return `${this._getFieldLabel(subField)}:${display}`;
                }).filter(Boolean).join(', ');
            }
            return String(item);
        });

        const result = items.join(' / ');
        return result.length > 200 ? result.substring(0, 200) + '\u2026' : result;
    },

    _renderCard(checkin) {
        const date = new Date(checkin.occurred_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let payloadHtml = '';
        const template = checkin.template;
        if (checkin.payload && template) {
            const fields = this._getTemplateFields(template);
            const fieldHtmls = fields.map(field => {
                const key = this._getFieldKey(field);
                if (!key) return '';
                const value = checkin.payload[key];
                const formatted = this._formatFieldValue(field, value);
                if (formatted === null) return '';
                return `<span class="payload-field">${this._escapeHtml(this._getFieldLabel(field))}: ${this._escapeHtml(formatted)}</span>`;
            }).filter(Boolean);
            if (fieldHtmls.length) {
                payloadHtml = `<div class="payload-compact">${fieldHtmls.join('')}</div>`;
            }
        }

        const tags = (checkin.tags || []).map(t =>
            `<span class="tag-pill" style="${this._getPillStyle(t.color || null)}">${this._escapeHtml(t.name || t.tag_name || '')}</span>`
        ).join('');

        return `
            <div class="card bg-white rounded-lg border p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                        ${payloadHtml}
                        ${tags ? `<div class="flex flex-wrap gap-1 mt-1">${tags}</div>` : ''}
                    </div>
                    <span class="text-xs text-gray-400 whitespace-nowrap">${date}</span>
                </div>
            </div>
        `;
    },
};
