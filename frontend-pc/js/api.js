// API utility — fetch wrapper with JWT auth

const API = {
    baseUrl: '/api',

    getToken() {
        return localStorage.getItem('token');
    },

    setToken(token) {
        localStorage.setItem('token', token);
    },

    clearToken() {
        localStorage.removeItem('token');
    },

    async request(path, options = {}) {
        const url = this.baseUrl + path;
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        const token = this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url, { ...options, headers });

        if (res.status === 401) {
            this.clearToken();
            App.showLogin();
            throw new Error('Unauthorized');
        }

        const data = await res.json();
        if (data.code !== 0) throw new Error(data.message || 'API error');
        return data.data;
    },

    get(path) {
        return this.request(path);
    },

    post(path, body) {
        return this.request(path, { method: 'POST', body: JSON.stringify(body) });
    },
};
