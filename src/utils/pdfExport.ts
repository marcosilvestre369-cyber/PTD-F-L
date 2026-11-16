import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DailyReportSummary, PdeRequest } from '../types/index.ts';
import { formatDatePt, formatDateTimePt } from './date.ts';

function formatStockStatusPt(status: string): string {
  if (status === 'TRATADO' || status === 'RESOLVIDO') return 'Tratado';
  if (status === 'NAO_CONSIDERADO') return 'Não considerado';
  return 'Por tratar';
}

function formatPdeStatusPt(status: string, upper = false): string {
  const label =
    status === 'RESOLVIDO'
      ? 'Resolvido'
      : status === 'NAO_CONSIDERADO'
      ? 'Não considerado'
      : 'Pendente';
  return upper ? label.toUpperCase() : label;
}

export function exportDailyReportPdf(report: DailyReportSummary) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 12; // 12mm em cada margem -> largura útil = 186mm

  const scope = report.reportScope || 'TODOS';
  const period = report.period || 'DIA';

  // Título e etiqueta dinâmica
  const scopeTitles: Record<string, string> = {
    STOCKS: 'RELATÓRIO OPERACIONAL DE STOCKS',
    PDE: 'RELATÓRIO DE QUALIDADE - PEDIDOS DE PDE',
    TAREFAS: 'RELATÓRIO DE DESEMPENHO E TAREFAS',
    TODOS: 'RELATÓRIO OPERACIONAL CONSOLIDADO',
  };

  const mainTitle = scopeTitles[scope] || 'RELATÓRIO OPERACIONAL CONSOLIDADO';
  const periodText = report.periodLabel || formatDatePt(report.reportDate);

  // Cabeçalho principal Carvão e Âmbar
  doc.setFillColor(38, 38, 38); // Carvão #262626
  doc.rect(0, 0, pageWidth, 27, 'F');
  doc.setFillColor(212, 162, 76); // Âmbar #D4A24C
  doc.rect(0, 27, pageWidth, 1.2, 'F');

  doc.setTextColor(249, 249, 248);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(mainTitle, margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(218, 218, 212);
  doc.text(`Secção: ${report.sectionName}   |   Período (${period}): ${periodText}`, margin, 18);
  doc.text(`Gerado em: ${formatDateTimePt(report.generatedAt)}   |   Formato: A4 Norma Operacional`, margin, 23);

  // Linha de filtros
  let currentY = 34;
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  const activeFilters = [];
  if (report.filters.period) activeFilters.push(`Período: ${report.filters.period}`);
  if (report.filters.reportScope) activeFilters.push(`Tipo: ${report.filters.reportScope}`);
  if (report.filters.type) activeFilters.push(`Subtipo: ${report.filters.type}`);
  if (report.filters.status) activeFilters.push(`Estado: ${report.filters.status}`);
  if (report.filters.articleQuery) activeFilters.push(`Pesquisa: "${report.filters.articleQuery}"`);
  const filterText = activeFilters.length > 0 ? `Filtros: ${activeFilters.join('  ·  ')}` : 'Filtros: Todos os registos do período';
  doc.text(filterText, margin, currentY);

  currentY += 6;

  // Cartões de Resumo (KPIs) conforme o Tipo de Relatório
  if (scope === 'STOCKS' || scope === 'TODOS') {
    const cardWidth = (pageWidth - margin * 2 - 9) / 4;
    const cardHeight = 15;
    const cards = [
      { title: 'Ocorrências Excesso', value: `${report.metrics.excessCount} (${report.metrics.excessBoxesTotal} cx)` },
      { title: 'Artigos Distintos', value: `${report.metrics.distinctArticlesExcess} artigos` },
      { title: 'Roturas / Revisão', value: `${report.metrics.ruptureCount} registos` },
      { title: 'Por Tratar (Período)', value: `${report.metrics.pendingTreatmentCount} pendentes` },
    ];

    cards.forEach((card, index) => {
      const x = margin + index * (cardWidth + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(card.title, x + 2.5, currentY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(card.value, x + 2.5, currentY + 11);
    });

    currentY += cardHeight + 6;
  }

  if (scope === 'PDE') {
    const cardWidth = (pageWidth - margin * 2 - 6) / 3;
    const cardHeight = 15;
    const cards = [
      { title: 'Total Pedidos PDE', value: `${report.pdeMetrics?.totalCount || 0} pedidos` },
      { title: 'PDE Pendentes', value: `${report.pdeMetrics?.pendingCount || 0} a aguardar` },
      { title: 'PDE Resolvidos', value: `${report.pdeMetrics?.resolvedCount || 0} concluídos` },
    ];

    cards.forEach((card, index) => {
      const x = margin + index * (cardWidth + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(card.title, x + 3, currentY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(card.value, x + 3, currentY + 11);
    });

    currentY += cardHeight + 6;
  }

  if (scope === 'TAREFAS') {
    const cardWidth = (pageWidth - margin * 2 - 9) / 4;
    const cardHeight = 15;
    const tMetrics = report.tasksMetrics || {
      totalTasks: 0,
      completedTasks: 0,
      notDoneTasks: 0,
      pendingTasks: 0,
      globalCompletionRate: 0,
    };

    const cards = [
      { title: 'Total Tarefas', value: `${tMetrics.totalTasks} tarefas` },
      { title: 'Tarefas Feitas', value: `${tMetrics.completedTasks} concluídas` },
      { title: 'Não Feitas', value: `${tMetrics.notDoneTasks} não feitas` },
      { title: 'Cumprimento Global', value: `${tMetrics.globalCompletionRate}% concluído` },
    ];

    cards.forEach((card, index) => {
      const x = margin + index * (cardWidth + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(card.title, x + 2.5, currentY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(card.value, x + 2.5, currentY + 11);
    });

    currentY += cardHeight + 6;
  }

  // 1. Tabela de Excessos (quando STOCKS ou TODOS)
  if (scope === 'STOCKS' || scope === 'TODOS') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`1. Excesso de Stock (${report.dayExcessRecords.length} ocorrências · Total: ${report.metrics.excessBoxesTotal} cx)`, margin, currentY);
    currentY += 4;

    if (report.dayExcessRecords.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Sem registos de excesso de stock para este período.', margin, currentY + 3);
      currentY += 8;
    } else {
      const excessRows = report.dayExcessRecords.map(r => [
        r.articleSku,
        r.articleDescription,
        `${r.boxes ?? '-'} cx`,
        r.dateType || '-',
        formatDatePt(r.stockDate),
        r.lot || '-',
        r.authorName,
        formatDatePt(r.treatmentDate),
        formatStockStatusPt(r.status),
      ]);

      // Total largura colunas = 16+44+14+14+16+14+22+22+20 = 182mm (ajustado exatamente ao A4 com margens 14/14mm)
      autoTable(doc, {
        startY: currentY,
        head: [['SKU', 'Artigo', 'Caixas', 'Tipo Data', 'Data', 'Lote', 'Autor', 'Tratamento', 'Estado']],
        body: excessRows,
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          textColor: [51, 65, 85],
          lineColor: [226, 232, 240],
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 44 },
          2: { cellWidth: 14, halign: 'right' },
          3: { cellWidth: 14 },
          4: { cellWidth: 16 },
          5: { cellWidth: 14 },
          6: { cellWidth: 22 },
          7: { cellWidth: 22 },
          8: { cellWidth: 20 },
        },
        margin: { left: margin, right: margin },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    }

    // 2. Tabela de Roturas e Revisão de Parâmetros
    if (currentY > pageHeight - 38) {
      doc.addPage();
      currentY = 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`2. Rotura Frequente e Revisão de Parâmetros (${report.dayRuptureRecords.length} ocorrências)`, margin, currentY);
    currentY += 4;

    if (report.dayRuptureRecords.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Sem registos de rotura frequente para este período.', margin, currentY + 3);
      currentY += 8;
    } else {
      const ruptureRows = report.dayRuptureRecords.map(r => [
        r.articleSku,
        r.articleDescription,
        'Revisão Requerida',
        r.observation || 'Sem observações adicionais',
        r.authorName,
        formatDatePt(r.treatmentDate),
        formatStockStatusPt(r.status),
      ]);

      // 18+46+24+42+20+16+16 = 182mm
      autoTable(doc, {
        startY: currentY,
        head: [['SKU', 'Artigo', 'Indicação', 'Contexto / Observação', 'Autor', 'Tratamento', 'Estado']],
        body: ruptureRows,
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          textColor: [51, 65, 85],
          lineColor: [226, 232, 240],
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 46 },
          2: { cellWidth: 24 },
          3: { cellWidth: 42 },
          4: { cellWidth: 20 },
          5: { cellWidth: 16 },
          6: { cellWidth: 16 },
        },
        margin: { left: margin, right: margin },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    }

    // 3. Tabela de Pendências Anteriores
    if (report.previousPendingRecords.length > 0) {
      if (currentY > pageHeight - 40) {
        doc.addPage();
        currentY = 14;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(180, 83, 9);
      doc.text(
        `3. Pendências Anteriores por Tratar (${report.previousPendingRecords.length} registos · ${report.previousPendingMetrics.excessBoxesTotal} cx)`,
        margin,
        currentY
      );
      currentY += 4;

      const pendingRows = report.previousPendingRecords.map(r => [
        r.type,
        r.articleSku,
        r.articleDescription,
        r.type === 'EXCESSO' ? `${r.boxes ?? '-'} cx (${r.dateType} ${formatDatePt(r.stockDate)})` : 'Revisão Parâmetros',
        formatDatePt(r.registrationDate),
        formatDatePt(r.treatmentDate),
        r.authorName,
        formatStockStatusPt(r.status),
      ]);

      // 16+16+44+36+16+16+20+18 = 182mm
      autoTable(doc, {
        startY: currentY,
        head: [['Tipo', 'SKU', 'Artigo', 'Detalhe Operacional', 'Data Reg.', 'Data Trat.', 'Autor', 'Estado']],
        body: pendingRows,
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          textColor: [51, 65, 85],
          lineColor: [254, 215, 170],
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [180, 83, 9],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 16 },
          2: { cellWidth: 44 },
          3: { cellWidth: 36 },
          4: { cellWidth: 16 },
          5: { cellWidth: 16 },
          6: { cellWidth: 20 },
          7: { cellWidth: 18 },
        },
        margin: { left: margin, right: margin },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // 4. Pedidos de Qualidade (PDE) (quando PDE ou TODOS)
  if (scope === 'PDE' || scope === 'TODOS') {
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `4. Pedidos de Qualidade de Artigos - PDE (${report.pdeRecords?.length || 0} registos · ${report.pdeMetrics?.pendingCount || 0} pendentes / ${report.pdeMetrics?.resolvedCount || 0} resolvidos)`,
      margin,
      currentY
    );
    currentY += 4;

    if (!report.pdeRecords || report.pdeRecords.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Sem pedidos de PDE registados para este período.', margin, currentY + 3);
      currentY += 8;
    } else {
      const pdeRows = report.pdeRecords.map(p => [
        p.sku,
        p.articleDescription,
        p.batchNumber,
        formatDatePt(p.expirationDate),
        p.defectReason,
        p.submittedByName,
        `${p.photos?.length || 0} fotos`,
        formatPdeStatusPt(p.status),
        p.resolutionNotes || '—',
      ]);

      // 16+38+15+16+30+22+12+14+19 = 182mm (enquadra perfeitamente na largura A4)
      autoTable(doc, {
        startY: currentY,
        head: [['SKU', 'Artigo', 'Lote', 'Validade', 'Motivo Qualidade', 'Colaborador', 'Fotos', 'Estado', 'Resolução']],
        body: pdeRows,
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          textColor: [51, 65, 85],
          lineColor: [226, 232, 240],
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [38, 38, 38],
          textColor: [249, 249, 248],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 38 },
          2: { cellWidth: 15 },
          3: { cellWidth: 16 },
          4: { cellWidth: 30 },
          5: { cellWidth: 22 },
          6: { cellWidth: 12, halign: 'center' },
          7: { cellWidth: 14, halign: 'center' },
          8: { cellWidth: 19 },
        },
        margin: { left: margin, right: margin },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // 5. Conclusão de Tarefas por Colaborador (quando TAREFAS ou TODOS)
  if (scope === 'TAREFAS' || scope === 'TODOS') {
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `5. Conclusão de Tarefas por Colaborador (${report.collaboratorTasks?.length || 0} colaboradores)`,
      margin,
      currentY
    );
    currentY += 4;

    if (!report.collaboratorTasks || report.collaboratorTasks.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Sem tarefas registadas para colaboradores neste período.', margin, currentY + 3);
      currentY += 8;
    } else {
      const reportYear = report.reportDate.slice(0, 4);
      const periodHeaderSuffix = period === 'MES' ? 'Mês' : period === 'ANO' ? 'Ano' : 'Dia';
      const colabRows = report.collaboratorTasks.map(c => {
        const eligible = c.annualScore?.eligible;
        return [
          c.mecanographicNumber,
          c.name,
          `${c.totalTasks}`,
          `${c.completedTasks}`,
          `${c.notDoneTasks}`,
          `${c.pendingTasks}`,
          `${c.completionRate}%`,
          `${c.weeklyCompletionRate ?? 0}%`,
          eligible ? `${c.annualScore?.totalPoints ?? 0} pts` : 'Isento',
        ];
      });

      // 16+37+16+17+17+18+22+23+20 = 186mm (largura útil exata A4 com margens 12mm)
      autoTable(doc, {
        startY: currentY,
        head: [[
          'Nº Mec.',
          'Colaborador',
          'Total Tarefas',
          'Concluídas',
          'Não Feitas',
          'Por Assinalar',
          `Taxa Cumpr. (${periodHeaderSuffix})`,
          'Taxa Tarefas (Sem.)',
          `IPA (${reportYear})`,
        ]],
        body: colabRows,
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          textColor: [51, 65, 85],
          lineColor: [226, 232, 240],
        },
        headStyles: {
          fillColor: [38, 38, 38],
          textColor: [249, 249, 248],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 37 },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 17, halign: 'center' },
          4: { cellWidth: 17, halign: 'center' },
          5: { cellWidth: 18, halign: 'center' },
          6: { cellWidth: 22, halign: 'center' },
          7: { cellWidth: 23, halign: 'center' },
          8: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: margin, right: margin },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // Rodapé e paginação em todas as páginas
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages}  ·  Frutas e Legumes  ·  Documento Operacional A4`,
      margin,
      pageHeight - 7
    );
    doc.text(
      `Tipo: ${scope} | Período: ${period}`,
      pageWidth - margin - 50,
      pageHeight - 7
    );
  }

  // Download do PDF
  const filename = `Relatorio_${scope}_${period}_${report.reportDate.replace(/-/g, '')}.pdf`;
  doc.save(filename);
}

/**
 * Emite uma Ficha Individual de PDE em Folha A4 perfeitamente ajustada para impressão física
 */
export function exportSinglePdeA4Pdf(pde: PdeRequest) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const usableWidth = pageWidth - margin * 2; // 182mm

  // Cabeçalho da Ficha de Não Conformidade PDE (Carvão e Âmbar)
  doc.setFillColor(38, 38, 38); // Carvão #262626
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setFillColor(212, 162, 76); // Âmbar #D4A24C
  doc.rect(0, 25, pageWidth, 1.2, 'F');

  doc.setTextColor(249, 249, 248);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PEDIDO DE QUALIDADE · PDE (FICHA DE NÃO CONFORMIDADE)', margin, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(218, 218, 212);
  doc.text(`Secção: Frutas e Legumes   |   ID: ${pde.id}   |   Estado: ${formatPdeStatusPt(pde.status, true)}`, margin, 18);
  doc.text(`Data de Emissão: ${formatDateTimePt(new Date().toISOString())}`, margin, 22.5);

  let currentY = 32;

  // Bloco de Identificação do Artigo e Lote
  autoTable(doc, {
    startY: currentY,
    head: [['CAMPO', 'INFORMAÇÃO OPERACIONAL']],
    body: [
      ['Artigo', pde.articleDescription],
      ['Código SKU', pde.sku],
      ['Lote da Mercadoria', pde.batchNumber],
      ['Data de Chegada', formatDatePt(pde.arrivalDate)],
      ['Data de Validade', formatDatePt(pde.expirationDate)],
      ['Motivo de Qualidade', pde.defectReason],
      ['Colaborador Subscritor', `${pde.submittedByName} (${pde.submittedByNumber})`],
      ['Data de Submissão', formatDateTimePt(pde.submittedAt)],
      ['Estado Atual', formatPdeStatusPt(pde.status, true)],
      ['Ação de Resolução', pde.resolutionAction || 'Pendente de validação pela administração'],
      ['Notas da Decisão', pde.resolutionNotes || 'Sem observações registadas'],
      ['Decidido por', pde.resolvedByName ? `${pde.resolvedByName} em ${formatDateTimePt(pde.resolvedAt || '')}` : '—'],
    ],
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 132 },
    },
    margin: { left: margin, right: margin },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Imagens / Fotografias se disponíveis
  if (pde.photos && pde.photos.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Fotografias Evidência de Qualidade (${pde.photos.length} fotos anexadas)`, margin, currentY);
    currentY += 4;

    const imgSize = 42; // 42mm x 42mm
    const gap = 4;
    let x = margin;
    let y = currentY;

    pde.photos.slice(0, 4).forEach((photo, idx) => {
      try {
        doc.addImage(photo, 'JPEG', x, y, imgSize, imgSize);
        doc.setDrawColor(203, 213, 225);
        doc.rect(x, y, imgSize, imgSize);
      } catch (e) {
        // Ignorar se a imagem tiver formato inválido
      }
      x += imgSize + gap;
      if (x + imgSize > pageWidth - margin) {
        x = margin;
        y += imgSize + gap;
      }
    });

    currentY = y + imgSize + 8;
  }

  // Rodapé da Ficha A4
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Ficha Oficial de PDE · Formato A4 para Impressão e Arquivo Operacional · Secção de Frutas e Legumes',
    margin,
    pageHeight - 8
  );

  const filename = `Ficha_PDE_${pde.sku}_${pde.batchNumber}.pdf`;
  doc.save(filename);
}
