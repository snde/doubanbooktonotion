// ==UserScript==
// @name         豆瓣读书同步到Notion
// @namespace    https://greasyfork.org/zh-CN/scripts/464467-%E8%B1%86%E7%93%A3%E8%AF%BB%E4%B9%A6%E5%90%8C%E6%AD%A5%E5%88%B0notion
// @version      1.6
// @description  抓取豆瓣读书信息，基于Notion搭建私人图书管理系统（逻辑与交互优化）
// @author       @Yanwudong (optimized)
// @match        https://book.douban.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douban.com
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @license      GNU GPLv3
// ==/UserScript==

(function() {
    'use strict';

    // =========================
    // 样式（修复了若干小 typo）
    // =========================
    GM_addStyle(`
  .toast {
    position: fixed;
    top: 150px;
    right: 50%;
    transform: translateX(50%);
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
  }
  .toast.show { opacity: 1; }
  .toast-body{
    background-color: #f2f8f2;
    color:#4f946e;
    padding: 8px 12px;
    box-shadow: 0 0 10px rgba(0,0,0,0.15);
    border-radius:4px;
  }
  #nlog {
    top: 130px;
    right: 50%;
    transform: translateX(50%);
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
    background: #fff;
    overflow: hidden;
    padding: 20px 20px 18px;
    position: fixed;
    display : none; /* 默认隐藏 */
    border-radius:6px;
    width: 340px;
  }
  #nlog.show { opacity: 1; }
  .form-group{ margin-bottom: 10px; }
  .form-control{ border: 1px solid #e4e6e5; border-radius: 3px; box-sizing: border-box; font-size: 13px; padding: 8px; width: 100%; }
  #exampleModalLabel{ cursor: pointer; font-size: 16px; line-height: 1.8; text-align: center; color: #333; font-weight: 600; margin-bottom:12px; }
  #saveBtn{ background-color: #41ac52; border: 1px solid #b9dcd0; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600; padding: 6px 10px; width: 60%; }
  .modal-footer{ display:flex; justify-content:space-between; align-items:center; margin-top:12px }
  #syncbt { display: inline-block; margin-left: 10px; font-size: 13px; color:#4f946e; background-color: #f2f8f2; padding: 2px 8px; border: 1px solid #b9dcd0; border-radius:3px }
  #syncbt:hover { cursor: pointer; }
`);

    // =========================
    // DOM 模板
    // =========================
    const modalHtml = `
  <div>
    <div id="exampleModalLabel">Notion API 设置</div>
    <div>
      <div class="form-group"><input type="text" class="form-control" id="apiInput" placeholder="Notion Integration Token (以Bearer形式)"/></div>
      <div class="form-group"><input type="text" class="form-control" id="pageIdInput" placeholder="目标页面 Page ID"/></div>
      <div class="modal-footer">
        <button type="button" id="saveBtn">保存并创建数据库</button>
        <button type="button" id="cancelBtn">取消</button>
      </div>
    </div>
  </div>
`;

    // 创建轻提示框
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.innerHTML = `<div class="toast-body"></div>`;
    document.body.appendChild(toast);

    // 创建设置框（默认隐藏）
    const nlog = document.createElement('div');
    nlog.id = 'nlog';
    nlog.innerHTML = modalHtml;
    document.body.appendChild(nlog);

    // =========================
    // 读取配置
    // =========================
    let nToken = GM_getValue('nToken') || '';
    let pageId = GM_getValue('pageId') || '';
    let databaseId = GM_getValue('databaseId') || '';
    const notionVersion = '2022-06-28';

    // pendingSync 标记：用于在用户保存设置后继续上次触发的同步操作
    let pendingSync = false;

    // =========================
    // 帮助函数：显示提示
    // =========================
    function showToast(text, ms = 3000) {
        toast.querySelector('.toast-body').innerText = text;
        toast.classList.add('show');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => toast.classList.remove('show'), ms);
    }

    // =========================
    // 获取书籍信息（更健壮）
    // =========================
    function getBookInfo() {
        const book = {};
        const titleEl = document.querySelector('#wrapper > h1 > span');
        if (titleEl) book['书名'] = titleEl.innerText.trim();
        const coverEl = document.querySelector('#mainpic > a > img');
        if (coverEl) book['封面'] = coverEl.src;
        const ratingEl = document.querySelector('.rating_num');
        if (ratingEl) book['评分'] = ratingEl.innerText.trim();
        book['豆瓣链接'] = window.location.href;

        const infos = document.querySelectorAll('#info .pl');
        for (const info of infos) {
            const keyText = (info.innerText || '').trim();
            // nextSibling/data may differ — 使用Element sibling 更稳健
            const next = info.nextSibling || info.nextElementSibling;
            const value = next ? (next.innerText || next.textContent || '').trim() : '';

            if (!keyText) continue;
            // 处理常见的字段名
            if (keyText.startsWith('作者')) book['作者'] = value;
            else if (keyText.startsWith('出版社')) book['出版社'] = value;
            else if (keyText.startsWith('页数')) book['页数'] = value.replace(/[^0-9]/g, '') || '';
            else if (keyText.startsWith('ISBN')) book['ISBN'] = value;
            else if (keyText.startsWith('出版年') || keyText.startsWith('出版年:') || keyText.startsWith('出版年/')) book['出版年'] = value;
            else {
                // 其他字段作为直接属性（去掉冒号）
                const k = keyText.replace(/[:：]$/,'');
                book[k] = value;
            }
        }
        return book;
    }

    // =========================
    // Notion 请求封装（返回 Promise）
    // =========================
    function notionRequest(url, method = 'GET', body = null) {
        return new Promise((resolve, reject) => {
            const headers = {
                'Notion-Version': notionVersion,
                'Authorization': 'Bearer ' + nToken,
                'Content-Type': 'application/json'
            };
            GM_xmlhttpRequest({
                method: method,
                url: url,
                headers: headers,
                data: body ? JSON.stringify(body) : null,
                onload: function(resp) {
                    try {
                        const json = JSON.parse(resp.responseText);
                        if (json && json.object === 'error') reject(json);
                        else resolve(json);
                    } catch (e) {
                        reject({ message: 'Invalid JSON response', raw: resp.responseText });
                    }
                },
                onerror: function(err) {
                    reject(err);
                }
            });
        });
    }

    // =========================
    // 创建数据库（如果还没创建）
    // 返回 Promise 并在成功时保存 databaseId
    // =========================
    function createDatabase() {
        const body = {
            parent: { type: 'page_id', page_id: pageId },
            title: [{ type: 'text', text: { content: 'BookList' } }],
            icon: { type: 'emoji', emoji: '📚' },
            properties: {
                '书名': { title: {} },
                '标签': { multi_select: { options: [] } },
                '状态': { select: { options: [] } },
                '打分': { select: { options: [] } },
                '作者': { rich_text: {} },
                '出版社': { rich_text: {} },
                '出版年月': { rich_text: {} },
                '页数': { number: { format: 'number' } },
                '评分': { number: { format: 'number' } },
                'ISBN': { rich_text: {} },
                '封面': { files: {} },
                '豆瓣链接': { url: {} },
                '简介': { rich_text: {} }
            }
        };
        return notionRequest('https://api.notion.com/v1/databases', 'POST', body)
            .then(res => {
                if (res && res.id) {
                    GM_setValue('databaseId', res.id);
                    databaseId = res.id;
                    return res;
                }
                throw res;
            });
    }

    // =========================
    // 创建条目并提示
    // =========================
    function createItem(book) {
        const body = {
            parent: { type: 'database_id', database_id: databaseId },
            icon: { type: 'emoji', emoji: '📔' },
            properties: {
                '书名': { title: [{ type: 'text', text: { content: book['书名'] || '' } }] },
                'ISBN': { rich_text: [{ type: 'text', text: { content: book['ISBN'] || '' } }] },
                '页数': { number: book['页数'] ? parseInt(book['页数']) : null },
                '状态': { select: { name: '🌑想读' } },
                '出版社': { rich_text: [{ type: 'text', text: { content: book['出版社'] || '' } }] },
                '出版年月': { rich_text: [{ type: 'text', text: { content: book['出版年'] || '' } }] },
                '评分': { number: book['评分'] ? parseFloat(book['评分']) : null },
                '作者': { rich_text: [{ type: 'text', text: { content: book['作者'] || '' } }] },
                '封面': { files: [{ type: 'external', name: 'cover', external: { url: book['封面'] || '' } }] },
                '豆瓣链接': { url: book['豆瓣链接'] }
            }
        };
        return notionRequest('https://api.notion.com/v1/pages', 'POST', body)
            .then(res => {
                showToast('同步成功！');
                return res;
            });
    }

    // =========================
    // 同步主流程：如果没有 databaseId，会先创建数据库
    // =========================
    async function syncToNotion() {
        if (!nToken || !pageId) {
            // 如果没有 api 或 page id，展示设置窗口并标记 pending
            pendingSync = true;
            showSettings();
            return;
        }
        try {
            if (!databaseId) {
                showToast('正在创建 Notion 数据库...');
                await createDatabase();
                showToast('数据库创建成功，开始同步...');
            }
            const book = getBookInfo();
            await createItem(book);
        } catch (err) {
            console.error('notion error', err);
            const msg = (err && err.message) ? err.message : '同步失败，请查看控制台';
            showToast(msg);
        }
    }

    // =========================
    // 显示/隐藏 设置窗口
    // =========================
    function showSettings() {
        // 填充已有值
        const apiInput = document.getElementById('apiInput');
        const pageIdInput = document.getElementById('pageIdInput');
        if (apiInput) apiInput.value = nToken || '';
        if (pageIdInput) pageIdInput.value = pageId || '';
        nlog.style.display = 'block';
        setTimeout(() => nlog.classList.add('show'), 10);
    }
    function hideSettings() {
        nlog.classList.remove('show');
        setTimeout(() => nlog.style.display = 'none', 200);
    }

    // =========================
    // 绑定设置窗口事件
    // =========================
    $(document).ready(function() {
        // 保存按钮
        $(document).on('click', '#saveBtn', async function() {
            const apiVal = $('#apiInput').val().trim();
            const pageVal = $('#pageIdInput').val().trim();
            if (!apiVal || !pageVal) {
                showToast('请填写 Token 和 Page ID');
                return;
            }
            nToken = apiVal;
            pageId = pageVal;
            GM_setValue('nToken', nToken);
            GM_setValue('pageId', pageId);

            hideSettings();
            try {
                // 创建数据库并在创建后如果 pendingSync 则继续同步
                await createDatabase();
                showToast('配置已保存并创建数据库');
                if (pendingSync) {
                    pendingSync = false;
                    await syncToNotion();
                }
            } catch (err) {
                console.error(err);
                showToast('创建数据库失败，请检查 Token 与 Page ID');
            }
        });

        // 取消
        $(document).on('click', '#cancelBtn', function() {
            pendingSync = false;
            hideSettings();
        });
    });

    // =========================
    // 添加「同步到Notion」按钮（不立即执行）
    // =========================
    function addButton() {
        const titleSpan = document.querySelector('#wrapper > h1 > span');
        if (!titleSpan) return;
        // 如果按钮已存在，不重复添加
        if (document.getElementById('syncbt')) return;
        const button = document.createElement('button');
        button.id = 'syncbt';
        button.innerText = '同步到Notion';
        // 点击时：如果有配置则立即同步；否则打开设置并标记为 pending
        button.addEventListener('click', function(e) {
            if (nToken && pageId && databaseId) {
                syncToNotion();
            } else if (nToken && pageId && !databaseId) {
                // 有 token & page，但没有 database -> 将创建并同步
                syncToNotion();
            } else {
                pendingSync = true;
                showSettings();
            }
        });
        titleSpan.insertAdjacentElement('afterend', button);
    }

    // 页面加载后插入按钮
    window.addEventListener('load', function() {
        addButton();
    });

})();
