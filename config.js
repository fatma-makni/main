/* CELIA shared settings — the only file you edit to connect the backend or change shipping. */
const CFG={
  API:'https://script.google.com/macros/s/AKfycbwGiNYXthM9NosKBcURvWPSH4lbX1cDnSD5BWAVQRyoqwT7FYBxFQSC4xFOBCkCdOuj/exec', // paste your Apps Script Web App URL
  SHIP:{'Tunisia':[10,190,'2–4'],'Europe':[37,370,'4–8'],'North America':[56,465,'7–12'],'Middle East':[43,465,'5–10'],'Africa':[43,465,'5–10'],'Rest of the world':[68,620,'8–15']},
  MAP:{'Tunisia':'Tunisia','France':'Europe','Italy':'Europe','Germany':'Europe','Spain':'Europe','United Kingdom':'Europe','United States':'North America','Canada':'North America'}
};
const $=s=>document.querySelector(s);
const formatPrice=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2})+' TND';
async function api(a,d={}){if(!CFG.API)throw Error('the backend is not connected yet.');const r=await fetch(CFG.API,{method:'POST',body:JSON.stringify({action:a,...d})});const j=await r.json();if(j.error)throw Error(j.error);return j}
