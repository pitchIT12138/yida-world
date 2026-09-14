import {chromium,type Browser,type BrowserContext,type Page} from 'playwright';
import {randomBytes} from 'node:crypto';
import {answerAddress,parseAnswerHTML} from '../src/lib/rich-source';
import {validateSource} from '../src/lib/validation';
import {MANUAL_WIDTH,MANUAL_HEIGHT,manualURL,validateManualAction,isManualResource} from '../src/lib/manual-browser';
import {ReaderError,readAnswerPage} from './reader';

type Session={context:BrowserContext;page:Page;target?:string;created:number;touched:number;busy:boolean;authenticated:boolean};
export class ManualBrowsers{
  private browser?:Promise<Browser>;
  private sessions=new Map<string,Session>();
  private creating=0;
  constructor(private launch:()=>Promise<Browser>=()=>chromium.launch({channel:'chromium',headless:process.env.COLLECTOR_HEADED!=='true'}),private now=()=>Date.now()){}
  async reap(){for(const [id,s]of this.sessions)if(this.now()-s.touched>10*60_000||this.now()-s.created>60*60_000)await this.remove(id)}
  async create(value?:string){
    const url=manualURL(value||'https://www.zhihu.com/signin');if(!url)throw new ReaderError('INVALID_ANSWER','请输入知乎回答链接。',400);
    await this.reap();if(this.sessions.size+this.creating>=3)throw new ReaderError('READER_BUSY','手动窗口已满，请关闭不用的窗口后重试。',503);
    this.creating++;let context:BrowserContext|undefined;
    try{
      this.browser??=this.launch().catch(e=>{this.browser=undefined;throw e});const browser=await this.browser;
      // New context per user: neither login state nor screen is shared between sessions.
      context=await browser.newContext({locale:'zh-CN',viewport:{width:MANUAL_WIDTH,height:MANUAL_HEIGHT},acceptDownloads:false,serviceWorkers:'block'});
      await context.route('**/*',route=>isManualResource(route.request().url())?route.fallback():route.abort());
      const page=await context.newPage();page.setDefaultTimeout(5000);
      context.on('page',popup=>{if(popup!==page)void popup.close()});
      const id=randomBytes(32).toString('hex'),time=this.now();
      let notice:string|undefined;
      try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000})}catch{notice='页面尚未加载完成，可以使用窗口中的登录或打开回答按钮重试。'}
      this.sessions.set(id,{context,page,created:time,touched:time,busy:false,authenticated:false,target:answerAddress(url)?.url});
      return{id,width:MANUAL_WIDTH,height:MANUAL_HEIGHT,notice};
    }catch(e){await context?.close();throw e}finally{this.creating--}
  }
  private async use<T>(id:string,run:(s:Session)=>Promise<T>,touch=true){
    const s=this.sessions.get(id);
    if(!s||this.now()-s.touched>10*60_000||this.now()-s.created>60*60_000){if(s)await this.remove(id);throw new ReaderError('SESSION_EXPIRED','窗口已过期，请重新打开。',410)}
    if(s.busy)throw new ReaderError('SESSION_BUSY','上一项操作正在完成。',409);
    s.busy=true;if(touch)s.touched=this.now();try{return await run(s)}finally{s.busy=false}
  }
  async status(id:string){
    return this.use(id,async s=>{
      // Login completion comes from the rendered account menu, never exported cookies.
      const login=await s.page.locator('.SignFlow:visible, .SignContainer:visible').first().isVisible().catch(()=>false);
      const profile=await s.page.locator('.AppHeader-profileEntry:visible, .AppHeader-profileAvatar:visible, .AppHeader-userInfo .Avatar:visible').first().isVisible().catch(()=>false);
      // A denied answer page has no account menu, but does not sign the user out.
      if(profile&&!login)s.authenticated=true;
      else if(login)s.authenticated=false;
      return{authenticated:s.authenticated};
    },false);
  }
  async read(id:string,value:string){
    const address=answerAddress(value);if(!address)throw new ReaderError('INVALID_ANSWER','请输入单条知乎回答链接。',400);
    return this.use(id,async s=>{s.target=address.url;return readAnswerPage(s.page,address)});
  }
  async screen(id:string){return this.use(id,s=>s.page.screenshot({type:'jpeg',quality:65,timeout:5000}),false)}
  async action(id:string,value:unknown){
    let a;try{a=validateManualAction(value)}catch{throw new ReaderError('INVALID_ACTION','操作内容或范围无效。',400)}
    return this.use(id,async s=>{
      if(a.type==='navigate'){const target=answerAddress(a.url);if(target)s.target=target.url;await s.page.goto(a.url,{waitUntil:'domcontentloaded',timeout:20000})}
      else if(a.type==='click')await s.page.mouse.click(a.x,a.y);
      else if(a.type==='pointer'){
        await s.page.mouse.move(a.x,a.y);
        if(a.phase==='down')await s.page.mouse.down();
        if(a.phase==='up')await s.page.mouse.up();
      }
      else if(a.type==='scroll')await s.page.mouse.wheel(0,a.deltaY);
      else if(a.type==='text')await s.page.keyboard.insertText(a.text);
      else if(a.type==='key')await s.page.keyboard.press(a.key);
      else if(a.type==='drag'){
        await s.page.mouse.move(a.points[0].x,a.points[0].y);await s.page.mouse.down();
        try{for(const p of a.points.slice(1)){await s.page.mouse.move(p.x,p.y);await s.page.waitForTimeout(15)}}finally{await s.page.mouse.up()}
      }
      return{ok:true};
    });
  }
  async capture(id:string){
    return this.use(id,async s=>{
      const expected=answerAddress(s.target||''),current=answerAddress(s.page.url());
      if(!expected||!current||expected.id!==current.id)throw new ReaderError('ANSWER_MISMATCH','请先在窗口中打开所选回答，再点击导入。');
      const answer=s.page.locator('.AnswerItem[name="'+expected.id+'"]').first();
      if(!await answer.locator('.RichContent-inner').count())throw new ReaderError('ANSWER_NOT_LOADED','还没有看到回答正文，请先正常登录并打开回答。');
      // Capture only on the user's button press. No automatic login, expansion, or API crawling.
      const source=parseAnswerHTML(await answer.evaluate(el=>el.outerHTML),'url').find(a=>a.id==='zhihu-'+expected.id);
      if(!source||source.imported?.completeness==='partial')throw new ReaderError('ANSWER_INCOMPLETE','请先在窗口中展开阅读全文，再导入。');
      source.sourceUrl=current.url;
      if(source.title==='导入的知乎回答')source.title=await s.page.locator('h1.QuestionHeader-title').first().textContent().catch(()=>null)||source.title;
      return validateSource(source);
    });
  }
  async remove(id:string){const s=this.sessions.get(id);this.sessions.delete(id);await s?.context.close()}
  async close(){await Promise.all([...this.sessions.keys()].map(id=>this.remove(id)));await(await this.browser)?.close()}
}
