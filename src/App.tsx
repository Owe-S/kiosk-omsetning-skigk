import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Plus, 
  Trash2, 
  Download,
  Table as TableIcon,
  ChevronRight,
  History,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ZReportData, ZReportLine, MappingEntry } from './types';
import { DEFAULT_VARE_MAPPING } from './constants';
import { processZReportImage } from './services/geminiService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'details' | 'mappings' | 'history' | 'reports'>('dashboard');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [reportData, setReportData] = useState<ZReportData | null>(null);
  const [history, setHistory] = useState<ZReportData[]>([]);
  const [mappings, setMappings] = useState<MappingEntry[]>(() => {
    const saved = localStorage.getItem('kiosk_mappings');
    return saved ? JSON.parse(saved) : DEFAULT_VARE_MAPPING;
  });

  // Save mappings whenever they change
  useEffect(() => {
    localStorage.setItem('kiosk_mappings', JSON.stringify(mappings));
  }, [mappings]);

  const [error, setError] = useState<string | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [ansattName, setAnsattName] = useState('');
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
  const [isKioskAuthenticated, setIsKioskAuthenticated] = useState(false);
  const [kioskUser, setKioskUser] = useState<{ phone: string, name: string } | null>(null);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSavingToSheets, setIsSavingToSheets] = useState(false);
  const [lastSpreadsheetId, setLastSpreadsheetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAuth();
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsGoogleAuthenticated(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsGoogleAuthenticated(data.isAuthenticated && !data.isKioskUser);
      setIsKioskAuthenticated(data.isKioskUser);
      if (data.isKioskUser) {
        setKioskUser(data.user);
        setAnsattName(data.user.name);
      }
    } catch (err) {
      console.error("Auth check failed:", err);
    }
  };

  const handleMobileLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login-mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setIsKioskAuthenticated(true);
        setKioskUser(data.user);
        setAnsattName(data.user.name);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Kunne ikke logge inn. Prï¿½v igjen senere.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleConnect = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (err) {
      console.error("Failed to get auth URL:", err);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsGoogleAuthenticated(false);
      setIsKioskAuthenticated(false);
      setKioskUser(null);
      setLastSpreadsheetId(null);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleSaveToSheets = async () => {
    if (!reportData || (!isGoogleAuthenticated && !isKioskAuthenticated)) return;
    setIsSavingToSheets(true);
    try {
      const res = await fetch('/api/sheets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportData })
      });
      const data = await res.json();
      if (res.ok) {
        setLastSpreadsheetId(data.spreadsheetId);
        alert("Lagret til Google Sheets!");
      } else {
        alert("Feil ved lagring: " + data.error);
      }
    } catch (err) {
      console.error("Save to sheets failed:", err);
      alert("Kunne ikke lagre til Google Sheets.");
    } finally {
      setIsSavingToSheets(false);
    }
  };

  const handleTripletexExport = () => {
    if (!reportData) return;
    // Tripletex standard CSV format: Dato, Konto, Belï¿½p, MVA-kode, Beskrivelse
    const headers = ["Dato", "Konto", "Belï¿½p", "MVA-kode", "Beskrivelse"];
    const rows = reportData.linjer.map(l => [
      reportData.dato,
      l.konto,
      l.beloep,
      l.mvaKode,
      `${l.varenavn} (${l.antall} stk)`
    ]);
    
    // Add payments
    reportData.betalinger.forEach(p => {
      rows.push([
        reportData.dato,
        p.konto,
        -p.beloep, // Negative for balancing
        "",
        `Betaling: ${p.type}`
      ]);
    });

    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Tripletex_Import_${reportData.dato}.csv`);
    link.click();
  };

  // Aggregation logic for reports
  const getAggregatedData = (view: 'daily' | 'monthly') => {
    const aggregated: Record<string, { 
      items: Record<string, { antall: number, beloep: number, kategori: string }>,
      categories: Record<string, { antall: number, beloep: number }>,
      totalBeloep: number,
      totalAntall: number
    }> = {};

    history.forEach(report => {
      const key = view === 'daily' ? report.dato : report.dato.substring(0, 7); // YYYY-MM
      
      if (!aggregated[key]) {
        aggregated[key] = { items: {}, categories: {}, totalBeloep: 0, totalAntall: 0 };
      }

      report.linjer.forEach(line => {
        // Item aggregation
        if (!aggregated[key].items[line.varenavn]) {
          aggregated[key].items[line.varenavn] = { antall: 0, beloep: 0, kategori: line.varegruppe };
        }
        aggregated[key].items[line.varenavn].antall += line.antall;
        aggregated[key].items[line.varenavn].beloep += line.beloep;

        // Category aggregation
        if (!aggregated[key].categories[line.varegruppe]) {
          aggregated[key].categories[line.varegruppe] = { antall: 0, beloep: 0 };
        }
        aggregated[key].categories[line.varegruppe].antall += line.antall;
        aggregated[key].categories[line.varegruppe].beloep += line.beloep;

        aggregated[key].totalBeloep += line.beloep;
        aggregated[key].totalAntall += line.antall;
      });
    });

    return Object.entries(aggregated).sort((a, b) => b[0].localeCompare(a[0]));
  };

  const [selectedReportPeriod, setSelectedReportPeriod] = useState<string>('');

  useEffect(() => {
    if (selectedReportPeriod === '' && history.length > 0) {
      setSelectedReportPeriod(`daily-${history[0].dato}`);
    }
  }, [history, selectedReportPeriod]);

  const [reportView, setReportView] = useState<'daily' | 'monthly'>('monthly');
  const aggregatedData = getAggregatedData(reportView);
  
  const dailyOptions = getAggregatedData('daily');
  const monthlyOptions = getAggregatedData('monthly');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setError(null);
    const newImages: string[] = [];
    let loadedCount = 0;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push(reader.result as string);
        loadedCount++;
        if (loadedCount === files.length) {
          setSelectedImages(prev => [...prev, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const startAnalysis = async () => {
    if (selectedImages.length === 0) return;

    setIsUploading(true);
    setError(null);
    try {
      const data = await processZReportImage(selectedImages);
      const dataWithAnsatt = { ...data, ansatt: ansattName || "Ukjent" };
      setReportData(dataWithAnsatt);
      setHistory(prev => [dataWithAnsatt, ...prev]);
      setActiveTab('details');
      setSelectedImages([]);
    } catch (err) {
      console.error("Error processing images:", err);
      setError("Kunne ikke analysere bildene. Vennligst prï¿½v igjen med tydeligere bilder.");
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const deleteReport = (dato: string) => {
    setHistory(prev => prev.filter(r => r.dato !== dato));
    setReportData(null);
    setActiveTab('dashboard');
  };

  const updateLine = (idx: number, field: keyof ZReportLine, value: any) => {
    if (!reportData) return;
    const newLinjer = [...reportData.linjer];
    newLinjer[idx] = { ...newLinjer[idx], [field]: value };
    
    // Recalculate totals
    const totalSalg = newLinjer.reduce((acc, l) => acc + l.beloep, 0);
    const differanse = reportData.totalBetaling - totalSalg;
    
    const updatedReport = { 
      ...reportData, 
      linjer: newLinjer, 
      totalSalg,
      differanse,
      status: differanse === 0 ? 'ok' : 'warning' as const
    };
    
    setReportData(updatedReport);
    setHistory(prev => prev.map(r => r.dato === reportData.dato ? updatedReport : r));
  };

  const updateLineArray = (newLinjer: ZReportLine[]) => {
    if (!reportData) return;
    const totalSalg = newLinjer.reduce((acc, l) => acc + l.beloep, 0);
    const differanse = reportData.totalBetaling - totalSalg;

    const updatedReport = { 
      ...reportData, 
      linjer: newLinjer, 
      totalSalg,
      differanse,
      status: differanse === 0 ? 'ok' : 'warning' as const
    };
    
    setReportData(updatedReport);
    setHistory(prev => prev.map(r => r.dato === reportData.dato ? updatedReport : r));
  };

  const exportToCSV = () => {
    if (!reportData) return;
    const headers = ["Dato", "Varenavn", "Antall", "Belï¿½p", "Varegruppe", "Konto", "MVA-kode"];
    const rows = reportData.linjer.map(l => [
      reportData.dato,
      l.varenavn,
      l.antall,
      l.beloep,
      l.varegruppe,
      l.konto,
      l.mvaKode
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Z-rapport-${reportData.dato}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isGoogleAuthenticated && !isKioskAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-200 mx-auto mb-6">
              <FileText size={32} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight">
              Oppgjï¿½r - Kiosken,<br />Ski Golfklubb
            </h1>
            <p className="mt-2 text-slate-500">Logg inn for ï¿½ starte dagsoppgjï¿½ret</p>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
            <div className="space-y-4">
              <button 
                onClick={handleGoogleConnect}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" referrerPolicy="no-referrer" />
                Logg inn med Google (Admin)
              </button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400 font-bold tracking-widest">Eller</span></div>
              </div>

              <form onSubmit={handleMobileLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Mobilnummer</label>
                  <input 
                    type="tel" 
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="Ditt mobil nummer"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Passord</label>
                  <input 
                    type="password" 
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Ditt passord!"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    required
                  />
                </div>
                {error && <p className="text-red-600 text-xs font-medium">{error}</p>}
                <button 
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                >
                  {isLoggingIn ? <Loader2 size={20} className="animate-spin" /> : "Logg inn som ansatt"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar / Top Nav */}
        <div className="fixed left-0 top-0 w-full md:h-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col md:gap-8 z-20">
          <div className="flex items-center justify-between p-4 md:p-6 pb-2 md:pb-6">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 shrink-0">
                <FileText className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <h1 className="font-bold text-lg md:text-xl tracking-tight leading-none">Ski Golf<span className="text-emerald-600 hidden md:inline">Kassa</span></h1>
            </div>
            
            {/* Mobile Right Icons */}
            <div className="flex md:hidden items-center gap-3">
               <div className="flex items-center justify-center px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full font-semibold text-xs gap-1">
                 <CheckCircle2 size={14} />
                 <span>v2.5</span>
               </div>
               {(isGoogleAuthenticated || isKioskAuthenticated) && (
                 <button onClick={handleGoogleLogout} className="p-2 text-red-600 bg-red-50 rounded-full" aria-label="Logg ut">
                   <LogOut size={16} />
                 </button>
               )}
            </div>
          </div>
  
          <nav className="flex flex-row md:flex-col gap-1 md:gap-2 px-4 md:px-6 pb-3 md:pb-0 overflow-x-auto no-scrollbar items-center md:items-stretch">
            <NavItem 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
              icon={<Upload size={20} className="md:w-5 md:h-5 w-4 h-4" />}
              label="Dashboard"
            />
            <NavItem 
              active={activeTab === 'details'} 
              onClick={() => setActiveTab('details')}
              icon={<TableIcon size={20} className="md:w-5 md:h-5 w-4 h-4" />}
              label="Dagsoppgjï¿½r"
            />
            <NavItem 
              active={activeTab === 'history'} 
              onClick={() => setActiveTab('history')}
              icon={<History size={20} className="md:w-5 md:h-5 w-4 h-4" />}
              label="Historikk"
            />
            <NavItem 
              active={activeTab === 'reports'} 
              onClick={() => setActiveTab('reports')}
              icon={<Download size={20} className="md:w-5 md:h-5 w-4 h-4" />}
              label="Rapporter"
            />
            {isGoogleAuthenticated && (
              <NavItem 
                active={activeTab === 'mappings'} 
                onClick={() => setActiveTab('mappings')}
                icon={<Settings size={20} className="md:w-5 md:h-5 w-4 h-4" />}
                label="Mappinger"
              />
            )}
          </nav>
  
          <div className="mt-auto hidden md:flex flex-col gap-4 p-6 pt-0">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Status</p>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <CheckCircle2 size={16} />
                  <span>Systemet er klart</span>
                </div>
                <p className="text-[10px] text-slate-400 text-right mt-1 font-mono">v2.5</p>
              </div>
            </div>
  
            {(isGoogleAuthenticated || isKioskAuthenticated) && (
              <button 
                onClick={handleGoogleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm"
              >
                <LogOut size={18} />
                Ferdig for i dag / Logg ut
              </button>
            )}
          </div>
        </div>
  
        {/* Main Content */}
        <main className="md:pl-64 pt-[120px] md:pt-0 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight mb-2">Velkommen tilbake</h2>
                    <p className="text-slate-500">Last opp Z-rapport og bankterminal-avstemming for ï¿½ starte importen.</p>
                  </div>
                  <div className="flex gap-3">
                    {isKioskAuthenticated ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-semibold border border-emerald-100">
                          <CheckCircle2 size={18} />
                          Logget inn som {kioskUser?.name}
                        </div>
                        <button 
                          onClick={handleGoogleLogout}
                          className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Logg ut"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ) : !isGoogleAuthenticated ? (
                      <button 
                        onClick={handleGoogleConnect}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl font-semibold hover:bg-rose-100 transition-colors shadow-sm"
                      >
                        <AlertCircle size={18} />
                        Koble til Google Sheets
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-semibold border border-emerald-100">
                          <CheckCircle2 size={18} />
                          Google Sheets tilkoblet (Admin)
                        </div>
                        <button 
                          onClick={handleGoogleLogout}
                          className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Logg ut av Google"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider">Hvem gjï¿½r oppgjï¿½ret?</label>
                    <input 
                      type="text" 
                      value={ansattName}
                      onChange={(e) => setAnsattName(e.target.value)}
                      placeholder="Skriv navnet ditt her..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    />
                  </div>

                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`hidden md:flex group relative ${selectedImages.length > 0 ? 'h-48' : 'h-96'} border-2 border-dashed border-slate-200 rounded-3xl bg-white flex-col items-center justify-center gap-4 cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-all duration-300`}
                  >
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                      <Plus size={24} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-lg mb-1">Legg til bilder</p>
                      <p className="text-slate-500 text-sm">Du kan velge flere bilder samtidig (Z-rapport + Bankterminal)</p>
                    </div>
                  </div>

                  {/* Mobile Button format for Legg til bilder */}
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className={`md:hidden flex w-full py-4 ${selectedImages.length === 0 ? 'bg-white border-2 border-emerald-600 text-emerald-600' : 'bg-slate-50 border-2 border-dashed border-slate-300 text-slate-500'} rounded-2xl font-bold text-lg hover:bg-emerald-50 transition-all items-center justify-center gap-3`}
                  >
                    <Plus size={24} />
                    <span>{selectedImages.length > 0 ? "Legg til flere bilder" : "Legg til bilder"}</span>
                  </button>

                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    accept="image/*"
                    multiple
                  />

                  {selectedImages.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {selectedImages.map((img, idx) => (
                        <div key={idx} className="relative group aspect-[3/4] rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
                          <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <button 
                            onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex gap-3 text-red-800">
                      <AlertCircle size={20} className="shrink-0" />
                      <p className="text-sm font-medium">{error}</p>
                    </div>
                  )}

                  <button 
                    onClick={startAnalysis}
                    disabled={selectedImages.length === 0 || isUploading}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-3"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={24} className="animate-spin" />
                        <span>Analyserer {selectedImages.length} bilder...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={24} />
                        <span>Start Analyse</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                  <StatCard 
                    title="Importerte rapporter" 
                    value={history.length.toString()} 
                    unit="stk" 
                  />
                  <StatCard 
                    title="Total omsetning" 
                    value={history.reduce((acc, r) => acc + r.totalSalg, 0).toLocaleString('no-NO')} 
                    unit="kr" 
                  />
                  <StatCard 
                    title="Gjennomsnittlig salg" 
                    value={history.length > 0 ? (history.reduce((acc, r) => acc + r.totalSalg, 0) / history.length).toLocaleString('no-NO', { maximumFractionDigits: 0 }) : "0"} 
                    unit="kr" 
                  />
                </div>
              </motion.div>
            )}

            {activeTab === 'details' && (
              <motion.div 
                key="details"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {reportData ? (
                  <>
                    <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-2xl font-bold tracking-tight">Rapport: {reportData.dato}</h2>
                          <StatusBadge status={reportData.status} />
                        </div>
                        <p className="text-slate-500 text-sm">Analysert og mappet mot Tripletex-kontoer</p>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setShowImages(!showImages)}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                        >
                          <FileText size={18} />
                          {showImages ? 'Skjul Bilder' : 'Vis Bilder'}
                        </button>
                        <button 
                          onClick={exportToCSV}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                        >
                          <Download size={18} />
                          Eksporter CSV
                        </button>
                        <button 
                          onClick={() => deleteReport(reportData.dato)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl font-semibold hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={18} />
                          Slett Rapport
                        </button>
                        <button 
                          onClick={handleTripletexExport}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                        >
                          <Download size={18} />
                          Tripletex Eksport
                        </button>
                        <button 
                          onClick={handleSaveToSheets}
                          disabled={(!isGoogleAuthenticated && !isKioskAuthenticated) || isSavingToSheets}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-100"
                        >
                          {isSavingToSheets ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={18} />
                          )}
                          Godkjenn Z-rapport
                        </button>
                      </div>
                    </div>

                    {lastSpreadsheetId && (
                      <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3 text-emerald-800">
                          <FileText size={20} />
                          <span className="font-medium text-sm">Rapporten er godkjent og lagret!</span>
                        </div>
                        <a 
                          href={`https://docs.google.com/spreadsheets/d/${lastSpreadsheetId}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-emerald-700 font-bold text-sm hover:underline flex items-center gap-1"
                        >
                          ï¿½pne regneark <ChevronRight size={16} />
                        </a>
                      </div>
                    )}

                    {showImages && reportData.bilder && (
                      <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                        {reportData.bilder.map((img, i) => (
                          <div key={i} className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                            <img src={img} className="w-full rounded-xl" referrerPolicy="no-referrer" />
                          </div>
                        ))}
                      </div>
                    )}

                    {reportData.meldinger.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3">
                        <AlertCircle className="text-amber-600 shrink-0" size={20} />
                        <ul className="text-sm text-amber-800 space-y-1">
                          {reportData.meldinger.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-6">
                      <SummaryBox label="Total Salg" value={reportData.totalSalg} />
                      <SummaryBox label="Total Betaling" value={reportData.totalBetaling} />
                      <SummaryBox label="Differanse" value={reportData.differanse} color={reportData.differanse !== 0 ? 'text-red-600' : 'text-emerald-600'} />
                      <SummaryBox label="MVA Totalt" value={reportData.mvaGrupper.reduce((acc, g) => acc + g.mva, 0)} />
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-700">Varelinjer (Drift)</h3>
                      </div>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                            <th className="px-6 py-4">Varenavn</th>
                            <th className="px-6 py-4">Antall</th>
                            <th className="px-6 py-4">Belï¿½p</th>
                            <th className="px-6 py-4">Konto</th>
                            <th className="px-6 py-4">MVA</th>
                            <th className="px-6 py-4">Kategori</th><th className="px-6 py-4"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {reportData.linjer.map((line, i) => (
                            <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-6 py-4">
                                <input 
                                  type="text" 
                                  value={line.varenavn}
                                  onChange={(e) => updateLine(i, 'varenavn', e.target.value)}
                                  disabled={!!lastSpreadsheetId}
                                  className="w-full px-2 py-1 font-medium border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded outline-none transition-all bg-transparent disabled:opacity-75 disabled:hover:border-transparent"
                                />
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                  type="number" 
                                  value={line.antall}
                                  onChange={(e) => updateLine(i, 'antall', parseInt(e.target.value) || 0)}
                                  disabled={!!lastSpreadsheetId}
                                  className="w-16 px-2 py-1 border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded outline-none transition-all bg-transparent disabled:opacity-75 disabled:hover:border-transparent"
                                />
                              </td>
                              <td className="px-6 py-4 font-semibold">
                                <div className="flex items-center gap-1">
                                  <input 
                                    type="number" 
                                    value={line.beloep}
                                    onChange={(e) => updateLine(i, 'beloep', parseInt(e.target.value) || 0)}
                                    disabled={!!lastSpreadsheetId}
                                    className="w-24 px-2 py-1 border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded outline-none transition-all bg-transparent font-semibold disabled:opacity-75 disabled:hover:border-transparent"
                                  />
                                  <span>kr</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                  type="text" 
                                  value={line.konto}
                                  onChange={(e) => updateLine(i, 'konto', e.target.value)}
                                  disabled={!!lastSpreadsheetId}
                                  className="w-20 px-2 py-1 font-mono text-slate-500 text-sm border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded outline-none transition-all bg-transparent disabled:opacity-75 disabled:hover:border-transparent"
                                />
                              </td>
                              <td className="px-6 py-4">
                                <select 
                                  value={line.mvaKode}
                                  onChange={(e) => updateLine(i, 'mvaKode', e.target.value)}
                                  disabled={!!lastSpreadsheetId}
                                  className="text-sm bg-transparent border border-transparent hover:border-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded px-2 py-1 text-slate-600 transition-all disabled:opacity-75 disabled:hover:border-transparent disabled:appearance-none"
                                >
                                  <option value="Ingen">Ingen</option>
                                  <option value="15% (Kode 31)">15% (Kode 31)</option>
                                  <option value="25% (Kode 3)">25% (Kode 3)</option>
                                </select>
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                  type="text" 
                                  value={line.varegruppe}
                                  onChange={(e) => updateLine(i, 'varegruppe', e.target.value)}
                                  disabled={!!lastSpreadsheetId}
                                  className="w-24 px-2 py-1 bg-slate-100 rounded-md text-xs font-bold text-slate-600 uppercase border border-transparent hover:border-slate-300 focus:border-emerald-500 focus:bg-white outline-none transition-all disabled:opacity-75 disabled:hover:border-transparent"
                                />
                              </td>
                              <td className="px-6 py-4 text-right">
                                {!lastSpreadsheetId && (
                                  <button 
                                    onClick={() => {
                                      const newLine = [...reportData.linjer];
                                      newLine.splice(i, 1);
                                      updateLineArray(newLine);
                                    }}
                                    className="p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                    title="Slett varelinje"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!lastSpreadsheetId && (
                        <div className="p-2 border-t border-slate-100 bg-slate-50/50 flex justify-center">
                          <button 
                            onClick={() => {
                              const newLinjer = [...reportData.linjer, { varenavn: "Ny varelinje", antall: 1, beloep: 0, varegruppe: "Diverse", konto: "3000", mvaKode: "25% (Kode 3)", dato: reportData.dato }];
                              updateLineArray(newLinjer);
                            }}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 border-dashed"
                          >
                            <Plus size={16} />
                            Legg til varelinje
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                          <h3 className="font-bold text-slate-700">Betalinger</h3>
                        </div>
                        <table className="w-full text-left">
                          <tbody className="divide-y divide-slate-50">
                            {reportData.betalinger.map((p, i) => (
                              <tr key={i}>
                                <td className="px-6 py-3 font-medium">{p.type}</td>
                                <td className="px-6 py-3 text-right font-bold">{p.beloep.toLocaleString('no-NO')} kr</td>
                                <td className="px-6 py-3 text-slate-400 text-sm font-mono">{p.konto}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                          <h3 className="font-bold text-slate-700">MVA Oppsummering</h3>
                        </div>
                        <table className="w-full text-left">
                          <tbody className="divide-y divide-slate-50">
                            {reportData.mvaGrupper.map((g, i) => (
                              <tr key={i}>
                                <td className="px-6 py-3 font-medium">{g.navn}</td>
                                <td className="px-6 py-3 text-right text-slate-500">Salg: {g.salg.toLocaleString('no-NO')}</td>
                                <td className="px-6 py-3 text-right font-bold">MVA: {g.mva}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-4">
                    <FileText size={48} className="opacity-20" />
                    <p>Ingen rapport valgt. Last opp en ny pï¿½ Dashboard.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center flex-wrap gap-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Omsetningsrapport</h2>
                    <p className="text-slate-500">Oversikt over salg per vare og kategori.</p>
                  </div>
                  <div className="w-full sm:w-auto">
                    <select 
                      value={selectedReportPeriod}
                      onChange={(e) => setSelectedReportPeriod(e.target.value)}
                      className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 bg-white"
                    >
                      <option disabled value="">Velg dato / mï¿½ned...</option>
                      <optgroup label="Mï¿½nedlig">
                        {monthlyOptions.map(([p]) => (
                          <option key={`monthly-${p}`} value={`monthly-${p}`}>{p}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Daglig">
                        {dailyOptions.map(([p]) => (
                          <option key={`daily-${p}`} value={`daily-${p}`}>{p}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                {(() => {
                  const isDaily = selectedReportPeriod.startsWith('daily-');
                  const dateKey = selectedReportPeriod.replace('daily-', '').replace('monthly-', '');
                  const currentOptions = isDaily ? dailyOptions : monthlyOptions;
                  const filtered = currentOptions.filter(([p]) => p === dateKey);

                  return filtered.length > 0 ? filtered.map(([period, data]) => (
                  <div key={period} className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-slate-200"></div>
                      <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">{isDaily ? 'Daglig: ' : 'Mï¿½nedlig: '}{period}</span>
                      <div className="h-px flex-1 bg-slate-200"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                          <h3 className="font-bold text-slate-700">Salg per Vare</h3>
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                            Total: {data.totalBeloep.toLocaleString('no-NO')} kr
                          </span>
                        </div>
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                              <th className="px-6 py-3">Vare</th>
                              <th className="px-6 py-3 text-right">Stykk</th>
                              <th className="px-6 py-3 text-right">Sum</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {Object.entries(data.items).map(([name, stats]) => (
                              <tr key={name}>
                                <td className="px-6 py-3">
                                  <p className="font-medium text-sm">{name}</p>
                                  <p className="text-[10px] text-slate-400 uppercase">{stats.kategori}</p>
                                </td>
                                <td className="px-6 py-3 text-right font-mono text-sm">{stats.antall}</td>
                                <td className="px-6 py-3 text-right font-bold text-sm">{stats.beloep.toLocaleString('no-NO')} kr</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm h-fit">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                          <h3 className="font-bold text-slate-700">Salg per Kategori</h3>
                        </div>
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                              <th className="px-6 py-3">Kategori</th>
                              <th className="px-6 py-3 text-right">Stykk</th>
                              <th className="px-6 py-3 text-right">Sum</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {Object.entries(data.categories).map(([cat, stats]) => (
                              <tr key={cat}>
                                <td className="px-6 py-3 font-medium text-sm">{cat}</td>
                                <td className="px-6 py-3 text-right font-mono text-sm">{stats.antall}</td>
                                <td className="px-6 py-3 text-right font-bold text-sm">{stats.beloep.toLocaleString('no-NO')} kr</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  )) : (
                  <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-4">
                    <Download size={48} className="opacity-20" />
                    <p>Ingen data tilgjengelig for rapportering ennï¿½.</p>
                  </div>
                  );
                })()}
              </motion.div>
            )}
            {activeTab === 'mappings' && isGoogleAuthenticated && (
              <motion.div 
                key="mappings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Mapping-regler</h2>
                    <p className="text-slate-500">Definer hvordan kassa-tekst oversettes til regnskapskontoer.</p>
                  </div>
                  <button className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors">
                    <Plus size={18} />
                    Ny Regel
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                        <th className="px-6 py-4">Tekst fra Kassa</th>
                        <th className="px-6 py-4">Kategori (Drift)</th>
                        <th className="px-6 py-4">Konto (Tripletex)</th>
                        <th className="px-6 py-4">MVA Kode</th>
                        <th className="px-6 py-4 text-right">Handlinger</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {mappings.map((m, i) => (
                        <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-3">
                            <input 
                              type="text" 
                              value={m.kassaTekst}
                              onChange={(e) => {
                                const newMappings = [...mappings];
                                newMappings[i].kassaTekst = e.target.value;
                                setMappings(newMappings);
                              }}
                              className="w-full px-2 py-1 font-medium border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded outline-none transition-all bg-transparent"
                              placeholder="f.eks. Kaffe"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <input 
                              type="text" 
                              value={m.driftskategori}
                              onChange={(e) => {
                                const newMappings = [...mappings];
                                newMappings[i].driftskategori = e.target.value;
                                setMappings(newMappings);
                              }}
                              className="w-full px-2 py-1 bg-slate-100 rounded-md text-xs font-bold text-slate-600 uppercase border border-transparent hover:border-slate-300 focus:border-emerald-500 focus:bg-white outline-none transition-all"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <input 
                              type="text" 
                              value={m.konto}
                              onChange={(e) => {
                                const newMappings = [...mappings];
                                newMappings[i].konto = e.target.value;
                                setMappings(newMappings);
                              }}
                              className="w-24 px-2 py-1 font-mono text-slate-500 text-sm border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded outline-none transition-all bg-transparent"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <select 
                              value={m.mva}
                              onChange={(e) => {
                                const newMappings = [...mappings];
                                newMappings[i].mva = e.target.value as "Ingen" | "12% (Kode 33)" | "15% (Kode 31)" | "25% (Kode 3)";
                                setMappings(newMappings);
                              }}
                              className="text-sm bg-transparent border border-transparent hover:border-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded px-2 py-1 text-slate-600 transition-all"
                            >
                              <option value="Ingen">Ingen</option>
                              <option value="12% (Kode 33)">12% (Kode 33)</option>
                              <option value="15% (Kode 31)">15% (Kode 31)</option>
                              <option value="25% (Kode 3)">25% (Kode 3)</option>
                            </select>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button 
                              onClick={() => {
                                const newMappings = [...mappings];
                                newMappings.splice(i, 1);
                                setMappings(newMappings);
                              }}
                              className="p-2 text-slate-300 hover:bg-red-50 hover:text-red-500 rounded-md transition-all opacity-0 group-hover:opacity-100"
                              title="Slett regel"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex justify-center">
                    <button 
                      onClick={() => setMappings([...mappings, { kassaTekst: "Ny Regel", driftskategori: "Mangler Kat.", konto: "3000", mva: "25% (Kode 3)" }])}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 border-dashed"
                    >
                      <Plus size={16} />
                      Legg til ny mapping-regel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold tracking-tight">Historikk</h2>
                <div className="grid gap-4">
                  {history.length > 0 ? history.map((item, i) => (
                    <div 
                      key={i} 
                      onClick={() => { setReportData(item); setActiveTab('details'); }}
                      className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between hover:border-emerald-500 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="font-bold">{item.dato}</p>
                          <p className="text-sm text-slate-500">{item.linjer.length} varelinjer ï¿½ {item.totalSalg.toLocaleString('no-NO')} kr</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <StatusBadge status={item.status} />
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteReport(item.dato); }}
                          className="p-2 text-slate-300 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                        <ChevronRight className="text-slate-300" />
                      </div>
                    </div>
                  )) : (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-4">
                      <History size={48} className="opacity-20" />
                      <p>Ingen historikk ennï¿½.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-lg md:rounded-xl font-semibold text-sm md:text-base transition-all duration-200 whitespace-nowrap shrink-0 ${
        active 
          ? 'bg-emerald-50 text-emerald-700 shadow-sm' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatCard({ title, value, unit, color = "text-slate-900" }: { title: string, value: string, unit: string, color?: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">{title}</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${color}`}>{value}</span>
        <span className="text-slate-400 font-medium">{unit}</span>
      </div>
    </div>
  );
}

function SummaryBox({ label, value, color = "text-slate-900" }: { label: string, value: number, color?: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value.toLocaleString('no-NO')} kr</p>
    </div>
  );
}

function StatusBadge({ status }: { status: 'ok' | 'warning' | 'error' }) {
  const configs = {
    ok: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Godkjent' },
    warning: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Sjekk pï¿½krevd' },
    error: { bg: 'bg-red-50', text: 'text-red-700', label: 'Feil i data' }
  };
  const config = configs[status];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}




