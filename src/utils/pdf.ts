import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Block } from '../types';
import { DAYS, getCatDisplay } from '../constants/categories';
import { t2m, m2t } from './time';
import { getTravelData } from '../components/TravelDays';

interface BudgetItem {
  category: string; name: string; unitPrice: number; quantity: number; currency: string;
}

function getBudgetData(): { items: BudgetItem[]; rateJPY: number } | null {
  try {
    const saved = localStorage.getItem('sg_mission_budget');
    if (saved) return JSON.parse(saved);
  } catch { /* */ }
  return null;
}

function generateHTML(blocks: Block[]): string {
  const travel = getTravelData();
  const budget = getBudgetData();

  let html = `
  <div style="font-family: 'Helvetica Neue', Arial, 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.6; width: 760px; padding: 0 20px;">
    <!-- Header -->
    <div style="border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 10px;">
      <div style="font-size: 20px; font-weight: 700;">シンガポール出張 工程表</div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 4px;">
        <span>2026年5月17日（日）〜 5月22日（木）　参加者: 4名（チームA・チームB）</span>
        <span>作成日: ${new Date().toLocaleDateString('ja-JP')}</span>
      </div>
    </div>

    <!-- Travel: Arrival -->
    <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px; margin-bottom: 8px;">
      <div style="font-weight: 700; font-size: 12px; margin-bottom: 4px;">5/17（日）移動日 — 到着</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <tr><td style="width: 100px; color: #666; padding: 2px 0;">フライト</td><td>${travel.arrival.flight || '—'}</td></tr>
        <tr><td style="color: #666; padding: 2px 0;">出発 → 到着</td><td>${travel.arrival.departure} → ${travel.arrival.arrivalTime}</td></tr>
        <tr><td style="color: #666; padding: 2px 0;">ホテル</td><td>${travel.arrival.hotel || '未定'}（CI ${travel.arrival.hotelCI}）</td></tr>
        ${travel.arrival.memo ? `<tr><td style="color: #666; padding: 2px 0;">備考</td><td>${travel.arrival.memo}</td></tr>` : ''}
      </table>
    </div>`;

  // ═══ Daily Schedule ═══
  DAYS.forEach((day, dayIdx) => {
    html += `
    <div style="margin-top: 10px; page-break-inside: avoid;">
      <div style="background: #eee; border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px; font-weight: 700; font-size: 12px;">
        ${day.date.replace('2026-', '')} （${['月','火','水','木'][dayIdx]}）　${day.desc}
      </div>`;

    (['A', 'B'] as const).forEach(team => {
      const teamBlocks = blocks.filter(b => b.day === day.key && b.team === team)
        .sort((a, b) => t2m(a.start) - t2m(b.start));
      if (teamBlocks.length === 0) return;

      html += `
      <div style="margin-top: 4px; margin-bottom: 6px;">
        <div style="font-size: 10px; color: #555; font-weight: 600; margin-bottom: 3px;">チーム${team}</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
          <thead>
            <tr style="background: #f5f5f5; border-bottom: 1px solid #ddd;">
              <th style="text-align: left; padding: 3px 6px; width: 80px; color: #888; font-weight: 500;">時間</th>
              <th style="text-align: left; padding: 3px 6px; width: 70px; color: #888; font-weight: 500;">種別</th>
              <th style="text-align: left; padding: 3px 6px; color: #888; font-weight: 500;">内容</th>
              <th style="text-align: left; padding: 3px 6px; width: 140px; color: #888; font-weight: 500;">場所</th>
            </tr>
          </thead>
          <tbody>`;

      teamBlocks.forEach((b, i) => {
        const cat = getCatDisplay(b.category, b.subType);
        const endTime = m2t(t2m(b.start) + b.dur);
        const bg = i % 2 === 0 ? '#fafafa' : '#fff';
        html += `
            <tr style="background: ${bg}; border-bottom: 1px solid #eee;">
              <td style="padding: 3px 6px;">${b.start}-${endTime}</td>
              <td style="padding: 3px 6px;">${cat.lbl}</td>
              <td style="padding: 3px 6px; font-weight: ${b.category === 'visit' ? '600' : '400'};">${b.detail || b.label || cat.lbl}</td>
              <td style="padding: 3px 6px; color: #555;">${b.location || ''}${b.fromLocation ? ' (from: ' + b.fromLocation + ')' : ''}</td>
            </tr>`;
      });

      html += `</tbody></table></div>`;
    });

    html += `</div>`;
  });

  // ═══ Travel: Departure ═══
  html += `
    <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px; margin-top: 10px; page-break-inside: avoid;">
      <div style="font-weight: 700; font-size: 12px; margin-bottom: 4px;">5/22（木）移動日 — 出発</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <tr><td style="width: 100px; color: #666; padding: 2px 0;">チェックアウト</td><td>${travel.departure.hotelCO}</td></tr>
        <tr><td style="color: #666; padding: 2px 0;">フライト</td><td>${travel.departure.flight || '—'}</td></tr>
        <tr><td style="color: #666; padding: 2px 0;">出発 → 到着</td><td>${travel.departure.departure} → ${travel.departure.arrivalTime}</td></tr>
        ${travel.departure.memo ? `<tr><td style="color: #666; padding: 2px 0;">備考</td><td>${travel.departure.memo}</td></tr>` : ''}
      </table>
    </div>`;

  // ═══ Visit Summary ═══
  const visits = blocks.filter(b => b.category === 'visit' || b.category === 'reserve')
    .sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : t2m(a.start) - t2m(b.start));

  if (visits.length > 0) {
    html += `
    <div style="margin-top: 14px; page-break-inside: avoid;">
      <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px;">訪問先一覧</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <thead>
          <tr style="background: #eee; border-bottom: 1px solid #ccc;">
            <th style="text-align: left; padding: 3px 6px; color: #888;">日付</th>
            <th style="text-align: left; padding: 3px 6px; color: #888;">Team</th>
            <th style="text-align: left; padding: 3px 6px; color: #888;">時間</th>
            <th style="text-align: left; padding: 3px 6px; color: #888;">企業名</th>
            <th style="text-align: left; padding: 3px 6px; color: #888;">場所</th>
            <th style="text-align: left; padding: 3px 6px; color: #888;">連絡先</th>
          </tr>
        </thead>
        <tbody>`;

    visits.forEach((v, i) => {
      const dayInfo = DAYS[parseInt(v.day[1])];
      const bg = i % 2 === 0 ? '#fafafa' : '#fff';
      html += `
          <tr style="background: ${bg}; border-bottom: 1px solid #eee;">
            <td style="padding: 3px 6px;">${dayInfo?.date.replace('2026-', '') || ''}</td>
            <td style="padding: 3px 6px;">${v.team}</td>
            <td style="padding: 3px 6px;">${v.start}-${m2t(t2m(v.start) + v.dur)}</td>
            <td style="padding: 3px 6px; font-weight: 600;">${v.detail || '—'}</td>
            <td style="padding: 3px 6px; color: #555;">${v.location || '—'}</td>
            <td style="padding: 3px 6px; color: #555;">${v.contact || '—'}</td>
          </tr>`;
    });
    html += `</tbody></table>
      <div style="font-size: 10px; color: #555; margin-top: 4px;">訪問予定: ${visits.length}件</div>
    </div>`;
  }

  // ═══ Budget ═══
  if (budget && budget.items.length > 0) {
    const toSGD = (item: BudgetItem) =>
      item.currency === 'SGD' ? item.unitPrice * item.quantity : (item.unitPrice * item.quantity) / budget.rateJPY;
    const total = budget.items.reduce((s, item) => s + toSGD(item), 0);

    html += `
    <div style="margin-top: 14px; page-break-inside: avoid;">
      <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px;">予算概要</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <thead>
          <tr style="background: #eee; border-bottom: 1px solid #ccc;">
            <th style="text-align: left; padding: 3px 6px; color: #888;">カテゴリ</th>
            <th style="text-align: left; padding: 3px 6px; color: #888;">項目</th>
            <th style="text-align: right; padding: 3px 6px; color: #888;">単価</th>
            <th style="text-align: right; padding: 3px 6px; color: #888;">数量</th>
            <th style="text-align: right; padding: 3px 6px; color: #888;">小計 (SGD)</th>
          </tr>
        </thead>
        <tbody>`;

    budget.items.forEach((item, i) => {
      const bg = i % 2 === 0 ? '#fafafa' : '#fff';
      const sub = toSGD(item);
      html += `
          <tr style="background: ${bg}; border-bottom: 1px solid #eee;">
            <td style="padding: 3px 6px;">${item.category}</td>
            <td style="padding: 3px 6px;">${item.name}</td>
            <td style="padding: 3px 6px; text-align: right;">${item.currency === 'SGD' ? 'S$' : '¥'}${item.unitPrice.toLocaleString()}</td>
            <td style="padding: 3px 6px; text-align: right;">${item.quantity}</td>
            <td style="padding: 3px 6px; text-align: right; font-weight: 600;">S$${sub.toFixed(0)}</td>
          </tr>`;
    });

    html += `
          <tr style="border-top: 2px solid #333; font-weight: 700;">
            <td colspan="4" style="text-align: right; padding: 6px 6px;">合計</td>
            <td style="text-align: right; padding: 6px 6px; font-size: 12px;">S$${total.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td>
          </tr>
          <tr>
            <td colspan="4" style="text-align: right; padding: 3px 6px; color: #666;">1人あたり</td>
            <td style="text-align: right; padding: 3px 6px; color: #666;">S$${(total / 4).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}（≈ ¥${Math.round(total / 4 * budget.rateJPY).toLocaleString()}）</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  // ═══ Footer ═══
  html += `
    <div style="margin-top: 16px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #999; display: flex; justify-content: space-between;">
      <span>シンガポール出張 工程表 — CONFIDENTIAL</span>
      <span>${new Date().toLocaleDateString('ja-JP')} 作成</span>
    </div>
  </div>`;

  return html;
}

export async function exportBusinessPDF(blocks: Block[]): Promise<void> {
  // Create off-screen container
  const container = document.createElement('div');
  container.innerHTML = generateHTML(blocks);
  container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;background:#fff;';
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: 794,
    });

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = 210;
    const pageH = 297;
    const imgW = pageW;

    // Split into pages
    const pageImgH = (canvas.width * pageH) / imgW;
    let srcY = 0;
    let page = 0;

    while (srcY < canvas.height) {
      if (page > 0) doc.addPage();

      const sliceH = Math.min(pageImgH, canvas.height - srcY);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceH;
      const ctx = sliceCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      }

      const imgData = sliceCanvas.toDataURL('image/png');
      const sliceImgH = (sliceH * imgW) / canvas.width;
      doc.addImage(imgData, 'PNG', 0, 0, imgW, sliceImgH);

      srcY += sliceH;
      page++;
    }

    doc.save('シンガポール出張_工程表_2026.pdf');
  } finally {
    document.body.removeChild(container);
  }
}
