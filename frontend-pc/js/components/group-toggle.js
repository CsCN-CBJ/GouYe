// Group toggle component - segmented control for "按状态" / "按项目"
// Persists selection to localStorage

const GroupToggle = {
    /**
     * Render the group toggle component into a container element
     * @param {object} options
     * @param {HTMLElement} options.container - Parent element
     * @param {string} options.storageKey - localStorage key e.g. "gouye:requirements:groupBy"
     * @param {string} [options.defaultValue='status'] - Default group mode
     * @param {Function} options.onChange - Called with new value ('status' | 'project')
     */
    render({ container, storageKey, defaultValue = 'status', onChange }) {
        const current = localStorage.getItem(storageKey) || defaultValue;

        container.innerHTML = `
            <div class="group-toggle-segmented" data-testid="group-toggle" data-active="${current}">
                <button class="group-toggle-btn" data-value="status">按状态</button>
                <button class="group-toggle-btn" data-value="project">按项目</button>
            </div>
        `;

        const btns = container.querySelectorAll('.group-toggle-btn');
        const updateActive = (value) => {
            btns.forEach(b => b.classList.toggle('active', b.dataset.value === value));
            const root = container.querySelector('[data-testid="group-toggle"]');
            root.setAttribute('data-active', value);
            localStorage.setItem(storageKey, value);
            if (onChange) onChange(value);
        };

        // Set initial active state
        updateActive(current);

        btns.forEach(b => {
            b.addEventListener('click', () => updateActive(b.dataset.value));
        });
    },

    getValue(storageKey, defaultValue = 'status') {
        return localStorage.getItem(storageKey) || defaultValue;
    },
};
