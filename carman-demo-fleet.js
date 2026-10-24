/* Carman V5.5: isolated, read-only end-to-end demo fleet.
   Does not write real workspaces, CRM, commissions or publish posts. */
var CarmanDemoFleet=(function(){
 'use strict';
 let active=false;
 const cardList=[
  {id:'CARMAN-DEMO-001',externalId:'DEMO-001',brand:'Toyota',model:'RAV4 2.0 豪華版',year:2021,mileage:58000,price:798000,color:'白色',fuel:'汽油',profile:'家庭休旅',angle:'家庭、載物、假日出遊',buyer:'假日會帶家人出門、希望車內空間夠用的人',question:'家庭休旅，你最在意後座空間還是後車廂？',compare:'CR-V、CX-5',scene:'帶著家人出遊，行李、推車與購物都要考慮到',photo:'car1'},
  {id:'CARMAN-DEMO-002',externalId:'DEMO-002',brand:'BMW',model:'320i Luxury',year:2020,mileage:42000,price:988000,color:'黑色',fuel:'汽油',profile:'駕駛質感',angle:'駕馭感、房車質感、預算規劃',buyer:'希望開車有樂趣、又願意計算保養預算的人',question:'你選 BMW 3 系列，會先看年份、配備，還是養車預算？',compare:'Mercedes-Benz C-Class、Lexus IS',scene:'每天通勤或週末出門，都想保有自己喜歡的駕駛節奏',photo:'car2'},
  {id:'CARMAN-DEMO-003',externalId:'DEMO-003',brand:'Honda',model:'Fit 1.5 S',year:2019,mileage:76000,price:358000,color:'白色',fuel:'汽油',profile:'城市代步',angle:'停車便利、首購、通勤',buyer:'第一台車、城市通勤、想控制購車成本的人',question:'第一台車你會選小車好停，還是加一點預算買房車？',compare:'Toyota Yaris、Suzuki Swift',scene:'上下班找停車位、週末跑咖啡廳，不一定需要大車',photo:'car3'},
  {id:'CARMAN-DEMO-004',externalId:'DEMO-004',brand:'Mazda',model:'CX-5 2.0',year:2022,mileage:31000,price:888000,color:'深灰色',fuel:'汽油',profile:'都會休旅',angle:'外型設計、家庭需求、乘坐質感',buyer:'想兼顧日常通勤與週末小旅行的人',question:'CX-5 跟 RAV4，如果只能選一台，你會選哪台？',compare:'Toyota RAV4、Honda CR-V',scene:'平日上班、假日載朋友跑郊外，想找一台外型順眼的 SUV',photo:'car4'},
  {id:'CARMAN-DEMO-005',externalId:'DEMO-005',brand:'Mercedes-Benz',model:'C200',year:2018,mileage:68000,price:898000,color:'白色',fuel:'汽油',profile:'入門豪華房車',angle:'品牌偏好、購車預算、養車需求',buyer:'喜歡豪華房車，想在車價與後續費用之間取得平衡的人',question:'中古 C-Class，你覺得買車價重要還是後續養車重要？',compare:'BMW 320i、Lexus IS',scene:'想升級一台自己喜歡的房車，同時把未來維護費一起估算',photo:'car5'}
 ];
 const prefix='【AI 生成｜測試用範例｜非真實在售，請勿對外刊登】\n\n';
 const cars=cardList.map((v,i)=>({
  ...v,trim:v.model,mileageKm:v.mileage,source:'Carman 虛構測試車庫',
  status:'可售',isDemo:true,demo:true,
  image:'demo-photos.svg#'+v.photo,
  images:[{url:'demo-photos.svg#'+v.photo,position:1,type:'cover',isDemo:true}],
  notes:'AI 生成測試資料；虛構年份、里程、售價、車況。並非凱爾車業車源，請勿對外刊登。',
  conditionDescription:'測試範例：未實際驗車，事故、泡水、鈑件、保養及配備均未核實。',
  lastSyncedAt:null
 }));
 function title(c){return [c.year,c.brand,c.model].join(' ');}
 function price(c){return 'NT$ '+c.price.toLocaleString('zh-TW');}
 function make(c,k){
  const fact=title(c)+'｜測試售價 '+price(c)+'｜示範里程 '+c.mileage.toLocaleString('zh-TW')+' km';
  const facts='\n\n車況、配備、事故紀錄與實際售價均未查證，本篇僅供測試 DriveOS 文案操作。';
  switch(k){
   case 'facebook:A':return prefix+'🚘 '+title(c)+'｜'+c.profile+'\n\n'+fact+'\n車色：'+c.color+'｜示範燃料：'+c.fuel+'\n\n'+c.scene+'。如果你正在考慮 '+c.brand+' '+c.model+'，建議先核對車況、實際配備與保養資料，再估算持有成本。\n\n💬 有類似購車需求？這是測試文案，請勿以本文價格作交易依據。'+facts;
   case 'facebook:B':return prefix+'手上大約 '+Math.round(c.price/10000)+' 萬元的預算，會怎麼選車？\n\n'+c.buyer+'，也許會把 '+title(c)+' 放入比較清單。\n\n測試車輛資料：'+c.color+'、'+c.mileage.toLocaleString('zh-TW')+' km、'+price(c)+'。\n\n如果同時比較 '+c.compare+'，你最想先確認空間、保養成本，還是安全配備？\n\n我們會依買家的需求，整理資料並交由合作車商核對。'+facts;
   case 'threads:A':return prefix+c.question+'\n\n拿 '+title(c)+' 當討論例子：'+price(c)+'、'+c.mileage.toLocaleString('zh-TW')+' 公里（全部是虛構測試數字）。\n\n我比較好奇，你會為了 '+c.profile+' 多留多少預算？留言告訴 Carman 🚘';
   case 'threads:B':return prefix+'這題我想問一下車友 👀\n\n'+c.scene+'。\n\n如果是 '+c.brand+' '+c.model+'，你會選它，還是 '+c.compare+'？\n\n不同人想要的車真的差很多。留言車型＋大概預算，聊聊你的選擇。\n\n※ 本車及照片均為 AI 測試示意，沒有實際在售。';
  }
 }
 const variants=[['facebook:A','Facebook社團'],['facebook:B','Facebook社團'],['threads:A','Threads'],['threads:B','Threads']];
 const posts=cars.flatMap(c=>variants.map(([v,platform])=>({
  id:'CARMAN-DEMO-AD-'+c.externalId+'-'+v.replace(':','-'),
  vehicleId:c.id,adFactory:true,factoryVariant:v,platform,title:title(c)+'｜'+v,
  content:make(c,v),status:'待審核',views:0,inquiries:0,isDemo:true,manualEdited:false,
  factorySignature:[c.brand,c.model,c.trim||'',c.year,c.mileageKm||c.mileage,c.price,c.status,c.imageUrl||c.image||'',c.images.map(x=>x.storagePath||x.url).join(';')].join('|')
 })));
 function state(){return {cars,posts,leads:[],deals:[],settings:{demo:true},demoFleet:true};}
 function enable(){active=true;window.CarmanDemoFleet.active=true;}
 function disable(){active=false;window.CarmanDemoFleet.active=false;}
 function workspace(){
  return '<section class="ow-hero"><small>DEMO FLEET · 5 AI CARS</small><h2>車源管理｜五台 AI 測試車庫</h2><p>從這裡選一台車，進入廣告工廠就能找到同一台車和四篇專屬文案。所有照片、售價、里程、描述都是虛構測試資料，不會寫入雲端正式車源。</p><div class="ow-hero-actions"><button class="btn" onclick="navigate(\'adFactory\')">查看 20 篇測試廣告 →</button><button class="btn secondary" data-demo-fleet="exit">回到正式車源</button></div></section>'
  +'<div class="ow-note"><b>AI 生成｜測試用範例</b>　5 台測試車、5 張 AI 照片、20 篇 FB／Threads 模擬廣告。不可對外刊登；與雲端車源、客戶及佣金完全隔離。</div>'
  +'<div class="cf-list">'+cars.map(c=>'<article class="cf-row"><div class="cf-photo cf-demo-pic"><img src="'+c.image+'" alt="'+c.brand+' '+c.model+' AI生成測試照片" loading="lazy"></div><div class="cf-information"><b>'+c.year+' '+c.brand+' '+c.model+'</b><div class="cf-detail">示範售價 '+price(c)+' · '+c.mileage.toLocaleString('zh-TW')+' km</div><div class="cf-labels"><span class="cf-state cf-warn">AI 生成｜測試用範例</span><span class="cf-state cf-done">4 / 4 篇廣告</span></div></div><button class="btn secondary" data-demo-fleet="open" data-car="'+c.id+'">查看廣告 ›</button></article>').join('')+'</div>';
 }
 document.addEventListener('click',event=>{
  const t=event.target.closest('[data-demo-fleet]');if(!t)return;
  if(t.dataset.demoFleet==='activate'){enable();if(typeof navigate==='function')navigate('cars');}
  if(t.dataset.demoFleet==='exit'){disable();if(typeof navigate==='function')navigate('cars');}
  if(t.dataset.demoFleet==='open'){if(typeof navigate==='function')navigate('adFactory');setTimeout(()=>document.querySelector('[data-cf="open"][data-id="'+t.dataset.car+'"]')?.click(),0);}
 });
 const api={state,workspace,enable,disable,cars,posts,active};return api;
})();