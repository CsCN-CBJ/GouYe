// App initialization and auth guard

const App = {
    async init() {
        LoginPage.init();
        this._initSidebar();
        this._initRouter();

        // Check auth state — validate token with API, not just its existence
        if (API.getToken()) {
            try {
                await API.get('/users/me');
                this.showApp();
            } catch {
                API.clearToken();
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    },

    showLogin() {
        document.getElementById('login-page').classList.remove('hidden');
        document.getElementById('app-layout').classList.add('hidden');
    },

    showApp() {
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('app-layout').classList.remove('hidden');
        Router.start();
    },

    _initSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const toggle = document.getElementById('menu-toggle');

        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('-translate-x-full');
            overlay.classList.toggle('hidden');
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        });

        // Close sidebar on nav click (mobile)
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth < 1024) {
                    sidebar.classList.add('-translate-x-full');
                    overlay.classList.add('hidden');
                }
            });
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            API.clearToken();
            this.showLogin();
        });
    },

    _initRouter() {
        const titleMap = {
            '#/requirements': '需求',
            '#/todos': 'TODO',
            '#/transactions': '记账',
            '#/checkins': '打卡',
        };

        const renderPage = (page, title) => {
            // Update active nav
            document.querySelectorAll('.nav-link').forEach(el => {
                el.classList.toggle('active', el.getAttribute('href') === window.location.hash);
            });
            // Update mobile title
            document.getElementById('mobile-title').textContent = title;
            // Render page
            page.render();
        };

        Router.register('#/requirements', () => renderPage(RequirementsPage, '需求'));
        Router.register('#/todos', () => renderPage(TodosPage, 'TODO'));
        Router.register('#/transactions', () => renderPage(TransactionsPage, '记账'));
        Router.register('#/checkins', () => renderPage(CheckinsPage, '打卡'));
        Router.register('#/login', () => this.showLogin());
    },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
