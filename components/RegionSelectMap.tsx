import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, 
  Unlock, 
  CheckCircle2, 
  Swords, 
  Compass, 
  Coins, 
  Shield, 
  Sparkles, 
  Flame, 
  CloudRain, 
  Snowflake, 
  Sun, 
  Moon, 
  ArrowLeft, 
  Award, 
  AlertTriangle,
  History,
  Info
} from 'lucide-react';
import { REGION_TREE_NODES, RegionTreeNode } from '../constants';
import { GameState, Archetype, Biome } from '../types';
import { PersistentSaveData } from '../src_types_progression';

interface RegionSelectMapProps {
  saveData: PersistentSaveData;
  activeArchetype: Archetype;
  currentRunLevel: number;
  currentRunCrystals: number;
  climbBonusMult: number;
  onSelectRegion: (floorNumber: number, isReplay: boolean) => void;
  onReturnToVillage: () => void;
}

export const RegionSelectMap: React.FC<RegionSelectMapProps> = ({
  saveData,
  activeArchetype,
  currentRunLevel,
  currentRunCrystals,
  climbBonusMult,
  onSelectRegion,
  onReturnToVillage,
}) => {
  const concludedList = saveData.concludedRegions || [];
  const [hoveredNode, setHoveredNode] = useState<RegionTreeNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<RegionTreeNode | null>(
    REGION_TREE_NODES[0] // Default select the first node
  );
  
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom of the map on mount so player starts at Region 1
  useEffect(() => {
    if (mapContainerRef.current) {
      mapContainerRef.current.scrollTop = mapContainerRef.current.scrollHeight;
    }
  }, []);

  // Check if a node is unlocked
  const isUnlocked = (node: RegionTreeNode) => {
    if (node.floorNumber === 1) return true;
    return node.predecessors.some(predId => concludedList.includes(predId));
  };

  // Check if a node is concluded
  const isConcluded = (node: RegionTreeNode) => {
    return concludedList.includes(node.floorNumber);
  };

  // Get difficulty color
  const getDifficultyBadge = (diff: string) => {
    switch (diff) {
      case 'Iniciante':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Intermediária':
        return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
      case 'Perigosa':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'Elite':
        return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      case 'Mestre':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'Pesadelo':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case 'Apocalipse':
        return 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  // Get biome icon or decoration
  const getBiomeDecoration = (biome: string) => {
    if (biome.includes('Floresta')) return '🌿';
    if (biome.includes('Necrópole')) return '💀';
    if (biome.includes('Vulcão')) return '🔥';
    if (biome.includes('Metrópole') || biome.includes('Cúpula')) return '⚡';
    if (biome.includes('Dunas')) return '🏜️';
    if (biome.includes('Geleira')) return '❄️';
    return '🌀';
  };

  // Calculate coordinates for the absolute mapping
  // Grid coordinates map perfectly: Center is 250, Y shifts to accommodate up-progression
  const getNodeCoords = (node: RegionTreeNode) => {
    const xBase = 250;
    const yBase = 750;
    
    // Nodes coordinates mapped previously
    // R1: x = 250, y = 750
    // R2: x = 130, y = 620
    // R3: x = 370, y = 620
    // R4: x = 50,  y = 490
    // R5: x = 250, y = 490
    // R6: x = 450, y = 490
    // R7: x = 130, y = 360
    // R8: x = 370, y = 360
    // R9: x = 250, y = 230
    // R10: x = 250, y = 100
    
    switch (node.floorNumber) {
      case 1: return { x: 250, y: 750 };
      case 2: return { x: 130, y: 620 };
      case 3: return { x: 370, y: 620 };
      case 4: return { x: 50,  y: 490 };
      case 5: return { x: 250, y: 490 };
      case 6: return { x: 450, y: 490 };
      case 7: return { x: 130, y: 360 };
      case 8: return { x: 370, y: 360 };
      case 9: return { x: 250, y: 230 };
      case 10: return { x: 250, y: 100 };
      default: return { x: 250, y: 750 };
    }
  };

  const handleStartExpedition = (node: RegionTreeNode) => {
    if (!isUnlocked(node)) return;
    const wasConcluded = isConcluded(node);
    onSelectRegion(node.floorNumber, wasConcluded);
  };

  // Draw connections between nodes using SVG curves
  const renderSVGConnections = () => {
    const lines: React.ReactNode[] = [];
    
    REGION_TREE_NODES.forEach(node => {
      const fromCoords = getNodeCoords(node);
      const nodeUnlocked = isUnlocked(node);
      const nodeConcluded = isConcluded(node);

      node.successors.forEach(succId => {
        const succNode = REGION_TREE_NODES.find(n => n.floorNumber === succId);
        if (!succNode) return;

        const toCoords = getNodeCoords(succNode);
        const pathUnlocked = nodeConcluded; // Unlocked if the source node is concluded

        // Curved Cubic Bezier lines
        const dx = toCoords.x - fromCoords.x;
        const dy = toCoords.y - fromCoords.y;
        const cpY1 = fromCoords.y + dy * 0.45;
        const cpY2 = fromCoords.y + dy * 0.55;

        const pathData = `M ${fromCoords.x} ${fromCoords.y} C ${fromCoords.x} ${cpY1}, ${toCoords.x} ${cpY2}, ${toCoords.x} ${toCoords.y}`;

        lines.push(
          <path
            key={`${node.floorNumber}-${succId}`}
            d={pathData}
            fill="none"
            stroke={pathUnlocked ? '#06b6d4' : '#1e293b'}
            strokeWidth={pathUnlocked ? '2.5' : '1.5'}
            strokeDasharray={pathUnlocked ? 'none' : '4,4'}
            opacity={pathUnlocked ? '0.8' : '0.4'}
            className={pathUnlocked ? 'animate-[dash_10s_linear_infinite]' : ''}
          />
        );

        // Add secondary glowing line for active paths
        if (pathUnlocked) {
          lines.push(
            <path
              key={`${node.floorNumber}-${succId}-glow`}
              d={pathData}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="5"
              opacity="0.15"
              className="blur-[2px]"
            />
          );
        }
      });
    });

    return (
      <svg className="absolute inset-0 pointer-events-none w-full h-full z-0">
        {lines}
      </svg>
    );
  };

  const activeNode = selectedNode || REGION_TREE_NODES[0];
  const activeNodeUnlocked = isUnlocked(activeNode);
  const activeNodeConcluded = isConcluded(activeNode);

  return (
    <div className="absolute inset-0 z-50 bg-[#020208] text-slate-100 font-sans flex flex-col pointer-events-auto overflow-hidden">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#04040d]/90 px-6 py-4 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onReturnToVillage}
            className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            VILA
          </button>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex flex-col">
            <h2 className="text-sm font-black font-mono tracking-widest text-cyan-400 uppercase">
              Cartografia da Torre
            </h2>
            <p className="text-[10px] text-slate-400 uppercase font-mono">
              Selecione o seu caminho de ascensão
            </p>
          </div>
        </div>

        {/* HUD de Recursos Temporários / Runas */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="bg-slate-950/60 border border-cyan-500/20 rounded-xl px-4 py-1.5 flex items-center gap-2">
            <Coins className="w-4 h-4 text-cyan-400" />
            <span>Cristais na Run: <span className="text-cyan-300 font-bold">{currentRunCrystals}</span></span>
          </div>
          {currentRunLevel > 1 && (
            <div className="bg-slate-950/60 border border-purple-500/20 rounded-xl px-4 py-1.5 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Nível da Run: <span className="text-purple-300 font-bold">Lvl {currentRunLevel}</span></span>
            </div>
          )}
          <div className="bg-slate-950/60 border border-amber-500/20 rounded-xl px-4 py-1.5 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span>Multiplicador: <span className="text-amber-300 font-bold">+{Math.round((climbBonusMult - 1) * 100)}%</span></span>
          </div>
        </div>
      </div>

      {/* THREE-COLUMN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT COLUMN: Hunter Status & Info */}
        <div className="w-[300px] border-r border-white/5 bg-[#03030b] p-6 flex flex-col gap-6 overflow-y-auto hidden lg:flex">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
              Caçador Ativo
            </span>
            <div className="bg-slate-950 border border-white/5 p-4 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan-950/50 border border-cyan-400/30 flex items-center justify-center text-xl">
                {activeArchetype === Archetype.ARCHER && '🏹'}
                {activeArchetype === Archetype.MAGE && '🔮'}
                {activeArchetype === Archetype.VORGAR && '🛡️'}
                {activeArchetype === Archetype.SUMMONER && '🐙'}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black font-mono tracking-wider text-white">
                  {activeArchetype === Archetype.ARCHER && 'LYRA (ARQUEIRA)'}
                  {activeArchetype === Archetype.MAGE && 'MALAKAR (MAGO)'}
                  {activeArchetype === Archetype.VORGAR && 'VORGAR (GUERREIRO)'}
                  {activeArchetype === Archetype.SUMMONER && 'CELESTE (INVOCADORA)'}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  PRONTOS PARA ASCENSÃO
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
              Cofre da Vila
            </span>
            <div className="bg-slate-950 border border-white/5 p-4 rounded-xl flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Cristais Permanentes:</span>
                <span className="text-amber-300 font-bold flex items-center gap-1">
                  💎 {saveData.permanentManaCrystals}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>Regiões Concluídas:</span>
                <span>{concludedList.length} / 10</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
              Diretrizes de Ascensão
            </span>
            <div className="bg-slate-950/60 border border-white/5 p-4 rounded-xl flex flex-col gap-3 text-xs leading-relaxed text-slate-400">
              <div className="flex gap-2">
                <Compass className="w-4 h-4 text-cyan-400 shrink-0" />
                <p>Cruze caminhos interconectados. Regiões vizinhas são desbloqueadas após derrotar o chefe correspondente.</p>
              </div>
              <div className="flex gap-2">
                <History className="w-4 h-4 text-purple-400 shrink-0" />
                <p>Se você morrer, retorna à Vila. Seus desbloqueios permanecem para a próxima run.</p>
              </div>
              <div className="flex gap-2">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <p>Regiões já limpas podem ser jogadas novamente para farmar Cristais extras e testar builds.</p>
              </div>
            </div>
          </div>

          {/* Footer of Left Column */}
          <div className="mt-auto pt-4 border-t border-white/5">
            <button
              onClick={onReturnToVillage}
              className="w-full py-3 bg-rose-950/40 border border-rose-500/30 hover:bg-rose-900/40 text-rose-300 font-mono font-bold tracking-wider text-xs rounded-xl transition-all uppercase cursor-pointer text-center"
            >
              Abandona Expedição
            </button>
          </div>
        </div>

        {/* CENTER COLUMN: The Scrollable Tree Map */}
        <div 
          ref={mapContainerRef}
          className="flex-1 bg-[#010104] overflow-y-auto relative flex justify-center py-10 select-none scrollbar-thin scrollbar-thumb-white/10"
        >
          {/* Subtle Cyber Grid Background overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff03_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

          {/* Map canvas container */}
          <div className="w-[500px] h-[850px] relative z-10 shrink-0">
            {/* Draw paths */}
            {renderSVGConnections()}

            {/* Draw nodes */}
            {REGION_TREE_NODES.map(node => {
              const coords = getNodeCoords(node);
              const unlocked = isUnlocked(node);
              const concluded = isConcluded(node);
              const isSelected = selectedNode?.floorNumber === node.floorNumber;
              const isHovered = hoveredNode?.floorNumber === node.floorNumber;

              // Setup node colors and glows
              let nodeBorderColor = 'border-slate-800';
              let nodeBg = 'bg-slate-950/90';
              let nodeGlow = '';
              let textColor = 'text-slate-500';

              if (unlocked) {
                textColor = 'text-slate-200';
                if (concluded) {
                  nodeBorderColor = 'border-emerald-500/50';
                  nodeBg = 'bg-[#031d10]';
                  nodeGlow = 'shadow-[0_0_15px_rgba(16,185,129,0.15)]';
                } else {
                  nodeBorderColor = 'border-cyan-500/50';
                  nodeBg = 'bg-[#021820]';
                  nodeGlow = 'shadow-[0_0_20px_rgba(6,182,212,0.25)] animate-pulse';
                }
              }

              if (isSelected) {
                nodeBorderColor = 'border-amber-400';
                nodeGlow = 'shadow-[0_0_25px_rgba(251,191,36,0.5)] scale-110';
              }

              return (
                <div
                  key={node.floorNumber}
                  style={{ 
                    left: `${coords.x}px`, 
                    top: `${coords.y}px`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  className="absolute z-20 cursor-pointer"
                  onClick={() => unlocked && setSelectedNode(node)}
                  onMouseEnter={() => unlocked && setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Outer Pulsing Ring */}
                  {unlocked && !concluded && (
                    <div className="absolute inset-0 rounded-full bg-cyan-400/15 animate-ping opacity-60 scale-125" />
                  )}

                  {/* Node Button */}
                  <div className={`w-14 h-14 rounded-full border-2 ${nodeBg} ${nodeBorderColor} ${nodeGlow} flex items-center justify-center transition-all duration-300 hover:scale-115 relative group`}>
                    
                    {/* Visual Icon */}
                    <span className="text-xl">
                      {unlocked ? (
                        concluded ? (
                          '✓'
                        ) : (
                          getBiomeDecoration(node.biome)
                        )
                      ) : (
                        <Lock className="w-5 h-5 text-slate-700" />
                      )}
                    </span>

                    {/* Small tag/label beneath or above node */}
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider font-semibold">
                      <span className={isSelected ? 'text-amber-300 font-bold' : unlocked ? 'text-slate-400' : 'text-slate-600'}>
                        {node.floorNumber}. {node.regionName.split(' ')[0]}
                      </span>
                    </div>

                    {/* Tiny Checkmark badge inside Node */}
                    {concluded && (
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] text-slate-950 font-black shadow-md border border-[#020208]">
                        ✓
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Region Details Panel */}
        <div className="w-[350px] border-l border-white/5 bg-[#03030b] p-6 flex flex-col gap-6 overflow-y-auto">
          
          {/* Header of Details */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
              Detalhes da Região
            </span>
            <h3 className="text-2xl font-black font-mono uppercase text-white tracking-wide">
              {activeNode.regionName}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold uppercase ${getDifficultyBadge(activeNode.dificuldade)}`}>
                {activeNode.dificuldade}
              </span>
              <span className="bg-slate-950 text-slate-400 border border-white/5 text-[10px] px-2.5 py-0.5 rounded-full font-mono">
                BIOMA: {activeNode.biome.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-white/5" />

          {/* Description */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              Explanação
            </span>
            <p className="text-xs text-slate-400 leading-relaxed font-sans bg-slate-950/50 border border-white/5 p-3 rounded-xl italic">
              "{activeNode.description}"
            </p>
          </div>

          {/* Boss info */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
              Guardião Boss
            </span>
            <div className="bg-slate-950 border border-white/5 p-4 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center text-lg">
                👹
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black font-mono tracking-wider text-rose-300 uppercase">
                  {activeNode.bossName}
                </span>
                <span className="text-[9px] text-rose-500/80 font-mono">
                  SINDICATO DO CAOS • AMBOS OS ESTADOS
                </span>
              </div>
            </div>
          </div>

          {/* Reward Bonus */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
              Recompensa de Rota
            </span>
            <div className="bg-slate-950 border border-white/5 p-3 rounded-xl text-xs flex items-center gap-3">
              <span className="text-xl">💎</span>
              <div className="flex flex-col">
                <span className="font-bold text-white font-mono uppercase text-[10px]">Efeito de Purificação:</span>
                <span className="text-slate-400 text-xs mt-0.5">{activeNode.recompensa}</span>
              </div>
            </div>
          </div>

          {/* Action Button at bottom */}
          <div className="mt-auto pt-6 border-t border-white/5 flex flex-col gap-3">
            {activeNodeUnlocked ? (
              <button
                onClick={() => handleStartExpedition(activeNode)}
                className={`w-full py-4 rounded-xl font-mono font-bold tracking-wider text-xs uppercase cursor-pointer flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 ${
                  activeNodeConcluded 
                    ? 'bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                }`}
              >
                {activeNodeConcluded ? (
                  <>
                    <History className="w-4 h-4 text-emerald-400 shrink-0" />
                    REJOGAR REGIÃO (REPLAY)
                  </>
                ) : (
                  <>
                    <Swords className="w-4 h-4 text-slate-950 shrink-0" />
                    INICIAR EXPEDIÇÃO
                  </>
                )}
              </button>
            ) : (
              <div className="w-full py-4 rounded-xl font-mono font-bold tracking-wider text-xs uppercase border border-slate-800 bg-slate-950 text-slate-600 flex items-center justify-center gap-2">
                <Lock className="w-4 h-4 text-slate-700 shrink-0" />
                CAMINHO BLOQUEADO
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
