import React, { useState, useMemo } from 'react';
import { 
  Sun, ChevronDown, Loader2, RefreshCw, Recycle, Trash2, Package, 
  Wine, Plus, Utensils, Pizza, Hamburger, ChefHat, Sandwich, 
  Soup, Drumstick, Salad, Fish 
} from 'lucide-react';

interface AgendaItem {
  id: string; 
  start: Date; 
  end: Date; 
  title: string; 
  location: string;
  category: 'word' | 'personal' | 'health' | 'social'; 
  color: string; 
  isAllDay: boolean; 
  htmlLink: string;
  allDayStartStr?: string; 
  allDayEndStr?: string;
  textColor?: string; 
  description?: string;
}

interface SolarForecastItem {
  value: number | string;
  unit: string;
  date: string;
  description: string;
}

interface SolarDataResponse {
  solar: Record<string, SolarForecastItem>;
}

interface WeekAgendaWidgetProps {
  accessToken: string | null;
  items: AgendaItem[];
  isLoading: boolean;
  solarData: SolarDataResponse | null;
  onRefresh: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const FOOD_OPTIONS = [
  'Pizza', 'Friet', 'Taco', 'Wrap', 
  'Spaghetti', 'Spinazie Spek', 'Kip Rijst', 'Croque', 'Sushi','Visburger','Soep'
];

export const WeekAgendaWidget: React.FC<WeekAgendaWidgetProps> = ({ 
  accessToken, 
  items, 
  isLoading, 
  solarData, 
  onRefresh, 
  isCollapsed, 
  onToggleCollapse 
}) => {
  const [selectedTimezone, setSelectedTimezone] = useState<string>('Europe/Brussels');
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [selectedWeekType, setSelectedWeekType] = useState<'rolling' | Date>('rolling');
  const [activeFoodAdd, setActiveFoodAdd] = useState<string | null>(null);
  const [isAddingFood, setIsAddingFood] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<AgendaItem | null>(null);

  const weekOptions = useMemo(() => {
    const options: { type: 'rolling' | Date; label: string }[] = [{ type: 'rolling', label: 'Komende 7 dagen' }];
    const baseDate = new Date();
    const day = baseDate.getDay();
    const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1);
    const firstMonday = new Date(baseDate.setDate(diff));
    firstMonday.setHours(0, 0, 0, 0);

    for (let i = 0; i < 12; i++) {
      const mon = new Date(firstMonday);
      mon.setDate(mon.getDate() + i * 7);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      
      const label = `${mon.getDate().toString().padStart(2, '0')}/${(mon.getMonth() + 1).toString().padStart(2, '0')} - ${sun.getDate().toString().padStart(2, '0')}/${(sun.getDate() + 1).toString().padStart(2, '0')}`;
      options.push({ type: mon, label });
    }
    return options;
  }, []);

  const weekDays = useMemo(() => {
    if (selectedWeekType === 'rolling') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d;
      });
    } else {
      const baseDate = selectedWeekType;
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        return d;
      });
    }
  }, [selectedWeekType]);
  
  const getEventsForDay = (date: Date) => {
    const dayStr = date.toLocaleDateString('en-CA', { timeZone: selectedTimezone });
    return items.filter(item => { 
      if (item.isAllDay && item.allDayStartStr && item.allDayEndStr) {
        return dayStr >= item.allDayStartStr && dayStr < item.allDayEndStr;
      }
      const startDayStr = item.start.toLocaleDateString('en-CA', { timeZone: selectedTimezone });
      const endDayStr = new Date(item.end.getTime() - 1).toLocaleDateString('en-CA', { timeZone: selectedTimezone });
      return dayStr >= startDayStr && dayStr <= endDayStr;
    });
  };

  const getSolarForecastForDay = (date: Date) => {
    if (!solarData?.solar) return null;
    const dStr = date.getDate().toString().padStart(2, '0') + '/' + (date.getMonth() + 1).toString().padStart(2, '0') + '/' + date.getFullYear();
    return Object.values(solarData.solar).find(item => item.date === dStr && item.description.includes('estimated'));
  };

  const toggleTimezone = () => {
    setSelectedTimezone(prev => prev === 'UTC' ? 'Europe/Brussels' : 'UTC');
  };

  const isWaste = (title: string) => ['PMD', 'RA', 'P/K', 'GLA'].includes(title.trim().toUpperCase());
  
  const isFood = (title: string) => title.trim().toLowerCase().startsWith('eten');

  const getFoodIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('burger')) return <Hamburger size={24} className="text-indigo-400" />;
    if (t.includes('pizza')) return <Pizza size={24} className="text-orange-500" />;
    if (t.includes('friet')) return <ChefHat size={24} className="text-amber-500" />;
    if (t.includes('taco')) return <ChefHat size={24} className="text-yellow-600" />;
    if (t.includes('wrap')) return <Sandwich size={24} className="text-yellow-500" />;
    if (t.includes('spaghetti')) return <Soup size={24} className="text-rose-500" />;
    if (t.includes('spinazie')) return <Salad size={24} className="text-emerald-500" />;
    if (t.includes('kip')) return <Drumstick size={24} className="text-orange-400" />;
    if (t.includes('croque')) return <Sandwich size={24} className="text-amber-600" />;
    if (t.includes('sushi')) return <Fish size={24} className="text-indigo-400" />;
    if (t.includes('vis')) return <Fish size={24} className="text-indigo-400" />;
    if (t.includes('soep')) return <Soup size={24} className="text-rose-500" />;
    return <Utensils size={20} className="text-gray-300" />;
  };

  const addFoodToCalendar = async (date: Date, dish: string) => {
    if (!accessToken) return;
    setIsAddingFood(true);
    try {
      const startStr = date.toISOString().split('T')[0];
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const endStr = nextDay.toISOString().split('T')[0];

      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { 
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: `Eten ${dish}`,
          start: { date: startStr },
          end: { date: endStr }
        })
      });

      if (!resp.ok) throw new Error('Kon evenement niet toevoegen');
      onRefresh();
    } catch (e) {
      console.error(e);
      alert('Fout bij toevoegen aan kalender');
    } finally {
      setIsAddingFood(false);
      setActiveFoodAdd(null);
    }
  };

  const deleteFoodFromCalendar = async () => {
    if (!accessToken || !itemToDelete) return;
    try {
      const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${itemToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      if (!resp.ok) throw new Error('Kon item niet verwijderen');
      onRefresh();
    } catch (e) {
      console.error(e);
      alert('Fout bij verwijderen uit kalender');
    } finally {
      setItemToDelete(null);
    }
  };

  const currentLabel = useMemo(() => {
    if (selectedWeekType === 'rolling') return 'Komende 7 dagen';
    const sun = new Date(selectedWeekType);
    sun.setDate(sun.getDate() + 6);
    return `${selectedWeekType.getDate().toString().padStart(2, '0')}/${(selectedWeekType.getMonth() + 1).toString().padStart(2, '0')} - ${sun.getDate().toString().padStart(2, '0')}/${(sun.getDate() + 1).toString().padStart(2, '0')}`;
  }, [selectedWeekType]);

  return (
    <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 flex flex-col overflow-hidden h-[1180px]">
      <div className="p-8 border-b border-gray-100 shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em]">
              Weekagenda
            </span>
            <button 
              onClick={toggleTimezone} 
              className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
            >
              {selectedTimezone === 'UTC' ? 'UTC' : 'BXL'}
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setShowWeekPicker(!showWeekPicker)}
                className="px-6 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2"
              >
                {currentLabel}
                <ChevronDown size={14} className={`transition-transform ${showWeekPicker ? 'rotate-180' : ''}`} />
              </button>
              {showWeekPicker && (
                <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 p-2 w-80 max-h-96 overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-200">
                  {weekOptions.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedWeekType(opt.type);
                        setShowWeekPicker(false);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        (selectedWeekType === opt.type || (selectedWeekType === 'rolling' && opt.type === 'rolling'))
                          ? 'bg-blue-50 text-blue-600'
                          : 'hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button 
              onClick={onToggleCollapse} 
              className="w-12 h-12 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-2xl flex items-center justify-center transition-all"
            >
              <ChevronDown size={20} className={`transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
            </button>
            <button 
              onClick={onRefresh} 
              disabled={isLoading}
              className="w-12 h-12 bg-blue-50 hover:bg-blue-100 text-blue-500 rounded-2xl flex items-center justify-center transition-all disabled:opacity-50"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
            </button>
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-7 divide-x divide-gray-100 overflow-hidden">
              {weekDays.map((date, idx) => {
                const dateKey = date.toISOString().split('T')[0];
                const eventsForDay = getEventsForDay(date);
                const today = date.toDateString() === new Date().toDateString();
                const wasteEvents = eventsForDay.filter(e => isWaste(e.title));
                const foodEvents = eventsForDay.filter(e => isFood(e.title));
                const regularEvents = eventsForDay.filter(e => !isWaste(e.title) && !isFood(e.title));
                const solarForecast = getSolarForecastForDay(date);

                return ( 
                  <div key={idx} className={`bg-white flex flex-col min-w-0 ${today ? 'bg-blue-50/20' : ''} relative`}>
                    <div className={`p-6 text-center border-b border-gray-50 shrink-0 ${today ? 'bg-blue-500/5' : ''}`}>
                      <div className={`text-[11px] font-black tracking-widest ${today ? 'text-blue-600' : 'text-gray-400'}`}>
                        {date.toLocaleDateString('nl-BE', { weekday: 'short' }).toUpperCase()}
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <div className={`text-3xl font-black ${today ? 'text-blue-600' : 'text-gray-800'}`}>{date.getDate()}</div>
                        {wasteEvents.length > 0 && (
                          <div className="flex items-center gap-1">
                            {wasteEvents.map(w => {
                              const t = w.title.trim().toUpperCase();
                              if (t === 'PMD') return <Recycle key={w.id} size={20} className="text-blue-500" strokeWidth={2.5} />;
                              if (t === 'RA') return <Trash2 key={w.id} size={20} className="text-gray-400" strokeWidth={2.5} />;
                              if (t === 'P/K') return <Package key={w.id} size={20} className="text-amber-500" strokeWidth={2.5} />;
                              if (t === 'GLA') return <Wine key={w.id} size={20} className="text-blue-600" strokeWidth={2.5} />;
                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-0 space-y-0.5 no-scrollbar">
                      {regularEvents.sort((a,b) => (a.isAllDay ? -1 : 1) - (b.isAllDay ? -1 : 1)).map(item => ( 
                        <div 
                          key={item.id + date.toISOString()} 
                          onClick={() => window.open(item.htmlLink, '_blank')} 
                          style={item.isAllDay ? { backgroundColor: item.color || '#9ca3af' } : {}} 
                          className={`w-full cursor-pointer hover:brightness-95 active:scale-[0.98] transition-all ${
                            item.isAllDay 
                              ? 'p-0.5 rounded-sm shadow-sm border border-black/5' 
                              : 'px-0.5 py-2 bg-transparent'
                          }`}
                        >
                          <div className={`flex flex-col ${!item.isAllDay ? 'text-black' : 'text-white'}`}>
                            {!item.isAllDay && (
                              <span className="text-[23px] font-black opacity-40 leading-none tabular-nums uppercase pl-1">
                                {item.start.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: selectedTimezone })}
                                {' - '}
                                {item.end.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: selectedTimezone })}
                              </span>
                            )}
                            <span 
                              className="text-[30px] font-bold leading-tight line-clamp-3 pl-1 pr-1"
                              style={item.textColor ? { color: item.textColor } : {}}
                            >
                              {item.title}
                            </span>
                          </div>
                        </div> 
                      ))} 
                    </div>

                    <div className="mt-auto border-t border-gray-100 bg-amber-50/10 p-4">
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Menu</span>
                        {foodEvents.length > 0 ? foodEvents.map(f => {
                          const displayFood = f.title.replace(/^Eten\s+/i, '');
                          return (
                            <div key={f.id} className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setItemToDelete(f); }}
                                className="hover:scale-110 active:scale-90 transition-transform cursor-pointer"
                                title="Verwijder dit menu-item"
                              >
                                {getFoodIcon(f.title)}
                              </button>
                              <span className="text-[26px] font-black text-gray-800 tracking-tight leading-none">
                                {displayFood}
                              </span>
                            </div>
                          );
                        }) : (
                          <div className="relative">
                            <button 
                              onClick={() => setActiveFoodAdd(activeFoodAdd === dateKey ? null : dateKey)}
                              className="w-full h-12 flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-400 rounded-xl transition-all active:scale-95 group"
                            >
                              <Plus size={24} className="group-hover:rotate-90 transition-transform" />
                            </button>
                            
                            {activeFoodAdd === dateKey && (
                              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-amber-100 rounded-2xl shadow-2xl z-50 p-2 animate-in zoom-in-95 fade-in duration-200">
                                <div className="max-h-128 overflow-y-auto no-scrollbar grid grid-cols-1 gap-1">
                                  {FOOD_OPTIONS.map(dish => (
                                    <button
                                      key={dish}
                                      onClick={() => addFoodToCalendar(date, dish)}
                                      disabled={isAddingFood}
                                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-amber-50 text-xs font-black text-amber-700 uppercase tracking-widest transition-all flex items-center justify-between"
                                    >
                                      {dish}
                                      <div className="w-6 h-6 flex items-center justify-center opacity-40">
                                        {getFoodIcon('Eten ' + dish)}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {solarForecast && (
                        <div className="mt-3 pt-3 border-t border-amber-200/40 flex items-center justify-between animate-in fade-in">
                          <div className="flex items-center gap-2">
                             <Sun size={14} className="text-amber-500 fill-amber-50" />
                             <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest"></span>
                          </div>
                          <span className="text-sm font-black text-amber-700 tabular-nums">
                            {solarForecast.value} <span className="text-[10px] opacity-60">kWh</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div> 
                ); 
              })}
            </div> 
          )}
        </div> 
      )}

      {itemToDelete && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center animate-in fade-in duration-300 bg-black/60 backdrop-blur-sm p-10">
          <div className="bg-white w-full max-w-sm p-10 rounded-[3rem] shadow-2xl flex flex-col items-center text-center">
             <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-[1.5rem] flex items-center justify-center mb-8">
               <Trash2 size={32} />
             </div>
             <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest mb-4">Gerecht verwijderen?</h3>
             <p className="text-sm text-gray-500 mb-10 leading-relaxed font-medium">Weet je zeker dat je <strong>{itemToDelete.title.replace(/^Eten\s+/i, '')}</strong> wilt verwijderen van de kalender?</p>
             <div className="flex gap-4 w-full">
                <button onClick={() => setItemToDelete(null)} className="flex-1 py-5 bg-gray-50 text-gray-400 hover:bg-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Annuleren</button>
                <button onClick={deleteFoodFromCalendar} className="flex-1 py-5 bg-rose-500 text-white hover:bg-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-100 transition-all">Verwijderen</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
