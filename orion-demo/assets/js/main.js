// Count-up animation for hero stats
function countUp(el){
  const target = +el.dataset.target;
  const dur = 1800;
  const start = performance.now();
  function tick(now){
    const t = Math.min(1, (now-start)/dur);
    const eased = 1 - Math.pow(1-t, 3);
    el.textContent = Math.floor(eased * target);
    if(t<1) requestAnimationFrame(tick);
    else el.textContent = target;
  }
  requestAnimationFrame(tick);
}
document.querySelectorAll('.stat-num[data-target]').forEach(el=>{
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ countUp(el); io.disconnect(); }});
  },{threshold:.4});
  io.observe(el);
});

// Reveal on scroll
const revealIO = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); revealIO.unobserve(e.target);}});
},{threshold:.15});
document.querySelectorAll('.reveal').forEach(el=>revealIO.observe(el));

// Poster wall: drag to scroll
document.querySelectorAll('.wall').forEach(wall=>{
  let down=false, startX=0, scroll=0;
  wall.addEventListener('mousedown',e=>{down=true;startX=e.pageX;scroll=wall.scrollLeft;wall.style.cursor='grabbing'});
  wall.addEventListener('mouseleave',()=>{down=false;wall.style.cursor=''});
  wall.addEventListener('mouseup',()=>{down=false;wall.style.cursor=''});
  wall.addEventListener('mousemove',e=>{if(!down)return;e.preventDefault();wall.scrollLeft=scroll-(e.pageX-startX)*1.5});
});

// Tab switching (games page)
document.querySelectorAll('[data-tab-group]').forEach(group=>{
  const tabs = group.querySelectorAll('[data-tab]');
  tabs.forEach(t=>t.addEventListener('click',()=>{
    tabs.forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const key = t.dataset.tab;
    const panels = document.querySelectorAll(`[data-panel-group="${group.dataset.tabGroup}"] [data-panel]`);
    panels.forEach(p=>p.style.display = p.dataset.panel===key?'':'none');
  }));
});
