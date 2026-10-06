import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { FileDown, TrendingUp, TrendingDown, Wallet, Briefcase, CheckCircle2, XCircle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { formatEuro, addCompanyHeader, addFooter } from "@/utils/pdfUtils";

export default function AnnualReport({ embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [worksites, setWorksites] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [anno, setAnno] = useState(new Date().getFullYear());

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [sites, txs, pays, qs, att, emps] = await Promise.all([
        db.Worksite.list(),
        db.WorksiteTransaction.list(),
        db.WorksitePayment.list(),
        db.Quote.list(),
        db.DailyAttendance.list(),
        db.Employee.list(),
      ]);
      setWorksites(sites);
      setTransactions(txs);
      setPayments(pays);
      setQuotes(qs);
      setAttendance(att);
      setEmployees(emps);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const yearData = useMemo(() => {
    const inYear = (dateStr) => {
      if (!dateStr) return false;
      return new Date(dateStr).getFullYear() === anno;
    };

    const yearTxs = transactions.filter(t => inYear(t.data));
    const yearPays = payments.filter(p => inYear(p.data));
    const yearQuotes = quotes.filter(q => inYear(q.data));
    const yearAttendance = attendance.filter(a => inYear(a.data));

    const entrate = yearTxs.filter(t => t.tipo === "entrata").reduce((s, t) => s + (t.importo || 0), 0);
    const uscite = yearTxs.filter(t => t.tipo === "uscita").reduce((s, t) => s + (t.importo || 0), 0);

    // Labor cost from attendance
    let laborCost = 0;
    yearAttendance.forEach(a => {
      a.presenze?.forEach(p => {
        const emp = employees.find(e => e.id === p.dipendente_id);
        laborCost += (p.ore || 0) * (emp?.costo_orario || 0);
      });
    });

    const margine = entrate - uscite - laborCost;
    const incassato = yearPays.reduce((s, p) => s + (p.importo || 0), 0);

    // Per-worksites breakdown
    const worksiteBreakdown = worksites.map(w => {
      const txs = yearTxs.filter(t => t.worksite_id === w.id);
      const wEntrate = txs.filter(t => t.tipo === "entrata").reduce((s, t) => s + (t.importo || 0), 0);
      const wUscite = txs.filter(t => t.tipo === "uscita").reduce((s, t) => s + (t.importo || 0), 0);
      const wLabor = yearAttendance
        .filter(a => a.cantiere_id === w.id)
        .reduce((s, a) => {
          return s + (a.presenze || []).reduce((s2, p) => {
            const emp = employees.find(e => e.id === p.dipendente_id);
            return s2 + (p.ore || 0) * (emp?.costo_orario || 0);
          }, 0);
        }, 0);
      const wMargine = wEntrate - wUscite - wLabor;
      return { ...w, entrate: wEntrate, uscite: wUscite, labor: wLabor, margine: wMargine };
    }).filter(w => w.entrate > 0 || w.uscite > 0 || w.labor > 0);

    const inAttivo = worksiteBreakdown.filter(w => w.margine >= 0);
    const inPerdita = worksiteBreakdown.filter(w => w.margine < 0);

    return {
      entrate, uscite, laborCost, margine, incassato,
      lavoriCount: worksiteBreakdown.length,
      preventiviCount: yearQuotes.length,
      preventiviApprovati: yearQuotes.filter(q => q.stato === "approvato").length,
      inAttivo, inPerdita,
      worksiteBreakdown: worksiteBreakdown.sort((a, b) => b.margine - a.margine),
    };
  }, [transactions, payments, quotes, attendance, employees, worksites, anno]);

  const handleExport = async () => {
    const jsPDF = (await import("jspdf")).default;
    const doc = new jsPDF();
    const profiles = await db.CompanyProfile.list();
    const profile = profiles[0];
    const pageWidth = 210, pageHeight = 297, margin = 15;
    let { y, color } = addCompanyHeader(doc, profile, pageWidth, margin);

    doc.setFontSize(16); doc.setFont(undefined, "bold");
    doc.text(`Report Annuale ${anno}`, margin, y);
    y += 10;

    // Summary box
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, pageWidth - margin * 2, 28, "F");
    doc.setFontSize(9); doc.setFont(undefined, "bold");
    doc.text("Riepilogo Economico", margin + 4, y + 6);
    doc.setFont(undefined, "normal");

    const rows = [
      ["Totale entrate", formatEuro(yearData.entrate), "text-emerald-600"],
      ["Totale uscite", formatEuro(yearData.uscite), "text-red-600"],
      ["Costo manodopera", formatEuro(yearData.laborCost), "text-red-600"],
      ["Margine complessivo", formatEuro(yearData.margine), yearData.margine >= 0 ? "text-emerald-600" : "text-red-600"],
      ["Totale incassato (pagamenti)", formatEuro(yearData.incassato), "text-brand-600"],
    ];
    rows.forEach((r, i) => {
      doc.text(r[0], margin + 4, y + 12 + i * 4);
      doc.text(r[1], pageWidth - margin - 4, y + 12 + i * 4, { align: "right" });
    });
    y += 34;

    // Worksites table
    if (y > pageHeight - 30) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont(undefined, "bold");
    doc.text(`Lavori (${yearData.lavoriCount})`, margin, y);
    y += 6;
    doc.setFontSize(8); doc.setFont(undefined, "bold");
    doc.setFillColor(color.r, color.g, color.b);
    doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.text("Lavoro", margin + 2, y + 5);
    doc.text("Entrate", 110, y + 5, { align: "right" });
    doc.text("Uscite", 135, y + 5, { align: "right" });
    doc.text("Manod.", 160, y + 5, { align: "right" });
    doc.text("Margine", pageWidth - margin - 2, y + 5, { align: "right" });
    y += 10;

    doc.setFont(undefined, "normal"); doc.setTextColor(0, 0, 0);
    yearData.worksiteBreakdown.forEach(w => {
      if (y > pageHeight - 20) { doc.addPage(); y = 20; }
      doc.text((w.nome || "").substring(0, 35), margin + 2, y);
      doc.text(formatEuro(w.entrate), 110, y, { align: "right" });
      doc.text(formatEuro(w.uscite), 135, y, { align: "right" });
      doc.text(formatEuro(w.labor), 160, y, { align: "right" });
      doc.text(formatEuro(w.margine), pageWidth - margin - 2, y, { align: "right" });
      y += 6;
    });

    y += 6;
    if (y > pageHeight - 20) { doc.addPage(); y = 20; }
    doc.setFont(undefined, "bold"); doc.setFontSize(9);
    doc.text(`Lavori in attivo: ${yearData.inAttivo.length}`, margin, y);
    doc.text(`Lavori in perdita: ${yearData.inPerdita.length}`, margin + 80, y);

    addFooter(doc, profile, pageWidth, pageHeight, margin);
    doc.save(`Report_Annuale_${anno}.pdf`);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {!embedded && <PageHeader title="Report di Fine Anno" subtitle="Riepilogo annuale dell'attività, esportabile" />}

      <div className="flex items-center gap-3 mb-6">
        <Select value={String(anno)} onValueChange={v => setAnno(parseInt(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{[0,1,2].map(i => { const y = new Date().getFullYear() - i; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}</SelectContent>
        </Select>
        <Button onClick={handleExport} variant="outline" className="gap-2 ml-auto">
          <FileDown className="w-4 h-4" /> Esporta PDF
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-6">
          <TrendingUp className="w-5 h-5 text-emerald-600 mb-2" />
          <p className="text-xl font-bold text-emerald-600">{formatEuro(yearData.entrate)}</p>
          <p className="text-xs text-slate-500">Totale entrate</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <TrendingDown className="w-5 h-5 text-red-600 mb-2" />
          <p className="text-xl font-bold text-red-600">{formatEuro(yearData.uscite + yearData.laborCost)}</p>
          <p className="text-xs text-slate-500">Totale uscite + manodopera</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <Wallet className={`w-5 h-5 mb-2 ${yearData.margine >= 0 ? "text-emerald-600" : "text-red-600"}`} />
          <p className={`text-xl font-bold ${yearData.margine >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatEuro(yearData.margine)}</p>
          <p className="text-xs text-slate-500">Margine complessivo</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <Briefcase className="w-5 h-5 text-brand-600 mb-2" />
          <p className="text-xl font-bold text-slate-900">{yearData.lavoriCount}</p>
          <p className="text-xs text-slate-500">Lavori nell'anno</p>
        </CardContent></Card>
      </div>

      {/* Profit/Loss summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-semibold text-emerald-800">Lavori in attivo ({yearData.inAttivo.length})</h3>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {yearData.inAttivo.map(w => (
              <Link key={w.id} to={`/lavori/${w.id}`} className="flex justify-between text-sm p-1.5 rounded hover:bg-emerald-100">
                <span className="text-slate-700 truncate">{w.nome}</span>
                <span className="font-medium text-emerald-600">+{formatEuro(w.margine)}</span>
              </Link>
            ))}
            {yearData.inAttivo.length === 0 && <p className="text-sm text-emerald-600">Nessun lavoro in attivo</p>}
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-5 h-5 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">Lavori in perdita ({yearData.inPerdita.length})</h3>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {yearData.inPerdita.map(w => (
              <Link key={w.id} to={`/lavori/${w.id}`} className="flex justify-between text-sm p-1.5 rounded hover:bg-red-100">
                <span className="text-slate-700 truncate">{w.nome}</span>
                <span className="font-medium text-red-600">{formatEuro(w.margine)}</span>
              </Link>
            ))}
            {yearData.inPerdita.length === 0 && <p className="text-sm text-red-600">Nessun lavoro in perdita</p>}
          </div>
        </div>
      </div>

      {/* Detailed table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Lavoro</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3 hidden sm:table-cell">Entrate</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3 hidden md:table-cell">Uscite</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3 hidden md:table-cell">Manod.</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3">Margine</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {yearData.worksiteBreakdown.map(w => (
              <tr key={w.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{w.nome}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-600 hidden sm:table-cell">{formatEuro(w.entrate)}</td>
                <td className="px-4 py-3 text-sm text-right text-red-600 hidden md:table-cell">{formatEuro(w.uscite)}</td>
                <td className="px-4 py-3 text-sm text-right text-orange-600 hidden md:table-cell">{formatEuro(w.labor)}</td>
                <td className={`px-4 py-3 text-sm font-bold text-right ${w.margine >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatEuro(w.margine)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}