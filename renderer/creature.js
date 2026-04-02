const { ipcRenderer } = require('electron');

const canvas = document.getElementById('creature');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const cx = W / 2;
const cy = H / 2;

// ========== 有机 Blob 形状 ==========

function drawBlob(centerX, centerY, baseRadius, time, detail) {
  const { freq1 = 3, freq2 = 5, freq3 = 7, amp1 = 4, amp2 = 2, amp3 = 1.5, speed = 1 } = detail;
  const points = 120;

  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;

    // 多层 sine 叠加，产生有机的不规则边缘
    const wobble =
      Math.sin(angle * freq1 + time * 0.8 * speed) * amp1 +
      Math.sin(angle * freq2 + time * 1.2 * speed) * amp2 +
      Math.sin(angle * freq3 + time * 0.5 * speed) * amp3;

    // 呼吸：整体缓慢胀缩
    const breathe = Math.sin(time * 0.6) * 3;

    const r = baseRadius + wobble + breathe;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ========== 渲染一帧 ==========

function render(time) {
  const t = time / 1000; // 秒

  ctx.clearRect(0, 0, W, H);

  // --- 外膜（半透明，暖肉粉色）---
  drawBlob(cx, cy, 50, t, {
    freq1: 3, freq2: 5, freq3: 7,
    amp1: 5, amp2: 3, amp3: 1.5,
    speed: 1
  });

  const membraneGrad = ctx.createRadialGradient(cx - 8, cy - 8, 10, cx, cy, 60);
  membraneGrad.addColorStop(0, 'rgba(245, 180, 168, 0.45)');
  membraneGrad.addColorStop(0.5, 'rgba(230, 150, 140, 0.35)');
  membraneGrad.addColorStop(0.8, 'rgba(210, 120, 110, 0.25)');
  membraneGrad.addColorStop(1, 'rgba(200, 100, 95, 0.1)');
  ctx.fillStyle = membraneGrad;
  ctx.fill();

  // 膜的边缘线
  ctx.strokeStyle = 'rgba(200, 120, 110, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- 细胞质（内部更浓的一层）---
  drawBlob(cx + 1, cy + 1, 38, t, {
    freq1: 4, freq2: 6, freq3: 8,
    amp1: 3, amp2: 1.5, amp3: 1,
    speed: 0.8
  });

  const cytoGrad = ctx.createRadialGradient(cx - 5, cy - 5, 5, cx, cy, 42);
  cytoGrad.addColorStop(0, 'rgba(240, 165, 155, 0.3)');
  cytoGrad.addColorStop(1, 'rgba(220, 140, 130, 0.1)');
  ctx.fillStyle = cytoGrad;
  ctx.fill();

  // --- 细胞核（深色，偏心，也在微微移动）---
  const nucleusX = cx + Math.sin(t * 0.3) * 4 + 3;
  const nucleusY = cy + Math.cos(t * 0.4) * 3 + 2;

  drawBlob(nucleusX, nucleusY, 14, t, {
    freq1: 4, freq2: 7, freq3: 3,
    amp1: 1.5, amp2: 1, amp3: 0.8,
    speed: 1.3
  });

  const nucleusGrad = ctx.createRadialGradient(nucleusX - 2, nucleusY - 2, 2, nucleusX, nucleusY, 16);
  nucleusGrad.addColorStop(0, 'rgba(160, 70, 65, 0.7)');
  nucleusGrad.addColorStop(0.6, 'rgba(140, 55, 50, 0.5)');
  nucleusGrad.addColorStop(1, 'rgba(120, 45, 40, 0.2)');
  ctx.fillStyle = nucleusGrad;
  ctx.fill();

  // --- 小泡（模拟细胞器，随机漂浮的小圆）---
  drawOrganelle(cx - 22, cy + 15, 4, t, 0.9);
  drawOrganelle(cx + 18, cy - 12, 3, t * 1.1, 0.7);
  drawOrganelle(cx - 10, cy - 20, 2.5, t * 0.7, 0.6);
  drawOrganelle(cx + 25, cy + 8, 2, t * 1.3, 0.5);

  requestAnimationFrame(render);
}

function drawOrganelle(baseX, baseY, radius, time, opacity) {
  const x = baseX + Math.sin(time * 0.5) * 3;
  const y = baseY + Math.cos(time * 0.6) * 3;

  ctx.beginPath();
  ctx.arc(x, y, radius + Math.sin(time) * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(220, 155, 148, ${opacity * 0.4})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(200, 130, 120, ${opacity * 0.3})`;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// ========== 拖拽 ==========

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

// ========== 启动 ==========

requestAnimationFrame(render);
