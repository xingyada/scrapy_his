const puppeteer = require('puppeteer');
const EventEmitter = require('events').EventEmitter;
const URL = require('url');
const path = require('path');

class PtScrawl extends EventEmitter {
    constructor(url, options) {
        super();

        this.rootPath = '';
        this.url = url;
        this.options = options;
        this.originUrl = ''; //protocol+hostname
        //资源缓存对象
        this.resourceBufferMap = new Map();
        //第三方域名列表
        this.thirdPartyList = new Map();
        //剔除JS文件
        this.thirdPartyList.set('\.js', '.pts');
        this.baseDir = options.baseDir || './asserts/'
        //存储的目录名
        this.directoryName = options.directoryName || 'temp'; //存储的目录名
        //请求类型白名单
        this.requestWhitelistContentType = [
            'image', 'script', 'stylesheet', 'document', 'font'
        ];
        //因为所有网络请求都会拦截，处理请求和页面资源以及dom构建无关可忽略
        //下面的域名是比较常见的前端采集域名 (有很多没有列出来的)
        this.blackList = [
            'collect.ptengine.cn',
            'collect.ptengine.jp',
            'js.ptengine.cn',
            'js.ptengine.jp',
            'hm.baidu.com',
            'api.growingio.com',
            'www.google-analytics.com',
            'script.hotjar.com',
            'vars.hotjar.com'
        ].concat(this.options.blackList || []);



    }

    _applyReplace(input, regCollections) {

        regCollections.forEach((value, key) => {
            let regExp = new RegExp(key, 'g')
            input = input.replace(regExp, value);
        });
        return input;
    }
    /**
     * 监听request 回调函数
     * @param {*} req 
     */
    async _onRequest(req) {
        //如果请求的是第三方域名，只考虑和页面构建相关的资源
        if (req.url().indexOf(this.originUrl) == -1 &&
            !this.requestWhitelistContentType.includes(req.resourceType()) ||
            this.blackList.indexOf(URL.parse(req.url()).host) != -1) {
            return req.abort();
        }

        req.continue();
    }

    /**
     * 监听response 响应
     * @param {*} res 
     */
    async _onResponse(res) {
        let request = res.request(),
            resourceUrl = decodeURIComponent(request.url()),
            urlObj = URL.parse(resourceUrl),
            filePath = urlObj.pathname, //文件路径
            dirPath = path.dirname(filePath), //目录路径
            requestMethod = request.method().toUpperCase(), //请求方法
            isSameOrigin = resourceUrl.includes(this.originUrl); //是否是同域名请求
        console.log(resourceUrl)
        //只考虑get请求资源，其它http verb 对文件资源请求较少
        if (requestMethod === 'GET') {
            //如果是同一个域名下的资源，则直接构建目录，下载文件
            //创建路径的方式依据请求本身path结构，保证和原资源网站目录结构完整统一，这样即使有CMD、AMD规范的代码再次执行，require相对路径也不会出现问题。
            let dirPathCreatedIfNotExists,
                filePathCreatedIfNotExists;

            let hostname = urlObj.hostname;

            if (isSameOrigin) {
                //如果返回的document类型，且文件路径没有拓展名
                if (request.resourceType() === 'document' && !path.extname(filePath)) {

                    this.rootPath = filePath;

                }
                if (filePath.indexOf(this.rootPath) != -1) {
                    let t_regEx = new RegExp(this.rootPath);
                    let t_dirPath = dirPath.replace(t_regEx, ''),
                        t_filePath = filePath.replace(t_regEx, '');
                    dirPathCreatedIfNotExists = path.join(this.baseDir, this.directoryName, t_dirPath);
                    filePathCreatedIfNotExists = path.join(this.baseDir, this.directoryName, t_filePath);
                    path.extname(filePathCreatedIfNotExists) && this.emit('data', {
                        dirKey: dirPathCreatedIfNotExists,
                        fileKey: filePathCreatedIfNotExists,
                        value: await res.buffer()
                    });
                }
                //构建同域名path
                //同域名的资源 有时会以//www.xxx.com/images/logo.png 这种方式使用，所以，对这种资源需要特殊处理

                this.thirdPartyList.set(`(https?:)?//${hostname}`, '.');
                dirPathCreatedIfNotExists = path.join(this.baseDir, this.directoryName, dirPath);
                filePathCreatedIfNotExists = path.join(this.baseDir, this.directoryName, filePath);
            } else {
                //第三方资源构建正则表达式，替换http、https、// 三种模式路径为本地目录路径
                this.thirdPartyList.set(`(https?:)?//${hostname}`, `./${hostname}`);
                dirPathCreatedIfNotExists = path.join(this.baseDir, this.directoryName, hostname, dirPath);
                filePathCreatedIfNotExists = path.join(this.baseDir, this.directoryName, hostname, filePath);
            }
            //获取扩展名 如果获取不到 则认为不是资源文件
            if (path.extname(filePathCreatedIfNotExists) && res.ok()) {

                if ((isSameOrigin && dirPath != '/') || !isSameOrigin) {
                    let needReplace = ['stylesheet', 'script'];
                    //@fixme toString 可能会有编码问题
                    let fileContent = (await res.buffer()).toString();
                    //第三方域名还获取，先缓存再处理
                    if (needReplace.includes(request.resourceType())) {
                        //js css 文件中可能包含需要替换的内容，需要处理
                        //所以暂时缓存不写入文件
                        this.resourceBufferMap.set(filePathCreatedIfNotExists, {
                            dir: dirPathCreatedIfNotExists,
                            content: fileContent
                        });
                    } else {
                        //路径不存在，直接创建多级目录
                        this.emit('data', {
                            dirKey: dirPathCreatedIfNotExists,
                            fileKey: filePathCreatedIfNotExists,
                            value: await res.buffer()
                        });

                    }

                }
            } /* else if (!path.extname(filePathCreatedIfNotExists) && res.headers()['content-type'].includes('image')){ //如果不存在扩展名且相应回来的内容是img
                //把当前链接，截取后几位做替换
                //把URL通过问号截取
                let noExtnameFileName = resourceUrl.substring(resourceUrl.length - 15).replace(/\/|=|&/g, 'pts');
                
                this.thirdPartyList.set(`${hostname}?${filePath.replace(/\//g,'\/')}?${urlObj.search}`, `./noExtname/${noExtnameFileName}`);
                dirPathCreatedIfNotExists = path.join(this.baseDir, this.directoryName, 'noExtname/' );
                filePathCreatedIfNotExists = path.join(this.baseDir, this.directoryName, `/noExtname/${noExtnameFileName}`);

                this.emit('data', {
                    dirKey: dirPathCreatedIfNotExists,
                    fileKey: filePathCreatedIfNotExists,
                    value: await res.buffer()
                });
            } */

        }
    }
    //puppeteer添加等待时间-by-yada
    timeout(delay) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    resolve(1)
                } catch (e) {
                    reject(0)
                }
            }, delay)
        })
    }
    async start() {
        try {
            if (this.options.beforeStart && typeof this.options.beforeStart === 'function') {
                this.options.beforeStart.call(this, this.options);
            }
            const browser = await puppeteer.launch({
                headless: false,
                ignoreHTTPSErrors: true,
                args: ['--no-sandbox'],
                defaultViewport: {
                    height: '20000px'
                }
            });

            const page = await browser.newPage();
            //启用请求拦截
            await page.setRequestInterception(true);

            let docUrl = URL.parse(this.url);
            //获取请求地址的域名，用来确定资源是否来自第三方
            this.originUrl = `${docUrl.protocol}//${docUrl.hostname}`;

            page.on('request', this._onRequest.bind(this));

            page.on('response', this._onResponse.bind(this));

            await page.goto(this.url, {
                waitUntil: 'networkidle0'
            });
            //滚动到底部--by-yada
            await page.evaluate(() => {
                var num = 100;
                var timerScroll = setInterval(function () {
                    if (document.documentElement.scrollTop + document.documentElement.clientHeight >= document.documentElement.scrollHeight) {
                        clearInterval(timerScroll);
                    }
                    document.documentElement.scrollTop = num;
                    num += 1000
                }, 30)
            });
            await this.timeout(5000);
            //对css javascript文件 进行替换处理
            this.resourceBufferMap.forEach((value, key) => {
                let {
                    dir,
                    content
                } = value;
                content = this._applyReplace(content, this.thirdPartyList);

                this.emit('data', {
                    dirKey: dir,
                    fileKey: key,
                    value: content
                });
            });

            //清空缓存
            this.resourceBufferMap.clear();
            await page.waitFor(10000);
            let content = await page.content();
            // html 内容处理
            content = this._applyReplace(content, this.thirdPartyList);
            content && this.emit('end', {
                fileKey: path.join(this.baseDir, this.directoryName, 'index.html'),
                value: content
            });


            await page.close();
            await browser.close();

        } catch (error) {
            console.log(error);
        }

    }
}


module.exports = PtScrawl;