//每种客户端自己实现，ptscrawl 只负责数据抓取，由上层代码处理数据
//本客户端是直接写抓取内容到本地磁盘

const shell = require('shelljs');
const md5 = require('md5');
const fs = require('fs');

const PtScrawl = require('./lib/scrawl');

//使用 本地存储 存储模式可灵活实现
//以博客园为例子进行页面抓取

function generateHistoryHeatmapFiles(url) {
    let s = Date.now();

    let md5_str = md5(Date.now());

    let ptScrawl = new PtScrawl(url, {
        directoryName: md5_str,
        baseDir: './asserts/',
        beforeStart: function (ctx) {
           // shell.exec(`rm -rf ${ctx.baseDir}`);
        }
    });


    ptScrawl.on('data', (data) => {
        let {
            dirKey,
            fileKey,
            value
        } = data;
        if (!fs.existsSync(dirKey)) {
            shell.exec(`mkdir -p ${dirKey}`);
           // console.log('create dir');
        }

       // console.log(fileKey);

        fs.writeFileSync(fileKey, value);
    });

    ptScrawl.on('end', (data) => {
        console.log('end event');
        // console.log(data);
        let {
            fileKey,
            value
        } = data;

        fs.writeFileSync(fileKey, value);
        //console.log('保存完成，共用时', (Date.now() - s) / 1000, 's');
    })

    ptScrawl.start();

    return md5_str;
}

module.exports =generateHistoryHeatmapFiles;

//require.main.filename：用node命令启动的module的filename, 如 node xxx，这里的filename就是这个xxx。
if(require.main.filename==__filename){
    generateHistoryHeatmapFiles('http://fudao.wendu.com/zt/kyyxb/m/');
}