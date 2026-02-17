import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const GREEN = [26, 86, 50];
const LIGHT_GREEN = [45, 138, 78];
const RED = [211, 47, 47];
const GRAY = [100, 100, 100];
const LIGHT_BG = [245, 250, 247];
const WHITE = [255, 255, 255];

export default function generatePDF({
  propertyType,
  client,
  system,
  controllers,
  backflows,
  zones,
  activeZoneCount,
  observations,
  recommendations,
  priority,
  estCost,
  estTime,
  techName,
  isCommercial,
}) {
  const doc = new jsPDF("p", "mm", "letter");
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;
  let y = 0;

  // ─── HELPERS ───

  const addFooter = () => {
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...GREEN);
      doc.setLineWidth(0.5);
      doc.line(margin, pageH - 18, pageW - margin, pageH - 18);
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text("www.irrigationssolutions.com | Hablamos Español", pageW / 2, pageH - 13, { align: "center" });
      doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 13, { align: "right" });
    }
  };

  const checkPage = (needed = 40) => {
    if (y > pageH - needed) {
      doc.addPage();
      y = 20;
    }
  };

  const sectionTitle = (title) => {
    checkPage();
    y += 4;
    doc.setFillColor(...GREEN);
    doc.rect(margin, y, 3, 7, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREEN);
    doc.text(title, margin + 6, y + 6);
    y += 14;
  };

  const infoRow = (label, value, x) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GRAY);
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    doc.text(String(value || "—"), x, y + 5);
  };

  const infoGrid = (rows) => {
    rows.forEach((row) => {
      const colW = contentW / row.length;
      row.forEach((item, i) => {
        infoRow(item[0], item[1], margin + i * colW);
      });
      y += 12;
    });
  };

  // ─── HEADER ───

  const typeLabel = isCommercial ? "Commercial" : "Residential";

  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageW, 34, "F");
  doc.setFillColor(...LIGHT_GREEN);
  doc.rect(0, 34, pageW, 3, "F");

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text("IRRIGATION SOLUTION GROUP", pageW / 2, 14, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${typeLabel} Wet Check Inspection Report`, pageW / 2, 23, { align: "center" });

  // Property sub-type badge for commercial
  if (isCommercial && client.propertySubType) {
    doc.setFontSize(9);
    doc.text(client.propertySubType, pageW / 2, 30, { align: "center" });
  }

  y = 46;

  // ─── CLIENT INFORMATION ───

  sectionTitle("CLIENT INFORMATION");

  const clientRows = [
    [["Client Name", client.name], ["Date", client.date], ["Work Order", client.workOrder]],
    [["Property Address", client.address], ["City / Zip", client.city], ["Phone", client.phone]],
    [["Email", client.email], ["Property Manager", client.manager]],
  ];

  if (isCommercial) {
    clientRows.push(
      [["Complex / Building", client.buildingName], ["# Buildings / Areas", client.numBuildings], ["Irrigated Acreage", client.irrigatedAcreage]],
    );
  }

  infoGrid(clientRows);

  if (client.lat && client.lng) {
    const mapsUrl = `https://www.google.com/maps?q=${client.lat},${client.lng}`;
    doc.setFontSize(8);
    doc.setTextColor(...LIGHT_GREEN);
    doc.text("View on Google Maps", margin, y);
    doc.link(margin, y - 3, 40, 5, { url: mapsUrl });
    y += 6;
  }

  // ─── CONTROLLERS ───

  sectionTitle("CONTROLLERS");

  if (controllers && controllers.length > 0) {
    const ctrlRows = controllers.map((c) => [
      String(c.id),
      c.make || "—",
      c.type || "—",
      c.location || "—",
      c.zoneFrom && c.zoneTo ? `${c.zoneFrom}–${c.zoneTo}` : "—",
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Make / Model", "Type", "Location", "Zones"]],
      body: ctrlRows,
      theme: "grid",
      headStyles: {
        fillColor: GREEN, textColor: WHITE, fontStyle: "bold", fontSize: 9, halign: "center",
      },
      bodyStyles: { fontSize: 9, halign: "center", cellPadding: 2.5 },
      alternateRowStyles: { fillColor: LIGHT_BG },
      columnStyles: { 0: { cellWidth: 10 } },
    });
    y = doc.lastAutoTable.finalY + 4;

    const ctrlsWithLoc = controllers.filter((c) => c.lat && c.lng);
    if (ctrlsWithLoc.length > 0) {
      doc.setFontSize(8);
      doc.setTextColor(...LIGHT_GREEN);
      ctrlsWithLoc.forEach((c) => {
        doc.text(`Controller ${c.id} Location: View on Maps`, margin, y + 2);
        doc.link(margin, y - 1, 60, 5, { url: `https://www.google.com/maps?q=${c.lat},${c.lng}` });
        y += 5;
      });
      y += 2;
    }
  }

  // ─── SYSTEM OVERVIEW ───

  sectionTitle("SYSTEM OVERVIEW");

  const sysRows = [
    [["Water Source", system.waterSource], ["Meter Size", system.meterSize], ["Flow Rate (GPM)", system.flowRate]],
    [["Static PSI", system.staticPSI], ["Working PSI", system.workingPSI]],
    [["Rain Sensor", system.rainSensor], ["Pump Station", system.pumpStation]],
  ];

  if (isCommercial) {
    sysRows.push(
      [["Mainline Size", system.mainlineSize], ["Mainline Material", system.mainlineMaterial], ["Master Valve", system.masterValve]],
      [["Flow Sensor", system.flowSensor], ["Points of Connection", system.poc]],
    );
  }

  infoGrid(sysRows);

  if (system.pumpLat && system.pumpLng) {
    doc.setFontSize(8);
    doc.setTextColor(...LIGHT_GREEN);
    doc.text("Pump Location: View on Google Maps", margin, y);
    doc.link(margin, y - 3, 60, 5, { url: `https://www.google.com/maps?q=${system.pumpLat},${system.pumpLng}` });
    y += 6;
  }

  // ─── BACKFLOW DEVICES ───

  if (backflows && backflows.length > 0) {
    sectionTitle("BACKFLOW DEVICES");

    const bfRows = backflows.map((b) => [
      String(b.id),
      b.type || "—",
      b.condition || "—",
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Type", "Condition"]],
      body: bfRows,
      theme: "grid",
      headStyles: {
        fillColor: GREEN, textColor: WHITE, fontStyle: "bold", fontSize: 9, halign: "center",
      },
      bodyStyles: { fontSize: 9, halign: "center", cellPadding: 2.5 },
      alternateRowStyles: { fillColor: LIGHT_BG },
      columnStyles: { 0: { cellWidth: 10 } },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ─── ZONE-BY-ZONE TABLE ───

  sectionTitle("ZONE-BY-ZONE INSPECTION RESULTS");

  const activeZones = zones.slice(0, activeZoneCount);

  // Build table based on property type
  const zoneHead = isCommercial
    ? [["Zone", "Area", "Ctrl", "Type", "Brand", "Heads", "PSI", "Status"]]
    : [["Zone", "Type", "Head Brand", "Heads", "PSI", "Status"]];

  const zoneRows = activeZones.map((z) => {
    const issues = [];
    if (z.leak) issues.push("LEAK");
    if (z.broken) issues.push("BROKEN");
    if (z.clogged) issues.push("CLOGGED");
    if (z.misaligned) issues.push("MISALIGNED");
    const status = z.ok ? "OK" : issues.length ? issues.join(", ") : "—";

    if (isCommercial) {
      return [
        String(z.id),
        z.area || "—",
        String(z.controllerId || 1),
        z.type || "—",
        z.headType || "—",
        z.heads || "—",
        z.psi || "—",
        status,
      ];
    }
    return [
      String(z.id),
      z.type || "—",
      z.headType || "—",
      z.heads || "—",
      z.psi || "—",
      status,
    ];
  });

  const statusColIdx = isCommercial ? 7 : 5;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: zoneHead,
    body: zoneRows,
    theme: "grid",
    headStyles: {
      fillColor: GREEN, textColor: WHITE, fontStyle: "bold", fontSize: 8, halign: "center",
    },
    bodyStyles: { fontSize: 8, halign: "center", cellPadding: 2 },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: isCommercial
      ? { 0: { cellWidth: 12 }, 2: { cellWidth: 10 }, 7: { cellWidth: 28 } }
      : { 0: { cellWidth: 14 }, 5: { cellWidth: 32 } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === statusColIdx) {
        const val = data.cell.raw;
        if (val === "OK") {
          data.cell.styles.textColor = GREEN;
          data.cell.styles.fontStyle = "bold";
        } else if (val !== "—") {
          data.cell.styles.textColor = RED;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  y = doc.lastAutoTable.finalY + 4;

  // Zone notes
  const zonesWithNotes = activeZones.filter((z) => z.notes);
  if (zonesWithNotes.length > 0) {
    checkPage(30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GRAY);
    doc.text("Zone Notes:", margin, y + 4);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    zonesWithNotes.forEach((z) => {
      checkPage(25);
      const prefix = z.area ? `Zone ${z.id} [${z.area}]` : `Zone ${z.id}`;
      doc.text(`${prefix}: ${z.notes}`, margin + 2, y + 2);
      y += 6;
    });
  }

  // Zone locations
  const zonesWithLocation = activeZones.filter((z) => z.lat && z.lng);
  if (zonesWithLocation.length > 0) {
    checkPage(30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GRAY);
    doc.text("Zone Locations:", margin, y + 4);
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(...LIGHT_GREEN);
    zonesWithLocation.forEach((z) => {
      checkPage(12);
      const prefix = z.area ? `Zone ${z.id} [${z.area}]` : `Zone ${z.id}`;
      doc.text(`${prefix} — View on Maps`, margin + 2, y + 2);
      doc.link(margin + 2, y - 1, 60, 5, { url: `https://www.google.com/maps?q=${z.lat},${z.lng}` });
      y += 6;
    });
  }

  y += 4;

  // ─── ZONE PHOTOS ───

  const zonesWithPhotos = activeZones.filter((z) => z.beforeImg || z.afterImg);
  if (zonesWithPhotos.length > 0) {
    sectionTitle("ZONE PHOTOS");

    const imgW = 70;  // width per image in mm
    const imgH = 52;  // height per image
    const gap = 6;

    zonesWithPhotos.forEach((z) => {
      checkPage(imgH + 22);

      const prefix = z.area ? `Zone ${z.id} [${z.area}]` : `Zone ${z.id}`;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GREEN);
      doc.text(prefix, margin, y);
      y += 6;

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);

      const imgs = [];
      if (z.beforeImg) imgs.push({ label: "Before", data: z.beforeImg });
      if (z.afterImg) imgs.push({ label: "After", data: z.afterImg });

      imgs.forEach((img, i) => {
        const x = margin + i * (imgW + gap);
        doc.text(img.label, x + imgW / 2, y, { align: "center" });
        try { doc.addImage(img.data, "JPEG", x, y + 2, imgW, imgH); } catch (_) { /* skip */ }
      });

      y += imgH + 8;
    });
  }

  // ─── OBSERVATIONS ───

  sectionTitle("GENERAL OBSERVATIONS");

  const obsList = [
    ["mainLineLeak", "Main Line Leak"],
    ["lateralLeak", "Lateral Line Leak"],
    ["valveBoxFlooded", "Valve Box Flooded"],
    ["overspray", "Overspray"],
    ["drySpots", "Dry Spots"],
    ["coverageIssues", "Coverage Issues"],
  ];

  if (isCommercial) {
    obsList.push(
      ["erosion", "Erosion"],
      ["drainageIssues", "Drainage Issues"],
      ["codeViolations", "Code Violations"],
      ["timerIssues", "Timer Programming Issues"],
      ["waterWaste", "Water Waste"],
      ["rootDamage", "Tree Root Damage"],
    );
  }

  const hasAnyObs = obsList.some(([k]) => observations[k]);

  doc.setFontSize(10);
  if (hasAnyObs) {
    obsList.forEach(([key, label]) => {
      if (observations[key]) {
        checkPage(25);
        doc.setFillColor(...RED);
        doc.circle(margin + 3, y - 1, 1.5, "F");
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        doc.text(label, margin + 8, y);
        y += 7;
      }
    });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text("No issues noted.", margin, y);
    y += 7;
  }

  y += 2;

  // ─── RECOMMENDATIONS ───

  sectionTitle("RECOMMENDATIONS");

  if (recommendations) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(recommendations, contentW);
    lines.forEach((line) => {
      checkPage(25);
      doc.text(line, margin, y);
      y += 5.5;
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text("None.", margin, y);
    y += 6;
  }

  y += 4;

  // ─── PRIORITY / COST / TIME BOX ───

  checkPage(50);

  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentW, 22, 3, 3, "FD");

  const colW3 = contentW / 3;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("Priority", margin + 6, y + 6);
  doc.text("Est. Cost", margin + colW3 + 6, y + 6);
  doc.text("Est. Time", margin + colW3 * 2 + 6, y + 6);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREEN);
  doc.text(priority || "—", margin + 6, y + 15);
  doc.text(estCost || "—", margin + colW3 + 6, y + 15);
  doc.text(estTime || "—", margin + colW3 * 2 + 6, y + 15);

  y += 32;

  // ─── TECHNICIAN ───

  checkPage(40);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("Technician", margin, y);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(techName || "—", margin, y + 7);

  // Signature line
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.3);
  doc.line(margin + 80, y + 7, margin + 150, y + 7);
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("Signature", margin + 80, y + 12);

  // ─── FOOTER ON ALL PAGES ───

  addFooter();

  // ─── SAVE ───

  const prefix = isCommercial ? "CommWetCheck" : "WetCheck";
  const fileName = `${prefix}_${(client.name || "report").replace(/\s+/g, "_")}_${client.date}.pdf`;

  // If returnBlob is true, return { blob, fileName } for sharing; otherwise save directly
  if (arguments[0]?.returnBlob) {
    const blob = doc.output("blob");
    return { blob, fileName };
  }
  doc.save(fileName);
}
