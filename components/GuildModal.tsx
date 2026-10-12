import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Zap, 
  Heart, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  Lock, 
  CheckCircle2, 
  Crosshair, 
  Flame, 
  Swords, 
  Footprints, 
  X, 
  Info,
  Award,
  Crown,
  Compass,
  ArrowRight
} from 'lucide-react';
import { Archetype } from '../types';
import { HunterDefinition } from '../src_types_build';
import { HUNTERS } from '../src_data_catalog';
import { PersistentSaveData } from '../src_types_progression';
import { SaveManager } from '../src_systems_progression';
import { audioManager } from '../audioManager';

interface GuildModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentArchetype: Archetype;
  onSelectHunter: (archetype: Archetype) => void;
  saveData?: PersistentSaveData;
  onStartRun?: () => void;
  isFirstSelection?: boolean;
}

export const GuildModal: React.FC<GuildModalProps> = ({
  isOpen,
  onClose,
  currentArchetype,
  onSelectHunter,
  saveData,
  onStartRun,
  isFirstSelection = false
}) => {
  const huntersList = Object.values(HUNTERS);
  
  // Index do caçador em foco no carrossel
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  
  // Tooltip de habilidade inspecionada
  const [activeTooltipSkill, setActiveTooltipSkill] = useState<{
    key: string;
    name: string;
    desc: string;
    cd?: number;
    charges?: number;
    icon: string;
  } | null>(null);

  // Inicializa o foco no caçador atualmente selecionado
  useEffect(() => {
    if (isOpen) {
      const idx = huntersList.findIndex(h => h.id === currentArchetype);
      if (idx !== -1) {
        setFocusedIndex(idx);
      }
      setActiveTooltipSkill(null);
    }
  }, [isOpen, currentArchetype]);

  // Teclado (Setas para navegar e Enter para selecionar)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'Escape' && !isFirstSelection) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusedIndex, isFirstSelection]);

  if (!isOpen) return null;

  const effectiveSaveData = saveData || SaveManager.loadSave();
  const currentHunter = huntersList[focusedIndex];
  const unlockedArchetypes = effectiveSaveData?.unlockedArchetypes || [Archetype.ARCHER, Archetype.MAGE, Archetype.VORGAR, Archetype.SUMMONER];
  const isUnlocked = unlockedArchetypes.includes(currentHunter.id);
  const isCurrentlyEquipped = currentArchetype === currentHunter.id;

  const handlePrev = () => {
    audioManager.playItemPickSfx();
    setFocusedIndex((prev) => (prev - 1 + huntersList.length) % huntersList.length);
    setActiveTooltipSkill(null);
  };

  const handleNext = () => {
    audioManager.playItemPickSfx();
    setFocusedIndex((prev) => (prev + 1) % huntersList.length);
    setActiveTooltipSkill(null);
  };

  const handleConfirmSelect = () => {
    if (!isUnlocked) return;
    audioManager.playLevelUpSfx();
    onSelectHunter(currentHunter.id);
    if (isFirstSelection && onStartRun) {
      onStartRun();
    } else {
      onClose();
    }
  };

  // Função visual para classes e tags
  const getRoleDetails = (archetype: Archetype) => {
    switch (archetype) {
      case Archetype.ARCHER:
        return { role: 'Atirador à Distância', difficulty: 'Média', primary: 'Dano Crítico & Velocidade' };
      case Archetype.MAGE:
        return { role: 'Conjurador em Área', difficulty: 'Fácil', primary: 'Dano Mágico & Controle' };
      case Archetype.VORGAR:
        return { role: 'Lutador Corpo a Corpo', difficulty: 'Alta', primary: 'Impacto Físico & Escudos' };
      case Archetype.SUMMONER:
        return { role: 'Comandante Espiritual', difficulty: 'Média', primary: 'Evocações & Tática' };
      default:
        return { role: 'Especialista', difficulty: 'Média', primary: 'Combate Geral' };
    }
  };

  const roleInfo = getRoleDetails(currentHunter.id);

  // Lista de habilidades do Caçador para a barra de feitiços
  const skillsConfig = [
    {
      slotKey: 'PASSIVA',
      keyLabel: 'Passiva',
      name: currentHunter.passive.name,
      desc: currentHunter.passive.description,
      icon: currentHunter.passive.icon || '👁️',
      cd: currentHunter.passive.cooldown
    },
    {
      slotKey: 'Q',
      keyLabel: 'Tecla Q',
      name: currentHunter.skill1.name,
      desc: currentHunter.skill1.description,
      icon: currentHunter.skill1.icon || '🎯',
      cd: currentHunter.skill1.cooldown
    },
    {
      slotKey: 'E',
      keyLabel: 'Tecla E',
      name: currentHunter.skill2.name,
      desc: currentHunter.skill2.description,
      icon: currentHunter.skill2.icon || '⚡',
      cd: currentHunter.skill2.cooldown
    },
    {
      slotKey: 'R',
      keyLabel: 'Tecla R (Ultimate)',
      name: currentHunter.skill3.name,
      desc: currentHunter.skill3.description,
      icon: currentHunter.skill3.icon || '💥',
      cd: currentHunter.skill3.cooldown
    },
    {
      slotKey: 'ESPAÇO',
      keyLabel: 'Espaço (Dash)',
      name: currentHunter.dash.name,
      desc: currentHunter.dash.description,
      icon: currentHunter.dash.icon || '💨',
      cd: currentHunter.dash.cooldown,
      charges: currentHunter.dash.maxCharges
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 backdrop-blur-md select-none overflow-hidden animate-fade-in font-sans">
      
      {/* Moldura Principal da Guilda */}
      <div className="relative w-full max-w-6xl h-[92vh] max-h-[820px] bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Iluminação de fundo e texturas ambientais */}
        <div 
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-500"
          style={{ backgroundColor: currentHunter.color }}
        />
        <div 
          className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-500"
          style={{ backgroundColor: currentHunter.color }}
        />

        {/* HEADER DA GUILDA */}
        <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black uppercase text-slate-100 tracking-wider">
                  Guilda dos Caçadores
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Ordem dos Ecos
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Selecione o Caçador para a próxima expedição às Torres Ancestrais.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Cristais de Mana acumulados */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-4 h-4" />
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase block font-semibold leading-none">Cristais</span>
                <span className="text-xs font-mono font-bold leading-none">{effectiveSaveData.manaCrystals || 0}</span>
              </div>
            </div>

            {/* Botão de Fechar */}
            {!isFirstSelection && (
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
                title="Fechar Guilda"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {/* CORPO PRINCIPAL (CARROSSEL + VISUALIZADOR + DETALHES) */}
        <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 sm:p-6 overflow-y-auto">
          
          {/* COLUNA ESQUERDA / CENTRO: PALCO DO CARROSSEL DE CAÇADORES (7 COLS) */}
          <div className="lg:col-span-7 flex flex-col justify-between items-center bg-slate-950/50 rounded-2xl border border-slate-800/80 p-4 relative overflow-hidden">
            
            {/* Seletor de Carrossel Superior com Miniaturas de Todos os Caçadores */}
            <div className="w-full flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                Catálogo de Caçadores ({focusedIndex + 1}/{huntersList.length})
              </span>

              {/* Botões de navegação lateral */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePrev}
                  className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNext}
                  className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Fita de Mini-Cards do Carrossel */}
            <div className="w-full flex items-center justify-center gap-2 sm:gap-3 py-1 mb-2">
              {huntersList.map((hunter, idx) => {
                const isItemUnlocked = unlockedArchetypes.includes(hunter.id);
                const isSelected = idx === focusedIndex;
                const isEquipped = currentArchetype === hunter.id;

                return (
                  <button
                    key={hunter.id}
                    onClick={() => {
                      setFocusedIndex(idx);
                      audioManager.playItemPickSfx();
                    }}
                    className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-slate-800 border-amber-400/80 shadow-lg scale-105 z-10'
                        : 'bg-slate-900/60 border-slate-800/80 opacity-60 hover:opacity-100 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="text-xl select-none">{hunter.icon}</span>
                    <div className="hidden sm:block">
                      <div className="text-[11px] font-bold text-slate-200 truncate max-w-[100px]">
                        {hunter.name.split(',')[0]}
                      </div>
                      <div className="text-[9px] text-slate-400 leading-none">
                        {isEquipped ? '★ Em Uso' : isItemUnlocked ? 'Pronto' : 'Bloqueado'}
                      </div>
                    </div>

                    {!isItemUnlocked && (
                      <span className="absolute -top-1 -right-1 bg-rose-950 border border-rose-600 rounded-full p-0.5 text-rose-300">
                        <Lock className="w-2.5 h-2.5" />
                      </span>
                    )}

                    {isEquipped && (
                      <span className="absolute -top-1 -right-1 bg-emerald-950 border border-emerald-500 rounded-full p-0.5 text-emerald-300">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* PALCO CENTRAL DO HERÓI */}
            <div className="relative w-full flex-1 flex flex-col items-center justify-center my-2">
              {/* Aura elemental no chão */}
              <div 
                className="w-48 h-16 rounded-full blur-2xl opacity-40 transition-all duration-500 absolute bottom-6"
                style={{ backgroundColor: currentHunter.color }}
              />

              {/* Pedestal Rúnico e Ícone de Destaque */}
              <div className="relative flex flex-col items-center">
                <div 
                  className={`w-36 h-36 sm:w-44 sm:h-44 rounded-3xl flex items-center justify-center text-7xl sm:text-8xl border-2 transition-all duration-500 relative shadow-2xl ${
                    isUnlocked 
                      ? 'bg-slate-900/90 hover:scale-105' 
                      : 'bg-slate-950/80 grayscale opacity-60'
                  }`}
                  style={{ 
                    borderColor: isUnlocked ? currentHunter.color : '#475569',
                    boxShadow: isUnlocked ? `0 0 40px ${currentHunter.color}25` : 'none'
                  }}
                >
                  <span className="select-none animate-pulse" style={{ animationDuration: '3s' }}>
                    {currentHunter.icon}
                  </span>

                  {!isUnlocked && (
                    <div className="absolute inset-0 bg-slate-950/70 rounded-3xl backdrop-blur-xs flex flex-col items-center justify-center text-slate-300">
                      <Lock className="w-10 h-10 text-rose-400 mb-1" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-300">Bloqueado</span>
                    </div>
                  )}

                  {isCurrentlyEquipped && (
                    <div className="absolute -top-3 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-wider px-3 py-0.5 rounded-full shadow-lg flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Caçador Ativo
                    </div>
                  )}
                </div>

                {/* Sombra / Base do Pedestal */}
                <div className="w-40 h-3 bg-slate-950 rounded-full mt-2 border-t border-slate-800/80" />
              </div>

              {/* Nome e Título do Caçador */}
              <div className="text-center mt-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-800/90 border border-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider mb-1">
                  <span style={{ color: currentHunter.color }}>●</span>
                  {currentHunter.title}
                </div>
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wide text-slate-100">
                  {currentHunter.name}
                </h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed line-clamp-2">
                  {currentHunter.description}
                </p>
              </div>
            </div>

            {/* BARRA DE HABILIDADES INLINE (PASSIVA, Q, E, R, ESPAÇO) */}
            <div className="w-full border-t border-slate-800/80 pt-3 mt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  Arsenal de Habilidades (Passe o mouse para inspecionar)
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {skillsConfig.map((sk) => {
                  const isHovered = activeTooltipSkill?.slotKey === sk.slotKey;

                  return (
                    <div
                      key={sk.slotKey}
                      onMouseEnter={() => setActiveTooltipSkill(sk)}
                      onClick={() => setActiveTooltipSkill(sk)}
                      className={`relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${
                        isHovered
                          ? 'bg-slate-800 border-amber-400/90 scale-105 shadow-lg'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-lg select-none">{sk.icon}</span>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-300 mt-1">
                        {sk.slotKey}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Tooltip Dinâmica de Habilidade Inspecionada */}
              {activeTooltipSkill && (
                <div className="mt-2.5 p-3 rounded-xl bg-slate-900 border border-slate-700/80 animate-fade-in">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{activeTooltipSkill.icon}</span>
                      <span className="text-xs font-black uppercase text-amber-300">
                        {activeTooltipSkill.name}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        {activeTooltipSkill.keyLabel}
                      </span>
                    </div>
                    {activeTooltipSkill.cd !== undefined && (
                      <span className="text-[10px] font-mono text-cyan-400 font-bold">
                        Recarga: {activeTooltipSkill.cd}s
                        {activeTooltipSkill.charges ? ` (${activeTooltipSkill.charges} Cargas)` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {activeTooltipSkill.desc}
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* COLUNA DIREITA: PAINEL DE ATRIBUTOS, FUNÇÃO E CONFIRMAÇÃO (5 COLS) */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-slate-950/70 rounded-2xl border border-slate-800/80 p-4 sm:p-5">
            
            <div>
              {/* Card de Ficha Tática */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  Perfil Tático
                </span>

                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                  Dificuldade: {roleInfo.difficulty}
                </span>
              </div>

              {/* Tags de Combate */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-[9px] font-bold uppercase text-slate-400 block mb-0.5">Função Principal</span>
                  <span className="text-xs font-black text-slate-200">{roleInfo.role}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-[9px] font-bold uppercase text-slate-400 block mb-0.5">Especialidade</span>
                  <span className="text-xs font-black text-cyan-300">{roleInfo.primary}</span>
                </div>
              </div>

              {/* ATRIBUTOS BASE COMPARATIVOS */}
              <div className="mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2.5">
                  Atributos Iniciais de Combate
                </span>

                <div className="space-y-2">
                  {/* Vida */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Heart className="w-3 h-3 text-rose-400" /> Vida Máxima:
                      </span>
                      <span className="text-rose-300 font-bold">{currentHunter.baseStats.maxHp} HP</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-rose-500 rounded-full"
                        style={{ width: `${Math.min(100, (currentHunter.baseStats.maxHp / 220) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Dano de Ataque (AD) */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Swords className="w-3 h-3 text-amber-400" /> Dano Físico (AD):
                      </span>
                      <span className="text-amber-300 font-bold">{currentHunter.baseStats.ad}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${Math.min(100, (currentHunter.baseStats.ad / 30) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Poder Mágico (AP) */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-400" /> Poder Mágico (AP):
                      </span>
                      <span className="text-purple-300 font-bold">{currentHunter.baseStats.ap}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${Math.min(100, (currentHunter.baseStats.ap / 30) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Armadura & RM */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Shield className="w-3 h-3 text-emerald-400" /> Defesas (ARM / RM):
                      </span>
                      <span className="text-emerald-300 font-bold">
                        {currentHunter.baseStats.armor} / {currentHunter.baseStats.mr}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(100, ((currentHunter.baseStats.armor + currentHunter.baseStats.mr) / 40) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Velocidade de Movimento */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Footprints className="w-3 h-3 text-cyan-400" /> Velocidade Base:
                      </span>
                      <span className="text-cyan-300 font-bold">{currentHunter.baseStats.moveSpeed}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-cyan-500 rounded-full"
                        style={{ width: `${Math.min(100, (currentHunter.baseStats.moveSpeed / 200) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tags de Estilo de Jogo */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {currentHunter.tags.map(tag => (
                  <span 
                    key={tag} 
                    className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* ÁREA DE AÇÃO INFERIOR */}
            <div className="border-t border-slate-800/80 pt-3">
              {isUnlocked ? (
                isCurrentlyEquipped ? (
                  <div className="space-y-2">
                    <div className="w-full py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-black uppercase tracking-wider text-center flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Caçador Pronto para a Expedição
                    </div>

                    {!isFirstSelection && onStartRun && (
                      <button
                        onClick={() => {
                          audioManager.playLevelUpSfx();
                          onClose();
                          onStartRun();
                        }}
                        className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black uppercase tracking-wider text-xs rounded-xl shadow-xl shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Compass className="w-4 h-4" />
                        Avançar para a Torre
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleConfirmSelect}
                    className="w-full py-4 bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-black uppercase tracking-wider text-xs sm:text-sm rounded-xl shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Award className="w-4 h-4" />
                    {isFirstSelection ? 'Confirmar Escolha e Iniciar' : 'Equipar este Caçador'}
                  </button>
                )
              ) : (
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center">
                  <div className="flex items-center justify-center gap-1.5 text-rose-400 font-bold text-xs uppercase mb-1">
                    <Lock className="w-3.5 h-3.5" />
                    Caçador Bloqueado
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Avance na exploração das Torres ou recrute novos caçadores com Cristais de Mana em atualizações futuras da Ordem.
                  </p>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
