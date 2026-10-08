/* SMZDM makeup queue. Default: query only. No automatic retry of card use. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MIN_INTERVAL_MS = 5000;
const MAX_INTERVAL_MS = 15000;
// Android Cookie/header adaptation derived from hex-ci/smzdm_script (MIT), Copyright (c) 2023 Hex.
const APP_VERSION='10.4.26',APP_VERSION_REV='866';
const DEFAULT_USER_AGENT_APP=`smzdm_android_V${APP_VERSION} rv:${APP_VERSION_REV} (Redmi Note 3;Android10.0;zh)smzdmapp`;
const reVersion=/(smzdm_android_V|smzdm\s|iphone_smzdmapp\/)([\d.]+)/i,reRev=/rv:([\d.]+)/i;
const randomStr=(len=18)=>Array.from({length:len},()=>String(crypto.randomInt(0,10))).join('');
const updateCookie=(cookie,name,value)=>cookie.replace(new RegExp(`(^|;)${name}=[^;]+;`,'ig'),`$1${name}=${encodeURIComponent(value)};`);
const getEnvCookies=()=>process.env.SMZDM_COOKIE ? process.env.SMZDM_COOKIE.split(/&|\r?\n/).map(v=>v.trim()).filter(Boolean) : [];
class SmzdmBot {
  constructor(cookie) {
    this.cookie = cookie.trim();

    const match = this.cookie.match(/sess=(.*?);/);
    this.token = match ? match[1] : '';

    // 处理 cookie
    this.androidCookie = this.cookie.replace('iphone', 'android').replace('iPhone', 'Android');
    this.androidCookie = updateCookie(this.androidCookie, 'smzdm_version', APP_VERSION);
    this.androidCookie = updateCookie(this.androidCookie, 'device_smzdm_version', APP_VERSION);
    this.androidCookie = updateCookie(this.androidCookie, 'v', APP_VERSION);
    this.androidCookie = updateCookie(this.androidCookie, 'device_smzdm_version_code', APP_VERSION_REV);
    this.androidCookie = updateCookie(this.androidCookie, 'device_system_version', '10.0');
    this.androidCookie = updateCookie(this.androidCookie, 'apk_partner_name', 'smzdm_download');
    this.androidCookie = updateCookie(this.androidCookie, 'partner_name', 'smzdm_download');
    this.androidCookie = updateCookie(this.androidCookie, 'device_type', 'Android');
    this.androidCookie = updateCookie(this.androidCookie, 'device_smzdm', 'android');
    this.androidCookie = updateCookie(this.androidCookie, 'device_name', 'Android');
  }

  getHeaders() {
    let userAgent = DEFAULT_USER_AGENT_APP;

    if (process.env.SMZDM_USER_AGENT_APP) {
      userAgent = process.env.SMZDM_USER_AGENT_APP
        .replace(reVersion, `$1${APP_VERSION}`)
        .replace(reRev, `rv:${APP_VERSION_REV}`);
    }

    return {
      Accept: '*/*',
      'Accept-Language': 'zh-Hans-CN;q=1',
      'Accept-Encoding': 'gzip',
      'request_key': randomStr(18),
      'User-Agent': userAgent,
      Cookie: this.androidCookie
    };
  }

}
const signKey = 'apr1$AwP!wRRT$gJ/q.X24poeBInlUJC';
function form(token) {
  const data = { weixin: 1, basic_v: 0, f: 'android', v: '10.4.26', time: String(Math.round(Date.now()/1000)*1000), token };
  const text = Object.keys(data).filter(k => data[k] !== '').sort().map(k => `${k}=${String(data[k]).replace(/\s+/, '')}`).join('&');
  return { ...data, sign: crypto.createHash('md5').update(`${text}&key=${signKey}`).digest('hex').toUpperCase() };
}
function validStatus(result) {
  if (!result || String(result.error_code) !== '0') return null;
  const data = result.data || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.fix_date))) return null;
  const before = Number(data.before_checkin_num), after = Number(data.after_checkin_num), cards = Number(data.left_fix_num);
  if (![before,after,cards].every(Number.isFinite) || before < 0 || after <= before || cards < 0) return null;
  return { fix_date:data.fix_date, before_checkin_num:before, after_checkin_num:after, left_fix_num:cards };
}
function noCards(result) {return String(result?.error_code)==='3' && /^没有补签卡/.test(result.error_msg || '') || String(result?.error_code)==='0' && String(result.data?.left_fix_num)==='0';}
function profileDays(result) {if(String(result?.error_code)!=='0')return null;const row=result.data?.rows?.find(r=>String(r.cell_type)==='18001');const value=Number(row?.cell_data?.checkin_num);return Number.isFinite(value)&&value>=0?value:null;}
function newState(options) {
  return { batch:options.batch, account_ids:options.accountIds, account_limits:options.accountLimits || {}, per_account_attempts:{}, done_accounts:[], card_counts:{}, max_attempts:options.maxCards, attempts:0, confirmed:0, last_attempt_ms:0, paused:false, pending:null, cursor:0, history:[] };
}
async function step(options, state, deps) {
  if (!options.apply) {
    const output=[];
    for(const account of options.accounts) output.push({ account_index:account, ...validStatus(await deps.query(account)) });
    return { state, report:{mode:'query_only',cards_used:0,accounts:output} };
  }
  if(!options.batch || options.batch==='pending' || !Number.isInteger(options.maxCards) || options.maxCards<1 || options.maxCards>500 || !options.accounts.length) throw new Error('Explicit batch, selected accounts and positive card budget required');
  state=state || newState(options);
  if(JSON.stringify(state.account_limits || {})!==JSON.stringify(options.accountLimits || {})) throw new Error('Account budgets changed; review existing batch');
  if(state.batch!==options.batch || JSON.stringify(state.account_ids)!==JSON.stringify(options.accountIds) || state.max_attempts!==options.maxCards) throw new Error('Existing batch differs; review its state before creating another batch');
  if(state.paused || state.pending) return {state,report:{mode:'paused',reason:state.reason || 'Prior result uncertain; manual review required',attempts:state.attempts,confirmed:state.confirmed}};
  if(state.attempts>=options.maxCards) return {state,report:{mode:'budget_reached',attempts:state.attempts,confirmed:state.confirmed}};
  const now=deps.now();
  const nextAttempt=state.next_attempt_ms || (state.last_attempt_ms ? state.last_attempt_ms+MIN_INTERVAL_MS : 0);
  if(nextAttempt && now<nextAttempt) return {state,report:{mode:'cooldown',next_attempt_after:new Date(nextAttempt).toISOString()}};
  state.per_account_attempts ||= {};state.done_accounts ||= [];state.card_counts ||= {};
  let account;
  for(let i=0;i<options.accounts.length;i++) {
    const candidate=options.accounts[state.cursor % options.accounts.length];
    if(!state.done_accounts.includes(candidate) && (state.per_account_attempts[candidate] || 0)<(options.accountLimits?.[candidate] ?? options.maxCards)) {account=candidate;break;}
    state.cursor++;
  }
  if(account===undefined) return {state,report:{mode:'accounts_finished',attempts:state.attempts,confirmed:state.confirmed}};
  const rawStatus=await deps.query(account);
  const status=validStatus(rawStatus);
  if(noCards(rawStatus) && !status) {state.done_accounts.push(account);state.card_counts[account]=0;state.cursor++;await deps.save(state);return {state,report:{mode:'account_finished',account_index:account,cards_left:0}};}
  if(status && (status.left_fix_num<1 || (options.earliestDate && status.fix_date<options.earliestDate))) {
    state.done_accounts.push(account);state.card_counts[account]=status.left_fix_num;state.cursor++;await deps.save(state);
    return {state,report:{mode:'account_finished',account_index:account,cards_left:status.left_fix_num}};
  }
  if(!status) {
    state.paused=true;state.reason='No eligible date/card, rejected status query, or date outside selected range';await deps.save(state);
    return {state,report:{mode:'paused',account_index:account,reason:state.reason}};
  }
  // Reserve one card BEFORE the mutation. An ambiguous response never triggers an automatic retry.
  state.attempts++;state.per_account_attempts[account]=(state.per_account_attempts[account] || 0)+1;state.last_attempt_ms=now;
  const delay=Math.max(MIN_INTERVAL_MS,Math.min(MAX_INTERVAL_MS,deps.delay ? deps.delay() : MIN_INTERVAL_MS));
  state.next_attempt_ms=now+delay;
  state.pending={account_index:account,date:status.fix_date,expected_continue_days:status.after_checkin_num};
  await deps.save(state);
  let response;
  try { response=await deps.fix(account); }
  catch(_) { state.paused=true;state.reason='补签结果不明，已暂停；先核对账号记录，禁止自动重试';await deps.save(state);return {state,report:{mode:'paused',reason:state.reason,attempts:state.attempts}}; }
  if(!response || String(response.error_code)!=='0') {
    state.paused=true;state.reason='补签被服务器拒绝或触发频率限制，已暂停，需按 App 提示等待并人工复核';await deps.save(state);
    return {state,report:{mode:'paused',reason:state.reason,server_error_code:response && response.error_code,attempts:state.attempts}};
  }
  let after;
  try {after=await deps.query(account);} catch(_) {}
  let next=validStatus(after);
  // Retry only READ-ONLY status queries. Never retry the card-consuming POST.
  for(let i=0;i<2 && !(next && next.fix_date!==status.fix_date && next.before_checkin_num>=status.after_checkin_num);i++) {
    if(deps.sleep) await deps.sleep(2000);
    try {after=await deps.query(account);next=validStatus(after);} catch(_) {}
  }
  // The official status describes the next eligible date; require the prior date to advance.
  let verified=next && next.fix_date!==status.fix_date && next.before_checkin_num>=status.after_checkin_num;
  if(!verified && noCards(after) && deps.profile) {
    let days;try {days=profileDays(await deps.profile(account));}catch(_){}
    if(days!==null && days!==undefined && days>=status.after_checkin_num){verified=true;next={left_fix_num:0,fix_date:null};state.done_accounts.push(account);}
  }
  state.history.push({account_index:account,date:status.fix_date,server_accepted:true,verified:Boolean(verified),at:new Date(now).toISOString()});
  if(!verified) {
    state.paused=true;state.reason='服务器接受了补签，但后续状态未完成核验；暂停以防重复扣卡';await deps.save(state);
    return {state,report:{mode:'paused',reason:state.reason,attempts:state.attempts,server_accepted:true}};
  }
  state.confirmed++;state.pending=null;state.cursor++;state.last_card_count=next.left_fix_num;state.card_counts[account]=next.left_fix_num;state.next_attempt_ms=deps.now()+delay;await deps.save(state);
  return {state,report:{mode:'one_card_confirmed',account_index:account,date:status.fix_date,confirmed:state.confirmed,attempts:state.attempts,max_attempts:options.maxCards,next_eligible_date:next.fix_date}};
}
async function runQueue(options,state,deps,onReport=()=>{}) {
  while(true) {
    const result=await step(options,state,deps);state=result.state;onReport(result.report);
    if(!options.apply || !options.loop || !['one_card_confirmed','account_finished','cooldown'].includes(result.report.mode)) return result;
    const waitMs=Math.max(0,(state.next_attempt_ms || state.last_attempt_ms+MIN_INTERVAL_MS)-deps.now());
    if(waitMs) await deps.sleep(waitMs);
  }
}
async function reconcile(options,state,deps) {
  if(!state || state.batch!==options.batch || JSON.stringify(state.account_ids)!==JSON.stringify(options.accountIds) || state.max_attempts!==options.maxCards || JSON.stringify(state.account_limits || {})!==JSON.stringify(options.accountLimits || {}))throw new Error('Batch/account/budget mismatch');
  const last=state.history.at(-1),pending=state.pending;
  if(!pending || !last || !last.server_accepted || last.verified || last.date!==pending.date || last.account_index!==pending.account_index)throw new Error('No accepted pending request to reconcile');
  const raw=await deps.query(pending.account_index);let status=validStatus(raw);
  if(!status && noCards(raw) && deps.profile) {
    const days=profileDays(await deps.profile(pending.account_index));
    if(days!==null && days>=pending.expected_continue_days){status={fix_date:null,before_checkin_num:days,left_fix_num:0};state.done_accounts ||= [];if(!state.done_accounts.includes(pending.account_index))state.done_accounts.push(pending.account_index);}
  }
  if(!status || status.fix_date===pending.date || status.before_checkin_num<pending.expected_continue_days)return {state,report:{mode:'paused',reason:'Read-only reconciliation inconclusive; no card request made'}};
  last.verified=true;last.reconciled_at=new Date().toISOString();state.confirmed++;state.pending=null;state.paused=false;delete state.reason;state.cursor++;if(state.notification_attempted){state.notification_history ||= [];state.notification_history.push({accepted:state.notification_accepted,at:new Date().toISOString()});delete state.notification_attempted;delete state.notification_accepted;}
  state.card_counts ||= {};state.card_counts[pending.account_index]=status.left_fix_num;state.last_card_count=status.left_fix_num;await deps.save(state);
  return {state,report:{mode:'reconciled',account_index:pending.account_index,confirmed:state.confirmed,cards_left:status.left_fix_num,cards_requested:0}};
}
async function main() {
  const preload=process.env.SMZDM_BACKFILL_PRELOAD || '/usr/local/lib/node_modules/@whyour/qinglong/shell/preload/env.js';
  if(fs.existsSync(preload)) require(preload);
  const got=require('got');
  const cookies=getEnvCookies();
  if(!Array.isArray(cookies) || !cookies.length) throw new Error('Missing SMZDM_COOKIE');
  const apply=process.env.SMZDM_BACKFILL_APPLY==='1';
  const rawAccounts=process.env.SMZDM_BACKFILL_ACCOUNTS;
  const accounts=rawAccounts==='all' ? cookies.map((_,i)=>i+1) : rawAccounts ? rawAccounts.split(',').map(Number) : apply ? [] : cookies.map((_,i)=>i+1);
  if(accounts.some(n=>!Number.isInteger(n) || n<1 || n>cookies.length) || new Set(accounts).size!==accounts.length) throw new Error('Invalid account selection');
  const bots=cookies.map(cookie=>new SmzdmBot(cookie));
  const accountIds=accounts.map(n=>{
    const match=cookies[n-1].match(/(?:^|;\s*)smzdm_id=([^;]+)/);
    if(apply && !match) throw new Error('Stable account ID required for card budget tracking');
    return crypto.createHash('sha256').update(match ? match[1] : cookies[n-1]).digest('hex').slice(0,16);
  });
  const options={apply,loop:process.env.SMZDM_BACKFILL_LOOP==='1',accounts,accountIds,batch:process.env.SMZDM_BACKFILL_BATCH || 'pending',maxCards:Number(process.env.SMZDM_BACKFILL_MAX_CARDS || '0'),earliestDate:process.env.SMZDM_BACKFILL_EARLIEST_DATE || ''};
  options.accountLimits={};
  if(process.env.SMZDM_BACKFILL_LIMITS) {
    for(const item of process.env.SMZDM_BACKFILL_LIMITS.split(',')) {
      const match=item.trim().match(/^(\d+):(\d+)$/);if(!match)throw new Error('Invalid per-account budget');
      const account=Number(match[1]),limit=Number(match[2]);
      if(!accounts.includes(account) || !Number.isInteger(limit) || limit<0 || limit>500 || account in options.accountLimits)throw new Error('Invalid per-account budget');
      options.accountLimits[account]=limit;
    }
    if(accounts.some(n=>!(n in options.accountLimits)))throw new Error('Budget required for every selected account');
  }
  if(options.earliestDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.earliestDate)) throw new Error('Invalid earliest date');
  const stateDir=path.resolve(process.env.SMZDM_BACKFILL_STATE_DIR || path.join(__dirname,'.smzdm_makeup_state'));
  if(apply) fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
  const statePath=path.join(stateDir,'state.json'),lockPath=path.join(stateDir,'running.lock');
  let lockFd;
  if(apply) {
    try {lockFd=fs.openSync(lockPath,'wx',0o600);fs.writeFileSync(lockFd,String(process.pid));}
    catch(error) {if(error.code==='EEXIST'){console.log('已有补签进程或未复核的锁文件；本次不执行');return;}throw error;}
  }
  const request=async(account,route)=>{
    if(route!=='fix_status' && route!=='fix' && route!=='show_view_v2') throw new Error('Invalid endpoint');
    if(route==='fix' && !apply) throw new Error('Query-only mode forbids card use');
    const bot=bots[account-1];
    const response=await got.post('https://user-api.smzdm.com/checkin/'+route,{headers:bot.getHeaders(),form:form(bot.token),retry:{limit:0},timeout:{request:20000},throwHttpErrors:false});
    if(response.statusCode===429) return {error_code:'429'};
    if(response.statusCode<200 || response.statusCode>=300) throw new Error('Remote HTTP failure');
    return JSON.parse(response.body);
  };
  try {
    const state=apply && fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath,'utf8')) : null;
    const save=async state=>{const temp=statePath+'.tmp';fs.writeFileSync(temp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(temp,statePath);};
    if(process.env.SMZDM_BACKFILL_RECONCILE==='1') {
      const result=await reconcile(options,state,{query:n=>request(n,'fix_status'),profile:n=>request(n,'show_view_v2'),save});
      console.log(JSON.stringify(result.report));return result;
    }
    const result=await runQueue(options,state,{now:()=>Date.now(),delay:()=>crypto.randomInt(MIN_INTERVAL_MS,MAX_INTERVAL_MS+1),sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)),query:n=>request(n,'fix_status'),profile:n=>request(n,'show_view_v2'),fix:n=>request(n,'fix'),save},report=>console.log(JSON.stringify(report)));
    if(apply && options.loop && result.state && !result.state.notification_attempted && ['paused','budget_reached','accounts_finished'].includes(result.report.mode)) {
      result.state.notification_attempted=true;await save(result.state);
      try {
        if(!process.env.BARK_PUSH) throw new Error('Missing notification endpoint');
        const body=`账号${accounts.join(',')}：本批确认补签${result.state.confirmed}天，尝试${result.state.attempts}/${options.maxCards}次。状态：${result.report.mode==='budget_reached'?'已达到用卡上限':result.report.mode==='accounts_finished'?'所有选中账号已完成或达到各自上限':result.state.reason || '已暂停'}。剩余卡数（最近已核验）：${JSON.stringify(result.state.card_counts || {})}。`;
        const response=await got.post(process.env.BARK_PUSH,{json:{title:'什么值得买补签队列结果',body,group:process.env.BARK_GROUP || 'qinglong'},retry:{limit:0},timeout:{request:15000},throwHttpErrors:false});
        result.state.notification_accepted=JSON.parse(response.body).code===200;await save(result.state);
        console.log(JSON.stringify({notification:'Bark',server_accepted:result.state.notification_accepted}));
      } catch(_) {console.log('Bark result notification failed; no further card use');}
    }
    return result;
  } finally {if(lockFd!==undefined){fs.closeSync(lockFd);fs.unlinkSync(lockPath);}}
}
module.exports={step,runQueue,reconcile,profileDays,noCards,main,validStatus,MIN_INTERVAL_MS,MAX_INTERVAL_MS};
if(require.main===module) main().catch(()=>{console.error('补签队列已停止，请核对参数或状态；不会自动重试不明结果');process.exitCode=1;});