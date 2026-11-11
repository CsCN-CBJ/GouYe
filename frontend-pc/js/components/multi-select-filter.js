// Multi-select status filter - chip group for 5 statuses
// Default selected: not_started + in_progress + blocked

const MultiSelectFilter = {
    STATUSES: [
        { key: 'in_progress', label: '进行中' },
        { key: 'blocked', label: '已阻塞' },
        { key: 'not_started', label: '未开始' },
        { key: 'completed', label: '已完成' },
        { key: 'cancelled', label: '已取消' },
    ],

    DEFAULT_SELECTED: ['not_started', 'in_progress', 'blocked'],

    /**
     * Render the multi-select filter into a container element
     * @param {object} options
     * @param {HTMLElement} options.container - Parent element
     * @param {string[]} [options.selected] - Initially selected statuses
     * @param {Function} options.onChange - Called with selected statuses array
     */
    render({ container, selected, onChange }) {
        const sel = selected || [...this.DEFAULT_SELECTED];

        const chips = this.STATUSES.map(s => {
            const checked = sel.includes(s.key);
            return `<button class="status-chip" data-testid="status-option" data-status="${s.key}" data-checked="${checked}">${s.label}</button>`;
        }).join('');

        container.innerHTML = `
            <div class="multi-select-filter" data-testid="status-filter" data-selected="${sel.join(',')}">
                ${chips}
            </div>
        `;

        const currentSelected = new Set(sel);

        container.querySelectorAll('.status-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const key = chip.dataset.status;
                if (currentSelected.has(key)) {
                    currentSelected.delete(key);
                } else {
                    currentSelected.add(key);
                }
                this._updateUI(container, currentSelected);
                if (onChange) onChange([...currentSelected]);
            });
        });

        this._updateUI(container, currentSelected);
    },

    _updateUI(container, selectedSet) {
        const arr = [...selectedSet];
        const root = container.querySelector('[data-testid="status-filter"]');
        root.setAttribute('data-selected', arr.join(','));

        container.querySelectorAll('.status-chip').forEach(chip => {
            const key = chip.dataset.status;
            const checked = selectedSet.has(key);
            chip.setAttribute('data-checked', checked);
            chip.classList.toggle('active', checked);
        });
    },

    /** Returns currently selected statuses from the DOM */
    getSelected(container) {
        const attr = container.querySelector('[data-testid="status-filter"]').getAttribute('data-selected');
        return attr ? attr.split(',') : [];
    },
};
