// Packages this Codex session's authored revisions. This is not an online generator.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import type {AnswerArtifact,DesignBaseline,InteractiveBlock,SceneStep} from '../src/lib/types';
import {seedAnswers} from '../src/data/seeds';
const plans=JSON.parse(await readFile('artifacts/session/v2-plan.json','utf8'));
const styles:Record<string,[string[],string,string,string]>={
  hnsw:[['#fafaf7','#252723','#c46a3d'],'黑体正文，等宽层号；句旁控制 14px，图中标签适度缩小。','白纸上的稀疏点线；开头与结尾无容器边框。','搜索由点击逐步推进；不自动奔跑。'],
  camera:[['#e9e1d4','#5d624e','#b69a71'],'句旁提问用衬线；镜头参数用等宽；避免新的大标题。','暖色窗光、哑光相机与透明段落控制；不用照片素材。','改变焦点用局部模糊；快门短闪尊重减少动态效果。'],
  birthday:[['#fffaf2','#9d4b2f','#76523c'],'编辑式大人数与小生日；概率比较是正文旁的短算式。','米白纸张与棕橙标记；只有房间承担密集视觉。','由加入人数触发静态更新；每轮随机、没有循环动画。'],
  ledger:[['#f6f3e9','#748363','#5b644c'],'账目等宽、金额衬线；边注以 14px 阅读为主。','账本和月历是对象，公式与结论无卡片。','逐月翻页；不做连续滚动数字或收益动画。'],
  knowledge:[['#faf5dd','#71613f','#7f8155'],'纸条用衬线，任务输入清楚可读。','任务纸承载具体行动；开头一句输入与结尾边注融入正文。','勾选即反馈，不把心理状态做成积分或进度条。'],
  story:[['#fbf8f5','#765965','#cdb5b4'],'文学衬线正文、轻注释；原文与阅读提示明确分开。','以留白、细线和一个可展开的词为主，去掉独立游戏外壳。','展开与视角切换立即发生，不加惊吓或持续抖动。'],
  redis:[['#edf3f0','#466a55','#52876d'],'命令与毫秒用等宽；句旁问题不另起标题。','通信装置只承担传输，前后时间算式与判断使用透明背景。','离散分步，不伪装真实网络计时。'],
  desk:[['#e9dbc7','#77624b','#839482'],'纸边原句与物件说明用衬线，年份用等宽。','物件有温暖木纹，句旁纸条简单；不做生产力桌面。','翻年由读者决定，开头纸条同步变化，不自动播放十年。'],
  mars:[['#20282c','#c18561','#8a5f4c'],'距离等宽、正文边注衬线；场景中保持可读对比。','星球场景保留主视觉，前后光程与回复时间不再做大面板。','仅评论传播移动，标注120倍速；离屏暂停。'],
  table:[['#f1f0e5','#65764e','#dfb657'],'假设克数与算式清晰，正文旁少量衬线。','餐盘和食物是主要物件；加法贴着原文，不再加营养仪表盘。','放入、移走立即反馈；最多8份，无自动摆盘动画。'],
  weather:[['#f7fafc','#577181','#a5b8c6'],'手机内部遵循普通应用字号；原始任务保持一句话。','保留手机对象，去掉其外层重复的任务海报；任务和计数散布在正文。','用户每次点击才增加步骤；无真实广告、定位或弹窗。'],
  neutron:[['#171922','#d8d0f4','#766388'],'极简数量级衬线、单位等宽；边注保持正常阅读尺寸。','暗色刻度是唯一强视觉；单位换算和物理边界保持明亮正文背景。','读者逐档拉远；无闪烁、持续粒子或大规模对象。'],
};
const mainDesign:Record<string,[string,string,string]>={
  hnsw:['交通换乘比喻刚建立，立即把抽象的层级换成可逐步走过的路径；查询选择已经在开头完成。','点击下一步观察当前层与节点，抵达底层后停止；句旁换目标会从入口重来。','SVG 分层节点和边承载搜索过程；步索引决定高亮路径。query-choice 只在变化时重算路径，search-step 回写正文。概念示意不代表完整 HNSW 实现。'],
  camera:['第一段先区分对焦与景深，第二段才给出杯子、植物和街道，取景器放在这里可以直接承接这些对象。','在句旁选择看清谁，在镜头上改变光圈，快门留下当时的照片；结尾可以选择是否保留环境。','SVG 绘制三段距离，局部模糊示意景深；焦点和光圈索引驱动画面，快门复制当时画面。外部选择仅在值改变时应用，避免覆盖镜头上的新操作。'],
  birthday:['先用句旁对比澄清任意两人的问题，再让人进入房间；避免读者带着另一个问题解释随机结果。','逐个邀请或直接到23人，观察重复日期；重开产生新一轮，理论概率不随随机样本改变。','上限60人的日期数组单独记录样本；理论值用无碰撞概率连乘的补集计算。显示随机碰撞与理论概率两种结果，发出人数与概率绑定。'],
  knowledge:['读到“自己的行动带来完结”后才出现任务纸，读者刚好能把定义应用到开头留下的目标。','把目标拆成小行动，完成后亲自确认，也可以放下或新增；后段提示承接确认数量。','DOM 任务列表保存本次浏览的完成状态，最多5件；目标从 goal-title 接收，完成数通过 wins 回传，不声称替作者评估心理状态。'],
  ledger:['第一段给定贷款假设，第二段提出生活仍在发生；此时翻月份才能把月供比较推进为现金过程。','选择当月事件再翻页，观察收入支出与现金；结尾边注跟随余额，重置回到初始储备。','等额本息公式与月份事件共同更新现金，内部保留数值精度，仅展示时取整。月份上限和复位明确，cash-balance 传递结果供边注读取。'],
  story:['开头先用一个词的注释建立有限视野，叙述展开后再给两个观察位置，不在开场打断故事。','切换跟随她或旁观者，点击局部词语查看阅读提示，然后回到原文继续。','将返回片段与生成注释区分呈现；视角索引只改变强调和提示，通过 story-view 联动文字，不续写情节或替换宿主原文。'],
  redis:['第一段先分清路上与处理成本，原文给出两种公式后才执行传输，让公式对应到往返动作。','选择逐条或批量模式，逐步发送、处理、返回，比较命令数不变时的等待总量。','固定6条命令、80ms往返、2ms处理；有限步骤状态驱动 SVG 位置和计时。批量92ms、逐次492ms是简化假设，复位清空进度。'],
  desk:['读到2021年的忙碌时打开桌面，读者已经知道2016的愿望，翻年才有可比较的情绪变化。','翻看三个年份并点选物件，开头的纸条也随年份变化；可以回到2016重读。','原生代码绘制桌面物件，年份索引选择对应原文语句与物件；desk-year 将年份送回开头纸条。避免用分数或职业建议解释生活变化。'],
  mars:['先用光程短句建立时间尺度，再在原文给出具体距离后进入评论场景，把延迟变成一次交流经历。','发送评论，等信号抵达；结尾再看一次立即回复要等待多久，等待期间不能把发送当作已送达。','用距离除以光速计算单程，120倍压缩为演示时钟。动画监听可见性并清理，评论状态区分传播中和抵达，不触发真实网络消息。'],
  table:['第一段说明虚构份量与数值，第二段提出摆放动作；此时出现餐盘，开头的算式可以随操作返回解释。','放入或移走食物，盘中总量和开头各项加法同时变化；清空餐盘恢复零。','最多8项的食物数组决定代码物件、总量与 plate-formula；protein-total 更新正文。数值仅是教学假设，不产生摄入建议。'],
  weather:['第一段描述干扰，第二段提出原始任务已改变；在这个转折处交给读者亲自走一次路径。','打开虚构天气应用，依次关闭或选择额外步骤，比较多次打开的操作次数，再恢复最初状态。','有限页面状态与轮次决定模拟手机内容；每次真实点击才记数，通过 weather-clicks 回到任务句旁。无真实广告、定位、支付或权限请求。'],
  neutron:['先完成毫升到立方米的单位换算，再进入密度与体积对应的数量级猜测，避免强视觉掩盖算术。','先猜质量，再放置参照并逐档拉远；到达末档停止，可重置重新比较。','密度乘体积得到假设质量，有限参照序列驱动 SVG 尺度切换；单位与数量级保持一致。结尾说明这不是现实中可稳定取出的一勺物质。'],
};
const mainDemos:Record<string,SceneStep['demo'][]>={
  hnsw:[{event:'click',selector:'#next'}],camera:[{event:'click',selector:'#shutter'}],
  birthday:[{event:'click',selector:'#twentythree'}],ledger:[{event:'click',selector:'[data-event="appliance"]'},{event:'click',selector:'#next'}],
  knowledge:[{event:'click',selector:'#tasks .task button'}],story:[{event:'click',selector:'[data-view="1"]'}],
  redis:[{event:'click',selector:'[data-mode="batch"]'},{event:'click',selector:'#step'},{event:'click',selector:'#step'},{event:'click',selector:'#step'}],
  desk:[{event:'click',selector:'[data-year="2"]'}],mars:[{event:'click',selector:'#send'}],
  table:[{event:'click',selector:'[data-food="egg"]'}],weather:[{event:'click',selector:'#screen button'}],
  neutron:[{event:'click',selector:'[data-guess="2"]'},{event:'click',selector:'#zoom'}],
};
const mainChecks:Record<string,string[]>={
  hnsw:['句旁查询改变搜索目标并回到入口','下一步抵达底层后停止，重来有效'],
  camera:['句旁焦点与取景器同步','f/8 与 f/1.8 改变清晰范围，快门快照不追随之后的调整'],
  birthday:['23 人理论概率显示50.7%','60人上限与重开有效，随机观察不冒充理论必然'],
  ledger:['家电首月现金约138676元','正常12个月约254111元，归零回到150000元'],
  knowledge:['句旁目标能带入任务纸','完成、放下、新增和5件上限有效'],
  story:['切换视角改变提示而不改写原文','展开关键词和恢复有效'],
  redis:['批量传输92ms，逐次492ms','命令始终为6条，终点与复位有效'],
  desk:['翻到2026，开头纸条变为“有时间认真生活”','物件提示使用原文语句，恢复2016有效'],
  mars:['发送后经历传播等待，离屏暂停','空白拒绝；单程约12分31秒，演示约6.25秒'],
  table:['每种一份总计24g，开头算式同步','8份上限、移走与清空有效'],
  weather:['三轮点击分别为1、2、4','句旁任务计数同步，重开有效'],
  neutron:['质量为2×10¹²kg，等于20亿吨','拉远到每格10亿吨时占2格，重猜有效'],
};
await mkdir('artifacts/session/v2',{recursive:true});
for(const plan of plans){
  const source=seedAnswers.find(a=>a.source.id===plan.answerId)!.source;
  const key=source.origin==='knowledge'?'knowledge':source.origin==='story'?'story':source.id;
  const raw=JSON.parse(await readFile('artifacts/session/v1/'+source.id+'.json','utf8')) as AnswerArtifact;
  const main=raw.blocks[0];main.afterParagraphId=source.paragraphs[plan.mainAfter].id;main.kind=['hnsw','birthday','desk','story'].includes(key)?'figure':'experience';
  if(key==='hnsw'){
    main.html=main.html.replace(/<div class="queries"[\s\S]*?<\/div>/,'').replace(/<h2>[\s\S]*?<\/h2>/,'');
    main.css+='section{background:transparent;border:0;padding:8px 0}header>span{display:none}';
    main.js+='world.onState(s=>{const n=Number(s["query-choice"]);if(Number.isInteger(n)&&n>=0&&n<=2&&n!==q){q=n;plan()}});';
  }
  if(key==='camera'){
    main.html=main.html.replace(/<div class="subjects">[\s\S]*?<\/div>/,'');
    main.js+='let externalFocus,externalAp;world.onState(s=>{let changed=false;const f=s["focus-choice"],a=s["ap-choice"];if(f!==undefined&&f!==externalFocus){externalFocus=f;const n=Number(f);if(n>=0&&n<=2){focus=n;changed=true}}if(a!==undefined&&a!==externalAp){externalAp=a;const n=Number(a);if(n>=0&&n<=2){ap=n;changed=true}}if(changed)render()});';
  }
  if(key==='knowledge'){
    main.js='let externalGoal="";'+main.js;
    main.js=main.js.replace("$('#goal').value='开始认真写一篇文章'","$('#goal').value=externalGoal||'开始认真写一篇文章'");
    main.js+='world.onState(s=>{if(typeof s["goal-title"]==="string"&&s["goal-title"]!==externalGoal){externalGoal=s["goal-title"];document.querySelector("#goal").value=externalGoal}});';
  }
  if(key==='table')main.js=main.js.replace("world.emit('protein-total'","world.emit('plate-formula',plate.map(f=>foods[f].protein).join(' + ')||'0');world.emit('protein-total'");
  if(key==='story')main.css+='section{background:transparent;border:0;padding:8px 0}header{display:none}';
  if(key==='ledger'||key==='redis')main.html=main.html.replace(/<h2>[\s\S]*?<\/h2>/,'');
  if(key==='weather'){
    main.html=main.html.replace('<span>一个很小的任务</span>','').replace(/<h2>[\s\S]*?<\/h2>/,'').replace('<p>你只想知道要不要带伞。<br>试着打开这个虚构 App。</p>','');
    main.css+='section{background:transparent;border:0;padding:8px 0;justify-content:center;gap:12px}.intro{order:2;flex:none;min-width:100%;padding-top:0}.phone{margin:0 auto}section>small{order:3}';
  }
  const components:DesignBaseline['components']=[{blockId:main.id,purpose:plan.mainPurpose,whyHere:mainDesign[key][0],interaction:mainDesign[key][1],implementation:mainDesign[key][2],checks:mainChecks[key]}];
  const demos=new Map<string,SceneStep['demo'][]>([[main.id,mainDemos[key]]]);
  const extraBlocks:InteractiveBlock[]=plan.extras.map((e:any)=>{
    const block={id:e.id,afterParagraphId:source.paragraphs[e.after].id,title:e.title,kind:e.kind,height:e.kind==='aside'?90:60,html:e.html,css:e.css+'body{color:'+styles[key][0][2]+'}button{color:'+styles[key][0][2]+'}',js:e.js};
    components.push({blockId:e.id,purpose:e.purpose,whyHere:e.why,interaction:e.interaction,implementation:e.implementation,checks:[e.interaction,'不改写原文；保持窄屏阅读和键盘按钮可用']});
    if(e.binding)raw.bindings.push({id:e.binding.id,paragraphId:block.afterParagraphId,label:'片段联动',initial:e.binding.initial,hidden:true});
    demos.set(e.id,[e.demo,...(e.id==='wins-open-loop'?[{event:'click' as const,selector:'#carry'}]:[])]);
    return block;
  });
  raw.blocks=[main,...extraBlocks].sort((a,b)=>source.paragraphs.findIndex(p=>p.id===a.afterParagraphId)-source.paragraphs.findIndex(p=>p.id===b.afterParagraphId));
  const [palette,typography,surface,motion]=styles[key];
  raw.design={version:'editorial-v2.2026-09-07',intent:plan.mainPurpose,readingFlow:plan.flow,voice:source.bio,
    style:{palette,typography,surface,motion},decisions:[
      {title:'按文章的转折安排表达',reason:plan.flow,tradeoff:'把不同任务分开会增加状态传递；为避免碎片化，片段沿正文推进，共用这篇的视觉语气。'},
      {title:'为文字留下位置',reason:'短片段只负责一个解释点，主场景才使用物件和较大画面。',tradeoff:'不追求每段都能操作；原文完整保留，展开和留白也属于阅读的一部分。'},
      {title:'把设计约定交给下一次生成',reason:'每个片段均记录位置理由、行为、实现与检查，后续模型读取当前版本再修改。',tradeoff:'基线提供连续性；用户改变表达目标时可以修订，不能变成固定题材模板。'}
    ],components:raw.blocks.map(b=>components.find(c=>c.blockId===b.id)!)};
  raw.explanation=plan.flow+' 各处表达沿正文展开，风格与联动方式记录在本篇设计基线中。';
  raw.scene=[{action:'compare',target:source.paragraphs[0].id,title:'先确定整篇的阅读路线',text:plan.flow}];
  for(const block of raw.blocks){
    const c=components.find(c=>c.blockId===block.id)!;
    raw.scene.push({action:'focus',target:block.afterParagraphId,title:'为什么在这里：'+block.title,text:c.whyHere.slice(0,200)});
    const actions=demos.get(block.id)||[];
    raw.scene.push({action:'reveal',target:block.id,title:'让这个设计实际动一次',text:(c.purpose+' '+(actions.length>1?'接下来逐步操作；每一步都停下来查看反馈。':c.interaction)).slice(0,200),demo:actions[0]});
    actions.slice(1).forEach((demo,i)=>raw.scene.push({action:'reveal',target:block.id,title:'继续这次操作 · '+(i+2),text:'继续操作同一个片段，观察界面和正文响应。实现约定：'+c.implementation.slice(0,150),demo}));
  }
  raw.scene.push({action:'restore',target:source.paragraphs[source.paragraphs.length-1].id,title:'把这些片段放回整篇文章',text:'这篇保持'+surface+' '+motion+' 这些约定已经保存，后续模型会据此延续或说明新的取舍。'});
  await writeFile('artifacts/session/v2/'+source.id+'.json',JSON.stringify(raw,null,2));
}
console.log('已组装12篇会话修订：31个沿正文分布的表达片段。');
