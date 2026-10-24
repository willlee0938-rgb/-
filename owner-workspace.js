/* DriveOS V5.3 -- simplified decision dashboards using the original cloud data */
var OwnerUI=(function(){
'use strict';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>Number(x||0).toLocaleString('zh-TW');
const isDemo=c=>!!(c.demo||c.isDemo||String(c.notes||'').includes('示範')||String(c.id||'').startsWith('example-'));
const available=c=>c.status==='可售'||c.status==='available';
const validCars=db=>(db.cars||[]).filter(c=>!isDemo(c));
const statusP=(value,extra='')=>'<span class="ow-pill '+extra+'">'+safe(value)+'</span>';
const nav=(p,label,cl='secondary')=>'<button class="btn '+cl+'" type="button" onclick="navigate(\''+p+'\')">'+label+'</button>';
function summary(db){
 const all=validCars(db),active=all.filter(available),p=db.posts||[];
 const needs=active.filter(c=>['facebook:A','facebook:B','threads:A','threads:B'].some(v=>!p.some(a=>a.adFactory===true&&a.vehicleId===c.id&&a.factoryVariant===v))).length;
 const review=p.filter(a=>a.adFactory===true&&a.status==='待審核'&&active.some(c=>c.id===a.vehicleId)).length;
 const pending=(db.leads||[]).filter(l=>!['已成交','未成交'].includes(l.stage)).length;
 return {all,active,needs,review,pending};
}
function dashboard(db){
 const s=summary(db),samples=(db.cars||[]).filter(isDemo).length;
 return '<div class="ow-hero"><small>CARMAN · DAILY COMMAND CENTER</small><h2>今天只需要看重點、審廣告、做決定。</h2><p>車源更新後，廣告跟著車輛管理；每台車只佔一列。正式串接楊哥庫存之前，這裡只顯示目前工作台資料，不會捏造每日同步成功。</p><div class="ow-hero-actions">'+nav('adFactory','查看待審核廣告','')+nav('cars','查看車源')+'</div></div>'
 +'<div class="ow-note">車商每日同步：<b>尚未串接</b>　·　GPT 自動產文：<b>尚未啟用</b>　·　Threads / FB 自動發布：<b>尚未授權</b>'+(samples?'　·　目前另有 '+samples+' 台示範資料，不計入正式庫存':'')+'</div>'
 +'<div class="ow-kpi"><div><small>已建檔可售車源</small><strong>'+number(s.active.length)+'</strong><span>非示範資料，非即時車商庫存</span></div><div><small>尚未補齊四篇草稿</small><strong>'+number(s.needs)+'</strong><span>FB A/B + Threads A/B</span></div><div><small>待審核廣告</small><strong>'+number(s.review)+'</strong><span>先確認價格、車況與實車照</span></div><div><small>尚在跟進的線索</small><strong>'+number(s.pending)+'</strong><span>買車與賣車需求</span></div></div>'
 +'<div class="ow-two"><section class="ow-section"><h2>今日工作重點</h2><div class="ow-statusline"><span>庫存狀態</span>'+statusP('等待楊哥授權','warn')+'</div><div class="ow-statusline"><span>廣告草稿</span>'+statusP(s.needs?'有車尚未補齊':'依現有資料已檢查')+'</div><div class="ow-statusline"><span>雲端儲存</span>'+statusP(window.DriveOSData?.isCloud?.()?'使用雲端帳號':'本機模式','')+'</div><div class="ow-actions">'+nav('inventoryImport','匯入車源')+nav('adFactory','進入廣告工廠','')+'</div></section><section class="ow-section"><h2>下一步</h2><p>楊哥開放資料庫後，先測試 5 台真車的照片、價格和上下架狀態，再擴到全部庫存。在此之前，先用廣告工廠練習審稿。</p><div class="ow-actions">'+nav('ownerLeads','買賣線索')+nav('settings','查看系統串接')+'</div></section></div>';
}
function leads(db){
 const ls=(db.leads||[]),buyers=ls.filter(l=>l.intent!=='想賣車'),sellers=ls.filter(l=>l.intent==='想賣車');
 const recent=ls.slice().sort((a,b)=>String(b.created||'').localeCompare(String(a.created||''))).slice(0,20);
 const list=recent.map(x=>'<tr><td><b>'+safe(x.name)+'</b><div class="muted">'+safe(x.contact||'')+'</div></td><td>'+statusP(x.intent||'想買車')+'</td><td>'+safe(x.source||'')+'</td><td>'+safe(x.interest||'')+'</td><td>'+safe(x.stage||'')+'</td><td><button class="btn secondary" onclick="openForm(\'leads\',\''+safe(x.id)+'\')">查看／編輯</button></td></tr>').join('');
 return '<div class="ow-hero"><small>CARMAN · LEAD HUB</small><h2>買家與賣家，一個地方追蹤。</h2><p>記錄預算、車型、需求和轉介進度。客戶同意轉介後，才把聯絡資料提供給合作車商。</p><div class="ow-hero-actions"><button class="btn" onclick="openForm(\'leads\')">＋ 新增買賣線索</button></div></div>'
 +'<div class="ow-kpi"><div><small>想買車</small><strong>'+number(buyers.length)+'</strong><span>未標示類型的舊資料暫歸買方</span></div><div><small>想賣車</small><strong>'+number(sellers.length)+'</strong><span>待車商估價或收購</span></div><div><small>待處理線索</small><strong>'+number(ls.filter(x=>!['已成交','未成交'].includes(x.stage)).length)+'</strong><span>尚未結案</span></div><div><small>轉介紀錄</small><strong>'+number((db.deals||[]).length)+'</strong><span>在原本成交模組保留</span></div></div>'
 +'<section class="ow-section"><div class="ow-leads-top"><h2>最近 20 筆買賣需求</h2>'+nav('broker','查看完整媒合進度')+'</div><div class="tablewrap"><table class="ow-table"><thead><tr><th>客戶</th><th>類型</th><th>來源</th><th>車款／需求</th><th>階段</th><th>操作</th></tr></thead><tbody>'+(list||'<tr><td colspan="6" class="empty">還沒有買賣線索，點上方新增即可。</td></tr>')+'</tbody></table></div><div class="ow-actions">'+nav('leads','完整 CRM')+nav('deals','轉介與佣金')+'</div></section>';
}
function settings(db,legacy){
 const cloud=window.DriveOSData?.isCloud?.();
 const tiles=[['庫存同步','等待楊哥提供授權資料','inventoryImport','車源匯入'],['廣告工廠','待 GPT API 正式串接','adFactory','管理文案'],['發布任務','等待 Threads / Facebook 平台授權','publishing','審核與發布'],['轉介佣金','保留歷史，不佔側邊欄','deals','佣金追蹤']];
 return '<div class="ow-hero"><small>CARMAN · SYSTEM</small><h2>系統設定與進階工具</h2><p>日常操作只留五個選單，低頻使用的匯入、發文任務、佣金和備份都集中在這裡。原本功能沒有刪除。</p></div>'
 +'<div class="ow-note">資料儲存：<b>'+(cloud?'雲端帳號模式（請確認頁首同步狀態）':'此瀏覽器本機模式')+'</b>　·　車商資料庫：<b>尚未串接</b>　·　AI 批量生成：<b>尚未啟用</b></div>'
 +'<section class="ow-section"><h2>需要時才打開的工具</h2>'+tiles.map(t=>'<div class="ow-quick"><div><strong>'+t[0]+'</strong><p>'+t[1]+'</p></div>'+nav(t[2],t[3])+'</div>').join('')+'</section>'
 +'<details class="ow-advanced"><summary>進階資料管理、備份與連線狀態（展開）</summary><div class="ow-inner">'+legacy()+'</div></details>'
 +'<div class="ow-actions">'+nav('reports','查看歷史報表')+nav('posts','原有社群廣告清單')+nav('examples','五組範例')+'</div>';
}
return {dashboard,leads,settings,summary};
})();