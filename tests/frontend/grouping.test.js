// tests/frontend/grouping.test.js
// Tests T1-T8, T12, T14 for grouping, filtering, and sorting

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
    loadScript('frontend-pc/js/components/group-toggle.js');
    loadScript('frontend-pc/js/components/multi-select-filter.js');
    loadScript('frontend-pc/js/components/todo-card.js');
    loadScript('frontend-pc/js/pages/requirements.js');
});

describe('RequirementsPage - grouping and filtering', () => {
    beforeEach(() => {
        RequirementsPage.groupBy = 'status';
        RequirementsPage.filters.statuses = ['not_started', 'in_progress', 'blocked'];
        localStorage.clear();
    });

    it('T1: default view sets group-toggle to status and status-filter excludes done/cancelled', () => {
        localStorage.removeItem('gouye:requirements:groupBy');

        // Render group toggle
        const div = document.createElement('div');
        document.getElementById('page-content').appendChild(div);

        GroupToggle.render({
            container: div,
            storageKey: 'gouye:requirements:groupBy',
            defaultValue: 'status',
            onChange: () => {},
        });

        const toggle = div.querySelector('[data-testid="group-toggle"]');
        expect(toggle.getAttribute('data-active')).toBe('status');

        // Render multi-select filter
        const filterDiv = document.createElement('div');
        document.getElementById('page-content').appendChild(filterDiv);

        MultiSelectFilter.render({
            container: filterDiv,
            onChange: () => {},
        });

        const filter = filterDiv.querySelector('[data-testid="status-filter"]');
        const selected = filter.getAttribute('data-selected');
        expect(selected).toContain('in_progress');
        expect(selected).toContain('blocked');
        expect(selected).toContain('not_started');
        expect(selected).not.toContain('completed');
        expect(selected).not.toContain('cancelled');
    });

    it('T2: status group order is in_progress, blocked, not_started under default filter', async () => {
        const todos = [
            mockTodo({ id: 1, status: 'in_progress', title: 'A', updated_at: '2026-06-05T00:00:00Z' }),
            mockTodo({ id: 2, status: 'not_started', title: 'B', updated_at: '2026-06-04T00:00:00Z' }),
            mockTodo({ id: 3, status: 'blocked', title: 'C', updated_at: '2026-06-03T00:00:00Z' }),
        ];

        global.API = {
            get(path) {
                if (path.includes('/todos')) return Promise.resolve(todos);
                if (path.includes('/projects')) return Promise.resolve([]);
                if (path.includes('/tags')) return Promise.resolve([]);
                return Promise.resolve([]);
            }
        };

        await RequirementsPage.render();

        const sections = document.querySelectorAll('[data-testid="group-section"]');
        const keys = Array.from(sections).map(s => s.getAttribute('data-group-key'));

        expect(keys).toEqual(['in_progress', 'blocked', 'not_started']);
    });

    it('T3: all 5 groups appear in fixed order when all selected', async () => {
        const todos = [
            mockTodo({ id: 1, status: 'cancelled', title: 'E', updated_at: '2026-06-01T00:00:00Z' }),
            mockTodo({ id: 2, status: 'completed', title: 'D', updated_at: '2026-06-02T00:00:00Z' }),
            mockTodo({ id: 3, status: 'not_started', title: 'C', updated_at: '2026-06-03T00:00:00Z' }),
            mockTodo({ id: 4, status: 'blocked', title: 'B', updated_at: '2026-06-04T00:00:00Z' }),
            mockTodo({ id: 5, status: 'in_progress', title: 'A', updated_at: '2026-06-05T00:00:00Z' }),
        ];

        global.API = {
            get(path) {
                if (path.includes('/todos')) return Promise.resolve(todos);
                if (path.includes('/projects')) return Promise.resolve([]);
                if (path.includes('/tags')) return Promise.resolve([]);
                return Promise.resolve([]);
            }
        };

        RequirementsPage.filters.statuses = ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled'];
        RequirementsPage.groupBy = 'status';

        // Ensure #req-list exists in DOM
        document.getElementById('page-content').innerHTML = '<div id="req-list"></div>';
        await RequirementsPage._loadData();

        const sections = document.querySelectorAll('[data-testid="group-section"]');
        const keys = Array.from(sections).map(s => s.getAttribute('data-group-key'));

        expect(keys).toEqual(['in_progress', 'blocked', 'not_started', 'completed', 'cancelled']);
        expect(sections.length).toBe(5);
    });

    it('T4: status group cards sorted by updated_at desc', () => {
        const todos = [
            mockTodo({ id: 1, status: 'in_progress', title: 'Old', updated_at: '2026-06-01T00:00:00Z' }),
            mockTodo({ id: 2, status: 'in_progress', title: 'Mid', updated_at: '2026-06-03T00:00:00Z' }),
            mockTodo({ id: 3, status: 'in_progress', title: 'New', updated_at: '2026-06-05T00:00:00Z' }),
        ];

        const sorted = RequirementsPage._sortByUpdatedAt(todos);
        expect(sorted[0].title).toBe('New');
        expect(sorted[1].title).toBe('Mid');
        expect(sorted[2].title).toBe('Old');
    });

    it('T5: project groups sorted by latest updated_at desc with uncategorized last', () => {
        const todos = [
            mockTodo({ id: 1, status: 'in_progress', project: { id: 2, name: 'B' }, updated_at: '2026-06-05T00:00:00Z' }),
            mockTodo({ id: 2, status: 'not_started', project: { id: 2, name: 'B' }, updated_at: '2026-06-01T00:00:00Z' }),
            mockTodo({ id: 3, status: 'in_progress', project: { id: 1, name: 'A' }, updated_at: '2026-06-03T00:00:00Z' }),
            mockTodo({ id: 4, status: 'not_started', updated_at: '2026-06-10T00:00:00Z' }),
        ];

        const groups = RequirementsPage._groupByProject(todos);
        const keys = groups.map(g => g[0]);

        expect(keys[0]).toContain('B');
        expect(keys[1]).toContain('A');
        expect(keys[keys.length - 1]).toBe('__none__');
    });

    it('T6: project group cards sorted by updated_at desc (not status priority)', () => {
        // in_progress cards have old dates; not_started has newest date.
        // Buggy status-priority sort would incorrectly put in_progress first.
        const todos = [
            mockTodo({ id: 1, status: 'in_progress', title: 'Oldest', project: { id: 1, name: 'P' }, updated_at: '2026-06-01T00:00:00Z' }),
            mockTodo({ id: 2, status: 'in_progress', title: 'Older', project: { id: 1, name: 'P' }, updated_at: '2026-06-03T00:00:00Z' }),
            mockTodo({ id: 3, status: 'blocked', title: 'Newer', project: { id: 1, name: 'P' }, updated_at: '2026-06-09T00:00:00Z' }),
            mockTodo({ id: 4, status: 'not_started', title: 'Newest', project: { id: 1, name: 'P' }, updated_at: '2026-06-10T00:00:00Z' }),
        ];

        const groups = RequirementsPage._groupByProject(todos);
        const items = groups[0][1];

        expect(items[0].title).toBe('Newest');
        expect(items[1].title).toBe('Newer');
        expect(items[2].title).toBe('Older');
        expect(items[3].title).toBe('Oldest');
    });

    it('T16: project group with all statuses sorts by updated_at desc (completed newest must not be pushed to end)', async () => {
        // Bug scenario: completed card is the newest but status-priority sort pushes it to the end.
        // With pure updated_at desc, it should come first.
        const todos = [
            mockTodo({ id: 1, status: 'completed', title: 'JustDone', project: { id: 1, name: 'P' }, updated_at: '2026-06-10T00:00:00Z' }),
            mockTodo({ id: 2, status: 'in_progress', title: 'MidProgress', project: { id: 1, name: 'P' }, updated_at: '2026-06-05T00:00:00Z' }),
            mockTodo({ id: 3, status: 'not_started', title: 'OldTodo', project: { id: 1, name: 'P' }, updated_at: '2026-06-01T00:00:00Z' }),
        ];

        global.API = {
            get(path) {
                if (path.includes('/todos')) return Promise.resolve(todos);
                if (path.includes('/projects')) return Promise.resolve([]);
                if (path.includes('/tags')) return Promise.resolve([]);
                return Promise.resolve([]);
            }
        };

        RequirementsPage.filters.statuses = ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled'];
        RequirementsPage.groupBy = 'project';
        document.getElementById('page-content').innerHTML = '<div id="req-list"></div>';
        await RequirementsPage._loadData();

        const cards = document.querySelectorAll('[data-testid="todo-card"]');
        const titles = Array.from(cards).map(c => c.querySelector('.todo-card-title').textContent.trim());

        expect(titles).toEqual(['JustDone', 'MidProgress', 'OldTodo']);
    });

    it('T7: project grouping with default filter hides done/cancelled', async () => {
        const todos = [
            mockTodo({ id: 1, status: 'in_progress', title: 'Active', project: { id: 1, name: 'P' }, updated_at: '2026-06-01T00:00:00Z' }),
            mockTodo({ id: 2, status: 'completed', title: 'Done', project: { id: 1, name: 'P' }, updated_at: '2026-06-02T00:00:00Z' }),
        ];

        global.API = {
            get(path) {
                if (path.includes('/todos')) return Promise.resolve(todos);
                if (path.includes('/projects')) return Promise.resolve([]);
                if (path.includes('/tags')) return Promise.resolve([]);
                return Promise.resolve([]);
            }
        };

        RequirementsPage.filters.statuses = ['not_started', 'in_progress', 'blocked'];
        RequirementsPage.groupBy = 'project';
        document.getElementById('page-content').innerHTML = '<div id="req-list"></div>';
        await RequirementsPage._loadData();

        const cards = document.querySelectorAll('[data-testid="todo-card"]');
        const statuses = Array.from(cards).map(c => c.getAttribute('data-status'));

        expect(statuses).toContain('in_progress');
        expect(statuses).not.toContain('completed');
    });

    it('T8: project grouping with all selected shows all cards', async () => {
        const todos = [
            mockTodo({ id: 1, status: 'in_progress', title: 'Active', project: { id: 1, name: 'P' }, updated_at: '2026-06-01T00:00:00Z' }),
            mockTodo({ id: 2, status: 'completed', title: 'Done', project: { id: 1, name: 'P' }, updated_at: '2026-06-02T00:00:00Z' }),
        ];

        global.API = {
            get(path) {
                if (path.includes('/todos')) return Promise.resolve(todos);
                if (path.includes('/projects')) return Promise.resolve([]);
                if (path.includes('/tags')) return Promise.resolve([]);
                return Promise.resolve([]);
            }
        };

        RequirementsPage.filters.statuses = ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled'];
        RequirementsPage.groupBy = 'project';
        document.getElementById('page-content').innerHTML = '<div id="req-list"></div>';
        await RequirementsPage._loadData();

        const cards = document.querySelectorAll('[data-testid="todo-card"]');
        const statuses = Array.from(cards).map(c => c.getAttribute('data-status'));

        expect(statuses).toContain('in_progress');
        expect(statuses).toContain('completed');
        expect(cards.length).toBe(2);
    });

    it('T12: localStorage persists group toggle selection', () => {
        const container = document.createElement('div');
        document.getElementById('page-content').appendChild(container);

        localStorage.setItem('gouye:requirements:groupBy', 'project');

        GroupToggle.render({
            container,
            storageKey: 'gouye:requirements:groupBy',
            defaultValue: 'status',
            onChange: () => {},
        });

        const toggle = container.querySelector('[data-testid="group-toggle"]');
        expect(toggle.getAttribute('data-active')).toBe('project');

        // Simulate page refresh: set to status, re-render
        localStorage.setItem('gouye:requirements:groupBy', 'status');

        const container2 = document.createElement('div');
        document.getElementById('page-content').appendChild(container2);

        GroupToggle.render({
            container: container2,
            storageKey: 'gouye:requirements:groupBy',
            defaultValue: 'status',
            onChange: () => {},
        });

        const toggle2 = container2.querySelector('[data-testid="group-toggle"]');
        expect(toggle2.getAttribute('data-active')).toBe('status');
    });

    it('T14: todo grid container uses grid class', async () => {
        const todos = [
            mockTodo({ id: 1, status: 'in_progress', title: 'A', updated_at: '2026-06-01T00:00:00Z' }),
        ];

        global.API = {
            get(path) {
                if (path.includes('/todos')) return Promise.resolve(todos);
                if (path.includes('/projects')) return Promise.resolve([]);
                if (path.includes('/tags')) return Promise.resolve([]);
                return Promise.resolve([]);
            }
        };

        RequirementsPage.groupBy = 'status';
        RequirementsPage.filters.statuses = ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled'];
        document.getElementById('page-content').innerHTML = '<div id="req-list"></div>';
        await RequirementsPage._loadData();

        const grid = document.querySelector('.todo-grid');
        expect(grid).toBeTruthy();
    });
});
