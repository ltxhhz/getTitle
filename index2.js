var https = require('https'),
  cheerio = require('cheerio'),
  mysql = require('mysql'),
  fs = require('fs'),
  path = require('path');

var conn = mysql.createConnection({
  host: 'localhost',
  user: '用户名',
  password: '密码',
  database: '数据库',
  // multipleStatements: true // 支持执行多条 sql 语句
})

var optPath = path.resolve(__dirname, 'opt.json')

var opt; //200014881, //976193
console.log('running');
if (fs.existsSync(optPath)) {
  opt = JSON.parse(fs.readFileSync(optPath))
  optPath = fs.openSync(optPath, 'w')
} else {
  optPath = fs.openSync(optPath, 'w')
  fs.writeSync(optPath, new Buffer(JSON.stringify(opt = {
    dbName: 'tiku',
    cListTB: 'courselist1',//用来储存课程列表的表
    topicTB: 'topic1',//用来储存题目的表
    currentPage: 200016301,//开始课程号
    maxPage: 300000000,//结束课程号
    fault: [],//出问题的课程号
    pageNow: 0,//运行到某一课第几个页面
    titleNow: 0//施工中
  })), undefined, undefined, 0)
}
conn.connect(function (err) {
  if (err) {
    console.error('连接错误:' + err.stack)
  }
  console.log('连接的id ' + conn.threadId);
  getData()

  // addCourseToDB(9);
})

function getData() {
  fs.ftruncateSync(optPath) //new Buffer()
  fs.writeSync(optPath, Buffer.alloc(Buffer.byteLength(JSON.stringify(opt)), JSON.stringify(opt)), undefined, undefined, 0)
  console.log('到', opt.currentPage) /* 210897355 */
  getKnowledgeId(opt.currentPage).then(async (res) => {
    let [a0, a1] = res, add;
    if (a1) {
      await addCourseToDB(opt.currentPage, a1);
    }
    if (a0.length > 0) {
      let dataNow = a0[0],
        i = 1,
        page;
      add = async () => {
        getTitle(opt.currentPage, dataNow).then(async (reBack) => {
          let [a, b, c] = reBack;
          page = page === undefined ? b : page;
          opt.pageNow = i
          fs.ftruncateSync(optPath)
          fs.writeSync(optPath, Buffer.alloc(Buffer.byteLength(JSON.stringify(opt)), JSON.stringify(opt)), undefined, undefined, 0)
          dataNow = page[i];
          i++;
          if (a.length > 0) { //保存题目
            for (let j = 0; j < a.length; j++) {
              a[j] = a[j].trim();
              if (a[j].length > 2000) {
                await addTopicToDB(opt.currentPage, a1, a[j].substring(0, 2000))
              } else {
                await addTopicToDB(opt.currentPage, a1, a[j])
              }
            }
            if (dataNow != null) {
              await add();
            } else {
              opt.currentPage++
              if (opt.currentPage === opt.maxPage) { //上限
                console.log('获取完成');
              } else {
                console.log('下一课', opt.currentPage);
                getData();
              }
            }
          } else { //跳过 没有题目
            if (c) { //记录 跳过
              opt.fault.push(opt.currentPage)
              opt.fault = unique(opt.fault)
              console.log('记录', opt.fault)
            }
            if (dataNow) { //下一页
              await add()
            } else { //下一课
              console.log('跳过', opt.currentPage)
              opt.currentPage++
              if (opt.currentPage === opt.maxPage) {
                conn.end();
                console.log('数据库连接关闭');
              } else {
                getData()
              }
            }
          }
        })
      }
      await add()
    } else { //跳过 没有页面
      console.log('跳过', opt.currentPage)
      opt.currentPage++
      if (opt.currentPage === opt.maxPage) {
        conn.end();
        console.log('数据库连接关闭');
      } else {
        getData()
      }
    }
  })
}
/**
 * 获取题目页id
 * @param {string|number} courseId 
 * @param {Function} cb 回调函数
 */
function getKnowledgeId(courseId, cb) {
  let url1 = 'https://mooc1.chaoxing.com/course/' + courseId + '.html',
    back = "";
  return new Promise((resolve, rej) => {
    https.get(url1, (res) => {
      if (res.statusCode == 404) {
        resolve([
          []
        ])
        return
      }
      res.on("data", (e) => {
        back += e;
      })
      res.on("end", (e) => {
        back = back.toString()
        arr = findAll(back, 'courseId=' + courseId + '&knowledgeId=([0-9]*)">')
        let cn = findAll(back, '<title>(.*)</title>');
        cn = cn.length > 0 ? cn[0] : ''
        console.log(arr);
        resolve([arr, cn]);
      })
      res.on("error", (e) => {
        rej(e)
      })
    })
  })
}
/**
 * 获取题目
 * @param {string|number} courseId 
 * @param {string|number} knowledgeId 
 * @param {Function} cb 回调函数
 */
function getTitle(courseId, knowledgeId, cb) {
  let url2 = 'https://mooc1.chaoxing.com/nodedetailcontroller/visitnodedetail?courseId=' + courseId + '&knowledgeId=' + knowledgeId,
    back = "",
    back2 = "",
    arr = [],
    url3 = "",
    title = [],
    datas = [],
    $1 = cheerio.load(back, {
      decodeEntities: false
    });
  return new Promise((resolve, rej) => {
    https.get(url2, (res) => {
      res.on("data", (e) => {
        back += e
      })
      res.on("end", (e) => {
        back = back.toString()
        arr = findAll(back, '&quot;:&quot;work-(.*?)&quot;')
        arr = unique(arr)
        datas = findAll(back, '<div id="c?o?u?r?s?e?C?h?a?p?t?e?r?S?e?l?e?c?t?e?d?" class="[\\s\\S]*?" data="(\\d*)">?')
        if (arr.length > 0) {
          for (let workId in arr) {
            url3 = 'https://mooc1.chaoxing.com/api/selectWorkQuestion?workId=' + arr[workId] + '&ut=null&classId=0&courseId=' + courseId + '&utenc=null';
            https.get(url3, (res) => {
              res.on('data', (e) => {
                back2 += e
              })
              res.on('end', (e) => {
                back2 = back2.toString()
                let $2 = cheerio.load(back2, {
                    decodeEntities: false
                  }),
                  node1, node2;
                node1 = $2('.TiMu>.Zy_TItle');
                if (node1.length > 0) {
                  let a = node1.children('.clearfix').html()
                  if (a == null || a.trim() == '') {
                    a = node1.children('.Zy_TItle_p').html()
                  }
                  if (!a) {
                    debugger
                    a = ''
                  } else {
                    a = delHtmlTag(a)
                  }
                  if (a.trim() != '') {
                    let b;
                    title.push(a)
                    node2 = node1.parent('.TiMu')
                    for (let i = 1; i < node2.length; i++) {
                      b = $2('html').find(node2[i]).children('.Zy_TItle').children('.clearfix').html();
                      if (b == null || b.trim() == '') {
                        b = $2('html').find(node2[i]).children('.Zy_TItle').children('.Zy_TItle_p').html();
                      }
                      if (!b) {
                        continue
                      }
                      b = delHtmlTag(b)
                      if (b.trim() != '') {
                        title.push(b)
                      } else { //记录 跳过 下一页
                        resolve([
                          [], datas, true
                        ])
                      }
                      // node2 = node2.next('TiMu')
                    }
                    resolve([title, datas])
                  } else { //跳过 下一页 记录
                    resolve([
                      [], datas, true
                    ])
                  }
                } else { //跳过 下一页 /空页面
                  resolve([
                    [], datas
                  ])
                }
              })
              res.on('error', (res) => {
                rej(res)
              })
            })
          }
          // cb(title, datas)
        } else { //跳过 下一页 /空页面
          resolve([
            [], datas
          ])
        }
      })
      res.on("error", (e) => {
        rej(e)
      })
    })
  })

}

/**
 * 将课程数据添加到数据库
 * @param {string|number} courseId 课程id
 */
function addCourseToDB(courseId, courseName) {
  let post = {
    序号: null,
    课程名: courseName,
    课程id: courseId
  }
  return new Promise((result, rej) => {
    conn.query('insert into ' + opt.cListTB + ' set ?', post, (err, res, fie) => {
      if (err) throw err;
      result(err)
    })
  })
  // conn.query('SELECT * FROM list where `课程id`=' + courseId + ';', function (error, results, fields) {
  //   if (error) throw error;
  //   cb(results)
  // });
}

async function addTopicToDB(courseId, courseName, topic) {
  let post = {
    序号: null,
    课程id: courseId,
    课程名: courseName,
    问题: topic,
    答案: null
  }
  new Promise((result, rej) => {
    conn.query('insert into ' + opt.topicTB + ' set ?', post, (err, res, fie) => {
      if (err) throw err;
      result(err)
    })
  })
}
/**
 * 去除html标签
 * @param {string} str 待操作的文本
 */
function delHtmlTag(str) {
  // console.log('删',str)
  return str.replace(/<[^>]+>/g, ""); //去掉所有的html标记
}

/**
 * 返回所有子匹配文本
 * @param {*} data 待操作的文本
 * @param {string} re 正则表达式字符串
 */
function findAll(data, re) {
  let reRule = new RegExp(re, 'ig'),
    arr = [],
    end = [];
  reRule.compile(reRule);
  end = reRule.exec(data);
  if (end != null && end.length > 0) {
    arr.push(end[1])
  } else {
    return []
  }
  while (end) {
    //console.log(arr)
    end = reRule.exec(data);
    if (end != null && end.length > 0) {
      arr.push(end[1]);
    }
  }
  return arr
}

/**
 * es6方法数组去重
 * @param {[*]} arr 要去重的数组
 */
function unique(arr) {
  return Array.from(new Set(arr))
}

/**复制数组或对象
 * @param {array|{}}source 数组或对象
 * @returns {array|{}} 数组或对象
 */
function copyLinearArray(source) {
  var sourceCopy = [],
    objectCopy = {}
  if (source.constructor === Object) { //如果是对象
    for (let item in source) objectCopy[item] = source[item].constructor === Object ? copyLinearArray(source[item]) : source[item];
    return objectCopy;
  } else { //如果是其他数组
    for (let item in source) sourceCopy[item] = source[item].constructor === Object ? copyLinearArray(source[item]) : source[item];
    return sourceCopy;
  }
}
