(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DriveOSExamples = factory();
})(globalThis, function () {
  'use strict';
  const vehicles = Object.freeze([
    { id: 'example-altis', brand: 'Toyota', model: 'Corolla Altis', year: 2020, mileage: 58000, price: 458000, angle: '通勤入門', question: '每天通勤用車，你會先比較價格、年份，還是里程？', color: '#2773b8' },
    { id: 'example-fit', brand: 'Honda', model: 'Fit', year: 2019, mileage: 65000, price: 358000, angle: '都會代步', question: '找代步車時，你最希望先確認哪些規格與使用需求？', color: '#ed7c43' },
    { id: 'example-mazda3', brand: 'Mazda', model: 'Mazda3', year: 2021, mileage: 43000, price: 598000, angle: '車款比較', question: '選房車時，你最想拿哪些車款一起比較？', color: '#aa3346' },
    { id: 'example-rav4', brand: 'Toyota', model: 'RAV4', year: 2020, mileage: 72000, price: 798000, angle: '家庭休旅', question: '考慮家庭用車，你會先列出幾位乘客、行李需求，還是購車預算？', color: '#697a8d' },
    { id: 'example-x3', brand: 'BMW', model: 'X3', year: 2018, mileage: 86000, price: 998000, angle: '進階休旅', question: '比較中古休旅時，除了購車預算，你也會先整理後續養車預算嗎？', color: '#243e5b' }
  ].map(vehicle => Object.freeze({ ...vehicle, isDemo: true, notes: '示範資料，非凱爾車業實際庫存；價格、年份與里程均為介面測試數值。' })));
  const disclaimer = '【示範廣告｜非真實庫存，請勿對外刊登】';
  function copyFor(id, platform) {
    const car = vehicles.find(car => car.id === id);
    if (!car) throw new Error('找不到廣告範例。');
    const title = `${car.year} ${car.brand} ${car.model}`;
    const price = `NT$ ${car.price.toLocaleString('zh-TW')}`;
    const mileage = `${car.mileage.toLocaleString('zh-TW')} 公里`;
    if (platform === 'facebook') return `${disclaimer}\n\n${title}｜示範售價 ${price}\n\n・年份：${car.year}\n・示範里程：${mileage}\n・本篇方向：${car.angle}\n\n${car.question}\n歡迎先整理你的預算、用途及方便賞車的時間，我協助遠端確認需求，再由車行確認實際可售車與安排現場賞車。\n\n車況、配備、保固及貸款條件，需以車行提供並確認的資料為準。\n本篇價格與里程皆為測試數值，不代表行情或實際報價。`;
    if (platform === 'threads') return `${disclaimer}\n\n${car.question}\n\n用 ${title} 示範一份選車資訊：\n示範預算 ${price}／示範里程 ${mileage}。\n\n如果要找類似車款，可以先留下預算與主要用途，讓我協助整理需求，再請車行確認實際庫存與賞車安排。\n\n這是版型示範，非在售車輛或市場估價。`;
    throw new Error('請選 Facebook 或 Threads 範例。');
  }
  return { vehicles, copyFor, disclaimer };
});
