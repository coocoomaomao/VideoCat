const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../electron/videocat-core.cjs');

test('supports common video formats',()=>{
  assert.equal(core.isSupported('a.MP4'),true);
  assert.equal(core.isSupported('a.mov'),true);
  assert.equal(core.isSupported('a.png'),false);
});

test('parses ffmpeg duration',()=>{
  const text='Duration: 00:01:30.50, start: 0.000000, bitrate: 5000 kb/s';
  assert.equal(core.parseDuration(text),90.5);
});

test('parses video stream info',()=>{
  const text='Stream #0:0: Video: h264 (High), yuv420p, 1920x1080, 29.97 fps, 30 tbr';
  const v=core.parseVideoStream(text);
  assert.equal(v.width,1920);
  assert.equal(v.height,1080);
  assert.equal(v.fps,29.97);
  assert.equal(v.codec,'h264');
});

test('calculates target bitrates',()=>{
  const r=core.calcTargetBitrates(60,25,128);
  assert.ok(r.videoKbps>3000);
  assert.equal(r.audioKbps,128);
});

test('downscales landscape video to 720p long edge',()=>{
  assert.deepEqual(core.normalizeResolution({width:3840,height:2160},'720p'),{width:1280,height:720});
});

test('does not upscale small video',()=>{
  assert.deepEqual(core.normalizeResolution({width:640,height:360},'1080p'),{width:640,height:360});
});

test('output name is mp4',()=>{
  assert.equal(core.outputName('hello.mov','small'),'hello_small.mp4');
});
