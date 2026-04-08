import { useRef, useEffect } from 'react';

interface Node {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  pulse: number;
}

export function LoginBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let W = 0, H = 0, animId = 0, time = 0;
    const N = 80;
    const nodes: Node[] = [];

    function resize() {
      W = c!.width = window.innerWidth;
      H = c!.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Initialize nodes in a more structured pattern
    for (let i = 0; i < N; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    function draw() {
      time += 0.005;
      ctx!.fillStyle = 'rgba(6, 8, 13, 0.15)';
      ctx!.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;

      // Central glow pulse
      const pulseR = 80 + Math.sin(time * 2) * 20;
      const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, pulseR * 3);
      grad.addColorStop(0, 'rgba(0, 229, 255, 0.06)');
      grad.addColorStop(0.5, 'rgba(0, 229, 255, 0.02)');
      grad.addColorStop(1, 'transparent');
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, W, H);

      // Expanding rings from center
      for (let ring = 0; ring < 3; ring++) {
        const ringR = ((time * 80 + ring * 200) % 600);
        const ringAlpha = Math.max(0, 1 - ringR / 600) * 0.08;
        ctx!.beginPath();
        ctx!.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(0, 229, 255, ${ringAlpha})`;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      // Update and draw nodes
      nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0) n.x = W;
        if (n.x > W) n.x = 0;
        if (n.y < 0) n.y = H;
        if (n.y > H) n.y = 0;
        n.pulse += 0.02;

        const a = 0.3 + Math.sin(n.pulse) * 0.2;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(0, 229, 255, ${a})`;
        ctx!.fill();
      });

      // Draw connections (mesh network)
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 150) {
            const a = (1 - d / 150) * 0.12;
            ctx!.beginPath();
            ctx!.moveTo(nodes[i].x, nodes[i].y);
            ctx!.lineTo(nodes[j].x, nodes[j].y);
            ctx!.strokeStyle = `rgba(0, 229, 255, ${a})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }

      // Data streams (vertical lines moving down)
      for (let s = 0; s < 5; s++) {
        const sx = (W * (s + 1)) / 6;
        const sy = ((time * 300 + s * 400) % (H + 200)) - 100;
        const streamGrad = ctx!.createLinearGradient(sx, sy - 60, sx, sy);
        streamGrad.addColorStop(0, 'transparent');
        streamGrad.addColorStop(1, 'rgba(0, 229, 255, 0.15)');
        ctx!.beginPath();
        ctx!.moveTo(sx, sy - 60);
        ctx!.lineTo(sx, sy);
        ctx!.strokeStyle = streamGrad;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      animId = requestAnimationFrame(draw);
    }

    // Initial clear
    ctx.fillStyle = '#06080d';
    ctx.fillRect(0, 0, W, H);
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, zIndex: 0 }} />;
}
