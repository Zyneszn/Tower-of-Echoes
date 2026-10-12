import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Archetype, Player } from '../types';
import { getHunterTalentTree, HUNTER_TALENT_TREES, createDefaultHunterProgress } from '../src_data_talents';
import { HunterTalentTree, TalentNode, TalentFamily, HunterTalentProgress } from '../src_types_talents';
import { SaveManager } from '../src_systems_progression';
import { PersistentSaveData } from '../src_types_progression';
import { 
  X, ZoomIn, ZoomOut, RotateCcw, Sparkles, Target, Zap, 
  ShieldAlert, Orbit, Flame, Crosshair, Crown, Eye, 
  Wind, Sun, Shield, Disc, Radio, Hexagon, Lock, 
  GitMerge, Compass, Activity, ArrowRight, Layers, CheckCircle2,
  AlertCircle, RefreshCw, Award
} from 'lucide-react';

interface TalentTreeModalProps {
  player: Player;
  onClose: () => void;
  onSelectArchetype?: (archetype: Archetype) => void;
}

// Icon mapper for dynamic talent node icons
const renderNodeIcon = (iconName: string, size = 18, className = '') => {
  switch (iconName) {
    case 'Target': return <Target size={size} className={className} />;
    case 'Crosshair': return <Crosshair size={size} className={className} />;
    case 'Zap': case 'ZapFast': return <Zap size={size} className={className} />;
    case 'ShieldAlert': return <ShieldAlert size={size} className={className} />;
    case 'Shield': return <Shield size={size} className={className} />;
    case 'Orbit': return <Orbit size={size} className={className} />;
    case 'Flame': return <Flame size={size} className={className} />;
    case 'Crown': return <Crown size={size} className={className} />;
    case 'Eye': return <Eye size={size} className={className} />;
    case 'Wind': return <Wind size={size} className={className} />;
    case 'Sun': return <Sun size={size} className={className} />;
    case 'Disc': return <Disc size={size} className={className} />;
    case 'Radio': return <Radio size={size} className={className} />;
    case 'Hexagon': return <Hexagon size={size} className={className} />;
    case 'Lock': return <Lock size={size} className={className} />;
    case 'GitMerge': return <GitMerge size={size} className={className} />;
    case 'Compass': return <Compass size={size} className={className} />;
    case 'Activity': return <Activity size={size} className={className} />;
    case 'Sparkles': case 'Sparkle': default: return <Sparkles size={size} className={className} />;
  }
};

// SVG Splatter effect component
const Splatter: React.FC<{ x: number; y: number; isMage?: boolean }> = ({ x, y, isMage }) => (
  <svg 
    className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 w-28 h-28 opacity-90 z-0" 
    style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }} 
    viewBox="0 0 100 100"
  >
    <path d="M40 25 Q50 15 65 25 T80 45 T70 70 T40 80 T25 60 T30 35 Z" fill="#ffffff" />
    <circle cx="20" cy="20" r="3.5" fill="#ffffff" />
    <circle cx="85" cy="30" r="2.5" fill="#ffffff" />
    <circle cx="75" cy="85" r="4.5" fill="#ffffff" />
    <circle cx="25" cy="80" r="3" fill="#ffffff" />
    <circle cx="95" cy="50" r="2" fill="#ffffff" />
    <circle cx="10" cy="60" r="3" fill="#ffffff" />
    <circle cx="15" cy="45" r="2" fill={isMage ? '#b026ff' : '#ff4757'} />
    <circle cx="90" cy="65" r="2.5" fill={isMage ? '#d946ef' : '#2ed573'} />
    <circle cx="50" cy="95" r="2" fill={isMage ? '#9333ea' : '#1e90ff'} />
    <circle cx="80" cy="15" r="2" fill={isMage ? '#c084fc' : '#ffa502'} />
  </svg>
);

// SVG Pattern for the background
const bgPattern = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='30' cy='30' rx='22' ry='14' fill='%23278f80' transform='rotate(-15 30 30)' opacity='0.7' /%3E%3Cellipse cx='90' cy='90' rx='20' ry='12' fill='%23278f80' transform='rotate(-15 90 90)' opacity='0.7' /%3E%3C/svg%3E")`;

export const TalentTreeModal: React.FC<TalentTreeModalProps> = ({
  player,
  onClose,
  onSelectArchetype
}) => {
  // Save data state
  const [saveData, setSaveData] = useState<PersistentSaveData>(() => SaveManager.load());

  // Currently viewed hunter talent tree (defaults to active player's archetype)
  const [viewedArchetype, setViewedArchetype] = useState<Archetype>(player.archetype);
  const talentTree: HunterTalentTree = getHunterTalentTree(viewedArchetype);

  // Active hunter's talent progress
  const currentProgress: HunterTalentProgress = useMemo(() => {
    const p = saveData.talentProgress?.[viewedArchetype];
    if (p) return p;
    return createDefaultHunterProgress(viewedArchetype);
  }, [saveData, viewedArchetype]);

  // Pan and Zoom Camera state
  const [zoom, setZoom] = useState<number>(0.90);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node selection for detail inspector
  const [selectedNodeId, setSelectedNodeId] = useState<string>('lyra_core');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Canvas container ref
  const containerRef = useRef<HTMLDivElement>(null);

  // Adjacency / Connection Map for the Graph
  const adjacencyMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    talentTree.nodes.forEach(n => {
      if (!map.has(n.id)) map.set(n.id, new Set<string>());
    });

    talentTree.connections.forEach(conn => {
      if (!map.has(conn.from)) map.set(conn.from, new Set<string>());
      if (!map.has(conn.to)) map.set(conn.to, new Set<string>());
      map.get(conn.from)!.add(conn.to);
      map.get(conn.to)!.add(conn.from);
    });

    talentTree.nodes.forEach(n => {
      (n.connections || []).forEach(targetId => {
        if (map.has(n.id) && map.has(targetId)) {
          map.get(n.id)!.add(targetId);
          map.get(targetId)!.add(n.id);
        }
      });
      (n.prerequisites || []).forEach(targetId => {
        if (map.has(n.id) && map.has(targetId)) {
          map.get(n.id)!.add(targetId);
          map.get(targetId)!.add(n.id);
        }
      });
    });

    return map;
  }, [talentTree]);

  // Helper to check if a node is available to unlock
  const isNodeAvailable = useCallback((nodeId: string): boolean => {
    if (currentProgress.unlockedNodeIds.includes(nodeId)) return false;
    const neighbors = adjacencyMap.get(nodeId);
    if (!neighbors) return false;
    for (const neighborId of neighbors) {
      if (currentProgress.unlockedNodeIds.includes(neighborId)) {
        return true;
      }
    }
    return false;
  }, [currentProgress.unlockedNodeIds, adjacencyMap]);

  // Sync selected node when hunter tree switches
  useEffect(() => {
    const defaultNode = talentTree.nodes[0]?.id || '';
    setSelectedNodeId(defaultNode);
  }, [viewedArchetype, talentTree]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Unlock Node Action
  const handleUnlockNode = (node: TalentNode) => {
    if (currentProgress.unlockedNodeIds.includes(node.id)) return;
    if (!isNodeAvailable(node.id)) return;
    if (currentProgress.availablePoints < node.cost) return;

    const newUnlocked = [...currentProgress.unlockedNodeIds, node.id];
    const newSpent = currentProgress.spentPoints + node.cost;
    const newAvailable = currentProgress.availablePoints - node.cost;

    const updatedProg: HunterTalentProgress = {
      ...currentProgress,
      unlockedNodeIds: newUnlocked,
      spentPoints: newSpent,
      availablePoints: newAvailable
    };

    const updatedSave: PersistentSaveData = {
      ...saveData,
      talentProgress: {
        ...(saveData.talentProgress || {}),
        [viewedArchetype]: updatedProg
      }
    };

    setSaveData(updatedSave);
    SaveManager.saveGame(updatedSave);
  };

  // Reset / Respec Talents Action
  const handleResetTalents = () => {
    let coreId = 'lyra_core';
    if (viewedArchetype === Archetype.MAGE) coreId = 'kael_core';
    else if (viewedArchetype === Archetype.VORGAR) coreId = 'vorgar_core';
    const totalPoints = currentProgress.availablePoints + currentProgress.spentPoints;

    const updatedProg: HunterTalentProgress = {
      hunterId: viewedArchetype,
      unlockedNodeIds: [coreId],
      spentPoints: 0,
      availablePoints: totalPoints
    };

    const updatedSave: PersistentSaveData = {
      ...saveData,
      talentProgress: {
        ...(saveData.talentProgress || {}),
        [viewedArchetype]: updatedProg
      }
    };

    setSaveData(updatedSave);
    SaveManager.saveGame(updatedSave);
    setSelectedNodeId(coreId);
  };

  // Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { x: pan.x, y: pan.y };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy
    });
  }, [isDragging]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom Handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = -e.deltaY * 0.0012;
    setZoom(prev => Math.min(1.8, Math.max(0.45, prev + zoomDelta)));
  };

  // Find active node object for inspector
  const activeNode = talentTree.nodes.find(n => n.id === (hoveredNodeId || selectedNodeId)) || talentTree.nodes[0];

  const isMage = viewedArchetype === Archetype.MAGE || viewedArchetype === 'MAGE';
  const isSelectedUnlocked = currentProgress.unlockedNodeIds.includes(activeNode.id);
  const isSelectedAvailable = isNodeAvailable(activeNode.id);
  const canAfford = currentProgress.availablePoints >= activeNode.cost;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2f9e8e] select-none font-sans text-white animate-in fade-in duration-300 overflow-hidden"
      style={{ backgroundImage: bgPattern, backgroundSize: '120px 120px' }}
    >
      
      {/* Top Header: HUD & Controls */}
      <div className="absolute top-4 left-6 right-6 z-40 flex flex-wrap items-center justify-between gap-4 pointer-events-auto">
        
        {/* Top Left Currency Counters HUD */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-full border-2 border-dashed border-white/40 bg-black/30 backdrop-blur-md min-w-[120px]">
            <div className={`w-3.5 h-3.5 rotate-45 ${isMage ? 'bg-[#d946ef]' : 'bg-emerald-400'} shadow-sm shrink-0`} />
            <span className="text-white font-black text-sm tracking-wider drop-shadow-md">{currentProgress.availablePoints} PTS</span>
          </div>
          <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-full border-2 border-dashed border-white/40 bg-black/30 backdrop-blur-md min-w-[120px]">
            <div className="w-3.5 h-3.5 rotate-45 bg-amber-400 shadow-sm shrink-0" />
            <span className="text-white font-black text-sm tracking-wider drop-shadow-md">{saveData.permanentManaCrystals} 💎</span>
          </div>
        </div>

        {/* Hunter Badge (Locked to Current Playing Hunter) */}
        <div className="flex items-center gap-2 px-4 py-2 bg-black/40 border border-white/20 rounded-2xl backdrop-blur-md text-white">
          <span className={`text-xs font-black uppercase tracking-wider ${isMage ? 'text-[#e879f9]' : 'text-[#f3a65a]'}`}>
            {talentTree.hunterName} — {talentTree.title}
          </span>
          <span className={`text-[9px] px-2 py-0.5 ${isMage ? 'bg-[#b026ff] text-white' : 'bg-emerald-500 text-slate-950'} rounded-full font-black`}>
            CAÇADOR ATIVO
          </span>
        </div>

        {/* Respec & Close */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetTalents}
            className="px-4 py-2 rounded-xl bg-black/40 hover:bg-black/60 text-white border border-white/20 text-xs font-bold uppercase tracking-wider backdrop-blur-md transition-all cursor-pointer flex items-center gap-1.5"
            title="Redefinir Talentos"
          >
            <RefreshCw size={14} />
            <span>Redefinir</span>
          </button>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-black/40 hover:bg-rose-600/80 text-white border border-white/20 backdrop-blur-md transition-all cursor-pointer"
            title="Fechar (ESC)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Graph Viewport */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className={`absolute inset-0 cursor-${isDragging ? 'grabbing' : 'grab'}`}
      >
        {/* World Transform */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.05s linear'
          }}
        >
          {/* SVG Connection Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10" style={{ left: '50%', top: '50%' }}>
            {talentTree.connections.map((conn, index) => {
              const fromNode = talentTree.nodes.find(n => n.id === conn.from);
              const toNode = talentTree.nodes.find(n => n.id === conn.to);
              if (!fromNode || !toNode) return null;

              const isFromUnlocked = currentProgress.unlockedNodeIds.includes(fromNode.id);
              const isToUnlocked = currentProgress.unlockedNodeIds.includes(toNode.id);
              const isConnectionActive = isFromUnlocked && isToUnlocked;

              const activeStroke = isMage ? '#e879f9' : '#ffffff';
              const inactiveStroke = isMage ? 'rgba(217, 70, 239, 0.4)' : 'rgba(255, 255, 255, 0.5)';

              return (
                <line
                  key={`conn_${index}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={isConnectionActive ? activeStroke : inactiveStroke}
                  strokeWidth={isConnectionActive ? 3.5 : 2}
                  strokeDasharray={conn.style === 'DASHED' ? '4 4' : undefined}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* Splatters behind Keystones & Roots */}
          {talentTree.nodes.filter(n => n.nodeType === 'KEYSTONE' || n.id.includes('core')).map(node => (
            <Splatter key={`splat-${node.id}`} x={node.x} y={node.y} isMage={isMage} />
          ))}

          {/* Nodes */}
          {talentTree.nodes.map(node => {
            const isSelected = selectedNodeId === node.id;
            const isUnlocked = currentProgress.unlockedNodeIds.includes(node.id);
            const isAvailable = isNodeAvailable(node.id);
            const isRoot = node.id.includes('core');
            const isHybrid = node.nodeType === 'HYBRID';
            const isKeystone = node.nodeType === 'KEYSTONE';

            let nodeTypeColor = 'bg-[#34b293]'; // Emerald Green default
            if (isMage) {
              if (isRoot || isKeystone) {
                nodeTypeColor = 'bg-gradient-to-br from-[#9333ea] to-[#b026ff] shadow-[0_0_15px_rgba(176,38,255,0.7)]';
              } else if (isHybrid) {
                nodeTypeColor = 'bg-gradient-to-tr from-[#9333ea] via-[#b026ff] to-[#f43f5e] ring-2 ring-[#e879f9] shadow-[0_0_12px_rgba(217,70,239,0.5)]';
              } else if (isUnlocked) {
                nodeTypeColor = 'bg-[#9333ea] shadow-[0_0_10px_rgba(176,38,255,0.5)]';
              } else if (isAvailable) {
                nodeTypeColor = 'bg-[#3b0764] ring-2 ring-[#b026ff]';
              } else {
                nodeTypeColor = node.cost > 2 ? 'bg-[#e65c5c]' : 'bg-[#475569]';
              }
            } else {
              if (isRoot || isKeystone) {
                nodeTypeColor = 'bg-[#f3a65a]';
              } else if (isHybrid) {
                nodeTypeColor = 'bg-gradient-to-tr from-[#34b293] to-[#f3a65a] ring-2 ring-amber-300';
              } else if (!isUnlocked && !isAvailable) {
                nodeTypeColor = node.cost > 2 ? 'bg-[#e65c5c]' : 'bg-[#5d6d7a]';
              }
            }

            const sizeClass = isRoot ? 'w-14 h-14' : isKeystone ? 'w-13 h-13' : isHybrid ? 'w-12 h-12' : 'w-11 h-11';
            const shadowStyle = 'shadow-[inset_0_3px_0_rgba(255,255,255,0.4),0_3px_0_rgba(0,0,0,0.2)]';

            const selectionRing = isSelected
              ? isMage
                ? 'ring-4 ring-[#e879f9] shadow-[0_0_22px_#b026ff] scale-115'
                : 'ring-4 ring-white scale-115'
              : 'hover:scale-110';

            return (
              <div
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-xl z-20 ${sizeClass} ${nodeTypeColor} ${shadowStyle} ${selectionRing} transition-all cursor-pointer`}
                style={{ left: `calc(50% + ${node.x}px)`, top: `calc(50% + ${node.y}px)` }}
              >
                {/* Node Icon */}
                {renderNodeIcon(
                  node.icon,
                  isRoot ? 22 : isKeystone ? 20 : 18,
                  'text-white drop-shadow-sm'
                )}

                {/* Notification Badge */}
                {(isAvailable || (isUnlocked && node.cost > 0)) && (
                  <div className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full ${isMage ? 'bg-[#e879f9] border-2 border-[#3b0764]' : 'bg-[#f6b93b] border-2 border-[#2f9e8e]'} z-30`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Inspector Card for Selected Node */}
      {activeNode && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 bg-black/75 border-2 border-white/20 p-4 rounded-2xl backdrop-blur-xl max-w-md w-[90vw] text-center shadow-2xl flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className={`font-black uppercase tracking-wider ${isMage ? 'text-[#e879f9]' : 'text-[#f3a65a]'}`}>
              {activeNode.name}
            </span>
            <span className="text-white/70">{isSelectedUnlocked ? 'DESBLOQUEADO' : `CUSTO: ${activeNode.cost} PTS`}</span>
          </div>
          <p className="text-xs text-white/90 font-sans leading-relaxed">{activeNode.description}</p>
          <div className="pt-1 flex gap-2">
            {isSelectedUnlocked ? (
              <button disabled className={`w-full py-2 ${isMage ? 'bg-[#9333ea]/80' : 'bg-emerald-600/80'} text-white font-bold text-xs rounded-lg uppercase tracking-wider`}>
                ✓ ATIVO
              </button>
            ) : isSelectedAvailable ? (
              <button
                onClick={() => handleUnlockNode(activeNode)}
                disabled={!canAfford}
                className={`w-full py-2 font-black text-xs rounded-lg uppercase tracking-wider transition-all cursor-pointer ${
                  canAfford 
                    ? isMage 
                      ? 'bg-[#b026ff] hover:bg-[#c084fc] text-white shadow-[0_0_15px_rgba(176,38,255,0.4)]' 
                      : 'bg-[#f3a65a] hover:bg-[#f5b878] text-slate-950 shadow-lg' 
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                {canAfford ? `DESBLOQUEAR (${activeNode.cost} PTS)` : 'PONTOS INSUFICIENTES'}
              </button>
            ) : (
              <button disabled className="w-full py-2 bg-slate-800 text-slate-500 font-bold text-xs rounded-lg uppercase tracking-wider">
                🔒 BLOQUEADO
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Action Buttons */}
      <div className="absolute bottom-6 left-6 z-30 flex gap-3 pointer-events-auto">
        <button 
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-[#2b2b2b] text-white text-xs font-bold border-b-2 border-black/50 shadow-lg hover:bg-[#3a3a3a] transition-colors cursor-pointer"
        >
          [ESC] VOLTAR
        </button>
      </div>

      <div className="absolute bottom-6 right-6 z-30 flex gap-3 pointer-events-auto">
        <button 
          onClick={() => {
            if (activeNode && isSelectedAvailable && canAfford) {
              handleUnlockNode(activeNode);
            }
          }}
          disabled={!activeNode || !isSelectedAvailable || !canAfford}
          className={`px-4 py-2 rounded-xl text-xs font-bold border-b-2 shadow-lg transition-colors cursor-pointer ${
            activeNode && isSelectedAvailable && canAfford
              ? isMage
                ? 'bg-[#b026ff] text-white border-purple-900 hover:bg-[#c084fc]'
                : 'bg-[#f3a65a] text-slate-950 border-amber-700 hover:bg-[#f5b878]'
              : 'bg-[#2b2b2b] text-white/40 border-black/50 cursor-not-allowed'
          }`}
        >
          [ESPAÇO] DESBLOQUEAR
        </button>
      </div>

    </div>
  );
};
