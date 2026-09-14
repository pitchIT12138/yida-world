import {chromium,type BrowserContext} from 'playwright';
import {answerAddress,parseAnswerHTML} from '../src/lib/rich-source';
import {validateSource} from '../src/lib/validation';

export class ReaderError extends Error{
  constructor(public code:string,message:string,public status=422){super(message)}
}

/** Product-side renderer. Its dedicated profile never reads the operator's regular browser profile. */
export class ZhihuReader{
  private context?:BrowserContext;
  private starting?:Promise<BrowserContext>;
  private busy=false;
  constructor(private profileDirectory:string,private headed=false,private createContext?:()=>Promise<BrowserContext>){}
  private async browser(){
    if(this.context)return this.context;
    this.starting??=this.createContext?this.createContext():chromium.launchPersistentContext(this.profileDirectory,{channel:'chromium',headless:!this.headed,locale:'zh-CN',viewport:{width:1360,height:900},acceptDownloads:false,serviceWorkers:'block'});
    try{this.context=await this.starting;this.context.on('close',()=>{this.context=undefined;this.starting=undefined});return this.context}catch(e){this.starting=undefined;throw e}
  }
  async close(){await this.context?.close()}
  async login(){const context=await this.browser();const page=context.pages()[0]||await context.newPage();await page.goto('https://www.zhihu.com/signin',{waitUntil:'domcontentloaded'});return page}
  async read(value:string,signal:AbortSignal){
    const address=answerAddress(value);if(!address)throw new ReaderError('INVALID_ANSWER','请输入单条知乎回答的链接或 ID。',400);
    if(signal.aborted)throw new ReaderError('CANCELLED','读取已取消。',499);
    if(this.busy)throw new ReaderError('READER_BUSY','正在读取另一篇回答，请稍后重试。',503);
    this.busy=true;
    let page:import('playwright').Page|undefined;
    const abort=()=>{void page?.close().catch(()=>{})};signal.addEventListener('abort',abort,{once:true});
    try{
      const context=await this.browser();page=await context.newPage();if(signal.aborted)throw new ReaderError('CANCELLED','读取已取消。',499);
      page.setDefaultTimeout(5000);
      // Limit renderer requests to Zhihu's own page/CDN resources. No arbitrary URL proxy.
      await page.route('**/*',route=>{
        let url:URL;try{url=new URL(route.request().url())}catch{return route.abort()}
        const own=url.protocol==='https:'&&!url.port&&/(^|\.)(zhihu\.com|zhimg\.com|zhstatic\.com)$/.test(url.hostname);
        return own?route.fallback():route.abort();
      });
      return await readAnswerPage(page,address);
    }catch(e){
      if(signal.aborted)throw new ReaderError('CANCELLED','读取已取消。',499);
      if(e instanceof ReaderError)throw e;
      throw new ReaderError('READER_FAILED','网页读取服务没有完成加载，请检查服务运行状态后重试。',502);
    }finally{signal.removeEventListener('abort',abort);await page?.close().catch(()=>{});this.busy=false}
  }
}

/** Read and expand a requested answer in the supplied browser page/session. */
export async function readAnswerPage(page:import('playwright').Page,address:{id:string;url:string}){
      const navigation=await page.goto(address.url,{waitUntil:'domcontentloaded',timeout:25000});
      if(navigation?.status()===403){
        const data=await navigation.json().catch(()=>null);
        if(data?.error?.code===40362)throw new ReaderError('SOURCE_ACCESS_LIMITED','知乎暂时限制了读取服务的访问；可稍后重试，或在此粘贴完整 HTML／正文。');
        if(data?.error?.code===40353)throw new ReaderError('READER_LOGIN_REQUIRED','读取服务需要正常登录知乎，登录后可继续按链接读取。');
      }
      const selector='.AnswerItem[name="'+address.id+'"]';
      const answer=page.locator(selector).first(),body=answer.locator('.RichContent-inner').first();
      try{await page.waitForFunction(target=>!!document.querySelector(target+' .RichContent-inner')||!!document.querySelector('.SignFlow, .SignContainer, .Captcha, [class*="Captcha"]'),selector,{timeout:20000});if(!await body.count())throw new Error('No body')}catch{
        console.error(JSON.stringify({event:'answer-not-loaded',httpStatus:navigation?.status(),path:new URL(page.url()).pathname,title:await page.title(),answerContainers:await page.locator('.AnswerItem').count(),initialData:await page.locator('#js-initialData').count(),challenge:await page.locator('#zh-zse-ck').count()}));
        if(await page.locator('#zh-zse-ck').count())throw new ReaderError('PAGE_CHECK_REQUIRED','知乎页面校验尚未完成，请在读取服务的正常浏览器中完成校验后重试。');
        if(await page.locator('.SignFlow, .SignContainer, .Captcha, [class*="Captcha"]').count())throw new ReaderError('READER_LOGIN_REQUIRED','读取服务需要正常登录知乎；登录完成后可继续按链接导入。');
        throw new ReaderError('ANSWER_NOT_LOADED','页面没有加载出目标回答，未将错误页或其他回答作为正文。');
      }
      for(let i=0;i<4;i++){
        const expand=answer.getByRole('button',{name:/展开阅读全文|查看全部|展开剩余/}).first();
        if(!await expand.isVisible())break;
        await expand.click();await page.waitForTimeout(500);
      }
      await body.scrollIntoViewIfNeeded();
      // Wait for this answer's body to stabilize; unrelated recommendations are not collected.
      let previous='',stable=0;
      for(let i=0;i<8&&stable<2;i++){const current=await body.innerHTML();stable=current===previous?stable+1:0;previous=current;await page.waitForTimeout(350)}
      const html=await answer.evaluate(el=>el.outerHTML);
      const source=parseAnswerHTML(html,'url').find(s=>s.id==='zhihu-'+address.id);
      if(!source)throw new ReaderError('ANSWER_MISMATCH','读取结果不属于所选回答。');
      if(source.imported?.completeness==='partial')throw new ReaderError('ANSWER_INCOMPLETE','回答仍有未展开内容，尚未取得全文。');
      const current=answerAddress(page.url());source.sourceUrl=current?.id===address.id?current.url:address.url;
      if(source.title==='导入的知乎回答')source.title=(await page.locator('h1.QuestionHeader-title').first().textContent().catch(()=>null))?.trim()||source.title;
      return validateSource(source);
}
