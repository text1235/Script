const assert=require('node:assert/strict');
const {runQueue,MIN_INTERVAL_MS,MAX_INTERVAL_MS}=require('../smzdm_makeup.js');
(async()=>{
 const options={apply:true,loop:true,accounts:[3],accountIds:['mock3'],batch:'MOCK',maxCards:2,earliestDate:''};
 let now=1000000,fixes=0,sleeps=[],queries=0;
 const query=async()=>{queries++;return {error_code:0,data:{fix_date:`2026-10-${String(7-fixes).padStart(2,'0')}`,before_checkin_num:1+fixes,after_checkin_num:2+fixes,left_fix_num:84-fixes}};};
 const deps={now:()=>now,delay:()=>10000,sleep:async ms=>{sleeps.push(ms);now+=ms;},query,fix:async()=>{fixes++;return {error_code:0};},save:async()=>{}};
 const result=await runQueue(options,null,deps);
 assert.equal(fixes,2);assert.equal(queries,4);assert.equal(result.report.mode,'budget_reached');assert.ok(sleeps.every(ms=>ms>=MIN_INTERVAL_MS&&ms<=MAX_INTERVAL_MS));
 let rejected=0;
 const paused=await runQueue(options,null,{...deps,query:async()=>({error_code:0,data:{fix_date:'2026-10-07',before_checkin_num:1,after_checkin_num:2,left_fix_num:84}}),fix:async()=>{rejected++;return {error_code:429};}});
 assert.equal(paused.report.mode,'paused');assert.equal(rejected,1);
 await runQueue(options,paused.state,deps);assert.equal(fixes,2);
 console.log('PASS: random delay bounds; loop total budget; immediate stop on rejection; no automatic resume. ALL CALLS MOCKED; CARDS USED: 0');
})().catch(()=>{console.error('Loop test failed');process.exitCode=1;});