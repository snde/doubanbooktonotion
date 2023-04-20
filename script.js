// ==UserScript==
// @name         豆瓣读书同步到Notion
// @namespace    http://your-domain-here.com
// @version      1.1
// @description  抓取豆瓣读书信息，同步到Notion搭建私人图书管理系统
// @author       @Yanwudong https://twitter.com/yanwudong
// @match        https://book.douban.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douban.com
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// ==/UserScript==
(function() {
    'use strict';
        // 添加CSS样式
    GM_addStyle(`
  .toast {
    position: fixed;
    top: 150px;
    right: 50%;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
  }
  .toast.show {
    opacity: 1;
  }

  .toast-body {
    background-color: #f2f8f2;
    //border: 1px solid #ccc;
    //border-radius: 3px;
    color:#4f946e;
    padding: 2px;
    padding-left:10px;
    padding-right:10px
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
  }
  #nlog {
    top: 130px;
    right: 50%;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
    background: #fff;
    overflow: hiadden;
    padding: 40px 30px 30px;
    position: fixed;
    display : none;
  }
  #nlog.show {
    opacity: 1;
  }
  .form-group{
    margin-bottom: 10px;
  }
  .form-control{
    border: 1px solid #e4e6e5;
    border-radius: 3px;
    box-sizing: border-box;
    font-size: 13px;
    padding: 10px;
    width: 280px;
  }
  #exampleModalLabel{
    cursor: pointer;
    font-size: 18px;
    line-height: 2;
    text-align: center;
    border-bottom: 2px solid #494949;
    color: #333;
    font-weight: 600;
    margin-bottom:20px;
  }
  #twitter{
    margin-left:30px;
  }
  #saveBtn{
    background-color: #41ac52;
    border: 1px solid #b9dcd0;
    color: #fff;
    cursor: default;
    font-size: 15px;
    font-weight: 600;
    padding: 0;
    width:79%;
  }
  .modal-footer button{
    height:36px;
    width:19%;
    margin-bottom:20px;

  }
  #syncbt {
    display: inline-block;
    margin-left: 10px;
    font-size: 13px;
    color:#4f946e;
    background-color: #f2f8f2;
    padding: 2px;
    padding-left: 8px;
    padding-right: 8px;
    border: 1px solid #b9dcd0;
    border-radius:3px
  }
    #setbt {
    display: inline-block;
    margin-left: 5px;
    font-size: 13px;
    color:#4f946e;
    background-color: #f2f8f2;
    padding: 2px;
    border: 1px solid #b9dcd0;
    border-radius:3px
  }

     `);

// 创建一个 Modal
const modalHtml = `
<div class="modal fade" id="myModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
  <div class="modal-dialog" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLabel">信息设置</h5>
      </div>
      <div class="modal-body">
        <form>
          <div class="form-group">
            <input type="text" class="form-control" id="apiInput" placeholder="Notion API">
          </div>
          <div class="form-group">
            <input type="text" class="form-control" id="pageIdInput" placeholder="Notion 页面 ID">
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-primary" id="saveBtn">保存设置</button>
        <button type="button" class="btn btn-secondary" id="closeBtn" data-dismiss="modal">关闭</button>
      </div>
      <div class="modal-bottom">
        <a href="https://seemly-pear-9fc.notion.site/Notion-e0ae1a1d391143abb9ff383730649149" id="refBtn" target="_blank";>操作说明</a>
        <a href="https://twitter.com/yanwudong" id="twitter" target="_blank";>推特</a>
      </div>
    </div>
  </div>
</div>
`;
//创建一个提示信息
    const info = `
     <div class="toast-body">
       🎉 同步成功！
     </div>
    `;

    //初始化用户信息
    //GM_setValue('nToken',undefined);
    //GM_setValue = ('pageId',undefined);
    //GM_setValue = ('databaseId','961aa20e76a0477496974e33273c1b0e');
    var nToken = GM_getValue('nToken');
    var pageId = GM_getValue('pageId');
    var databaseId = GM_getValue('databaseId');
    const notionVersion = '2022-06-28';

    // 创建一个轻提示框元素
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.innerHTML =`
     <div class="toast-body">
       🎉 同步成功！
     </div>
    `;
    // 将轻提示框添加到页面中
    document.body.appendChild(toast);

    //创建一个授权框，让用户输入ApiKey和PageId
    const nlog = document.createElement('div');
    nlog.id = 'nlog';
    nlog.innerHTML = modalHtml;
    document.body.appendChild(nlog);
    nlog.classList.add('show');
    // 等待页面加载完成后执行
    $(document).ready(function() {
        // 给按钮添加点击事件
        $('#saveBtn').click(function() {
            nToken = $('#apiInput').val();
            pageId = $('#pageIdInput').val();
            GM_setValue('nToken', nToken);
            GM_setValue('pageId', pageId);
            //用户第一次使用先创建数据库
            createDatabase();
            nlog.style.display = 'none';
        });
        $('#closeBtn').click(function(){
            nlog.style.display = 'none';
        });
    });

    //检查用户是否登录
    const checkUserInfo = () =>{
        debugger
        // 如果用户没有输入过信息，弹出输入框让其输入
        if (!nToken || !pageId || !databaseId ) {
            nlog.style.display = 'block';
        }else{
            syncToNotion();
        }
    }
    //设置用户信息,暂时没用这个
    const setUserInfo = () =>{
        //如果有用户信息，则在输入框展示，之前有设置的时候用，现在用不到了
        if (nToken || pageId || databaseId ) {
            $('#apiInput').val(nToken);
            $('#pageIdInput').val(pageId);
        }
        nlog.style.display = 'block';
    }

    //输入用户信息并保存，暂时没用这个
    const addUserInfo = () =>{
        nToken = prompt('请输入您的ApiKey：');
        pageId = prompt('请输入您的页面Id：');
        // 存储用户信息
        GM_setValue('nToken', nToken);
        GM_setValue('pageId', pageId);
        //用户第一次使用先创建数据库
        createDatabase();
    }

    // 添加同步按钮到页面
    const addButton = () => {
        const button = document.createElement('button');
        button.innerText = '同步到Notion';
        button.onclick = checkUserInfo;
        //const set = document.createElement('button');
        //set.innerText ='⚙️';
        //set.onclick = setUserInfo;
        //button.insertAdjacentElement('afterend',set);
        //set.id = 'setbt';
        const actions = document.querySelector('#wrapper > h1 > span');//在书籍名称后面加按钮
        actions.insertAdjacentElement('afterend',button);
        button.id = 'syncbt';
    };

    // 获取书籍信息，需要研究下元素获取
    const getBookInfo = () => {
        const infos = document.querySelectorAll('#info .pl');
        let book = {};
        book['书名'] = document.querySelector('#wrapper > h1 > span').innerText;
        book['封面'] = document.querySelector('#mainpic > a > img').src;
        book['评分'] = document.querySelector('.rating_num').innerText;
        book['豆瓣链接']=window.location.href;
        //循环遍历infos，并把每个元素赋值给info
        for(const info of infos){
            if(info.innerText === '作者'){
                book['作者'] = info.nextSibling.nextSibling.innerText
            }else if(info.innerText === '出版社:'){
                book['出版社'] = info.nextSibling.nextSibling.innerText
            }else if(info.innerText === '丛书:'){
                book['丛书'] = info.nextSibling.nextSibling.innerText
            }else{
               let prop = info.innerText.substr(0,info.innerText.length-1)
                book[prop] = info.nextSibling.data
            }
        }
        return book
    };

    // 同步书籍信息到Notion
    const syncToNotion = () => {
        //先判断有没有设置用户api
        //checkUserInfo();
        debugger;
        const book = getBookInfo();
        //怎么创建数据库，并把数据传进去，是最大的问题？2023年4月17日11:40:34创建数据库；2023年4月17日14:52，创建数据库成功了，卧槽感人
        //createDatabase()
        //同步书到notion数据库
        createItem(book);
    };
    //创建页面子数据库database
    function createDatabase() {
        const body = {
            'parent': { 'type': 'page_id', 'page_id': pageId },
            'title': [
                {
                    'type': 'text',
                    'text': {
                        'content': 'BookList',
                        'link': null
                    }
                }
            ],
            'icon':{
                'type':'emoji',
                'emoji':'📚'
            },
            'properties': {
                '书名': {
                    'title': {}
                },
                '标签':{
                    'multi_select':{
                        'options':[
                            {
                                'name':'运营',
                                'color':'purple'
                            },
                            {
                                'name':'文学',
                                'color':'orange'
                            },
                            {
                                'name':'流行',
                                'color':'green'
                            },
                            {
                                'name':'生活',
                                'color':'default'
                            },
                            {
                                'name':'经管',
                                'color':'yellow'
                            },
                            {
                                'name':'科技',
                                'color':'blue'
                            },
                            {
                                'name':'文化',
                                'color':'red'
                            }
                        ]
                    }
                },
                '状态':{
                    'select':{
                        'options':[
                            {
                                'name':'🌑想读',
                                'color':'purple'
                            },
                            {
                                'name':'🌒在读',
                                'color':'orange'
                            },
                            {
                                'name':'🌕读过',
                                'color':'green'
                            }
                        ]
                    }
                },
                '打分':{
                    'select':{
                        'options':[
                            {
                                'name':'⭐️⭐️⭐️⭐️⭐️'
                            },
                            {
                                'name':'⭐️⭐️⭐️⭐️'
                            },
                            {
                                'name':'⭐️⭐️⭐️'
                            },
                            {
                                'name':'⭐️⭐️'
                            },
                            {
                                'name':'⭐️'
                            }
                        ]
                    }
                },
                '作者': {
                    'rich_text': {}
                },
                '出版社': {
                    'rich_text': {}
                },
                '出版年月': {
                    'rich_text': {}
                },
                '页数': {
                    'number': {
                        'format': 'number'
                    }
                },
                '评分': {
                    'number': {
                        'format': 'number'
                    }
                },
                'ISBN': {
                    'rich_text': {}
                },
                '封面': {
                    'files': {}
                },
                '豆瓣链接': {
                    'url': {}
                },
                '简介': {
                    'rich_text': {}
                },
            }
        };
        const options = {
            headers: {
                Authorization: 'Bearer ' + nToken,
                'Notion-Version': notionVersion,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.notion.com/v1/databases',
            headers: options.headers,
            data: options.body,
            onload: function(response) {
                const res = JSON.parse(response.responseText);
                if (res.object === 'error') {
                    alert(res.message);
                } else {
                    GM_setValue('databaseId',res.id);
                    databaseId = res.id;
                    toast.innerHTML =`
                       <div class="toast-body">
                          🎉 配置成功！
                       </div>
                        `;
                    // 显示轻提示框
                    toast.classList.add('show');

                    // 3秒后隐藏轻提示框
                    setTimeout(() => {
                        toast.classList.remove('show');
                    }, 3000);
                }
            }
        });

    }
    //同步书
    function createItem(book) {
        const body = {
            'parent': { 'type': 'database_id', 'database_id': databaseId },
            'icon':{
                'type':'emoji',
                'emoji':'📔'
            },
            'properties': {
                '书名': {
                    'type': 'title',
                    'title': [{ 'type': 'text', 'text': { 'content': book['书名'] } }]
                },
                'ISBN': {
                    'type': 'rich_text',
                    'rich_text': [{ 'type': 'text', 'text': { 'content': book['ISBN'] ? book['ISBN']:'' } }]
                },
                '页数': {
                    'number': parseInt(book['页数'] ? book['页数']:'' )
                },
                '状态':{
                    select:{
                        'name':'🌑想读'
                    }
                },
                '出版社': {
                    'type': 'rich_text',
                    'rich_text': [{ 'type': 'text', 'text': { 'content': book['出版社'] ? book['出版社']:'' } }]
                },
                '出版年月': {
                    'type': 'rich_text',
                    'rich_text': [{ 'type': 'text', 'text': { 'content': book['出版年'] ? book['出版年']:'' } }]
                },
                '评分': {
                    'number': parseFloat(book['评分'])
                },
                '作者': {
                    'type': 'rich_text',
                    'rich_text': [{ 'type': 'text', 'text': { 'content': book['作者']} }]
                },
                '封面': {
                    'files': [
                        {
                            'type': 'external',
                            'name': 'cover',
                            'external': { 'url': book['封面']}
                        },
                    ]
                },
                '豆瓣链接':{
                    'type':'url',
                    'url':book['豆瓣链接']
                }
            },
        };
        //传参数
        const options = {
            headers: {
                Authorization: 'Bearer ' + nToken,
                'Notion-Version': notionVersion,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.notion.com/v1/pages',
            headers: options.headers,
            data: options.body,
            onload: function(response) {
                const res = JSON.parse(response.responseText);
                if (res.object === 'error') {
                    alert(res.message);
                } else {
                    toast.innerHTML =`
                       <div class="toast-body">
                          🎉 同步成功！
                       </div>
                        `;
                    // 显示轻提示框
                    toast.classList.add('show');

                    // 3秒后隐藏轻提示框
                    setTimeout(() => {
                        toast.classList.remove('show');
                    }, 3000);

                }
            }
        });
    }

    addButton()
})();
