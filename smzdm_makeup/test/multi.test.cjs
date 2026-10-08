const test=require('node:test');const assert=require('node:assert/strict');const {runQueue,reconcile}=require('../smzdm_makeup.js');
const options={apply:true,loop:true,accounts:[1,2],accountIds:['a','b'],batch:'MOCK_MULTI',maxCards:3,accountLimits:{1:1,2:2},earliestDate:''};
const status=(n,cards=10)=>({error_code:0,data:{fix_date:`2026-10-${String(7-n).padStart(2,'0')}`,before_checkin_num:n+1,after_checkin_num:n+2,left_fix_num:cards}});
test('round robin respects independent account and total budgets',async()=>{
 let now=1e6;const counts={1:0,2:0},calls=[];
 const result=await runQueue(options,null,{now:()=>now,sleep:async ms=>{now+=ms;},query:async a=>status(counts[a]),fix:async a=>{calls.push(a);counts[a]++;return {error_code:0};},save:async()=>{}});
 assert.deepEqual(calls,[1,2,2]);assert.equal(result.state.confirmed,3);assert.equal(result.state.per_account_attempts[1],1);assert.equal(result.state.per_account_attempts[2],2);
});
test('zero-card account is skipped without affecting next account',async()=>{
 let now=1e6,used=0;const result=await runQueue({...options,maxCards:2},null,{now:()=>now,sleep:async ms=>{now+=ms;},query:async a=>a===1?status(0,0):status(used),fix:async a=>{assert.equal(a,2);used++;return {error_code:0};},save:async()=>{}});assert.equal(used,2);assert.ok(result.state.done_accounts.includes(1));
});
test('explicit reconciliation queries only and preserves spent budget',async()=>{
 const state={batch:'MOCK_MULTI',account_ids:['a','b'],max_attempts:3,account_limits:{1:1,2:2},attempts:1,confirmed:0,cursor:0,paused:true,pending:{account_index:1,date:'2026-10-07',expected_continue_days:2},history:[{account_index:1,date:'2026-10-07',server_accepted:true,verified:false}]};
 let queried=0,saved=0;const result=await reconcile(options,state,{query:async()=>{queried++;return status(1,9);},save:async()=>{saved++;}});assert.equal(queried,1);assert.equal(saved,1);assert.equal(result.state.attempts,1);assert.equal(result.state.confirmed,1);assert.equal(result.state.pending,null);assert.equal(result.report.cards_requested,0);
});
test('no-card reply is confirmed through read-only official checkin profile',async()=>{
 const state={batch:'MOCK_MULTI',account_ids:['a','b'],max_attempts:3,account_limits:{1:1,2:2},attempts:1,confirmed:0,cursor:0,paused:true,pending:{account_index:1,date:'2026-10-07',expected_continue_days:2},history:[{account_index:1,date:'2026-10-07',server_accepted:true,verified:false}]};
 const result=await reconcile(options,state,{query:async()=>({error_code:3,error_msg:'没有补签卡？'}),profile:async()=>({error_code:0,data:{rows:[{cell_type:'18001',cell_data:{checkin_num:'2'}}]}}),save:async()=>{}});
 assert.equal(result.state.confirmed,1);assert.equal(result.state.card_counts[1],0);assert.ok(result.state.done_accounts.includes(1));assert.equal(result.report.cards_requested,0);
});
