import React, { useState, useEffect } from 'react';
import { Loader2, Flower2, X, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';

interface PollenWidgetProps {
  onClose?: () => void;
}

export const PollenWidget: React.FC<PollenWidgetProps> = ({ onClose }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use Node-RED proxy to avoid CORS issues
  const NODERED_POLLEN_ENDPOINT = 'https://100.74.104.126:1881/pollen';
  const KMI_POLLEN_URL = 'https://www.meteo.be/nl/weer/verwachtingen/stuifmeelallergie-en-hooikoorts';

  const fetchPollenData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch via Node-RED proxy
      const response = await fetch(NODERED_POLLEN_ENDPOINT);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const html = await response.text();
      
      // The Node-RED proxy already extracts and returns the cleaned HTML
      // Just set it directly
      setHtmlContent(html);
      
    } catch (e: any) {
      console.error('Pollen fetch error:', e);
      setError(e.message || 'Fout bij ophalen van stuifmeel data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPollenData();
  }, []);

  return (
    <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 flex flex-col h-[1200px] overflow-hidden relative">
      {/* Header */}
      <div className="p-8 border-b border-gray-100 shrink-0 bg-gradient-to-r from-green-50 to-yellow-50">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center">
              <Flower2 size={28} className="text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                Stuifmeel Voorspelling
              </h2>
              <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mt-1">
                KMI • Sciensano
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={fetchPollenData}
              disabled={loading}
              className="w-12 h-12 bg-white hover:bg-green-50 text-green-600 rounded-2xl flex items-center justify-center transition-all border border-green-100 disabled:opacity-50"
              title="Ververs data"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <RefreshCw size={20} />
              )}
            </button>
            
            <a
              href={KMI_POLLEN_URL}
              target="_blank"
              rel="noreferrer"
              className="w-12 h-12 bg-white hover:bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center transition-all border border-blue-100"
              title="Open KMI website"
            >
              <ExternalLink size={20} />
            </a>
            
            {onClose && (
              <button
                onClick={onClose}
                className="w-12 h-12 bg-gray-900 hover:bg-black text-white rounded-2xl flex items-center justify-center transition-all shadow-lg"
                title="Sluiten"
              >
                <X size={24} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-white custom-touch-scrollbar">
        {loading && !htmlContent ? (
          <div className="h-full flex flex-col items-center justify-center gap-6">
            <Loader2 className="w-16 h-16 text-green-500 animate-spin" />
            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">
              Stuifmeel data laden...
            </p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-6 text-center p-8">
            <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center">
              <AlertCircle size={40} className="text-rose-500" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight mb-2">
                Fout bij laden
              </h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md">
                {error}
              </p>
              <button
                onClick={fetchPollenData}
                className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
              >
                Opnieuw proberen
              </button>
            </div>
          </div>
        ) : (
          <div 
            className="pollen-content prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
      </div>

      {/* Custom styles for the pollen content */}
      <style>{`
        /* Custom scrollbar styling */
        .custom-touch-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-touch-scrollbar::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 10px;
        }
        .custom-touch-scrollbar::-webkit-scrollbar-thumb {
          background: #10b981;
          border-radius: 10px;
        }
        .custom-touch-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #059669;
        }
        
        .pollen-content {
          font-family: 'Inter', sans-serif;
        }
        
        .pollen-content h2 {
          font-size: 1.5rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #1f2937;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #e5e7eb;
        }
        
        .pollen-content h3 {
          font-size: 1.125rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #374151;
          margin-top: 2rem;
          margin-bottom: 1rem;
        }
        
        .pollen-content p {
          color: #6b7280;
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        
        .pollen-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5rem 0;
          background: white;
          border-radius: 1rem;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .pollen-content table th {
          background: linear-gradient(to right, #10b981, #84cc16);
          color: white;
          padding: 1rem;
          text-align: left;
          font-weight: 900;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        
        .pollen-content table td {
          padding: 0.875rem 1rem;
          border-bottom: 1px solid #f3f4f6;
          color: #374151;
          font-weight: 600;
        }
        
        .pollen-content table tr:last-child td {
          border-bottom: none;
        }
        
        .pollen-content table tr:hover {
          background: #f9fafb;
        }
        
        .pollen-content img {
          max-width: 100%;
          height: auto;
          border-radius: 1rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          margin: 0.5rem 0;
          transition: transform 0.2s;
        }
        
        .pollen-content img:hover {
          transform: scale(1.02);
        }
        
        .pollen-content a {
          color: #10b981;
          font-weight: 700;
          text-decoration: none;
          transition: color 0.2s;
        }
        
        .pollen-content a:hover {
          color: #059669;
          text-decoration: underline;
        }
        
        .pollen-content .row {
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .pollen-content .row:last-child {
          border-bottom: none;
        }
        
        .pollen-content .row h3 {
          background: linear-gradient(to right, #10b981, #84cc16);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          font-size: 1.25rem;
          margin-bottom: 1rem;
        }
        
        .pollen-content .col-sm-3,
        .pollen-content .col-xs-6 {
          display: inline-block;
          width: 23%;
          margin: 0.5%;
          vertical-align: top;
        }
        
        @media (max-width: 768px) {
          .pollen-content .col-sm-3,
          .pollen-content .col-xs-6 {
            width: 48%;
          }
        }
        
        .pollen-content .table.clearfix {
          margin: 2rem 0;
        }
        
        .pollen-content .novalues td {
          vertical-align: middle;
        }
        
        .pollen-content strong {
          font-weight: 800;
          color: #1f2937;
        }
      `}</style>
    </div>
  );
};
