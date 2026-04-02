const { ipcRenderer } = require('electron');
const fs = require('fs');
const pathMod = require('path');
const logFile = pathMod.join(window.__projectRoot || pathMod.join(__dirname, '..'), 'moyo.log');
function log(msg) {
  const line = new Date().toLocaleTimeString() + ' ' + msg + '\n';
  try { fs.appendFileSync(logFile, line); } catch(e) {}
  console.log(msg);
}

const canvas = document.getElementById('creature');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const cx = W / 2;
const cy = H / 2;

// ========== 突触系统 ==========
// 每个突触是圆周上的一个凸起，有自己的角度、大小、生长状态

const MAX_BUMP_COUNT = 12;   // 最多能长出多少个突触

let bumps = [];
// 安静时没有突触，全靠 sine 波塑形（和第一版一致）
// 说话时才会长出突触

// 尝试长出一个新突触
function tryGrowBump() {
  if (bumps.length >= MAX_BUMP_COUNT) return;

  // 找一个空隙位置
  const angle = Math.random() * Math.PI * 2;
  bumps.push({
    angle: angle,
    amplitude: 4 + Math.random() * 6,
    width: 0.2 + Math.random() * 0.25,
    phase: Math.random() * Math.PI * 2,
    isBase: false,
    life: 0,  // 从 0 开始慢慢长出
  });
}

// 计算某个角度上所有突触的叠加凸起
function getBumpOffset(angle, time) {
  let offset = 0;
  for (const b of bumps) {
    const diff = Math.abs(angle - b.angle);
    const wrapped = Math.min(diff, Math.PI * 2 - diff);
    if (wrapped < b.width * 2) {
      // 高斯形凸起
      const gaussian = Math.exp(-(wrapped * wrapped) / (2 * b.width * b.width));
      // 每个突触有自己的微小呼吸
      const breathe = 1 + Math.sin(time * 0.015 + b.phase) * 0.15;
      offset += b.amplitude * gaussian * b.life * breathe;
    }
  }
  return offset;
}

// ========== 有机 Blob 形状（基于突触）==========

// detail: 每层不同的频率/振幅/速度，让层之间错位（还原第一版）
function drawBlob(centerX, centerY, baseRadius, time, detail, roughness) {
  const { freq1 = 3, freq2 = 5, freq3 = 7, amp1 = 5, amp2 = 3, amp3 = 1.5, speed = 1 } = detail;
  const points = 180;
  const rough = roughness || 0;

  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;

    // 第一版的不规则形状：每层用不同参数，产生层间错位
    const wobble =
      Math.sin(angle * freq1 + time * 0.016 * speed) * amp1 +
      Math.sin(angle * freq2 + time * 0.024 * speed) * amp2 +
      Math.sin(angle * freq3 + time * 0.01 * speed) * amp3;

    // 整体缓慢呼吸
    const breathe = Math.sin(time * 0.012) * 3;

    // 突触凸起（说话时长出来的）
    const bumpOffset = getBumpOffset(angle, time);

    // 边缘小凸起（圆嘟嘟的小突触，说话时出现）
    const edgeBumps = getEdgeRoughness(angle, time, rough);

    const r = baseRadius + wobble + breathe + bumpOffset + edgeBumps;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ========== 边缘粗糙度（圆嘟嘟的小凸起）==========

// 预生成一圈随机的小凸起种子，让边缘有机地不规则
const EDGE_SEEDS = [];
for (let i = 0; i < 30; i++) {
  EDGE_SEEDS.push({
    angle: (i / 30) * Math.PI * 2 + (Math.random() - 0.5) * 0.15,
    size: 1.5 + Math.random() * 2.5,  // 小凸起的高度
    width: 0.06 + Math.random() * 0.06, // 很窄，像小圆珠
    phase: Math.random() * Math.PI * 2,
  });
}

function getEdgeRoughness(angle, time, intensity) {
  if (intensity < 0.02) return 0;
  let offset = 0;
  for (const s of EDGE_SEEDS) {
    const diff = Math.abs(angle - s.angle);
    const wrapped = Math.min(diff, Math.PI * 2 - diff);
    if (wrapped < s.width * 3) {
      const gaussian = Math.exp(-(wrapped * wrapped) / (2 * s.width * s.width));
      const pulse = 1 + Math.sin(time * 0.02 + s.phase) * 0.2;
      offset += s.size * gaussian * intensity * pulse;
    }
  }
  return offset;
}

// ========== 渲染 ==========

let voiceExcitement = 0;       // 当前兴奋度（平滑后的）
let voiceRaw = 0;              // 麦克风原始值
let growTimer = 0;             // 累计兴奋量，达到阈值长新突触
let nameGlow = 0;              // 叫名字时的橙红色光晕（0~1）
let nameGlowRaw = 0;

function render(time) {
  const t = time / 1000;

  // 兴奋度缓慢趋近目标值（约2-3秒到达）
  voiceExcitement += (voiceRaw - voiceExcitement) * 0.02;
  if (voiceExcitement < 0.01) voiceExcitement = 0;

  // 名字光晕缓慢趋近
  nameGlow += (nameGlowRaw - nameGlow) * 0.015;
  nameGlowRaw *= 0.995; // 缓慢衰减
  if (nameGlow < 0.01) nameGlow = 0;

  // 声音刺激累积 → 长新突触
  if (voiceExcitement > 0.1) {
    growTimer += voiceExcitement * 0.01;
    if (growTimer > 1) {
      tryGrowBump();
      growTimer = 0;
    }
  }

  // 突触慢慢生长或消亡
  for (const b of bumps) {
    if (voiceExcitement > 0.05) {
      b.life = Math.min(1, b.life + 0.005);
    } else {
      b.life = Math.max(0, b.life - 0.001);
    }
  }

  // 移除完全消失的突触
  bumps = bumps.filter(b => b.life > 0);

  const ex = voiceExcitement;

  ctx.clearRect(0, 0, W, H);

  // --- 外膜（第一版参数：freq 3,5,7 amp 5,3,1.5 speed 1）---
  const ng = nameGlow;
  drawBlob(cx, cy, 50 + ex * 5, t,
    { freq1: 3, freq2: 5, freq3: 7, amp1: 5, amp2: 3, amp3: 1.5, speed: 1 },
    ex);

  const a = 0.45 + ex * 0.15 + ng * 0.2;
  const membraneGrad = ctx.createRadialGradient(cx - 8, cy - 8, 10, cx, cy, 62 + ex * 8);
  // 叫名字时偏向更深的橙红色
  const r0 = Math.min(255, 245 + ex * 10 + ng * 10);
  const g0 = Math.max(80, 180 - ex * 30 - ng * 60);
  const b0 = Math.max(60, 168 - ex * 40 - ng * 80);
  membraneGrad.addColorStop(0, `rgba(${r0}, ${g0}, ${b0}, ${a})`);
  membraneGrad.addColorStop(0.5, `rgba(${Math.min(255, 230 + ng * 20)}, ${Math.max(70, 150 - ex * 20 - ng * 50)}, ${Math.max(50, 140 - ex * 30 - ng * 60)}, ${a * 0.78})`);
  membraneGrad.addColorStop(0.8, `rgba(${Math.min(245, 210 + ng * 25)}, ${Math.max(60, 120 - ex * 15 - ng * 40)}, ${Math.max(40, 110 - ex * 20 - ng * 50)}, ${a * 0.56})`);
  membraneGrad.addColorStop(1, `rgba(${200 + ng * 30}, ${Math.max(50, 100 - ng * 30)}, ${Math.max(40, 95 - ng * 35)}, ${0.1 + ex * 0.05 + ng * 0.1})`);
  ctx.fillStyle = membraneGrad;
  ctx.fill();

  ctx.strokeStyle = `rgba(${200 + ng * 30}, ${Math.max(60, 120 - ng * 40)}, ${Math.max(50, 110 - ng * 40)}, 0.3)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- 细胞质（第一版参数：freq 4,6,8 amp 3,1.5,1 speed 0.8 → 和外膜错位）---
  drawBlob(cx + 1, cy + 1, 38 + ex * 3, t,
    { freq1: 4, freq2: 6, freq3: 8, amp1: 3, amp2: 1.5, amp3: 1, speed: 0.8 },
    ex * 0.5);

  const cytoGrad = ctx.createRadialGradient(cx - 5, cy - 5, 5, cx, cy, 42);
  cytoGrad.addColorStop(0, 'rgba(240, 165, 155, 0.3)');
  cytoGrad.addColorStop(1, 'rgba(220, 140, 130, 0.1)');
  ctx.fillStyle = cytoGrad;
  ctx.fill();

  // --- 细胞核（非常缓慢地漂移）---
  const nucleusX = cx + Math.sin(t * 0.006) * 4 + 3;
  const nucleusY = cy + Math.cos(t * 0.008) * 3 + 2;

  // 核（第一版参数：freq 4,7,3 amp 1.5,1,0.8 speed 1.3）
  drawBlob(nucleusX, nucleusY, 14, t,
    { freq1: 4, freq2: 7, freq3: 3, amp1: 1.5, amp2: 1, amp3: 0.8, speed: 1.3 },
    0);

  const nucleusGrad = ctx.createRadialGradient(nucleusX - 2, nucleusY - 2, 2, nucleusX, nucleusY, 16);
  nucleusGrad.addColorStop(0, 'rgba(160, 70, 65, 0.7)');
  nucleusGrad.addColorStop(0.6, 'rgba(140, 55, 50, 0.5)');
  nucleusGrad.addColorStop(1, 'rgba(120, 45, 40, 0.2)');
  ctx.fillStyle = nucleusGrad;
  ctx.fill();

  // --- 小泡 ---
  drawOrganelle(cx - 22, cy + 15, 4, t, 0.9);
  drawOrganelle(cx + 18, cy - 12, 3, t, 0.7);
  drawOrganelle(cx - 10, cy - 20, 2.5, t, 0.6);
  drawOrganelle(cx + 25, cy + 8, 2, t, 0.5);

  requestAnimationFrame(render);
}

function drawOrganelle(baseX, baseY, radius, time, opacity) {
  const x = baseX + Math.sin(time * 0.01) * 3;
  const y = baseY + Math.cos(time * 0.012) * 3;

  ctx.beginPath();
  ctx.arc(x, y, radius + Math.sin(time * 0.02) * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(220, 155, 148, ${opacity * 0.4})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(200, 130, 120, ${opacity * 0.3})`;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// ========== 拖拽（只移动，不触发视觉反应）==========

let dragging = false;
let lastX, lastY;

canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.screenX;
  lastY = e.screenY;
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  lastX = e.screenX;
  lastY = e.screenY;
  ipcRenderer.send('window-drag', { dx, dy });
});

window.addEventListener('mouseup', () => {
  dragging = false;
});

// ========== 语音（Moyo 的耳朵）==========
// 两层感知：
// 1. 麦克风音量 → 一般反应（蠕动、突触）
// 2. Web Speech API → 识别"Moyo" → 变色

log('[Moyo] 正在初始化...');

// --- 语音识别（听名字）---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'zh-CN';

  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    const text = last[0].transcript.toLowerCase();
    // 检测名字：moyo / 摩哟 / 莫约 等
    if (text.includes('moyo') || text.includes('摩哟') || text.includes('莫约') || text.includes('魔药') || text.includes('摩约')) {
      log('[Moyo] 听到了我的名字！ → ' + text);
      nameGlowRaw = 1;
    }
    if (last.isFinal) {
      log('[Moyo 听到] ' + text);
    }
  };

  recognition.onerror = (event) => {
    if (event.error !== 'no-speech' && event.error !== 'network') {
      log('[Moyo 识别] ' + event.error);
    }
  };

  recognition.onend = () => {
    // 自动重启
    try { recognition.start(); } catch(e) {}
  };

  try {
    recognition.start();
    log('[Moyo] 语音识别已启动（听名字）');
  } catch(e) {
    log('[Moyo] 语音识别启动失败: ' + e.message);
  }
}

// --- 麦克风音量感知 ---
log('[Moyo] 正在连接麦克风...');

navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  // 环境噪音基线（前几秒自动校准）
  let noiseFloor = 0;
  let calibrationFrames = 0;
  const CALIBRATION_DURATION = 120; // 约2秒

  function detectVolume() {
    analyser.getByteFrequencyData(dataArray);

    // 只关注人声频段（300Hz ~ 3000Hz），忽略环境低频噪音
    const sampleRate = audioCtx.sampleRate;
    const binSize = sampleRate / analyser.fftSize;
    const lowBin = Math.floor(300 / binSize);
    const highBin = Math.floor(3000 / binSize);

    let sum = 0;
    let count = 0;
    for (let i = lowBin; i <= highBin && i < dataArray.length; i++) {
      sum += dataArray[i];
      count++;
    }
    const avg = count > 0 ? sum / count : 0;

    // 校准阶段：学习环境噪声水平
    if (calibrationFrames < CALIBRATION_DURATION) {
      noiseFloor = noiseFloor * 0.95 + avg * 0.05;
      calibrationFrames++;
      if (calibrationFrames === CALIBRATION_DURATION) {
        log('[Moyo] 环境噪声基线: ' + noiseFloor.toFixed(1));
        log('[Moyo] 耳朵已打开！对我说话试试');
      }
    }

    // 减去噪声基线，只响应明显高于环境的声音
    const adjusted = Math.max(0, avg - noiseFloor - 5);

    if (adjusted > 3) {
      voiceRaw = Math.min(1, adjusted / 30);
    } else {
      voiceRaw = 0;
    }

    requestAnimationFrame(detectVolume);
  }

  detectVolume();
}).catch(err => {
  log('[Moyo] 无法访问麦克风: ' + err.message);
});

// ========== 启动 ==========

requestAnimationFrame(render);
