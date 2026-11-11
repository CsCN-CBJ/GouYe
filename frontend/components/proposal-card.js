// AI 提议确认卡片组件

class ProposalCard extends HTMLElement {
    constructor() {
        super();
        this.proposal = null;
        this.innerHTML = `
            <div class="proposal-overlay hidden">
                <div class="proposal-card">
                    <div class="proposal-header">
                        <h3 class="proposal-title">AI 解析结果</h3>
                        <button class="proposal-close" onclick="this.closest('proposal-card').hide()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="proposal-body">
                        <div class="proposal-field">
                            <label>标题</label>
                            <input type="text" class="proposal-input proposal-title-input" placeholder="标题">
                        </div>
                        <div class="proposal-field-group">
                            <div class="proposal-field">
                                <label>类型</label>
                                <span class="proposal-badge proposal-kind-badge"></span>
                            </div>
                            <div class="proposal-field">
                                <label>领域/分类</label>
                                <span class="proposal-value proposal-domain"></span>
                            </div>
                        </div>
                        <div class="proposal-field">
                            <label>项目</label>
                            <span class="proposal-value proposal-project"></span>
                        </div>
                        <div class="proposal-field">
                            <label>标签</label>
                            <div class="proposal-tags"></div>
                        </div>
                        <div class="proposal-field">
                            <label>详情预览</label>
                            <pre class="proposal-payload"></pre>
                        </div>
                    </div>
                    <div class="proposal-actions">
                        <button class="btn-secondary btn-reject">取消</button>
                        <button class="btn-secondary btn-manual">手动录入</button>
                        <button class="btn-primary btn-accept">确认</button>
                    </div>
                </div>
            </div>
            <style>
                .proposal-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 60;
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                    background: rgba(0,0,0,0.3);
                }
                .proposal-overlay.hidden {
                    display: none;
                }
                .proposal-card {
                    width: 100%;
                    max-width: 480px;
                    max-height: 90vh;
                    background: #fff;
                    border-radius: 24px 24px 0 0;
                    display: flex;
                    flex-direction: column;
                    animation: slideUp 0.3s ease;
                }
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                .proposal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px 20px 12px;
                    border-bottom: 1px solid #f1f5f9;
                }
                .proposal-header .proposal-title {
                    font-size: 17px;
                    font-weight: 700;
                    color: #0f172a;
                }
                .proposal-close {
                    width: 32px;
                    height: 32px;
                    border-radius: 10px;
                    border: none;
                    background: #f1f5f9;
                    color: #64748b;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .proposal-body {
                    padding: 16px 20px;
                    overflow-y: auto;
                    flex: 1;
                }
                .proposal-field {
                    margin-bottom: 14px;
                }
                .proposal-field-group {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }
                .proposal-field label {
                    display: block;
                    font-size: 11px;
                    font-weight: 600;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 6px;
                }
                .proposal-input {
                    width: 100%;
                    padding: 10px 14px;
                    background: #f8fafc;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 12px;
                    font-size: 14px;
                    color: #1e293b;
                    outline: none;
                    transition: all 0.2s;
                }
                .proposal-input:focus {
                    border-color: #1e293b;
                    background: #fff;
                }
                .proposal-value {
                    font-size: 14px;
                    color: #334155;
                    line-height: 1.5;
                }
                .proposal-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                }
                .proposal-badge.kind-todo {
                    background: #eff6ff;
                    color: #3b82f6;
                }
                .proposal-badge.kind-checkin {
                    background: #f0fdf4;
                    color: #10b981;
                }
                .proposal-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }
                .proposal-tags .tag {
                    font-size: 12px;
                    padding: 4px 10px;
                    border-radius: 8px;
                    background: #f1f5f9;
                    color: #64748b;
                    font-weight: 500;
                }
                .proposal-tags .tag-new {
                    background: #1e293b;
                    color: #fff;
                }
                .proposal-payload {
                    background: #f8fafc;
                    border-radius: 10px;
                    padding: 10px 14px;
                    font-size: 12px;
                    font-family: monospace;
                    color: #64748b;
                    overflow-x: auto;
                    white-space: pre-wrap;
                    word-break: break-word;
                    border: 1px solid #f1f5f9;
                }
                .proposal-actions {
                    display: flex;
                    gap: 10px;
                    padding: 16px 20px 24px;
                    border-top: 1px solid #f1f5f9;
                }
                .proposal-actions button {
                    flex: 1;
                    padding: 12px;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .proposal-actions button:active {
                    transform: scale(0.98);
                }
                .btn-secondary {
                    background: #f1f5f9;
                    color: #64748b;
                }
                .btn-primary {
                    background: #000;
                    color: #fff;
                }
            </style>
        `;

        this.overlay = this.querySelector(".proposal-overlay");
        this.querySelector(".btn-accept").addEventListener("click", () => this.accept());
        this.querySelector(".btn-reject").addEventListener("click", () => this.reject());
        this.querySelector(".btn-manual").addEventListener("click", () => this.manual());
        this.overlay.addEventListener("click", (e) => {
            if (e.target === this.overlay) this.reject();
        });
    }

    show(proposal) {
        this.proposal = proposal;
        const preview = proposal.preview || {};

        this.querySelector(".proposal-title-input").value = preview.title || "";

        const kindBadge = this.querySelector(".proposal-kind-badge");
        kindBadge.textContent = proposal.kind === "todo" ? "TODO" : "打卡";
        kindBadge.className = `proposal-badge proposal-kind-badge kind-${proposal.kind}`;

        this.querySelector(".proposal-domain").textContent =
            preview.domain || preview.category || "-";

        const proj = preview.project;
        const projText = proj
            ? proj.id
                ? `${proj.name} (已有)`
                : `新建: ${proj.new}`
            : "-";
        this.querySelector(".proposal-project").textContent = projText;

        const tagsContainer = this.querySelector(".proposal-tags");
        const tags = preview.tags || [];
        if (tags.length === 0) {
            tagsContainer.innerHTML = '<span class="proposal-value">-</span>';
        } else {
            tagsContainer.innerHTML = tags
                .map((t) => {
                    const isNew = !t.id;
                    const name = t.name || t.new || "";
                    return `<span class="tag ${isNew ? "tag-new" : ""}">${isNew ? "+ " : ""}${name}</span>`;
                })
                .join("");
        }

        this.querySelector(".proposal-payload").textContent = JSON.stringify(
            preview.payload || {},
            null,
            2
        );

        this.overlay.classList.remove("hidden");
        document.body.style.overflow = "hidden";
    }

    hide() {
        this.overlay.classList.add("hidden");
        document.body.style.overflow = "";
        this.proposal = null;
    }

    async accept() {
        if (!this.proposal) return;

        const btn = this.querySelector(".btn-accept");
        btn.disabled = true;
        const original = btn.textContent;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const overrides = {
            title: this.querySelector(".proposal-title-input").value,
        };

        const data = await request(`/ai/proposals/${this.proposal.proposal_id}/accept`, {
            method: "POST",
            body: JSON.stringify({ overrides }),
        });

        btn.disabled = false;
        btn.textContent = original;

        if (data && data.code === 200) {
            showToast("创建成功");
            this.hide();
            this.dispatchEvent(
                new CustomEvent("proposal-confirmed", {
                    bubbles: true,
                    detail: { kind: this.proposal.kind },
                })
            );
        } else {
            showToast(data?.message || "创建失败");
        }
    }

    async reject() {
        if (this.proposal) {
            await request(`/ai/proposals/${this.proposal.proposal_id}/reject`, {
                method: "POST",
            });
        }
        this.hide();
    }

    manual() {
        const kind = this.proposal?.kind;
        this.hide();
        this.dispatchEvent(
            new CustomEvent("proposal-manual", {
                bubbles: true,
                detail: { kind },
            })
        );
    }
}

customElements.define("proposal-card", ProposalCard);
