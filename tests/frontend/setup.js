// tests/frontend/setup.js
// Setup DOM environment for frontend tests using happy-dom
import { beforeEach } from 'vitest';
import { Window } from 'happy-dom';

beforeEach(() => {
    const window = new Window({ url: 'http://localhost/' });
    global.window = window;
    global.document = window.document;
    global.localStorage = window.localStorage;
    global.HTMLElement = window.HTMLElement;
    global.HTMLButtonElement = window.HTMLButtonElement;
    global.HTMLDivElement = window.HTMLDivElement;
    global.HTMLSelectElement = window.HTMLSelectElement;
    global.HTMLOptionElement = window.HTMLOptionElement;
    global.Event = window.Event;
    global.CustomEvent = window.CustomEvent;
    global.DOMParser = window.DOMParser;
    global.fetch = undefined; // Each test sets its own mock

    // Create app container
    document.body.innerHTML = '<div id="app"><div id="page-content"></div></div>';
});

// Helper: mock fetch
global.mockFetch = function(responses) {
    global.fetch = (url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        for (const [pattern, response] of Object.entries(responses)) {
            if (urlStr.includes(pattern)) {
                const res = typeof response === 'function' ? response() : response;
                return res.ok
                    ? Promise.resolve({ status: res.status || 200, json: () => Promise.resolve({ code: 0, data: res.data || res }) })
                    : Promise.reject(new Error(res.message || 'Fetch error'));
            }
        }
        return Promise.reject(new Error('Unexpected fetch: ' + urlStr));
    };
};

// Helper: mock API.get (to avoid fetch dependency)
global.mockAPIGet = function(responses) {
    global.API = {
        get(path) {
            for (const [pattern, response] of Object.entries(responses)) {
                if (path.includes(pattern)) {
                    const res = typeof response === 'function' ? response() : response;
                    if (res instanceof Error || (res && res._error)) {
                        return Promise.reject(new Error(res.message || res._error || 'Error'));
                    }
                    return Promise.resolve(res);
                }
            }
            return Promise.reject(new Error('Unexpected API call: ' + path));
        }
    };
};

// Mock todo factory
global.mockTodo = function(overrides = {}) {
    return {
        id: overrides.id || 1,
        title: overrides.title || 'Test Todo',
        status: overrides.status || 'in_progress',
        domain: overrides.domain || 'work',
        created_at: overrides.created_at || '2026-06-01T00:00:00Z',
        updated_at: overrides.updated_at || '2026-06-05T00:00:00Z',
        due_at: overrides.due_at || null,
        project: overrides.project || null,
        tags: overrides.tags || [],
        ...overrides,
    };
};

// Mock versions factory
global.mockVersions = function(count = 5) {
    const comments = ['创建', '标题修改', '状态改为进行中', '状态改为阻塞', '添加截止日期', '状态改为已完成', '描述更新', '添加标签'];
    const versions = [];
    for (let i = 0; i < count; i++) {
        const date = new Date('2026-06-01T00:00:00Z');
        date.setDate(date.getDate() + i);
        versions.push({
            id: i + 1,
            todo_id: 1,
            version_number: i + 1,
            comment: comments[i % comments.length],
            created_at: date.toISOString(),
            snapshot: {},
        });
    }
    return versions;
};
