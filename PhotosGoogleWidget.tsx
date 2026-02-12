import React, { useState, useEffect } from 'react';
import { 
  Loader2, Image as ImageIcon, Plus, Download, Upload, 
  Trash2, X, Copy 
} from 'lucide-react';

interface GooglePhotosWidgetProps {
  accessToken: string | null;
  onForceLogout: () => void;
}

interface LogEntry {
  timestamp: string;
  msg: string;
  type: 'info' | 'error' | 'success';
}

// IndexedDB configuration
const DB_NAME = 'HubPhotosDB';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

// IndexedDB Helper Functions
const openPhotosDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('filename', 'filename', { unique: false });
      }
    };
  });
};

const savePhotoToIndexedDB = async (photo: any): Promise<void> => {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(photo);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getAllPhotosFromIndexedDB = async (): Promise<any[]> => {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const clearAllPhotosFromIndexedDB = async (): Promise<void> => {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const GooglePhotosWidget: React.FC<GooglePhotosWidgetProps> = ({ accessToken, onForceLogout }) => {
  const [photos, setPhotos] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [photosLogs, setPhotosLogs] = useState<LogEntry[]>([]);
  const [showPhotosLog, setShowPhotosLog] = useState(false);

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('nl-BE', { hour12: false });
    setPhotosLogs(prev => [...prev, { timestamp, msg, type }].slice(-100));
  };

  // Load photos from IndexedDB on mount
  useEffect(() => {
    const loadPhotos = async () => {
      try {
        const storedPhotos = await getAllPhotosFromIndexedDB();
        if (storedPhotos.length > 0) {
          addLog(`${storedPhotos.length} foto's geladen uit IndexedDB`, 'success');
          setPhotos(storedPhotos);
        }
      } catch (e: any) {
        addLog(`Fout bij laden: ${e.message}`, 'error');
      }
    };
    loadPhotos();
  }, []);

  const extractUri = (item: any) => {
    let uri = item.mediaFile?.servingUrl || 
           item.preview?.servingUrl || 
           item.mediaItem?.mediaFile?.servingUrl || 
           item.mediaItem?.preview?.servingUrl ||
           item.servingUrl ||
           item.baseUrl;
    
    return uri;
  };

  const extractFilename = (item: any) => {
    return item.mediaFile?.filename || 
           item.preview?.filename || 
           item.mediaItem?.mediaFile?.filename || 
           item.mediaItem?.preview?.filename ||
           item.filename || 
           "Foto";
  };

  const fetchImageAsBlobUrl = async (uri: string): Promise<{ blobUrl: string; blobData: string }> => {
    if (!accessToken) throw new Error("Geen access token");
    
    let finalUri = uri;
    if (uri.includes('googleusercontent.com') && !uri.includes('=')) {
      finalUri = uri + '=d';
    }
    
    const response = await fetch(finalUri, {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (blob.size < 100) throw new Error("Onvoldoende data in blob");
    
    const blobData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    const blobUrl = URL.createObjectURL(blob);
    return { blobUrl, blobData };
  };

  useEffect(() => {
    const regenerateBlobUrls = () => {
      if (photos.length === 0) return;
      
      const photosNeedingUrls = photos.filter(p => p.blobData && !p.blobUrl);
      if (photosNeedingUrls.length > 0) {
        addLog(`Bezig met regenereren van ${photosNeedingUrls.length} blob URLs...`, 'info');
        
        const updatedPhotos = photos.map(photo => {
          if (photo.blobData && !photo.blobUrl) {
            const blob = dataURLToBlob(photo.blobData);
            const blobUrl = URL.createObjectURL(blob);
            return { ...photo, blobUrl };
          }
          return photo;
        });
        
        setPhotos(updatedPhotos);
        addLog(`Blob URLs geregenereerd`, 'success');
      }
    };

    regenerateBlobUrls();
  }, [photos.length]);

  const dataURLToBlob = (dataURL: string): Blob => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const createPickerSession = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Starten van een nieuwe Google Photos Picker sessie...", 'info');
    try {
      const response = await fetch('https://photospicker.googleapis.com/v1/sessions', {
        method: 'POST',
        headers: { 
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ })
      });
      const data = await response.json();
      if (data.pickerUri) {
        addLog(`Picker sessie aangemaakt. ID: ${data.id}. URI: ${data.pickerUri}`, 'success');
        setIsPicking(true);
        const pickerWindow = window.open(data.pickerUri, '_blank');
        
        const pollTimer = setInterval(async () => {
          try {
            const checkResp = await fetch(`https://photospicker.googleapis.com/v1/sessions/${data.id}`, {
              headers: { Authorization: 'Bearer ' + accessToken }
            });
            const checkData = await checkResp.json();
            addLog(`Polling sessie ${data.id} - Status mediaItemsSet: ${checkData.mediaItemsSet}`, 'info');
            if (checkData.mediaItemsSet) {
              clearInterval(pollTimer);
              addLog("Gebruiker heeft foto's geselecteerd. Items ophalen...", 'success');
              await fetchSessionItems(data.id);
              if (pickerWindow) pickerWindow.close();
              setIsPicking(false);
            }
          } catch (e: any) {
            addLog(`Fout tijdens polling: ${e.message}`, 'error');
          }
        }, 3000);
      } else {
        addLog(`Kon pickerUri niet vinden in response.`, 'error');
      }
    } catch (e: any) {
      addLog(`Picker Session Error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionItems = async (sessionId: string) => {
    try {
      addLog(`Media items ophalen voor sessie: ${sessionId}`, 'info');
      const response = await fetch(`https://photospicker.googleapis.com/v1/mediaItems?sessionId=${sessionId}`, {
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      const data = await response.json();
      if (data.mediaItems && data.mediaItems.length > 0) {
        addLog(`${data.mediaItems.length} media items gevonden. Downloaden...`, 'info');

        const processedItems = await Promise.all(data.mediaItems.map(async (item: any) => {
          try {
            const uri = extractUri(item);
            if (!uri) throw new Error("Item heeft geen media URI");
            
            const filename = extractFilename(item);
            const { blobUrl, blobData } = await fetchImageAsBlobUrl(uri);
            
            const photoItem = { 
              ...item, 
              filename,
              blobUrl,
              blobData
            };
            
            await savePhotoToIndexedDB(photoItem);
            
            return photoItem;
          } catch (e: any) {
            addLog(`Download fout: ${e.message}`, 'error');
            return null;
          }
        }));

        const finalItems = processedItems.filter(item => item !== null);
        addLog(`${finalItems.length} foto's opgeslagen in IndexedDB`, 'success');
        
        const newPhotos = [...photos, ...finalItems];
        setPhotos(newPhotos);
      } else {
        addLog(`Geen media items gevonden in response of lijst is leeg.`, 'error');
      }
    } catch (e: any) {
      addLog(`Fetch Items Error: ${e.message}`, 'error');
    }
  };

  const clearSlideshow = async () => {
    addLog("Slideshow wissen...", 'info');
    photos.forEach(photo => {
      if (photo.blobUrl) URL.revokeObjectURL(photo.blobUrl);
    });
    setPhotos([]);
    setCurrentIndex(0);
    
    try {
      await clearAllPhotosFromIndexedDB();
      addLog("IndexedDB gewist", 'success');
    } catch (e: any) {
      addLog(`IndexedDB wissen fout: ${e.message}`, 'error');
    }
  };

  const downloadBackup = async () => {
    try {
      addLog("Backup voorbereiden...", 'info');
      
      const photosToBackup = photos.map(photo => ({
        ...photo,
        blobUrl: undefined // Don't include blob URLs in backup
      }));

      const backup = {
        version: 1,
        timestamp: new Date().toISOString(),
        photos: photosToBackup
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `photos-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addLog(`Backup van ${photosToBackup.length} foto's gedownload`, 'success');
    } catch (e: any) {
      addLog(`Backup fout: ${e.message}`, 'error');
    }
  };

  const restoreBackup = async (file: File) => {
    try {
      addLog("Backup herstellen...", 'info');
      
      const text = await file.text();
      const backup = JSON.parse(text);
      
      if (!backup.photos || !Array.isArray(backup.photos)) {
        throw new Error("Ongeldig backup formaat");
      }

      await clearAllPhotosFromIndexedDB();
      photos.forEach(photo => {
        if (photo.blobUrl) URL.revokeObjectURL(photo.blobUrl);
      });

      for (const photo of backup.photos) {
        await savePhotoToIndexedDB(photo);
      }

      const restoredPhotos = backup.photos.map((photo: any) => {
        if (photo.blobData) {
          const blob = dataURLToBlob(photo.blobData);
          const blobUrl = URL.createObjectURL(blob);
          return { ...photo, blobUrl };
        }
        return photo;
      });

      setPhotos(restoredPhotos);
      setCurrentIndex(0);
      
      addLog(`${backup.photos.length} foto's hersteld uit backup`, 'success');
    } catch (e: any) {
      addLog(`Restore fout: ${e.message}`, 'error');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      restoreBackup(file);
    }
  };

  useEffect(() => {
    if (photos.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length);
    }, 30000);
    return () => clearInterval(interval);
  }, [photos.length]);

  if (loading) return (
    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex flex-col h-[1200px] items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
      <p className="mt-4 text-xs font-black text-gray-400 uppercase tracking-widest">Sessie starten...</p>
    </div>
  );

  if (isPicking) return (
    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex flex-col h-[1200px] items-center justify-center text-center">
      <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
        <ImageIcon size={40} className="text-blue-400" />
      </div>
      <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-2">Foto's aan het kiezen...</h3>
      <p className="text-sm text-gray-500 mb-8 max-w-xs">Ga naar het geopende tabblad om foto's voor je slideshow te selecteren.</p>
      <div className="flex items-center gap-3 px-6 py-3 bg-blue-50 text-blue-600 rounded-full border border-blue-100">
         <Loader2 size={16} className="animate-spin" />
         <span className="text-[10px] font-black uppercase tracking-widest">Wachten op selectie</span>
      </div>
    </div>
  );

  if (photos.length === 0) return (
    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex flex-col h-[1200px] items-center justify-center text-center">
      <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mb-6">
        <ImageIcon size={32} className="text-gray-300" />
      </div>
      <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight mb-2">Slideshow Leeg</h3>
      <p className="text-sm text-gray-400 mb-10 max-w-xs">Gebruik de Google Photos Picker om foto's te kiezen of herstel een backup.</p>
      <div className="flex flex-col gap-4">
        <button onClick={createPickerSession} className="px-12 py-6 bg-indigo-600 text-white rounded-[2rem] text-[13px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-3">
          <Plus size={20} /> Foto's Kiezen
        </button>
        <label className="px-12 py-6 bg-gray-100 text-gray-700 rounded-[2rem] text-[13px] font-black uppercase tracking-[0.2em] hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer">
          <Upload size={20} /> Backup Herstellen
          <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>
    </div>
  );

  return (
    <div className="bg-black rounded-[3rem] shadow-sm border border-gray-100 flex flex-col h-[1200px] overflow-hidden relative group">
      <div className="absolute inset-0 rounded-[3rem] overflow-hidden">
        {photos.map((photo, idx) => {
            if (!photo.blobUrl) return null;
            
            return (
              <div 
                key={photo.id + idx} 
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
              >
                <img 
                  src={photo.blobUrl} 
                  alt={photo.filename || "Foto"} 
                  className="w-full h-full object-cover" 
                  onError={() => {
                    addLog(`Laadfout voor ${photo.filename || 'item'}`, 'error');
                  }}
                  onLoad={() => {
                    if (idx === currentIndex) addLog(`Zichtbaar: ${photo.filename || 'item'}`, 'success');
                  }}
                />
              </div>
            );
          })}
      </div>
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none z-20" />
      
      <div className="absolute top-10 right-10 flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity z-30">
        <button onClick={createPickerSession} className="h-14 px-6 bg-white/20 backdrop-blur-md rounded-2xl flex items-center gap-3 text-white hover:bg-white/40 transition-colors">
          <Plus size={18} /><span className="text-[10px] font-black uppercase tracking-widest">Toevoegen</span>
        </button>
        <button onClick={downloadBackup} title="Backup downloaden" className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-emerald-400 hover:bg-white/40 transition-colors">
          <Download size={18} />
        </button>
        <label title="Backup herstellen" className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-blue-400 hover:bg-white/40 transition-colors cursor-pointer">
          <Upload size={18} />
          <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
        </label>
        <button onClick={clearSlideshow} title="Slideshow wissen" className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-rose-400 hover:bg-white/40 transition-colors">
          <Trash2 size={18} />
        </button>
        <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white">
          <ImageIcon size={20} />
        </div>
      </div>

      <div className="absolute bottom-10 left-10 text-white flex flex-col gap-1 z-30">
        <button 
          onClick={() => setShowPhotosLog(true)}
          className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-opacity text-left cursor-help flex items-center gap-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Slideshow • {photos.length} Foto's
        </button>
        <span className="text-xs font-bold truncate max-w-sm pointer-events-none">
          {photos[currentIndex]?.filename || "Laden..."}
        </span>
      </div>

      {showPhotosLog && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center animate-in fade-in bg-black/90 backdrop-blur-md p-10">
          <div className="bg-[#1a1a1a] w-full max-w-3xl h-[90vh] rounded-[3rem] border border-white/10 flex flex-col overflow-hidden shadow-2xl">
            <div className="p-8 bg-[#222] border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-4 text-blue-400">
                <ImageIcon size={24} />
                <h3 className="font-black text-xs uppercase tracking-[0.4em]">Google Photos Debug Log</h3>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => { const text = photosLogs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n'); navigator.clipboard.writeText(text); }} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all">
                  <Copy size={18} />
                </button>
                <button onClick={() => setPhotosLogs([])} className="p-3 bg-white/5 hover:bg-white/10 text-rose-400 rounded-xl transition-all">
                  <Trash2 size={18} />
                </button>
                <button onClick={() => setShowPhotosLog(false)} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all">
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-2 font-mono text-[11px] scroll-smooth no-scrollbar">
              {photosLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20 text-white font-black uppercase tracking-[0.3em] gap-4">
                  <ImageIcon size={48} className="animate-pulse" />
                  Geen logs...
                </div>
              ) : photosLogs.map((log, i) => (
                <div key={i} className={`flex gap-4 border-b border-white/5 pb-2 last:border-0 ${log.type === 'error' ? 'text-rose-400' : log.type === 'success' ? 'text-emerald-400' : 'text-gray-400'}`}>
                  <span className="opacity-40 whitespace-nowrap">[{log.timestamp}]</span>
                  <span className="font-bold whitespace-nowrap uppercase">[{log.type}]</span>
                  <span className="text-white opacity-80 break-all">{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
