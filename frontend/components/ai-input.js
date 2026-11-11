// AI 自然语言输入组件

class AIInput extends HTMLElement {
    constructor() {
        super();
        this.innerHTML = `
            <div class="ai-input-wrapper">
                <textarea 
                    class="ai-input-textarea" 
                    placeholder="用自然语言记录，例如：\n明天下午三点交方案，work domain，高优先级\n今天晨跑了五公里\n昨晚读了三十页书"
                    rows="4"
                ></textarea>
                <div class="ai-input-footer">
                    <span class="ai-input-hint">Ctrl + Enter 快捷提交</span>
                    <button class="ai-input-submit">
                        <i class="fas fa-wand-magic-sparkles"></i>
                        <span>AI 解析</span>
                    </button>
                </div>
            </div>
            <style>
                .ai-input-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .ai-input-textarea {
                    width: 100%;
                    padding: 14px 16px;
                    background: #f8fafc;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 16px;
                    font-size: 14px;
                    line-height: 1.5;
                    color: #1e293b;
                    resize: vertical;
                    outline: none;
                    transition: all 0.2s;
                    font-family: inherit;
                }
                .ai-input-textarea:focus {
                    border-color: #1e293b;
                    background: #fff;
                }
                .ai-input-textarea::placeholder {
                    color: #94a3b8;
                }
                .ai-input-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .ai-input-hint {
                    font-size: 11px;
                    color: #94a3b8;
                }
                .ai-input-submit {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 18px;
                    background: #000;
                    color: #fff;
                    border: none;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .ai-input-submit:active {
                    transform: scale(0.96);
                }
                .ai-input-submit:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            </style>
        `;

        this.textarea = this.querySelector(".ai-input-textarea");
        this.btn = this.querySelector(".ai-input-submit");

        this.btn.addEventListener("click", () => this.submit());
        this.textarea.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.key === "Enter") {
                e.preventDefault();
                this.submit();
            }
        });
    }

    async submit() {
        const text = this.textarea.value.trim();
        if (!text) {
            showToast("请输入内容");
            return;
        }

        this.btn.disabled = true;
        const originalHtml = this.btn.innerHTML;
        this.btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>解析中...</span>';

        const data = await request("/ai/parse", {
            method: "POST",
            body: JSON.stringify({ text }),
        });

        this.btn.disabled = false;
        this.btn.innerHTML = originalHtml;

        if (data && data.code === 200 && data.data) {
            this.textarea.value = "";
            this.dispatchEvent(
                new CustomEvent("ai-proposal", {
                    bubbles: true,
                    detail: data.data,
                })
            );
        } else {
            const msg = data?.message || "AI 解析失败，请使用手动录入";
            showToast(msg);
            this.dispatchEvent(
                new CustomEvent("ai-error", {
                    bubbles: true,
                    detail: { message: msg },
                })
            );
        }
    }
}

customElements.define("ai-input", AIInput);
