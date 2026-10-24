/* Carman V5.2: add-only ad factory UI on top of the original DriveOS */
var AdFactoryUI=(function(){
  'use strict';
  const variants=[['facebook:A','Facebook A'],['facebook:B','Facebook B'],['threads:A','Threads A'],['threads:B','Threads B']];
  let query='',only='all',showSamples=false,selectedId='',selectedVariant='facebook:A',message='';
  function html(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function money(n){return 'NT$ '+Number(n||0).toLocaleString('zh-TW');}
  function state(){return window.DriveOSApp?.snapshot()||{cars:[],posts:[]};}
  function samples(){return (window.DriveOSExamples?.vehicles||[]).map(c=>({...c,mileage:c.mileageKm||c.mileage,status:'可售',demo:true}));}
  function sample(c){return Boolean(showSamples||c?.demo||c?.isDemo||String(c?.notes||'').includes('示範')||String(c?.id||'').startsWith('example-'));}
  function cars(){const list=state().cars||[];return showSamples?samples():list;}
  function stock(c){return c.status==='可售'||c.status==='available';}
  function signature(c){return [c.brand,c.model,c.trim||'',c.year,c.mileageKm||c.mileage,c.price,c.status,c.imageUrl||c.image||'',(c.images||[]).map(x=>typeof x==='string'?x:x.storagePath||x.url).join(';')].join('|');}
  function ad(st,c,k){return (st.posts||[]).find(p=>p.adFactory===true&&p.vehicleId===c.id&&p.factoryVariant===k);}
  function sourcePhoto(c){
    if(sample(c))return {url:'',storagePath:''};
    const first=(window.VehiclePhotos?.gallery?.(c)||[])[0]||{};
    const fromPhotos=String(first.url||c.imageUrl||c.image||'');
    const url=/^https:\/\//i.test(fromPhotos)?fromPhotos:'';
    let storagePath='';
    try{const ctx=window.DriveOSData?.storageContext?.();if(first.storagePath&&ctx&&VehiclePhotos.owned(first.storagePath,ctx.userId))storagePath=first.storagePath;}
    catch(_){}
    return {url,storagePath};
  }
  function hasPhoto(c){const photo=sourcePhoto(c);return Boolean(photo.url||photo.storagePath);}
  function image(c){
    const photo=sourcePhoto(c),alt=html(c.brand+' '+c.model+' 實車照片');
    if(photo.storagePath){
      const url=window.DriveOSPhotos?.cover?.(c)||photo.url||'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#eaf1f7"/><text x="100" y="65" font-size="13" text-anchor="middle" fill="#667f96">雲端照片載入中</text></svg>');
      return '<img loading="lazy" data-storage-path="'+html(photo.storagePath)+'" src="'+html(url)+'" alt="'+alt+'">';
    }
    if(photo.url)return '<img loading="lazy" src="'+html(photo.url)+'" alt="'+alt+'" onerror="this.hidden=true;this.parentElement.classList.add(\'cf-photo-error\')">';
    return '<span>'+(sample(c)?'示範車輛':'待補實車照片')+'</span>';
  }
  function safeTitle(c){return [c.year,c.brand,c.model].filter(Boolean).join(' ');}
  function template(c,k){const title=safeTitle(c),n=Number(c.mileageKm||c.mileage||0).toLocaleString('zh-TW'),p=money(c.price);
    const disclaimer=sample(c)?'【示範文案，非真實車源，禁止對外刊登】\n\n':'';
    const fb1=title+'｜車源資訊\n\n・年份：'+c.year+'\n・里程：'+n+' 公里\n・售價：'+p+'\n\n這台車適不適合你的日常需求？歡迎先說預算、使用情境和看車地區。\n\nCarman 協助媒合合作車商，實際車況、可售狀態及交易條件請以車商最新確認資料為準。';
    const fb2='想找 '+c.brand+' '+c.model+'？\n\n這台 '+title+' 目前資料售價 '+p+'，里程 '+n+' 公里。\n\n挑中古車不能只看標價，還要確認維修紀錄、實際車況及未來使用需求。\n\n想看類似車款，歡迎私訊預算＋地區；後續由合作車商提供詳細說明。';
    const th1='如果給你 '+p+' 的預算，你會把 '+title+' 放進候選名單嗎？🚘\n\n除了價格，我覺得車況、保養紀錄和用車需求也要一起考慮。\n\n你挑中古車第一眼會先看什麼？';
    const th2='買車不一定要選最貴的，選適合的比較重要。\n\n拿 '+title+' 當例子，資料里程 '+n+' 公里，售價 '+p+'。\n\n你會拿它跟哪一台車比較？留言聊聊。';
    return disclaimer+({'facebook:A':fb1,'facebook:B':fb2,'threads:A':th1,'threads:B':th2}[k]||fb1);
  }
  function label(p,c){if(!p)return '未建立';if(signature(c)!==p.factorySignature)return '資料異動';return p.status||'待審核';}
  function workspace(){const st=state(),all=cars(),filtered=all.filter(c=>{
      const text=(safeTitle(c)+' '+c.id).toLowerCase(),a=variants.map(v=>ad(st,c,v[0]));
      const any=a.some(Boolean),changed=a.some(p=>p&&p.factorySignature!==signature(c));
      return (!query||text.includes(query.toLowerCase()))&&(only==='all'||(only==='ready'&&a.every(Boolean)&&!changed)||(only==='missing'&&!a.every(Boolean))||(only==='changed'&&changed));
    });
    const covered=filtered.filter(c=>variants.every(v=>ad(st,c,v[0]))).length;
    return '<div class="cf-intro"><span class="cf-chip">CARMAN · DRIVEOS V5.2</span><h2>廣告工廠｜每台車只佔一列。</h2><p>平常只看車輛、庫存和四篇廣告是否齊全；需要審查時，才從右側打開 Facebook A／B 和 Threads A／B。沿用原本的雲端工作台與深藍色介面。</p></div>'
    +'<div class="cf-alert">'+(showSamples?'目前使用 5 台虛構練習車源；下方所有文案都不是實際庫存，不能對外發布。':'目前是原有 DriveOS 的車源資料。未串接車商每日庫存與 GPT API；按「建立草稿」產生的是安全套版，不是 AI 產文。')+'</div>'
    +'<div class="cf-toolbar"><input id="cf-query" aria-label="搜尋車款" placeholder="搜尋車型、品牌、年份或車源編號…" value="'+html(query)+'"><select id="cf-filter" aria-label="廣告完成度"><option value="all">所有車輛</option><option value="ready" '+(only==='ready'?'selected':'')+'>四篇齊全</option><option value="missing" '+(only==='missing'?'selected':'')+'>尚缺草稿</option><option value="changed" '+(only==='changed'?'selected':'')+'>資料異動</option></select><button class="btn secondary" data-cf="sample">'+(showSamples?'返回實際工作台':'觀看示範資料')+'</button><button class="btn" data-cf="bulk" '+(showSamples?'disabled':'')+'>為可售車補齊草稿</button></div>'
    +'<div class="cf-mini-stats"><div><b id="cf-count">'+filtered.length+'</b> 台車源　·　<b>'+covered+'</b> 台四篇齊全</div><small>'+html(message||'不重複列出同一台車的四篇文案')+'</small></div>'
    +'<div class="cf-list">'+(filtered.map(c=>{const a=variants.map(v=>ad(st,c,v[0])),cnt=a.filter(Boolean).length,changed=a.some(p=>p&&p.factorySignature!==signature(c));
      return '<article class="cf-row" data-cf-row data-name="'+html((safeTitle(c)+' '+c.id).toLowerCase())+'" data-complete="'+(cnt===4&&!changed)+'" data-missing="'+(cnt!==4)+'" data-changed="'+changed+'"><div class="cf-photo">'+image(c)+'</div><div class="cf-information"><b>'+html(safeTitle(c))+'</b><div class="cf-detail">'+html(c.id)+' · '+money(c.price)+' · '+html(c.status||'待確認')+'</div><div class="cf-labels"><span class="cf-state '+(cnt===4?'cf-done':'')+'">'+(showSamples?'4 篇示範':cnt+' / 4 篇草稿')+'</span>'+(changed?'<span class="cf-state cf-warn">需重新審核</span>':'')+(sample(c)?'<span>示範車源</span>':'')+'</div></div><button class="btn secondary" data-cf="open" data-id="'+html(c.id)+'">查看四篇 ›</button></article>';
    }).join('')||'<div class="cf-empty">目前沒有符合條件的車輛。等取得楊哥授權庫存後，從原本「車源匯入」加入資料即可。</div>')+'</div>'
    +'<div class="hint" style="margin-top:18px">四份稿件與車源 ID 綁定；若價格或其他資料有變更會顯示需重審。舊版審核發布工作台仍保留，不會自動把範例發布出去。</div>';
  }
  function drawer(){const el=document.getElementById('cf-overlay');if(!el)return;
    const c=cars().find(c=>c.id===selectedId);if(!c){el.remove();return;}
    const st=state(),p=ad(st,c,selectedVariant),dem=sample(c),text=p?.content||template(c,selectedVariant);
    const status=p?label(p,c):'尚未建立';
    el.innerHTML='<div class="cf-shade" data-cf="close"></div><section class="cf-panel" role="dialog" aria-modal="true" aria-label="查看車輛廣告"><div class="cf-panel-head"><div class="cf-heading"><div><span class="cf-chip">'+(dem?'DEMO 示範':'正式車源')+'</span><h2>'+html(safeTitle(c))+'</h2><p>'+money(c.price)+' · '+html(c.status||'待確認')+' · '+html(status)+'</p></div><button class="btn secondary" data-cf="close" aria-label="關閉視窗">關閉 ×</button></div><div class="cf-variants">'+variants.map(v=>'<button data-cf="tab" data-key="'+v[0]+'" class="'+(v[0]===selectedVariant?'active':'')+'">'+v[1]+'</button>').join('')+'</div></div><div class="cf-panel-body"><div class="cf-car-head"><div class="cf-photo">'+image(c)+'</div><div><b>'+html(c.brand+' '+c.model)+'</b><p>年份 '+html(c.year)+' · 里程 '+Number(c.mileageKm||c.mileage||0).toLocaleString('zh-TW')+' km</p><p>文案版本：'+html(variants.find(v=>v[0]===selectedVariant)?.[1]||'')+'</p></div></div><label for="cf-content">廣告內文</label><textarea id="cf-content" '+(dem?'readonly':'')+'>'+html(text)+'</textarea>'+(dem?'<div class="cf-notice">此篇是虛構練習素材，不能刊登。</div>':'<p class="cf-info">目前為預先產生的安全套版。核准前需確認車價、可售狀態、實車照片和合作車商資訊。這裡的「核准」只會更新工作台狀態，不會自動發文。</p>')+'</div><div class="cf-panel-foot"><button class="btn secondary" data-cf="copy">複製文案</button><button class="btn" data-cf="save" '+(dem?'disabled':'')+'>儲存草稿</button><button class="btn" data-cf="approve" '+(dem||!p||!stock(c)||!hasPhoto(c)||signature(c)!==p.factorySignature?'disabled':'')+'>核准此稿</button></div></section>';void window.DriveOSPhotos?.refresh?.();
  }
  function open(id){selectedId=id;selectedVariant='facebook:A';let overlay=document.getElementById('cf-overlay');if(!overlay){overlay=document.createElement('div');overlay.id='cf-overlay';overlay.className='cf-modal';document.body.appendChild(overlay);}drawer();}
  function persistChange(change){
    if(!window.DriveOSApp){alert('工作台尚未準備完成');return;}
    const st=state();try{change(st);DriveOSData.persist(st);window.DriveOSApp.replaceState(st);message='已保存在目前工作台';if(selectedId)drawer();}
    catch(e){alert('儲存失敗，原資料保持不變：'+(e?.message||e));}
  }
  function saveCurrent(approve){const c=cars().find(x=>x.id===selectedId);if(!c||sample(c))return;
    const content=document.getElementById('cf-content')?.value?.trim();if(!content){alert('文案不能空白');return;}
    if(approve&&(!stock(c)||!hasPhoto(c))){alert('正式核准前，車源必須仍可售且有授權的實車照片');return;}
    persistChange(st=>{st.posts=st.posts||[];let post=ad(st,c,selectedVariant);if(approve&&(!post||post.factorySignature!==signature(c)))throw new Error('車源資料有異動，請重新審稿');
      if(!post){post={id:'AF-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),adFactory:true,vehicleId:c.id,factoryVariant:selectedVariant,platform:selectedVariant.startsWith('facebook')?'Facebook社團':'Threads',title:safeTitle(c)+'｜'+selectedVariant,views:0,inquiries:0,date:new Date().toLocaleDateString('en-CA'),status:'待審核',factorySignature:signature(c)};st.posts.push(post);}
      post.content=content;post.status=approve?'已核准':'待審核';post.factorySignature=signature(c);
    });
  }
  function bulk(){if(showSamples)return;const st=state(),target=st.cars.filter(c=>stock(c)&&!sample(c)),missing=target.reduce((n,c)=>n+variants.filter(v=>!ad(st,c,v[0])).length,0);
    if(!missing){alert('可售車目前四份草稿都已齊全');return;}
    if(!confirm('將替 '+target.length+' 台可售車補齊 '+missing+' 篇安全套版草稿。這不是 GPT AI 文案，也不會發布，確定建立？'))return;
    persistChange(next=>{for(const c of target){for(const [k] of variants){if(ad(next,c,k))continue;next.posts.push({id:'AF-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),adFactory:true,vehicleId:c.id,factoryVariant:k,platform:k.startsWith('facebook')?'Facebook社團':'Threads',title:safeTitle(c)+'｜'+k,content:template(c,k),status:'待審核',factorySignature:signature(c),views:0,inquiries:0,date:new Date().toLocaleDateString('en-CA')});}}});
  }
  document.addEventListener('click',e=>{const t=e.target.closest('[data-cf]');if(!t)return;
    const action=t.dataset.cf;if(action==='open')open(t.dataset.id);
    if(action==='close'){selectedId='';document.getElementById('cf-overlay')?.remove();}
    if(action==='tab'){const cur=document.getElementById('cf-content');const car=cars().find(c=>c.id===selectedId);const original=car?(ad(state(),car,selectedVariant)?.content||template(car,selectedVariant)):'';if(cur&&!sample(car)&&cur.value!==original&&!confirm('這份文案尚未儲存，切換版本會遺失修改。確定切換？'))return;selectedVariant=t.dataset.key;drawer();}
    if(action==='copy'){const x=document.getElementById('cf-content');if(!x)return;const clipboard=navigator.clipboard?.writeText?.(x.value);if(clipboard)clipboard.catch(()=>{x.select();document.execCommand('copy');});else{x.select();document.execCommand('copy');}message='已複製';}
    if(action==='sample'){showSamples=!showSamples;query='';only='all';if(typeof navigate==='function')navigate('adFactory');}
    if(action==='bulk')bulk();
    if(action==='save')saveCurrent(false);
    if(action==='approve')saveCurrent(true);
  });
  document.addEventListener('input',e=>{if(e.target.id!=='cf-query')return;query=e.target.value;filterRows();});
  document.addEventListener('change',e=>{if(e.target.id!=='cf-filter')return;only=e.target.value;filterRows();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('cf-overlay')){selectedId='';document.getElementById('cf-overlay')?.remove();}});
  function filterRows(){const rows=[...document.querySelectorAll('[data-cf-row]')];let visible=0;rows.forEach(r=>{const ok=(!query||r.dataset.name.includes(query.toLowerCase()))&&(only==='all'||(only==='ready'&&r.dataset.complete==='true')||(only==='missing'&&r.dataset.missing==='true')||(only==='changed'&&r.dataset.changed==='true'));r.hidden=!ok;if(ok)visible++;});const counter=document.getElementById('cf-count');if(counter)counter.textContent=visible;}
  return {workspace};
})();
