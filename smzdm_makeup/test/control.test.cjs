const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const c=require('../smzdm_makeup_control.js'),core=require('../smzdm_makeup.js');
const raw=(date,gain=1,cards=3)=>({error_code:0,data:{fix_date:date,before_checkin_num:90,after_checkin_num:90+gain,left_fix_num:cards}});
const clock=c.dates(new Date('2026-10-11T01:00:00Z'));
test('Shanghai weekly anchor and rolling seven-day boundary',()=>{assert.deepEqual(clock,{today:'2026-10-11',recent:'2026-10-04',week:'2026-10-11'});assert.equal(c.dates(new Date('2026-10-10T16:00:00Z')).week,'2026-10-11');assert.equal(c.dates(new Date('2026-10-13T01:00:00Z')).week,'2026-10-11');});
test('next-card preview leaves the continuation decision to the user',()=>{const config={mode:'forward',old_date_enabled:true,target_date:'',revision:1};const r=c.preview(raw('2026-07-13'),config,clock);assert.equal(r.next_card_gain,1);assert.equal(r.continuation_decision,'user');assert.equal(r.long_range_forecast,'unknown');assert.equal('minimum_gain' in r,false);});
test('old dates with only one day gain are permitted when enabled; scope cannot change in place',async()=>{let used=0;const opts={apply:true,accounts:[1],accountIds:['test'],batch:'TEST',maxCards:7,accountLimits:{1:7},earliestDate:''};const r=await core.step(opts,null,{now:()=>1e6,query:async()=>used?{error_code:0,data:{fix_date:'2026-07-12',before_checkin_num:91,after_checkin_num:92,left_fix_num:2}}:raw('2026-07-13'),save:async()=>{},fix:async()=>{used++;return {error_code:0};}});assert.equal(used,1);assert.equal(r.state.streak_summary[1].after,91);await assert.rejects(()=>core.step({...opts,earliestDate:'2026-10-04'},r.state,{}),/Policy changed/);});
test('inclusive target is allowed; older date stops with zero requests',async()=>{let calls=0;const r=await core.step({apply:true,accounts:[1],accountIds:['test'],batch:'TARGET',maxCards:7,earliestDate:'2026-07-14'},null,{now:()=>1e6,query:async()=>raw('2026-07-13'),fix:async()=>{calls++;},save:async()=>{}});assert.equal(calls,0);assert.equal(r.report.reason,'date_boundary');assert.throws(()=>c.settings({mode:'target',old_date_enabled:true,target_date:'2026-02-30',revision:1},clock.today));});
test('changing buttons preserves weekly spending; pending and foreign identity block all modes',async()=>{
 const base=path.resolve('.test-tmp');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'control-'));
 const priorEnv={...process.env},oldMain=core.main;
 const put=(batch,state)=>{const dir=path.join(root,batch);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({batch,account_ids:[id],attempts:0,confirmed:0,per_account_attempts:{},...state}));};
 const crypto=require('node:crypto'),id=crypto.createHash('sha256').update('mock').digest('hex').slice(0,16);
 try{
  Object.assign(process.env,{SMZDM_COOKIE:'sess=fake;smzdm_id=mock;',SMZDM_MAKEUP_ACCOUNTS:'1',SMZDM_MAKEUP_ROOT:root,SMZDM_MAKEUP_WEEKLY_MAX:'7',SMZDM_MAKEUP_ACCOUNT_MAX:'7',SMZDM_BACKFILL_PRELOAD:path.join(root,'missing.js')});
  const current=c.dates(),legacy='weekly-'+current.week;put(legacy,{attempts:3,confirmed:3,per_account_attempts:{1:3}});
  core.main=async()=>{assert.equal(process.env.SMZDM_BACKFILL_MAX_CARDS,'4');assert.equal(process.env.SMZDM_BACKFILL_LIMITS,'1:4');const dir=process.env.SMZDM_BACKFILL_STATE_DIR;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({batch:process.env.SMZDM_BACKFILL_BATCH,account_ids:[id],attempts:0,confirmed:0,per_account_attempts:{},max_attempts:4,account_limits:{1:4}}));return {mock:true};};
  const forward=await c.main('forward');assert.equal(forward.cards_requested,0);assert.equal(forward.settings.old_date_enabled,true);await c.main('run');
  await c.main('recent');await c.main('run');assert.equal(c.ledger(root,current,[id],[1],7,7).total,3);
  await assert.rejects(()=>c.main('target'),/target date/);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'settings.json'))).mode,'recent');
  put(legacy,{attempts:4,confirmed:3,pending:{date:'2026-01-01'},per_account_attempts:{1:4}});await assert.rejects(()=>c.main('forward'),/unresolved/);
  put(legacy,{account_ids:['foreign']});assert.throws(()=>c.ledger(root,current,[id],[1],7,7),/identity/);
  put(legacy,{attempts:8,confirmed:8,per_account_attempts:{1:8}});assert.throws(()=>c.ledger(root,current,[id],[1],7,7),/exceeded/);
 }finally{core.main=oldMain;for(const k of Object.keys(process.env))if(!(k in priorEnv))delete process.env[k];Object.assign(process.env,priorEnv);if(root.startsWith(base+path.sep))fs.rmSync(root,{recursive:true});}
});

test('notification reports verified streak days and does not claim an uncertain gain',()=>{const options={accounts:[1,2],maxCards:7},result={report:{mode:'paused'},state:{confirmed:1,attempts:2,pending:{account_index:2},card_counts:{1:2,2:1},streak_summary:{1:{before:90,after:120,confirmed_cards:1},2:{before:80,after:80,confirmed_cards:0}}}};const body=core.notificationBody(options,result);assert.ok(body.includes('90 → 120'));assert.ok(body.includes('30'));assert.ok(body.includes('最后核验'));assert.equal(body.includes('81 天'),false);});

test('Bark layout keeps archived delivery options and reports total weekly usage',()=>{
 const result={report:{mode:'accounts_finished'},state:{confirmed:1,attempts:1,card_counts:{1:0},streak_summary:{1:{before:90,after:91,confirmed_cards:1}}}};
 const payload=core.notificationPayload({accounts:[1],maxCards:4,notificationMode:'forward',weeklyUsedOutsideBatch:3,weeklyMax:35},result,{BARK_GROUP:'qinglong',BARK_ARCHIVE:'1',BARK_LEVEL:'active'});
 assert.equal(payload.title,'✅ 值得买补签 · +1天');assert.equal(payload.isArchive,'1');assert.equal(payload.level,'active');
 assert.ok(payload.body.includes('\n👤 账号 1\n'));assert.ok(payload.body.includes('本周尝试 4 / 35 次'));assert.ok(payload.body.includes('🔓 旧日期：开启'));
 assert.equal('url' in payload,false);assert.equal('minimum_gain' in payload,false);
});
