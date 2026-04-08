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
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.items && parsed.items.length > 0) return parsed;
    }
  } catch { /* */ }
  return null;
}

const baseStyle = `font-family: 'Helvetica Neue', Arial, 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.6; width: 760px; padding: 10px 20px; background: #fff;`;

function sectionHTML(inner: string): string {
  return `<div style="${baseStyle}">${inner}</div>`;
}

function buildSections(blocks: Block[]): string[] {
  const travel = getTravelData();
  const budget = getBudgetData();
  const sections: string[] = [];

  // ═══ Header ═══
  sections.push(sectionHTML(`
    <div style="border-bottom: 2px solid #222; padding-bottom: 8px;">
      <div style="font-size: 20px; font-weight: 700;">シンガポール出張 工程表</div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 4px;">
        <span>2026年5月17日（日）〜 5月22日（金）　参加者: 4名（チームA・チームB）</span>
        <span>作成日: ${new Date().toLocaleDateString('ja-JP')}</span>
      </div>
    </div>
  `));

  // ═══ Arrival ═══
  sections.push(sectionHTML(`
    <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px;">
      <div style="font-weight: 700; font-size: 12px; margin-bottom: 4px;">5/17（日）移動日 — 到着</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <tr><td style="width: 100px; color: #666; padding: 2px 0;">フライト</td><td>${travel.arrival.flight || '—'}</td></tr>
        <tr><td style="color: #666; padding: 2px 0;">出発 → 到着</td><td>${travel.arrival.departure} → ${travel.arrival.arrivalTime}</td></tr>
        <tr><td style="color: #666; padding: 2px 0;">ホテル</td><td>${travel.arrival.hotel || '未定'}（CI ${travel.arrival.hotelCI}）</td></tr>
        ${travel.arrival.memo ? `<tr><td style="color: #666;">備考</td><td>${travel.arrival.memo}</td></tr>` : ''}
      </table>
    </div>
  `));

  // ═══ Daily Schedule ═══
  DAYS.forEach((day, dayIdx) => {
    (['A', 'B'] as const).forEach(team => {
      const teamBlocks = blocks.filter(b => b.day === day.key && b.team === team)
        .sort((a, b) => t2m(a.start) - t2m(b.start));
      if (teamBlocks.length === 0) return;

      let rows = '';
      teamBlocks.forEach((b, i) => {
        const cat = getCatDisplay(b.category, b.subType);
        const endTime = m2t(t2m(b.start) + b.dur);
        const bg = i % 2 === 0 ? '#fafafa' : '#fff';
        rows += `<tr style="background: ${bg}; border-bottom: 1px solid #eee;">
          <td style="padding: 3px 6px;">${b.start}-${endTime}</td>
          <td style="padding: 3px 6px;">${cat.lbl}</td>
          <td style="padding: 3px 6px; font-weight: ${b.category === 'visit' ? '600' : '400'};">${b.detail || b.label || cat.lbl}</td>
          <td style="padding: 3px 6px; color: #555;">${b.location || ''}${b.fromLocation ? ' (from: ' + b.fromLocation + ')' : ''}</td>
        </tr>`;
      });

      const dateStr = `${day.date.replace('2026-', '')} （${['月','火','水','木'][dayIdx]}）`;
      sections.push(sectionHTML(`
        <div style="background: #eee; border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px; font-weight: 700; font-size: 12px;">
          ${dateStr}　${day.desc}
        </div>
        <div style="margin-top: 4px;">
          <div style="font-size: 10px; color: #555; font-weight: 600; margin-bottom: 3px;">チーム${team}</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead><tr style="background: #f5f5f5; border-bottom: 1px solid #ddd;">
              <th style="text-align: left; padding: 3px 6px; width: 80px; color: #888; font-weight: 500;">時間</th>
              <th style="text-align: left; padding: 3px 6px; width: 70px; color: #888; font-weight: 500;">種別</th>
              <th style="text-align: left; padding: 3px 6px; color: #888; font-weight: 500;">内容</th>
              <th style="text-align: left; padding: 3px 6px; width: 140px; color: #888; font-weight: 500;">場所</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `));
    });
  });

  // ═══ Departure ═══
  sections.push(sectionHTML(`
    <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px;">
      <div style="font-weight: 700; font-size: 12px; margin-bottom: 4px;">5/22（金）移動日 — 出発</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <tr><td style="width: 100px; color: #666; padding: 2px 0;">チェックアウト</td><td>${travel.departure.hotelCO}</td></tr>
        <tr><td style="color: #666; padding: 2px 0;">フライト</td><td>${travel.departure.flight || '—'}</td></tr>
        <tr><td style="color: #666; padding: 2px 0;">出発 → 到着</td><td>${travel.departure.departure} → ${travel.departure.arrivalTime}</td></tr>
        ${travel.departure.memo ? `<tr><td style="color: #666;">備考</td><td>${travel.departure.memo}</td></tr>` : ''}
      </table>
    </div>
  `));

  // ═══ Visit Summary ═══
  const visits = blocks.filter(b => b.category === 'visit' || b.category === 'reserve')
    .sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : t2m(a.start) - t2m(b.start));

  if (visits.length > 0) {
    let vrows = '';
    visits.forEach((v, i) => {
      const dayInfo = DAYS[parseInt(v.day[1])];
      const bg = i % 2 === 0 ? '#fafafa' : '#fff';
      vrows += `<tr style="background: ${bg}; border-bottom: 1px solid #eee;">
        <td style="padding: 3px 6px;">${dayInfo?.date.replace('2026-', '') || ''}</td>
        <td style="padding: 3px 6px;">${v.team}</td>
        <td style="padding: 3px 6px;">${v.start}-${m2t(t2m(v.start) + v.dur)}</td>
        <td style="padding: 3px 6px; font-weight: 600;">${v.detail || '—'}</td>
        <td style="padding: 3px 6px; color: #555;">${v.location || '—'}</td>
        <td style="padding: 3px 6px; color: #555;">${v.contact || '—'}</td>
      </tr>`;
    });

    sections.push(sectionHTML(`
      <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px;">訪問先一覧</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <thead><tr style="background: #eee; border-bottom: 1px solid #ccc;">
          <th style="text-align: left; padding: 3px 6px; color: #888;">日付</th>
          <th style="text-align: left; padding: 3px 6px; color: #888;">Team</th>
          <th style="text-align: left; padding: 3px 6px; color: #888;">時間</th>
          <th style="text-align: left; padding: 3px 6px; color: #888;">企業名</th>
          <th style="text-align: left; padding: 3px 6px; color: #888;">場所</th>
          <th style="text-align: left; padding: 3px 6px; color: #888;">連絡先</th>
        </tr></thead>
        <tbody>${vrows}</tbody>
      </table>
      <div style="font-size: 10px; color: #555; margin-top: 4px;">訪問予定: ${visits.length}件</div>
    `));
  }

  // ═══ Budget ═══
  if (budget && budget.items && budget.items.length > 0) {
    const toSGD = (item: BudgetItem) =>
      item.currency === 'SGD' ? item.unitPrice * item.quantity : (item.unitPrice * item.quantity) / budget.rateJPY;
    const total = budget.items.reduce((s, item) => s + toSGD(item), 0);

    let brows = '';
    budget.items.forEach((item, i) => {
      const bg = i % 2 === 0 ? '#fafafa' : '#fff';
      brows += `<tr style="background: ${bg}; border-bottom: 1px solid #eee;">
        <td style="padding: 3px 6px;">${item.category}</td>
        <td style="padding: 3px 6px;">${item.name}</td>
        <td style="padding: 3px 6px; text-align: right;">${item.currency === 'SGD' ? 'S$' : '¥'}${item.unitPrice.toLocaleString()}</td>
        <td style="padding: 3px 6px; text-align: right;">${item.quantity}</td>
        <td style="padding: 3px 6px; text-align: right; font-weight: 600;">S$${toSGD(item).toFixed(0)}</td>
      </tr>`;
    });

    sections.push(sectionHTML(`
      <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px;">予算概要</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <thead><tr style="background: #eee; border-bottom: 1px solid #ccc;">
          <th style="text-align: left; padding: 3px 6px; color: #888;">カテゴリ</th>
          <th style="text-align: left; padding: 3px 6px; color: #888;">項目</th>
          <th style="text-align: right; padding: 3px 6px; color: #888;">単価</th>
          <th style="text-align: right; padding: 3px 6px; color: #888;">数量</th>
          <th style="text-align: right; padding: 3px 6px; color: #888;">小計 (SGD)</th>
        </tr></thead>
        <tbody>${brows}
          <tr style="border-top: 2px solid #333; font-weight: 700;">
            <td colspan="4" style="text-align: right; padding: 6px;">合計</td>
            <td style="text-align: right; padding: 6px; font-size: 12px;">S$${total.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td>
          </tr>
          <tr>
            <td colspan="4" style="text-align: right; padding: 3px 6px; color: #666;">1人あたり</td>
            <td style="text-align: right; padding: 3px 6px; color: #666;">S$${(total / 4).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}（≈ ¥${Math.round(total / 4 * budget.rateJPY).toLocaleString()}）</td>
          </tr>
        </tbody>
      </table>
    `));
  }

  // ═══ Footer ═══
  sections.push(sectionHTML(`
    <div style="padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #999; display: flex; justify-content: space-between;">
      <span>シンガポール出張 工程表 — CONFIDENTIAL</span>
      <span>${new Date().toLocaleDateString('ja-JP')} 作成</span>
    </div>
  `));

  return sections;
}

export async function exportBusinessPDF(blocks: Block[]): Promise<void> {
  const sections = buildSections(blocks);
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = 210;
  const pageH = 297;
  const margin = 5;

  let currentY = margin;
  let pageNum = 0;

  for (const html of sections) {
    // Render section to canvas
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;background:#fff;';
    document.body.appendChild(container);

    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      width: 794,
    });

    document.body.removeChild(container);

    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;

    // If this section doesn't fit on current page, start new page
    if (currentY + imgH > pageH - margin && pageNum > 0) {
      doc.addPage();
      currentY = margin;
    }

    // If section is taller than a full page, just place it and it may overflow
    // (rare case - individual sections should be small enough)
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', margin, currentY, imgW, imgH);
    currentY += imgH + 2; // 2mm gap between sections

    if (pageNum === 0 && currentY === margin + imgH + 2) pageNum = 1;
  }

  doc.save('シンガポール出張_工程表_2026.pdf');
}
