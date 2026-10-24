// Carman backend core, safe-by-default; never publishes to social media.
import Inventory from '../inventory-import.js';
import { randomUUID } from 'node:crypto';
export const VARIANTS=['facebook:A','facebook:B','threads:A','threads:B'];
export const isDemo=c=>Boolean(c?.isDemo||c?.demo||String(c?.notes||'').includes('示範')||String(c?.id||'').startsWith('example-'));
export const eligible=c=>c&&['可售','available'].includes(c.status)&&!isDemo(c);
export function vehicleSignature(c){
 return [c.brand,c.model,c.trim||'',c.year,c.mileageKm||c.mileage,c.price,c.status,c.imageUrl||c.image||'',(c.images||[]).map(x=>typeof x==='string'?x:x.storagePath||x.url).join(';')].join('|');
}
export function applyFeed(existingState,feedRows,{source='凱爾車業',fullSnapshot=false}={}){
 if(!Array.isArray(feedRows)||feedRows.length<1||feedRows.length>2000)throw Error('來源必須是 1–2000 台有效車源，空檔不覆蓋庫存');
 const state=structuredClone(existingState);for(const k of ['cars','posts','leads','deals'])state[k]||=[];
 const before=new Map(state.cars.filter(c=>c.source===source&&c.externalId).map(c=>[String(c.externalId),structuredClone(c)]));
 if(fullSnapshot&&before.size>=10&&feedRows.length<Math.ceil(before.size*.7))throw Error('庫存突減超過 30%，安全停止');
 const plan=Inventory.preview(state.cars,feedRows,source);
 if(plan.errors.length)throw Error('車源格式錯誤共 '+plan.errors.length+' 筆，未更動任何資料');
 const counts=Inventory.apply(state,plan,'remote-authorized-feed.json');
 const seen=new Set(plan.entries.map(e=>String(e.vehicle.externalId)));
 if(fullSnapshot)for(const c of state.cars)if(c.source===source&&c.externalId&&!seen.has(String(c.externalId))&&eligible(c)){c.status='待確認';c.lastSyncedAt=new Date().toISOString();}
 const changed=[];
 for(const c of state.cars){if(c.source!==source||!c.externalId)continue;const p=before.get(String(c.externalId));if(!p)changed.push({id:c.id,kind:'new'});else if(vehicleSignature(p)!==vehicleSignature(c))changed.push({id:c.id,kind:'changed'});}
 for(const p of state.posts){if(!p.adFactory)continue;const c=state.cars.find(x=>x.id===p.vehicleId);if(c&&(!eligible(c)||p.factorySignature!==vehicleSignature(c))&&!['已發布','published'].includes(p.status)){p.status='需重審';p.approvedAt=null;p.approvedBy=null;}}
 return {state,counts,changed,sourceCount:feedRows.length};
}
export function missingDraftVehicles(state,max=25){
 const map=new Map((state.posts||[]).filter(p=>p.adFactory).map(p=>[p.vehicleId+'|'+p.factoryVariant,p]));
 return (state.cars||[]).filter(c=>eligible(c)&&VARIANTS.some(k=>{const p=map.get(c.id+'|'+k);return !p||(!p.manualEdited&&!['已發布','published','已核准'].includes(p.status)&&(p.factorySignature!==vehicleSignature(c)||p.generatedBy!=='openai_api'));})).slice(0,max);
}
export function saveAIDrafts(state,car,payload){
 if(!eligible(car))throw Error('示範或停售車不得準備正式廣告');
 const specs=[['facebook:A','facebookA'],['facebook:B','facebookB'],['threads:A','threadsA'],['threads:B','threadsB']];
 const inputs=specs.map(([variant,key])=>{const content=String(payload?.[key]||'').trim();if(content.length<35||content.length>2500)throw Error(variant+' 文案長度不合規');if(/保證無事故|保證原鈑件|保證零事故|絕無泡水|百分之百|全台最低價|保證最低價|親自驗車|本人到場查驗/.test(content))throw Error('未經證實的車況保證，停止整車生成');return {variant,content};});
 state.posts||=[];const sig=vehicleSignature(car),ts=new Date().toISOString();let saved=0;
 for(const {variant,content} of inputs){
  let post=state.posts.find(p=>p.adFactory&&p.vehicleId===car.id&&p.factoryVariant===variant);
  if(post?.manualEdited){if(post.factorySignature!==sig)post.status='需重審';continue;}
  if(post&&['已發布','published'].includes(post.status))continue;
  if(!post){post={id:'AI-'+randomUUID(),adFactory:true,vehicleId:car.id,factoryVariant:variant,platform:variant.startsWith('facebook')?'Facebook社團':'Threads',views:0,inquiries:0};state.posts.push(post);}
  Object.assign(post,{title:[car.year,car.brand,car.model].join(' ')+'｜'+variant,content,date:ts.slice(0,10),status:'待審核',generatedBy:'openai_api',factorySignature:sig,verificationNote:String(payload.verificationNote||'').slice(0,500),generatedAt:ts,approvedAt:null,approvedBy:null});saved++;
 }
 return saved;
}
