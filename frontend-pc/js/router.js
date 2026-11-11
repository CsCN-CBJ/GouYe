// Simple hash router

const Router = {
    routes: {},
    currentPage: null,

    register(hash, handler) {
        this.routes[hash] = handler;
    },

    navigate(hash) {
        window.location.hash = hash;
    },

    start() {
        window.addEventListener('hashchange', () => this._resolve());
        this._resolve();
    },

    _resolve() {
        const hash = window.location.hash || '#/requirements';
        const route = this.routes[hash];
        if (route) {
            this.currentPage = hash;
            route();
        } else {
            // Default to requirements
            window.location.hash = '#/requirements';
        }
    },
};
