import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFeed,missingDraftVehicles,saveAIDrafts,vehicleSignature } from './core.mjs';
const row=(id='K1',price=458000,status='available')=>({externalId:id,brand:'Toyota',model:'Altis',year:2020,mileageKm:58000,price,status,images:['https://images.example/car1.jpg']});
const empty=()=>({cars:[],posts:[],leads:[{id:'L1'}],deals:[{id:'D1'}],settings:{}});
test('新進車一台只能有四份稿，重跑不重複，CRM 不受影響',()=>{
 const first=applyFeed(empty(),[row()],{source:'凱爾車業'});
 assert.equal(first.state.cars.length,1);
 assert.equal(first.state.leads.length,1);
 const car=first.state.cars[0]; assert.equal(missingDraftVehicles(first.state).length,1);
 const payload={facebookA:'車款車源資料完整介紹，請先確認實際可售與細節，有問題歡迎私訊討論。 買中古車前仍應確認車況與資料來源，以車商實際說明為準。',facebookB:'平常通勤想找耐用房車的朋友，這款車可以列入候選清單，聊聊你的預算。 買中古車前仍應確認車況與資料來源，以車商實際說明為準。',threadsA:'你會選擇什麼樣的中古房車呢？先看這台的年份、價格，再想想使用需求與保養預算。 買中古車前仍應確認車況與資料來源，以車商實際說明為準。',threadsB:'買車最怕只看漂亮外觀！同年份和里程的差別很大，這台你會列入候選嗎？ 買中古車前仍應確認車況與資料來源，以車商實際說明為準。',verificationNote:'車況待確認'};
 assert.equal(saveAIDrafts(first.state,car,payload),4);assert.equal(missingDraftVehicles(first.state).length,0);
 const repeat=applyFeed(first.state,[row()],{source:'凱爾車業'});
 assert.equal(repeat.changed.length,0);assert.equal(repeat.state.posts.length,4);
 assert.equal(repeat.state.deals.length,1);
});
test('價格異動撤銷核准並需更新文案',()=>{
 const st=applyFeed(empty(),[row()],{source:'凱爾車業'}).state,c=st.cars[0];
 st.posts=[{vehicleId:c.id,adFactory:true,factoryVariant:'facebook:A',factorySignature:vehicleSignature(c),status:'已核准',approvedAt:'2026-10-24'}];
 const next=applyFeed(st,[row('K1',420000)],{source:'凱爾車業'}).state;
 assert.equal(next.cars[0].price,420000);assert.equal(next.posts[0].status,'需重審');assert.equal(next.posts[0].approvedAt,null);
 assert.equal(missingDraftVehicles(next).length,1);
});
test('售出、空來源、異常車數不能誤發或刪除庫存',()=>{
 const st=applyFeed(empty(),[row()],{source:'凱爾車業'}).state;
 const sold=applyFeed(st,[row('K1',458000,'sold')],{source:'凱爾車業'}).state;
 assert.equal(missingDraftVehicles(sold).length,0);
 assert.throws(()=>applyFeed(st,[],{source:'凱爾車業'}),/空檔/);
 const many=Array.from({length:20},(_,i)=>row('K'+i));
 const full=applyFeed(empty(),many,{source:'凱爾車業'}).state;
 assert.throws(()=>applyFeed(full,many.slice(0,5),{source:'凱爾車業',fullSnapshot:true}),/安全停止/);
});
test('手改文案不被自動覆寫',()=>{
 const s=applyFeed(empty(),[row()],{source:'凱爾車業'}).state,c=s.cars[0];
 s.posts=[{id:'P1',vehicleId:c.id,adFactory:true,manualEdited:true,factoryVariant:'facebook:A',content:'保留我的文字',status:'待審核',factorySignature:vehicleSignature(c)}];
 saveAIDrafts(s,c,{facebookA:'這份文字只是測試有沒有被覆蓋，四份稿件全部要有完整的說明內容。 買中古車前仍應確認車況與資料來源，以車商實際說明為準。',facebookB:'說明這台車的年份與價格以及通勤的需求和購車前需要檢查的資料。 買中古車前仍應確認車況與資料來源，以車商實際說明為準。',threadsA:'這台中古車如果是你想買，你會先看價格還是維修紀錄？歡迎留言分享。 買中古車前仍應確認車況與資料來源，以車商實際說明為準。',threadsB:'來討論一下中古車的選擇，你通常最重視哪個部分，也可以留言分享。 買中古車前仍應確認車況與資料來源，以車商實際說明為準。',verificationNote:'確認'});
 assert.equal(s.posts.find(x=>x.id==='P1').content,'保留我的文字');
});
