import React, { useState } from 'react';
import { GameItem, ITEMS_DATABASE } from '../src_data_items';
import { PersistentSaveData } from '../src_types_progression';
import { X, Gem, Lock, Sparkles, Trophy, Crown, CheckCircle2, BookOpen } from 'lucide-react';

interface VaultModalProps {
  saveData: PersistentSaveData;
  onClose: () => void;
}

export const VaultModal: React.FC<VaultModalProps> = ({ saveData, onClose }) => {
  const [selectedRarity, setSelectedRarity] = useState<string>('TODOS');
  const [hoveredItem, setHoveredItem] = useState<GameItem | null>(null);

  const unlockedIds = saveData.unlockedRelicIds || [];
  
  // Calculate stats
  const totalRelics = ITEMS_DATABASE.length;
  const unlockedCount = ITEMS_DATABASE.filter(item => unlockedIds.includes(item.id)).length;
  const completionPercentage = Math.round((unlockedCount / totalRelics) * 100) || 0;

  const rarities = ['TODOS', 'COMUM', 'INCOMUM', 'RARO', 'EPICO', 'LENDARIO'];

  const filteredItems = ITEMS_DATABASE.filter(item => {
    if (selectedRarity === 'TODOS') return true;
    return item.rarity === selectedRarity;
  });

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'LENDARIO': return 'text-amber-500 border-amber-500 bg-amber-500/10 hover:bg-amber-500/20';
      case 'EPICO': return 'text-purple-500 border-purple-500 bg-purple-500/10 hover:bg-purple-500/20';
      case 'RARO': return 'text-cyan-500 border-cyan-500 bg-cyan-500/10 hover:bg-cyan-500/20';
      case 'INCOMUM': return 'text-emerald-500 border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20';
      default: return 'text-slate-400 border-slate-500 bg-slate-500/10 hover:bg-slate-500/20';
    }
  };

  const getRarityBadge = (rarity: string) => {
    switch (rarity) {
      case 'LENDARIO': return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
      case 'EPICO': return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
      case 'RARO': return 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
      case 'INCOMUM': return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border border-slate-500/30';
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-mono">
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/15 rounded-xl border border-amber-500/30">
              <Crown className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                Cofre de Relíquias da Torre
              </h2>
              <p className="text-xs text-slate-400">Guarde seus tesouros conquistados purificando as regiões</p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STATS STRIP */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-950/20 border-b border-slate-800 text-xs">
          <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800">
            <span className="text-slate-400 uppercase tracking-wider">Coleção de Relíquias</span>
            <span className="font-bold text-amber-400 text-sm">{unlockedCount} / {totalRelics}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800">
            <span className="text-slate-400 uppercase tracking-wider">Progresso de Descoberta</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${completionPercentage}%` }}></div>
              </div>
              <span className="font-bold text-slate-200">{completionPercentage}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800">
            <span className="text-slate-400 uppercase tracking-wider">Regiões Purificadas</span>
            <span className="font-bold text-emerald-400 text-sm flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {saveData.concludedRegions?.length || 0} / 10
            </span>
          </div>
        </div>

        {/* MAIN BODY LAYOUT */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          
          {/* LEFT: GRID AND FILTERS */}
          <div className="flex-1 p-5 flex flex-col overflow-y-auto min-h-0 border-r border-slate-800">
            {/* Rarity Tabs */}
            <div className="flex flex-wrap gap-1.5 mb-4 border-b border-slate-800 pb-3">
              {rarities.map(rarity => (
                <button
                  key={rarity}
                  onClick={() => setSelectedRarity(rarity)}
                  className={`px-3 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider border cursor-pointer transition-all ${
                    selectedRarity === rarity
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                      : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {rarity}
                </button>
              ))}
            </div>

            {/* Grid of relics */}
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3.5 pb-4">
              {filteredItems.map(item => {
                const isUnlocked = unlockedIds.includes(item.id);
                const isHovered = hoveredItem?.id === item.id;
                
                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredItem(item)}
                    onClick={() => setHoveredItem(item)}
                    className={`aspect-square relative flex items-center justify-center rounded-xl cursor-pointer border select-none transition-all duration-200 ${
                      isUnlocked
                        ? `${getRarityColor(item.rarity)} border-opacity-40`
                        : 'bg-slate-950/40 border-slate-800/80 text-slate-600 hover:border-slate-800 hover:bg-slate-950/20'
                    } ${isHovered ? 'scale-105 shadow-lg border-opacity-100' : ''}`}
                  >
                    {isUnlocked ? (
                      <span className="text-3xl animate-fade-in">{item.icon}</span>
                    ) : (
                      <Lock className="w-5 h-5 opacity-40 text-slate-500" />
                    )}

                    {/* Boss Badge indicator on locked/unlocked */}
                    {item.bossExclusive && (
                      <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" title="Exclusivo de Chefe" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: DETAIL PREVIEW PANEL */}
          <div className="w-full md:w-80 bg-slate-950/40 p-5 flex flex-col justify-between overflow-y-auto border-t md:border-t-0 border-slate-800">
            {hoveredItem ? (
              <div className="flex flex-col gap-4 animate-fade-in">
                {/* Visual Icon card wrapper */}
                <div className={`w-20 h-20 mx-auto flex items-center justify-center rounded-2xl border-2 bg-slate-900 shadow-inner ${
                  unlockedIds.includes(hoveredItem.id) ? getRarityColor(hoveredItem.rarity) : 'border-slate-800 text-slate-600'
                }`}>
                  {unlockedIds.includes(hoveredItem.id) ? (
                    <span className="text-5xl">{hoveredItem.icon}</span>
                  ) : (
                    <Lock className="w-8 h-8 opacity-40 text-slate-500" />
                  )}
                </div>

                <div className="text-center">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${getRarityBadge(hoveredItem.rarity)}`}>
                    {hoveredItem.rarity}
                  </span>
                  <h3 className="text-slate-100 font-bold text-sm mt-2 uppercase tracking-wide">
                    {unlockedIds.includes(hoveredItem.id) ? hoveredItem.name : '???'}
                  </h3>
                  <p className="text-[10px] text-slate-400 uppercase mt-1">Região {hoveredItem.regionNumber}: {hoveredItem.biome}</p>
                </div>

                <hr className="border-slate-800" />

                {unlockedIds.includes(hoveredItem.id) ? (
                  <div className="flex flex-col gap-3">
                    <div className="text-xs text-slate-300 leading-relaxed italic bg-slate-900/60 p-3 rounded-lg border border-slate-800/40">
                      "{hoveredItem.description}"
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-lg flex flex-col gap-1 text-[11px]">
                      <span className="text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Efeito Latente Permanente
                      </span>
                      <span className="text-slate-200">{hoveredItem.statsDesc}</span>
                    </div>

                    <div className="text-[10px] text-slate-400 flex flex-col gap-1 mt-1 bg-slate-900/30 p-2.5 rounded-lg">
                      <span className="font-semibold text-slate-300">Contexto Histórico:</span>
                      <span className="italic">"{hoveredItem.flavourText}"</span>
                      {hoveredItem.bossExclusive && (
                        <div className="mt-1.5 text-amber-500 font-semibold flex items-center gap-1">
                          <Trophy className="w-3 h-3" /> Drop Exclusivo de {hoveredItem.bossExclusive}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-500 flex flex-col items-center gap-2">
                    <Lock className="w-8 h-8 opacity-40 text-slate-600" />
                    <span>Esta relíquia permanece selada no topo da torre. Purifique a região e derrote seu guardião para revelá-la!</span>
                    {hoveredItem.bossExclusive && (
                      <span className="text-[10px] text-amber-500 font-semibold uppercase tracking-wider mt-2 flex items-center gap-1">
                        <Crown className="w-3 h-3" /> Recompensa de {hoveredItem.bossExclusive}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-xs text-slate-500 py-12 gap-3 leading-relaxed">
                <BookOpen className="w-10 h-10 opacity-30 text-slate-500 animate-pulse" />
                <span>Passe o mouse ou toque em uma relíquia para decifrar suas propriedades antigas e lore mística.</span>
              </div>
            )}

            {/* Bottom info banner */}
            <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500 text-center">
              As propriedades latentes das relíquias serão integradas ao seu Arsenal de Combate em futuras atualizações!
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
