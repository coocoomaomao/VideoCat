const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

let ffmpegPath = require('ffmpeg-static');
if (ffmpegPath && ffmpegPath.includes('app.asar') && !fs.existsSync(ffmpegPath)) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}

const SUPPORTED = new Set([
  '.mp4','.mov','.mkv','.avi','.webm','.m4v','.wmv','.flv','.mpeg','.mpg','.ts','.mts','.m2ts'
]);

function isSupported(filePath) {
  return SUPPORTED.has(path.extname(filePath).toLowerCase());
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

function parseDuration(text) {
  const m = text.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function parseVideoStream(text) {
  const lines = text.split(/\r?\n/).filter(x => /Video:/i.test(x));
  const line = lines[0] || '';
  const wh = line.match(/(\d{2,5})x(\d{2,5})/);
  const fps = line.match(/(\d+(?:\.\d+)?)\s*fps/i);
  const codec = line.match(/Video:\s*([^,\s]+)/i);
  return {
    width: wh ? Number(wh[1]) : null,
    height: wh ? Number(wh[2]) : null,
    fps: fps ? Number(fps[1]) : null,
    codec: codec ? codec[1] : null
  };
}

function runProbe(filePath) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('找不到 FFmpeg'));
    const p = spawn(ffmpegPath, ['-hide_banner', '-i', filePath], { windowsHide:true });
    let stderr = '';
    p.stderr.on('data', d => stderr += d.toString());
    p.on('error', reject);
    p.on('close', () => {
      const duration = parseDuration(stderr);
      const video = parseVideoStream(stderr);
      if (!duration || !video.width || !video.height) {
        return reject(new Error('无法读取视频信息，可能是不支持的格式或文件已损坏'));
      }
      resolve({ duration, ...video });
    });
  });
}

async function inspectVideo(filePath) {
  if (!isSupported(filePath)) throw new Error('不支持的视频格式');
  const stat = fs.statSync(filePath);
  const meta = await runProbe(filePath);
  return {
    path:filePath,
    name:path.basename(filePath),
    size:stat.size,
    sizeText:formatBytes(stat.size),
    ...meta
  };
}

function normalizeResolution(meta, preset='keep') {
  const w = Number(meta.width);
  const h = Number(meta.height);
  if (!w || !h || preset === 'keep') return { width:w, height:h };

  const targetLong = preset === '1080p' ? 1920 : preset === '720p' ? 1280 : preset === '480p' ? 854 : null;
  if (!targetLong) return { width:w, height:h };

  const currentLong = Math.max(w,h);
  if (currentLong <= targetLong) return { width:w, height:h };

  const ratio = targetLong / currentLong;
  let nw = Math.round(w * ratio / 2) * 2;
  let nh = Math.round(h * ratio / 2) * 2;
  nw = Math.max(2,nw); nh = Math.max(2,nh);
  return { width:nw, height:nh };
}

function calcTargetBitrates(durationSec, targetMB, audioKbps=128) {
  const d = Math.max(1, Number(durationSec));
  const mb = Math.max(1, Number(targetMB));
  const totalKbps = Math.floor((mb * 1024 * 1024 * 8 * 0.97) / d / 1000);
  const audio = Math.min(Math.max(64, Number(audioKbps) || 128), Math.max(64, totalKbps - 120));
  const video = Math.max(120, totalKbps - audio);
  return { totalKbps, videoKbps:video, audioKbps:audio };
}

function estimateQuality(videoKbps, width, height, fps=30) {
  if (!width || !height) return { label:'未知', score:null };
  const safeFps = fps || 30;
  const bpp = (videoKbps * 1000) / (width * height * safeFps);
  if (bpp >= 0.09) return { label:'较高', score:bpp };
  if (bpp >= 0.055) return { label:'中等', score:bpp };
  if (bpp >= 0.032) return { label:'偏低', score:bpp };
  return { label:'很低', score:bpp };
}

function uniqueTarget(target) {
  if (!fs.existsSync(target)) return target;
  const p = path.parse(target);
  let i = 2;
  while (true) {
    const candidate = path.join(p.dir, `${p.name} (${i})${p.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    i++;
  }
}

function outputName(filePath, suffix='compressed') {
  const p = path.parse(filePath);
  return `${p.name}_${suffix || 'compressed'}.mp4`;
}

function parseTimeSeconds(line) {
  const m = line.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1])*3600 + Number(m[2])*60 + Number(m[3]);
}

function runFfmpeg(args, duration, passIndex, onProgress=()=>{}) {
  return new Promise((resolve,reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide:true });
    let tail = '';
    p.stderr.on('data', d => {
      const s = d.toString();
      tail = (tail + s).slice(-8000);
      const sec = parseTimeSeconds(s);
      if (sec != null && duration) {
        const local = Math.max(0, Math.min(1, sec / duration));
        const overall = passIndex === 1 ? local * 0.5 : 0.5 + local * 0.5;
        onProgress(overall);
      }
    });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg 压缩失败（code ${code}）\n${tail.slice(-1200)}`)));
  });
}

async function compressOne(filePath, outputDir, options={}, onProgress=()=>{}) {
  const meta = await inspectVideo(filePath);
  const targetMB = Number(options.targetMB || 25);
  const resolution = normalizeResolution(meta, options.resolution || 'keep');
  const rates = calcTargetBitrates(meta.duration, targetMB, options.audioKbps || 128);
  const suffix = options.suffix || 'compressed';
  fs.mkdirSync(outputDir, { recursive:true });
  const target = uniqueTarget(path.join(outputDir, outputName(filePath, suffix)));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'videocat-'));
  const passlog = path.join(tmp,'passlog');
  const nullOut = process.platform === 'win32' ? 'NUL' : '/dev/null';

  const vf = (resolution.width !== meta.width || resolution.height !== meta.height)
    ? `scale=${resolution.width}:${resolution.height}:flags=lanczos`
    : null;

  const commonVideo = [
    '-c:v','libx264',
    '-preset', options.preset || 'medium',
    '-b:v', `${rates.videoKbps}k`,
    '-maxrate', `${Math.max(rates.videoKbps, Math.round(rates.videoKbps*1.15))}k`,
    '-bufsize', `${Math.max(240, rates.videoKbps*2)}k`,
    '-pix_fmt','yuv420p'
  ];
  if (vf) commonVideo.push('-vf',vf);

  const pass1 = [
    '-y','-i',filePath,
    ...commonVideo,
    '-pass','1','-passlogfile',passlog,
    '-an','-f','mp4',nullOut
  ];

  const pass2 = [
    '-y','-i',filePath,
    ...commonVideo,
    '-pass','2','-passlogfile',passlog,
    '-c:a','aac','-b:a',`${rates.audioKbps}k`,
    '-movflags','+faststart',
    target
  ];

  try {
    onProgress(0);
    await runFfmpeg(pass1, meta.duration, 1, onProgress);
    await runFfmpeg(pass2, meta.duration, 2, onProgress);
  } finally {
    try { fs.rmSync(tmp,{recursive:true,force:true}); } catch {}
  }

  const stat = fs.statSync(target);
  return {
    source:filePath,
    target,
    sourceSize:meta.size,
    sourceSizeText:formatBytes(meta.size),
    outputSize:stat.size,
    outputSizeText:formatBytes(stat.size),
    targetMB,
    width:resolution.width,
    height:resolution.height,
    duration:meta.duration,
    videoKbps:rates.videoKbps,
    audioKbps:rates.audioKbps,
    quality:estimateQuality(rates.videoKbps,resolution.width,resolution.height,meta.fps)
  };
}

async function compressBatch(files, outputDir, options={}, onProgress=()=>{}) {
  const results = [];
  for (let i=0;i<files.length;i++) {
    try {
      const r = await compressOne(files[i], outputDir, options, fraction => {
        onProgress({ current:i+1, total:files.length, fraction, file:files[i] });
      });
      results.push({ok:true,...r});
    } catch (error) {
      results.push({ok:false,source:files[i],error:error.message});
    }
    onProgress({ current:i+1, total:files.length, fraction:1, file:files[i] });
  }
  return results;
}

module.exports = {
  SUPPORTED,
  isSupported,
  formatBytes,
  parseDuration,
  parseVideoStream,
  normalizeResolution,
  calcTargetBitrates,
  estimateQuality,
  outputName,
  inspectVideo,
  compressOne,
  compressBatch
};
