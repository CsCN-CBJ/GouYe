// Login page

const LoginPage = {
    init() {
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');
            errorEl.classList.add('hidden');

            try {
                const data = await API.post('/users/login', { username, password });
                API.setToken(data.token);
                App.showApp();
                Router.navigate('#/requirements');
            } catch (err) {
                errorEl.textContent = err.message || '登录失败';
                errorEl.classList.remove('hidden');
            }
        });
    },
};
