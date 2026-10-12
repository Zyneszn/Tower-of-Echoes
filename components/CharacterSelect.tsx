import React, { useState, useEffect } from 'react';
import { Archetype } from '../types';
import { HUNTERS } from '../src_data_catalog';
import { PersistentSaveData } from '../src_types_progression';
import { SaveManager } from '../src_systems_progression';
import { audioManager } from '../audioManager';
import { 
  Swords, 
  Shield, 
  Zap, 
  Target, 
  Sparkles, 
  ChevronRight, 
  Info, 
  Crown, 
  Flame, 
  ArrowLeft,
  CheckCircle2,
  Lock
} from 'lucide-react';

interface CharacterSelectProps {
  onStartWithBuild?: (archetype: Archetype) => void;
  onSelect?: (archetype: Archetype) => void;
  onBackToMenu?: () => void;
  saveData?: PersistentSaveData;
}

export const CharacterSelect: React.FC<CharacterSelectProps> = ({
  onStartWithBuild,
  onSelect,
  onBackToMenu,
  saveData
}) => {
  const effectiveSave = saveData || SaveManager.loadSave();
  const unlockedArchetypes = effectiveSave?.unlockedArchetypes || [
    Archetype.ARCHER, 
    Archetype.MAGE, 
    Archetype.VORGAR, 
    Archetype.SUMMONER
  ];

  const hunterKeys: Archetype[] = [
    Archetype.ARCHER,
    Archetype.MAGE,
    Archetype.VORGAR,
    Archetype.SUMMONER
  ];

  const [selectedArchetype, setSelectedArchetype] = useState<Archetype>(Archetype.ARCHER);
  const [activeTabSkill, setActiveTabSkill] = useState<'passive' | 'skill1' | 'skill2' | 'skill3' | 'dash'>('skill1');

  // Keyboard navigation hotkeys (1, 2, 3, 4, Enter, Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') {
        setSelectedArchetype(Archetype.ARCHER);
        audioManager.playUiClickSfx();
      } else if (e.key === '2') {
        setSelectedArchetype(Archetype.MAGE);
        audioManager.playUiClickSfx();
      } else if (e.key === '3') {
        setSelectedArchetype(Archetype.VORGAR);
        audioManager.playUiClickSfx();
      } else if (e.key === '4') {
        setSelectedArchetype(Archetype.SUMMONER);
        audioManager.playUiClickSfx();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        const currentIndex = hunterKeys.indexOf(selectedArchetype);
        const nextIndex = (currentIndex + 1) % hunterKeys.length;
        setSelectedArchetype(hunterKeys[nextIndex]);
        audioManager.playUiClickSfx();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        const currentIndex = hunterKeys.indexOf(selectedArchetype);
        const prevIndex = (currentIndex - 1 + hunterKeys.length) % hunterKeys.length;
        setSelectedArchetype(hunterKeys[prevIndex]);
        audioManager.playUiClickSfx();
      } else if (e.key === 'Enter' || e.key === ' ') {
        handleConfirmSelection(selectedArchetype);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedArchetype]);

  const handleConfirmSelection = (chosen: Archetype) => {
    if (!unlockedArchetypes.includes(chosen)) return;
    audioManager.playStartRunSfx();
    if (onStartWithBuild) {
      onStartWithBuild(chosen);
    } else if (onSelect) {
      onSelect(chosen);
    }
  };

  const currentHunter = HUNTERS[selectedArchetype];

  // Rating ratings for display
  const getRatingStats = (arch: Archetype) => {
    switch (arch) {
      case Archetype.ARCHER:
        return { atk: 5, def: 2, spd: 5, rng: 5, role: 'Atirador • Crítico & Velocidade' };
      case Archetype.MAGE:
        return { atk: 5, def: 3, spd: 3, rng: 4, role: 'Arcanista • Dano em Área & Controle' };
      case Archetype.VORGAR:
        return { atk: 4, def: 5, spd: 2, rng: 1, role: 'Colosso • Corpo a Corpo & Baluarte' };
      case Archetype.SUMMONER:
        return { atk: 4, def: 3, spd: 3, rng: 3, role: 'Invocador • Legião Espiritual' };
      default:
        return { atk: 3, def: 3, spd: 3, rng: 3, role: 'Caçador' };
    }
  };

  const renderStatBar = (label: string, value: number, color: string) => (
    <div className="flex items-center justify-between text-xs font-mono">
      <span className="text-slate-400 font-semibold w-24">{label}</span>
      <div className="flex gap-1 flex-1 max-w-[120px] justify-end">
        {[1, 2, 3, 4, 5].map((step) => (
          <div
            key={step}
            className={`h-2 w-4 rounded-sm transition-all duration-300 ${
              step <= value 
                ? 'shadow-[0_0_8px_currentColor]' 
                : 'bg-slate-800 border border-white/5'
            }`}
            style={{
              backgroundColor: step <= value ? color : undefined,
              color: color
            }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative w-full h-full bg-slate-950 text-white font-mono flex flex-col justify-between p-4 sm:p-8 select-none overflow-y-auto overflow-x-hidden">
      {/* Background Ambient Glow */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-25 transition-all duration-700 blur-3xl"
        style={{
          background: `radial-gradient(circle at 50% 40%, ${currentHunter.color} 0%, transparent 70%)`
        }}
      />

      {/* Top Header Navigation */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 max-w-7xl mx-auto w-full">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Expedição Ancestral
            </span>
            <span className="text-slate-500 text-xs">• 10 Andares</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase flex items-center gap-3">
            Escolha seu Caçador
          </h1>
        </div>

        {onBackToMenu && (
          <button
            onClick={onBackToMenu}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-all text-xs font-bold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Menu</span>
          </button>
        )}
      </div>

      {/* Main 4 Hero Cards Grid */}
      <div className="relative z-10 max-w-7xl mx-auto w-full my-auto py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {hunterKeys.map((key, index) => {
            const hunter = HUNTERS[key];
            const isSelected = selectedArchetype === key;
            const isUnlocked = unlockedArchetypes.includes(key);
            const rating = getRatingStats(key);

            return (
              <div
                key={key}
                onClick={() => {
                  setSelectedArchetype(key);
                  audioManager.playUiClickSfx();
                }}
                className={`relative rounded-2xl p-5 border cursor-pointer transition-all duration-300 flex flex-col justify-between backdrop-blur-xl group ${
                  isSelected
                    ? 'bg-slate-900/90 shadow-2xl scale-[1.02] z-20'
                    : 'bg-slate-900/50 border-white/10 hover:border-white/20 hover:bg-slate-900/70 opacity-85 hover:opacity-100'
                }`}
                style={{
                  borderColor: isSelected ? hunter.color : undefined,
                  boxShadow: isSelected ? `0 0 30px ${hunter.color}35` : undefined
                }}
              >
                {/* Hotkey Tag & Selected Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span 
                    className="w-6 h-6 rounded-lg bg-slate-950 border border-white/15 flex items-center justify-center text-xs font-black"
                    style={{ color: isSelected ? hunter.color : '#94a3b8' }}
                  >
                    {index + 1}
                  </span>

                  {isSelected && (
                    <span 
                      className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm"
                      style={{ backgroundColor: `${hunter.color}25`, color: hunter.color, border: `1px solid ${hunter.color}50` }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Selecionado
                    </span>
                  )}
                </div>

                {/* Pedestal Icon Avatar */}
                <div className="flex flex-col items-center text-center my-2">
                  <div 
                    className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-3 relative transition-transform duration-300 group-hover:scale-110 shadow-xl border border-white/10"
                    style={{
                      background: `radial-gradient(circle, ${hunter.color}25 0%, #090d16 100%)`,
                      borderColor: isSelected ? hunter.color : 'rgba(255,255,255,0.1)'
                    }}
                  >
                    <span>{hunter.icon}</span>
                  </div>

                  <h2 className="text-lg font-black text-white tracking-tight leading-snug">
                    {hunter.name.split(',')[0]}
                  </h2>
                  <span className="text-[11px] font-bold text-slate-400 mt-0.5 tracking-wide">
                    {hunter.title}
                  </span>
                  
                  <span 
                    className="mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                    style={{
                      borderColor: `${hunter.color}40`,
                      backgroundColor: `${hunter.color}10`,
                      color: hunter.color
                    }}
                  >
                    {rating.role}
                  </span>
                </div>

                {/* Rating Stat Bars */}
                <div className="space-y-1.5 my-4 bg-slate-950/60 p-3 rounded-xl border border-white/5">
                  {renderStatBar('Ataque', rating.atk, hunter.color)}
                  {renderStatBar('Defesa', rating.def, hunter.color)}
                  {renderStatBar('Agilidade', rating.spd, hunter.color)}
                </div>

                {/* Select / Confirm Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedArchetype(key);
                    handleConfirmSelection(key);
                  }}
                  disabled={!isUnlocked}
                  className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer ${
                    isSelected
                      ? 'text-slate-950 hover:brightness-110 active:scale-95'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                  style={{
                    backgroundColor: isSelected ? hunter.color : undefined
                  }}
                >
                  {isUnlocked ? (
                    <>
                      <span>{isSelected ? 'Ascender à Torre' : 'Selecionar'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-slate-500" />
                      <span>Bloqueado</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Selected Hunter Skill & Details Panel */}
        <div 
          className="mt-6 bg-slate-900/90 border rounded-2xl p-5 backdrop-blur-xl transition-all duration-300 shadow-2xl"
          style={{ borderColor: `${currentHunter.color}40` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4 border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{currentHunter.icon}</span>
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <span>{currentHunter.name}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed max-w-2xl">
                  {currentHunter.description}
                </p>
              </div>
            </div>

            {/* Confirm CTA */}
            <button
              onClick={() => handleConfirmSelection(selectedArchetype)}
              className="px-8 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-slate-950 flex items-center gap-2 transition-all shadow-xl hover:scale-105 active:scale-95 cursor-pointer ml-auto"
              style={{
                backgroundColor: currentHunter.color,
                boxShadow: `0 0 25px ${currentHunter.color}50`
              }}
            >
              <span>Entrar na Torre com {currentHunter.name.split(',')[0]}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Skill Selector Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { id: 'skill1', label: '[Q] Habilidade 1', skill: currentHunter.skill1 },
              { id: 'skill2', label: '[E] Habilidade 2', skill: currentHunter.skill2 },
              { id: 'skill3', label: '[R] Suprema', skill: currentHunter.skill3 },
              { id: 'dash', label: '[Espaço] Esquiva', skill: currentHunter.dash },
              { id: 'passive', label: '[Passiva] Talento', skill: currentHunter.passive }
            ].map((item) => {
              const isActive = activeTabSkill === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTabSkill(item.id as any);
                    audioManager.playUiClickSfx();
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isActive 
                      ? 'bg-slate-800/90 text-white shadow-lg' 
                      : 'bg-slate-950/60 border-white/5 text-slate-400 hover:border-white/15 hover:text-slate-200'
                  }`}
                  style={{
                    borderColor: isActive ? currentHunter.color : undefined
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {item.label}
                    </span>
                    <span className="text-base">{item.skill.icon}</span>
                  </div>
                  <span className="text-xs font-bold truncate text-white">
                    {item.skill.name}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-snug">
                    {item.skill.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Instructions */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 max-w-7xl mx-auto w-full text-[11px] text-slate-500 border-t border-white/5 pt-3">
        <div className="flex items-center gap-4">
          <span>💡 Dica: Pressione <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">1</kbd> - <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">4</kbd> para trocar rapidamente</span>
          <span>• Pressione <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">Enter</kbd> para Iniciar</span>
        </div>
        <span className="text-slate-600">Torre dos Ecos v2.5 • Caçadores Desbloqueados</span>
      </div>
    </div>
  );
};
