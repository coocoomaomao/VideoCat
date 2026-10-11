const $=s=>document.querySelector(s);
let files=[], inspected=[], outputDir=null;

const toast=msg=>{
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),2300);
};

const fmtDuration=s=>{
  if(!s)return'--';
  const m=Math.floor(s/60),sec=Math.floor(s%60);
  return `${m}:${String(sec).padStart(2,'0')}`;
};

async function addFiles(paths){
  files=[...new Set([...files,...paths])];
  inspected=await window.videocat.inspectVideos(files);
  if(files.length && !outputDir){
    outputDir=await window.videocat.suggestOutputDir(files[0]);
    $('#outputPath').textContent=outputDir;
    $('#outputBadge').textContent='自动目录';
  }
  renderFiles(); renderEstimates();
  $('#workspace').hidden=files.length===0;
}

function renderFiles(){
  $('#queueBadge').textContent=`${files.length} 个`;
  $('#fileList').innerHTML=inspected.map((x,i)=>x.ok?`
    <div class="file-row">
      <div><b>${x.name}</b><small>${x.width}×${x.height} · ${fmtDuration(x.duration)} · ${x.codec||'video'}</small></div>
      <span>${x.sizeText}</span>
      <button data-remove="${i}">移除</button>
    </div>`:`
    <div class="file-row error">
      <div><b>${x.name}</b><small>${x.error}</small></div><span>不可用</span><button data-remove="${i}">移除</button>
    </div>`).join('');
}

$('#fileList').addEventListener('click',e=>{
  const b=e.target.closest('[data-remove]'); if(!b)return;
  const i=Number(b.dataset.remove);
  files.splice(i,1); inspected.splice(i,1);
  renderFiles(); renderEstimates();
  $('#workspace').hidden=files.length===0;
});

function targetMB(){return Math.max(1,Number($('#targetMB').value||25))}
function selectedResolution(){return $('#resolution').value}

function estimate(meta){
  const mb=targetMB();
  const totalKbps=Math.floor((mb*1024*1024*8*.97)/Math.max(1,meta.duration)/1000);
  const audio=Math.min(Number($('#audioKbps').value),Math.max(64,totalKbps-120));
  const video=Math.max(120,totalKbps-audio);
  let w=meta.width,h=meta.height;
  const p=selectedResolution();
  const target=p==='1080p'?1920:p==='720p'?1280:p==='480p'?854:null;
  if(target && Math.max(w,h)>target){const r=target/Math.max(w,h);w=Math.max(2,Math.round(w*r/2)*2);h=Math.max(2,Math.round(h*r/2)*2)}
  const fps=meta.fps||30,bpp=video*1000/(w*h*fps);
  const q=bpp>=.09?'较高':bpp>=.055?'中等':bpp>=.032?'偏低':'很低';
  return{video,audio,w,h,q};
}

function renderEstimates(){
  const usable=inspected.filter(x=>x.ok);
  if(!usable.length){$('#estimateList').innerHTML='<div class="empty">选择视频后，这里会显示预计结果。</div>';return}
  $('#estimateList').innerHTML=usable.map(x=>{
    const e=estimate(x),tooBig=x.size<=targetMB()*1024*1024;
    return `<article class="estimate ${e.q==='很低'?'warn':''}">
      <div><b>${x.name}</b><small>${x.sizeText} → 目标 ≤ ${targetMB()}MB</small></div>
      <div class="metric"><strong>${e.w}×${e.h}</strong><span>视频约 ${e.video}kbps · 清晰度预估 ${e.q}</span>${tooBig?'<em>原文件已经小于目标值</em>':''}</div>
    </article>`;
  }).join('');
}

async function choose(){
  const p=await window.videocat.chooseVideos(); if(p.length)addFiles(p);
}
$('#chooseBtn').addEventListener('click',choose);
$('#dropZone').addEventListener('click',choose);
$('#clearBtn').addEventListener('click',()=>{
  files=[];inspected=[];outputDir=null;renderFiles();renderEstimates();$('#workspace').hidden=true;$('#resultList').innerHTML='';
});

const dz=$('#dropZone');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')}));
dz.addEventListener('drop',e=>{
  const p=[...e.dataTransfer.files].map(f=>f.path).filter(Boolean);
  if(p.length)addFiles(p);
});

$('.presets').addEventListener('click',e=>{
  const b=e.target.closest('[data-mb]'); if(!b)return;
  $('#targetMB').value=b.dataset.mb;
  document.querySelectorAll('[data-mb]').forEach(x=>x.classList.toggle('active',x===b));
  renderEstimates();
});
['targetMB','resolution','audioKbps','suffix'].forEach(id=>$('#'+id).addEventListener('input',renderEstimates));

$('#outputBtn').addEventListener('click',async()=>{
  const p=await window.videocat.chooseOutputDir();
  if(p){outputDir=p;$('#outputPath').textContent=p;$('#outputBadge').textContent='已选择'}
});

window.videocat.onProgress(p=>{
  const fileBase=(p.current-1)/p.total;
  const overall=Math.max(0,Math.min(1,fileBase+(p.fraction||0)/p.total));
  $('#progressBar').style.width=Math.round(overall*100)+'%';
  $('#progressText').textContent=`正在压缩 ${p.current}/${p.total} · ${Math.round((p.fraction||0)*100)}%`;
});

$('#compressBtn').addEventListener('click',async()=>{
  const usable=inspected.filter(x=>x.ok).map(x=>x.path);
  if(!usable.length){toast('先选择可用的视频');return}
  if(!outputDir){toast('请选择输出文件夹');return}
  $('#compressBtn').disabled=true;
  $('#progressWrap').hidden=false;
  $('#progressBar').style.width='0%';
  $('#progressText').textContent='第一遍分析即将开始…';
  $('#resultList').innerHTML='';
  const results=await window.videocat.compress({
    files:usable,outputDir,
    options:{
      targetMB:targetMB(),
      resolution:$('#resolution').value,
      audioKbps:Number($('#audioKbps').value),
      suffix:$('#suffix').value.trim()||'compressed',
      preset:'medium'
    }
  });
  $('#compressBtn').disabled=false;
  $('#progressText').textContent='全部处理完成';
  $('#progressBar').style.width='100%';
  $('#resultList').dataset.results=JSON.stringify(results);
  $('#resultList').innerHTML=results.map((r,i)=>r.ok?`
    <div class="result-row ok">
      <div><b>✓ ${r.target.split(/[\\/]/).pop()}</b><small>${r.sourceSizeText} → ${r.outputSizeText} · ${r.width}×${r.height} · ${r.quality.label}</small></div>
      <button data-reveal="${i}">打开位置</button>
    </div>`:`
    <div class="result-row fail"><div><b>✕ ${r.source.split(/[\\/]/).pop()}</b><small>${r.error}</small></div><span></span></div>`).join('');
  toast(`完成：${results.filter(x=>x.ok).length}/${results.length} 个`);
});

$('#resultList').addEventListener('click',e=>{
  const b=e.target.closest('[data-reveal]');if(!b)return;
  const arr=JSON.parse($('#resultList').dataset.results||'[]');
  const r=arr[Number(b.dataset.reveal)];
  if(r?.target)window.videocat.revealFile(r.target);
});
renderEstimates();
