import { jsPDF } from 'jspdf';
import type { Block } from '../types';
import { DAYS, getCat } from '../constants/categories';
import { t2m, m2t } from './time';

export function exportBusinessPDF(blocks: Block[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mg = 15;
  const cw = pw - mg * 2;
  let y = 0;

  function newPage() { doc.addPage(); y = mg; addHeader(); }
  function checkPage(needed: number) { if (y + needed > ph - 20) newPage(); }

  function addHeader() {
    doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.5);
    doc.line(mg, mg, pw - mg, mg);
    y = mg + 8;
    doc.setFontSize(16); doc.setTextColor(20, 20, 20);
    doc.text('シンガポール出張 工程表', mg, y);
    doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    doc.text('2026年5月18日（月）〜 5月21日（木）', pw - mg, y, { align: 'right' });
    y += 6; doc.setFontSize(8);
    doc.text('参加者: 4名（チームA・チームB）', mg, y);
    doc.text('作成日: ' + new Date().toLocaleDateString('ja-JP'), pw - mg, y, { align: 'right' });
    y += 2; doc.setLineWidth(0.3); doc.line(mg, y, pw - mg, y); y += 6;
  }

  addHeader();

  // ═══ Daily Schedule ═══
  DAYS.forEach((day, dayIdx) => {
    checkPage(40);
    doc.setFillColor(240, 240, 240);
    doc.rect(mg, y, cw, 7, 'F');
    doc.setDrawColor(180, 180, 180); doc.rect(mg, y, cw, 7, 'D');
    doc.setFontSize(10); doc.setTextColor(20, 20, 20);
    doc.text(`${day.date.replace('2026-', '')} （${['月','火','水','木'][dayIdx]}）  ${day.desc}`, mg + 3, y + 5);
    y += 10;

    (['A', 'B'] as const).forEach(team => {
      const teamBlocks = blocks.filter(b => b.day === day.key && b.team === team).sort((a, b) => t2m(a.start) - t2m(b.start));
      if (teamBlocks.length === 0) return;

      checkPage(20);
      doc.setFontSize(9); doc.setTextColor(60, 60, 60);
      doc.text(`チーム${team}`, mg + 2, y + 3); y += 5;

      const cols = [mg, mg + 28, mg + 55, mg + cw * 0.65];
      doc.setFillColor(248, 248, 248); doc.rect(mg, y, cw, 5, 'F');
      doc.setDrawColor(200, 200, 200); doc.line(mg, y + 5, pw - mg, y + 5);
      doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text('時間', cols[0] + 1, y + 3.5);
      doc.text('種別', cols[1] + 1, y + 3.5);
      doc.text('内容', cols[2] + 1, y + 3.5);
      doc.text('場所', cols[3] + 1, y + 3.5);
      y += 6;

      teamBlocks.forEach((b, i) => {
        checkPage(7);
        const cat = getCat(b.type);
        const endTime = m2t(t2m(b.start) + b.dur);
        if (i % 2 === 0) { doc.setFillColor(252, 252, 252); doc.rect(mg, y - 1, cw, 5.5, 'F'); }
        doc.setFontSize(7.5); doc.setTextColor(40, 40, 40);
        doc.text(`${b.start}-${endTime}`, cols[0] + 1, y + 2.5);
        doc.text(cat.lbl, cols[1] + 1, y + 2.5);
        doc.setTextColor(20, 20, 20);
        doc.text((b.detail || b.label).substring(0, 28), cols[2] + 1, y + 2.5);
        doc.setTextColor(80, 80, 80);
        doc.text((b.location || '').substring(0, 20), cols[3] + 1, y + 2.5);
        doc.setDrawColor(230, 230, 230); doc.line(mg, y + 4.5, pw - mg, y + 4.5);
        y += 5.5;
      });
      y += 4;
    });
    y += 4;
  });

  // ═══ Visit Summary ═══
  newPage();
  doc.setFontSize(12); doc.setTextColor(20, 20, 20);
  doc.text('訪問先一覧', mg, y); y += 8;

  const visits = blocks.filter(b => b.type === 'visit' || b.type === 'reserve')
    .sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : t2m(a.start) - t2m(b.start));

  doc.setFillColor(240, 240, 240); doc.rect(mg, y, cw, 6, 'F');
  doc.setDrawColor(180, 180, 180); doc.line(mg, y + 6, pw - mg, y + 6);
  doc.setFontSize(7.5); doc.setTextColor(100, 100, 100);
  const vc = [mg, mg + 22, mg + 34, mg + 54, mg + cw * 0.55, mg + cw * 0.78];
  doc.text('日付', vc[0]+1, y+4); doc.text('Team', vc[1]+1, y+4); doc.text('時間', vc[2]+1, y+4);
  doc.text('企業名', vc[3]+1, y+4); doc.text('場所', vc[4]+1, y+4); doc.text('連絡先', vc[5]+1, y+4);
  y += 8;

  visits.forEach((v, i) => {
    checkPage(7);
    const dayInfo = DAYS[parseInt(v.day[1])];
    if (i % 2 === 0) { doc.setFillColor(252, 252, 252); doc.rect(mg, y - 1, cw, 5.5, 'F'); }
    doc.setFontSize(7.5); doc.setTextColor(40, 40, 40);
    doc.text(dayInfo?.date.replace('2026-','') || '', vc[0]+1, y+2.5);
    doc.text(v.team, vc[1]+1, y+2.5);
    doc.text(`${v.start}-${m2t(t2m(v.start)+v.dur)}`, vc[2]+1, y+2.5);
    doc.setTextColor(20, 20, 20);
    doc.text((v.detail||'—').substring(0,20), vc[3]+1, y+2.5);
    doc.setTextColor(80, 80, 80);
    doc.text((v.location||'—').substring(0,16), vc[4]+1, y+2.5);
    doc.text((v.contact||'—').substring(0,14), vc[5]+1, y+2.5);
    doc.setDrawColor(230, 230, 230); doc.line(mg, y+4.5, pw-mg, y+4.5);
    y += 5.5;
  });

  y += 6; doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  doc.text(`訪問予定: ${visits.length}件`, mg, y);

  // Footer
  const pages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
    doc.line(mg, ph - 12, pw - mg, ph - 12);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text('シンガポール出張 工程表 — CONFIDENTIAL', mg, ph - 8);
    doc.text(`${i} / ${pages}`, pw - mg, ph - 8, { align: 'right' });
  }

  doc.save('シンガポール出張_工程表_2026.pdf');
}
