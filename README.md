# PtScrawl 

## 安装

```bash

```

## 配置

```javascript
//指定要修改的url
//使用 本地存储 存储模式可灵活实现
//以博客园为例子进行页面抓取
let ptScrawl = new PtScrawl('https://www.cnblogs.com', {
    directoryName: md5(Date.now()),
    baseDir: './asserts/',
    beforeStart: function (ctx) {
        shell.exec(`rm -rf ${ctx.baseDir}`);
    },
    write: function (data) {
        console.log('data event');
        // console.log(data);
        let {
            dirKey,
            fileKey,
            value
        } = data;
        if (!fs.existsSync(dirKey)) {
            shell.exec(`mkdir -p ${dirKey}`);
            console.log('create dir');
        }

        fs.writeFileSync(fileKey, value);


    },
    end: function (data) {
        console.log('end event');
        // console.log(data);
        let {
            fileKey,
            value
        } = data;
        fs.writeFileSync(fileKey, value);
    }
});

ptScrawl.start();

//也可以订制其它存储方式 比如 S3 存储桶

```

## 启动

```bash
node ./client.js
```
