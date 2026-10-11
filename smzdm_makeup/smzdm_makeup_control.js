/* Weekly controller and Qinglong setting buttons. Settings/detection never spend cards. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('./smzdm_makeup.js');
function read(p){return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;}
function atomic(p,data){const t=p+'.tmp';fs.writeFileSync(t,JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(t,p);}
function dates(now=new Date()){
 const d=new Date(now.getTime()+8*3600000),day=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
 const today=day.toISOString().slice(0,10);day.setUTCDate(day.getUTCDate()-7);const recent=day.toISOString().slice(0,10);
 day.setUTCDate(day.getUTCDate()+7-day.getUTCDay());return {today,recent,week:day.toISOString().slice(0,10)};
}
function validDate(s,today){return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s && s<today;}
function settings(value,today){
 const v=value || {mode:'recent',old_date_enabled:false,target_date:'',revision:0};
 if(!['recent','forward','target'].includes(v.mode)||typeof v.old_date_enabled!=='boolean'||v.old_date_enabled!==(v.mode!=='recent')||!Number.isInteger(v.revision)||v.revision<0)throw new Error('Invalid saved settings');
 if(v.mode==='target'&&!validDate(v.target_date,today))throw new Error('A real past target date is required');
 return v;
}
function policy(config,clock){return {earliestDate:config.mode==='recent'?clock.recent:config.mode==='target'?config.target_date:''};}
function preview(raw,config,clock){
 const s=core.validStatus(raw);if(!s)return {status:core.noCards(raw)?'no_cards':'unknown',long_range_forecast:'unknown'};
 return {...s,next_card_gain:s.after_checkin_num-s.before_checkin_num,is_recent_gap:s.fix_date>=clock.recent,old_date_enabled:config.old_date_enabled,
 within_target:config.mode!=='target'||s.fix_date>=config.target_date,continuation_decision:'user',long_range_forecast:'unknown',
 note:'Only the next card is previewable. The user decides whether to continue older dates.'};
}
function ledger(root,clock,ids,accounts,total,perAccount){
 const used={total:0,accounts:Object.fromEntries(accounts.map(a=>[a,0]))};
 for(const ent of fs.readdirSync(root,{withFileTypes:true})){
  if(!ent.isDirectory()||!/^weekly-\d{4}-\d{2}-\d{2}(?:-[a-f0-9]+)?$/.test(ent.name))continue;
  const dir=path.join(root,ent.name),s=read(path.join(dir,'state.json'));
  if(fs.existsSync(path.join(dir,'running.lock')))throw new Error('Existing batch lock requires review');
  if(!s)throw new Error('Existing batch directory has no durable state');
  if(s.paused||s.pending||s.attempts!==s.confirmed)throw new Error('Prior card result unresolved; no new batch allowed');
  if(s.batch!==ent.name||JSON.stringify(s.account_ids)!==JSON.stringify(ids))throw new Error('Existing batch/account identity mismatch');
  if(!Number.isInteger(s.attempts)||s.attempts<0||!Number.isInteger(s.confirmed))throw new Error('Invalid prior accounting');
  if(!ent.name.startsWith('weekly-'+clock.week))continue;
  let sum=0;
  for(const [a,n]of Object.entries(s.per_account_attempts||{})){if(!accounts.includes(Number(a))||!Number.isInteger(n)||n<0)throw new Error('Invalid per-account accounting');sum+=n;used.accounts[a]+=n;}
  if(sum!==s.attempts)throw new Error('Prior per-account accounting incomplete');used.total+=s.attempts;
 }
 if(used.total>total||accounts.some(a=>used.accounts[a]>perAccount))throw new Error('Weekly budget already exceeded; review required');
 return used;
}
function remaining(used,accounts,total,perAccount){return {maxCards:Math.max(0,total-used.total),accountLimits:Object.fromEntries(accounts.map(a=>[a,Math.max(0,perAccount-used.accounts[a])]))};}
function acquire(root){fs.mkdirSync(root,{recursive:true,mode:0o700});const p=path.join(root,'controller.lock');const fd=fs.openSync(p,'wx',0o600);fs.writeFileSync(fd,String(process.pid));return ()=>{fs.closeSync(fd);fs.unlinkSync(p);};}
function preload(){const p=process.env.SMZDM_BACKFILL_PRELOAD || '/usr/local/lib/node_modules/@whyour/qinglong/shell/preload/env.js';if(fs.existsSync(p))require(p);}
function environment(){
 preload();const cookies=core.getEnvCookies(),raw=process.env.SMZDM_MAKEUP_ACCOUNTS || 'all';
 const accounts=raw==='all'?cookies.map((_,i)=>i+1):raw.split(',').map(Number);
 if(!accounts.length||new Set(accounts).size!==accounts.length||accounts.some(a=>!Number.isInteger(a)||a<1||a>cookies.length))throw new Error('Invalid accounts');
 const ids=accounts.map(a=>{const match=cookies[a-1].match(/(?:^|;\s*)smzdm_id=([^;]+)/);if(!match)throw new Error('Stable identity required');return crypto.createHash('sha256').update(match[1]).digest('hex').slice(0,16);});
 const total=Number(process.env.SMZDM_MAKEUP_WEEKLY_MAX || accounts.length*7),perAccount=Number(process.env.SMZDM_MAKEUP_ACCOUNT_MAX || 7);
 if(!Number.isInteger(total)||total<1||total>500||!Number.isInteger(perAccount)||perAccount<1||perAccount>500)throw new Error('Invalid weekly budget');
 return {accounts,ids,cookies,total,perAccount,root:path.resolve(process.env.SMZDM_MAKEUP_ROOT || path.join(__dirname,'.smzdm_makeup_auto')),clock:dates()};
}
async function detect(env,config){
 const got=require('got'),rows=[];
 for(const a of env.accounts){
  const bot=new core.SmzdmBot(env.cookies[a-1]);let raw;
  try {const r=await got.post('https://user-api.smzdm.com/checkin/fix_status',{headers:bot.getHeaders(),form:core.form(bot.token),retry:{limit:0},timeout:{request:20000},throwHttpErrors:false});raw=r.statusCode===200?JSON.parse(r.body):null;}catch(_){raw=null;}
  rows.push({account_index:a,...preview(raw,config,env.clock)});
  if(a!==env.accounts.at(-1))await new Promise(r=>setTimeout(r,3000));
 }
 return {mode:'benefit_detection',cards_requested:0,settings:config,accounts:rows,checked_at:new Date().toISOString(),multi_card_gain:'unknown'};
}
async function main(action='run'){
 const e=environment(),configPath=path.join(e.root,'settings.json');
 let config=settings(read(configPath),e.clock.today);
 if(action==='detect'){
  const result=await detect(e,config);console.log(JSON.stringify(result));
  // Local report only. No notification or queue state is changed.
  fs.mkdirSync(e.root,{recursive:true,mode:0o700});atomic(path.join(e.root,'benefit-preview.json'),result);return result;
 }
 if(action==='dry-run'){
  const used=fs.existsSync(e.root)?ledger(e.root,e.clock,e.ids,e.accounts,e.total,e.perAccount):{total:0,accounts:Object.fromEntries(e.accounts.map(a=>[a,0]))};
  const result={mode:'dry_run',cards_requested:0,settings:config,policy:policy(config,e.clock),week:e.clock.week,used,remaining:remaining(used,e.accounts,e.total,e.perAccount)};
  console.log(JSON.stringify(result));return result;
 }
 if(!['run','forward','recent','target'].includes(action))throw new Error('Unknown action');
 const release=acquire(e.root);
 try {
  config=settings(read(configPath),e.clock.today);
  const used=ledger(e.root,e.clock,e.ids,e.accounts,e.total,e.perAccount);
  if(action!=='run'){
   const next={...config,mode:action,old_date_enabled:action!=='recent'};
   if(action==='target')next.target_date=process.env.SMZDM_MAKEUP_TARGET_DATE || config.target_date;
   settings(next,e.clock.today);
   if(JSON.stringify({...next,revision:0})!==JSON.stringify({...config,revision:0}))next.revision=config.revision+1;
   atomic(configPath,next);const result={mode:'settings_saved',cards_requested:0,settings:next,week_used:used};console.log(JSON.stringify(result));return result;
  }
  const active=read(path.join(e.root,'active-v2.json')),scope=policy(config,e.clock);
  const key=crypto.createHash('sha256').update(JSON.stringify({config,scope,ids:e.ids})).digest('hex').slice(0,16);
  const batch='weekly-'+e.clock.week+'-'+key,dir=path.join(e.root,batch),current=read(path.join(dir,'state.json'));
  const budget=current?{maxCards:current.max_attempts,accountLimits:current.account_limits}:remaining(used,e.accounts,e.total,e.perAccount);
  if(budget.maxCards<1||e.accounts.every(a=>budget.accountLimits[a]<1)){const result={mode:'weekly_budget_reached',cards_requested:0,used};console.log(JSON.stringify(result));return result;}
  // A changed scope gets only the remainder. Reusing a scope retains its immutable budget.
  if(current){const others={total:used.total-current.attempts,accounts:Object.fromEntries(e.accounts.map(a=>[a,used.accounts[a]-(current.per_account_attempts[a]||0)]))};const available=remaining(others,e.accounts,e.total,e.perAccount);
   if(current.max_attempts>available.maxCards||e.accounts.some(a=>current.account_limits[a]>available.accountLimits[a]))throw new Error('Scope budget overlaps newer card use; review required');
  }
  // active-v2 is only a pointer; old state files/counters/locks are never reset.
  atomic(path.join(e.root,'active-v2.json'),{batch,previous:active?.batch || null,settings:config});
  Object.assign(process.env,{SMZDM_BACKFILL_APPLY:'1',SMZDM_BACKFILL_LOOP:'1',SMZDM_BACKFILL_ACCOUNTS:e.accounts.join(','),SMZDM_BACKFILL_BATCH:batch,
   SMZDM_BACKFILL_MAX_CARDS:String(budget.maxCards),SMZDM_BACKFILL_LIMITS:e.accounts.map(a=>a+':'+budget.accountLimits[a]).join(','),SMZDM_BACKFILL_STATE_DIR:dir,
   SMZDM_BACKFILL_EARLIEST_DATE:scope.earliestDate});
  delete process.env.SMZDM_BACKFILL_MIN_GAIN;delete process.env.SMZDM_BACKFILL_GAIN_BEFORE_DATE;delete process.env.SMZDM_BACKFILL_RECONCILE;return await core.main();
 }finally{release();}
}

function display(result){
 if(!result)return;
 const names={recent:'旧日期补签关闭，只补最近七天',forward:'旧日期补签开启',target:'补到指定日期'};
 if(result.mode==='settings_saved')console.log('设置已保存：'+names[result.settings.mode]+'。此按钮不消耗补签卡。');
 if(result.mode==='benefit_detection'){
  console.log('补签状态查询（只读，不消耗卡）：');
  for(const r of result.accounts)console.log(r.status ? '账号'+r.account_index+'：'+(r.status==='no_cards'?'没有可用补签卡':'查询结果未知') : '账号'+r.account_index+'：当前连签 '+r.before_checkin_num+' 天；下一张补 '+r.fix_date+' 后为 '+r.after_checkin_num+' 天（增加 '+r.next_card_gain+' 天），剩 '+r.left_fix_num+' 张。');
  console.log('旧日期是否继续补由你判断；更早多张卡后的收益未知。');
 }
}
module.exports={display,dates,settings,policy,preview,ledger,remaining,main};
if(require.main===module)main(process.argv.includes('--dry-run')?'dry-run':process.argv[2] || 'run').then(display).catch(()=>{console.error('Controller stopped; review configuration, prior state and locks. No automatic retry.');process.exitCode=1;});
