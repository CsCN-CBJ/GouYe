// tests/frontend/todo-card.test.js
// Tests T9, T10, T11, T13 for TodoCard component

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadScript(relativePath) {
    const code = readFileSync(resolve(__dirname, '../../', relativePath), 'utf-8');
    // Replace `const X = ` with `globalThis.X = ` so variables become globals
    const globalized = code.replace(/^const (\w+) = /gm, 'globalThis.$1 = ');
    (0, eval)(globalized);
}

beforeAll(() => {
    loadScript('frontend-pc/js/components/todo-card.js');
});

describe('TodoCard - version history', () => {
    it('T9: renders at most 5 version items', async () => {
        mockAPIGet({
            '/todos/1/versions': mockVersions(5),
        });

        TodoCard.STATE = {};

        const cardHtml = mockTodo({ id: 1, title: 'Test', status: 'in_progress' });
        document.getElementById('page-content').innerHTML = TodoCard.renderCard(cardHtml);

        await TodoCard.loadVersions(1);

        const items = document.querySelectorAll('[data-testid="version-item"]');
        expect(items.length).toBeLessThanOrEqual(5);
        expect(document.querySelector('[data-testid="version-list"]').getAttribute('data-loaded')).toBe('true');
    });

    it('T10: shows expand button when more than 5 versions', async () => {
        mockAPIGet({
            '/todos/1/versions': mockVersions(7),
        });

        TodoCard.STATE = {};

        const cardHtml = mockTodo({ id: 1, title: 'Test', status: 'in_progress' });
        document.getElementById('page-content').innerHTML = TodoCard.renderCard(cardHtml);

        await TodoCard.loadVersions(1);

        const expandBtn = document.querySelector('[data-testid="version-expand"]');
        expect(expandBtn).toBeTruthy();
        expect(expandBtn.getAttribute('data-expanded')).toBe('false');
        expect(expandBtn.textContent).toContain('还有 2 条');
    });

    it('T11: clicking expand loads all versions and button changes', async () => {
        const calls = [];
        global.API = {
            get(path) {
                calls.push(path);
                if (path.includes('limit=5')) return Promise.resolve(mockVersions(7));
                if (path.includes('limit=200')) return Promise.resolve(mockVersions(10));
                return Promise.resolve([]);
            }
        };

        TodoCard.STATE = {};

        const cardHtml = mockTodo({ id: 1, title: 'Test', status: 'in_progress' });
        document.getElementById('page-content').innerHTML = TodoCard.renderCard(cardHtml);

        await TodoCard.loadVersions(1);

        // Before click: 5 items shown, expand button visible
        expect(document.querySelectorAll('[data-testid="version-item"]').length).toBe(5);
        const expandBtn = document.querySelector('[data-testid="version-expand"]');
        expect(expandBtn).toBeTruthy();
        expect(expandBtn.getAttribute('data-expanded')).toBe('false');

        // Click expand
        TodoCard.toggleExpand(1);
        expect(TodoCard.STATE[1].expanded).toBe(true);

        // Flush microtasks so the promise chain inside toggleExpand resolves
        await new Promise(r => setTimeout(r, 0));

        // After expand: 10 items shown, button text changed to '收起'
        expect(document.querySelectorAll('[data-testid="version-item"]').length).toBe(10);
        const finalBtn = document.querySelector('[data-testid="version-expand"]');
        expect(finalBtn).toBeTruthy();
        expect(finalBtn.textContent).toContain('收起');
        expect(finalBtn.getAttribute('data-expanded')).toBe('true');

        // Verify limit=200 was called
        expect(calls.some(c => c.includes('limit=200'))).toBe(true);
    });

    it('T13: shows retry button on load failure', async () => {
        mockAPIGet({
            '/todos/1/versions': new Error('Network error'),
        });

        TodoCard.STATE = {};

        const cardHtml = mockTodo({ id: 1, title: 'Test', status: 'in_progress' });
        document.getElementById('page-content').innerHTML = TodoCard.renderCard(cardHtml);

        await TodoCard.loadVersions(1);

        const errorEl = document.querySelector('.version-error');
        expect(errorEl).toBeTruthy();
        expect(errorEl.textContent).toContain('历史加载失败');
        expect(errorEl.textContent).toContain('重试');
    });

    // F1: 版本历史渲染显示 comment，不出现 Updated: / Initial version
    it('F1: version history shows comment, not change_summary text', async () => {
        mockAPIGet({
            '/todos/1/versions': mockVersions(3),
        });

        TodoCard.STATE = {};

        const cardHtml = mockTodo({ id: 1, title: 'F1 Test', status: 'in_progress' });
        document.getElementById('page-content').innerHTML = TodoCard.renderCard(cardHtml);

        await TodoCard.loadVersions(1);

        const versionsHtml = document.querySelector('[data-testid="version-list"]').innerHTML;
        expect(versionsHtml).not.toContain('Updated:');
        expect(versionsHtml).not.toContain('Initial version');
        expect(versionsHtml).toContain('创建');
    });

    // F2: comment 为空的版本显示 —
    it('F2: empty/null comment shows —', async () => {
        const versionsWithNull = mockVersions(2);
        versionsWithNull[0].comment = null;
        versionsWithNull[1].comment = '';

        mockAPIGet({
            '/todos/1/versions': versionsWithNull,
        });

        TodoCard.STATE = {};

        const cardHtml = mockTodo({ id: 1, title: 'F2 Test', status: 'in_progress' });
        document.getElementById('page-content').innerHTML = TodoCard.renderCard(cardHtml);

        await TodoCard.loadVersions(1);

        const summaries = document.querySelectorAll('.version-summary');
        expect(summaries[0].textContent.trim()).toBe('—');
        expect(summaries[1].textContent.trim()).toBe('—');
    });
});
