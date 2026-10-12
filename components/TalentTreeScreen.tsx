import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Sword, Shield, Zap, Flame, Clock, Magnet, Ghost, 
  Target, Heart, ArrowUpRight, FastForward, HelpCircle,
  FlaskConical, Activity,
  Wifi, Target as Crosshair
} from 'lucide-react';

// ==========================================
// MOCK DATA GENERATION
// ==========================================
type NodeType = 'GREEN' | 'ORANGE' | 'RED' | 'GRAY';

interface VisualNode {
  id: string;
  x: number;
  y: number;
  type: NodeType;
  icon: string;
  hasNotification?: boolean;
  hasSplatters?: boolean;
  connections: string[];
}

const MOCK_NODES: VisualNode[] = [
  // Center Root
  { id: 'center', x: 0, y: 0, type: 'ORANGE', icon: 'Sword', connections: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'], hasSplatters: true },
  
  // Left Branch
  { id: 'n1', x: -140, y: 0, type: 'GREEN', icon: 'FlaskConical', connections: ['n1_1', 'n1_2', 'n1_3'], hasSplatters: true },
  { id: 'n1_1', x: -280, y: -70, type: 'GRAY', icon: 'HelpCircle', connections: ['n1_1_1'] },
  { id: 'n1_1_1', x: -380, y: -100, type: 'GREEN', icon: 'ArrowUpRight', connections: [] },
  { id: 'n1_2', x: -280, y: 30, type: 'ORANGE', icon: 'Zap', connections: ['n1_2_1'] },
  { id: 'n1_2_1', x: -400, y: 40, type: 'GREEN', icon: 'Clock', connections: [] },
  { id: 'n1_3', x: -220, y: 130, type: 'GREEN', icon: 'Shield', connections: ['n1_3_1'] },
  { id: 'n1_3_1', x: -330, y: 180, type: 'GREEN', icon: 'ArrowUpRight', connections: [] },

  // Top-Left Branch
  { id: 'n2', x: -100, y: -130, type: 'GREEN', icon: 'Sword', connections: ['n2_1'] },
  { id: 'n2_1', x: -210, y: -200, type: 'GREEN', icon: 'Crosshair', connections: ['n2_1_1', 'n2_1_2'] },
  { id: 'n2_1_1', x: -310, y: -170, type: 'RED', icon: 'Target', hasNotification: true, connections: [] },
  { id: 'n2_1_2', x: -250, y: -300, type: 'GREEN', icon: 'Clock', connections: [] },

  // Top Branch
  { id: 'n3', x: 0, y: -160, type: 'GREEN', icon: 'Magnet', connections: ['n3_1', 'n3_2'] },
  { id: 'n3_1', x: -70, y: -270, type: 'ORANGE', icon: 'FastForward', connections: [] },
  { id: 'n3_2', x: 70, y: -280, type: 'ORANGE', icon: 'Flame', connections: [] },

  // Top-Right Branch
  { id: 'n4', x: 130, y: -100, type: 'ORANGE', icon: 'ArrowUpRight', connections: ['n4_1', 'n4_2'] },
  { id: 'n4_1', x: 230, y: -180, type: 'GREEN', icon: 'ArrowUpRight', hasSplatters: true, connections: ['n4_1_1', 'n4_1_2'] },
  { id: 'n4_1_1', x: 300, y: -280, type: 'GREEN', icon: 'Ghost', connections: [] },
  { id: 'n4_1_2', x: 350, y: -170, type: 'GREEN', icon: 'Wifi', connections: [] },
  { id: 'n4_2', x: 250, y: -50, type: 'GREEN', icon: 'FlaskConical', connections: [] },

  // Right Branch
  { id: 'n5', x: 170, y: 10, type: 'GREEN', icon: 'FlaskConical', hasSplatters: true, connections: ['n5_1', 'n5_2'] },
  { id: 'n5_1', x: 300, y: -10, type: 'GREEN', icon: 'ArrowUpRight', connections: ['n5_1_1', 'n5_1_2'] },
  { id: 'n5_1_1', x: 410, y: -80, type: 'ORANGE', icon: 'Crosshair', connections: ['n5_1_1_1'] },
  { id: 'n5_1_1_1', x: 500, y: -40, type: 'RED', icon: 'Flame', hasNotification: true, connections: [] },
  { id: 'n5_1_2', x: 430, y: 50, type: 'GREEN', icon: 'Crosshair', connections: ['n5_1_2_1'] },
  { id: 'n5_1_2_1', x: 530, y: 100, type: 'GRAY', icon: 'HelpCircle', hasNotification: true, connections: [] },
  { id: 'n5_2', x: 260, y: 90, type: 'GREEN', icon: 'FastForward', connections: [] },

  // Bottom-Right Branch
  { id: 'n6', x: 140, y: 160, type: 'GREEN', icon: 'Heart', hasNotification: true, connections: ['n6_1', 'n6_2'] },
  { id: 'n6_1', x: 270, y: 220, type: 'RED', icon: 'Target', hasNotification: true, hasSplatters: true, connections: ['n6_1_1', 'n6_1_2'] },
  { id: 'n6_1_1', x: 380, y: 160, type: 'GREEN', icon: 'ArrowUpRight', connections: [] },
  { id: 'n6_1_2', x: 390, y: 280, type: 'RED', icon: 'Heart', hasNotification: true, connections: [] },
  { id: 'n6_2', x: 220, y: 290, type: 'GREEN', icon: 'Shield', connections: [] },

  // Bottom Branch
  { id: 'n7', x: 0, y: 190, type: 'GREEN', icon: 'FlaskConical', hasSplatters: true, connections: ['n7_1', 'n7_2'] },
  { id: 'n7_1', x: -100, y: 280, type: 'RED', icon: 'Heart', hasNotification: true, connections: [] },
  { id: 'n7_2', x: 90, y: 320, type: 'GREEN', icon: 'Shield', connections: [] },
];

const renderIcon = (name: string, className: string) => {
  const props = { size: 20, className, strokeWidth: 2.5 };
  switch (name) {
    case 'Sword': return <Sword {...props} />;
    case 'Shield': return <Shield {...props} />;
    case 'Zap': return <Zap {...props} />;
    case 'Flame': return <Flame {...props} />;
    case 'Clock': return <Clock {...props} />;
    case 'Magnet': return <Magnet {...props} />;
    case 'Ghost': return <Ghost {...props} />;
    case 'Target': return <Target {...props} />;
    case 'Heart': return <Heart {...props} />;
    case 'ArrowUpRight': return <ArrowUpRight {...props} />;
    case 'FastForward': return <FastForward {...props} />;
    case 'FlaskConical': return <FlaskConical {...props} />;
    case 'Activity': return <Activity {...props} />;
    case 'Wifi': return <Wifi {...props} />;
    case 'Crosshair': return <Crosshair {...props} />;
    case 'HelpCircle': default: return <HelpCircle {...props} />;
  }
};

// SVG Splatter effect component
const Splatter: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <svg 
    className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 w-28 h-28 opacity-90 z-0" 
    style={{ left: x, top: y }} 
    viewBox="0 0 100 100"
  >
    <path d="M40 25 Q50 15 65 25 T80 45 T70 70 T40 80 T25 60 T30 35 Z" fill="#ffffff" />
    <circle cx="20" cy="20" r="3.5" fill="#ffffff" />
    <circle cx="85" cy="30" r="2.5" fill="#ffffff" />
    <circle cx="75" cy="85" r="4.5" fill="#ffffff" />
    <circle cx="25" cy="80" r="3" fill="#ffffff" />
    <circle cx="95" cy="50" r="2" fill="#ffffff" />
    <circle cx="10" cy="60" r="3" fill="#ffffff" />
    
    {/* Colored tiny dots matching the reference art */}
    <circle cx="15" cy="45" r="2" fill="#ff4757" />
    <circle cx="90" cy="65" r="2.5" fill="#2ed573" />
    <circle cx="50" cy="95" r="2" fill="#1e90ff" />
    <circle cx="80" cy="15" r="2" fill="#ffa502" />
  </svg>
);


export const TalentTreeScreen: React.FC = () => {
  // Pan and Zoom Camera state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = -e.deltaY * 0.001;
    setZoom(prev => Math.min(2, Math.max(0.3, prev + zoomDelta)));
  };

  // Node Color Mapper
  const getNodeStyles = (type: NodeType) => {
    switch (type) {
      case 'GREEN':
        return {
          bg: 'bg-[#34b293]',
          shadow: 'shadow-[inset_0_3px_0_rgba(255,255,255,0.4),0_3px_0_rgba(0,0,0,0.15)]'
        };
      case 'ORANGE':
        return {
          bg: 'bg-[#f3a65a]',
          shadow: 'shadow-[inset_0_3px_0_rgba(255,255,255,0.5),0_3px_0_rgba(0,0,0,0.15)]'
        };
      case 'RED':
        return {
          bg: 'bg-[#e65c5c]',
          shadow: 'shadow-[inset_0_3px_0_rgba(255,255,255,0.4),0_3px_0_rgba(0,0,0,0.15)]'
        };
      case 'GRAY':
        return {
          bg: 'bg-[#5d6d7a]',
          shadow: 'shadow-[inset_0_3px_0_rgba(255,255,255,0.3),0_3px_0_rgba(0,0,0,0.2)]'
        };
    }
  };

  // SVG Pattern for the background
  const bgPattern = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='30' cy='30' rx='22' ry='14' fill='%23278f80' transform='rotate(-15 30 30)' opacity='0.7' /%3E%3Cellipse cx='90' cy='90' rx='20' ry='12' fill='%23278f80' transform='rotate(-15 90 90)' opacity='0.7' /%3E%3C/svg%3E")`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2f9e8e] select-none font-sans overflow-hidden"
         style={{ backgroundImage: bgPattern, backgroundSize: '120px 120px' }}>
      
      {/* Viewport Container */}
      <div
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
            {MOCK_NODES.map((node) => {
              return node.connections.map(targetId => {
                const targetNode = MOCK_NODES.find(n => n.id === targetId);
                if (!targetNode) return null;
                return (
                  <line
                    key={`${node.id}-${targetId}`}
                    x1={node.x}
                    y1={node.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke="#ffffff"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                );
              });
            })}
          </svg>

          {/* Splatters (Z-index 0, behind lines and nodes) */}
          {MOCK_NODES.filter(n => n.hasSplatters).map(node => (
            <Splatter key={`splat-${node.id}`} x={node.x} y={node.y} />
          ))}

          {/* Nodes (Z-index 20) */}
          {MOCK_NODES.map(node => {
            const isRoot = node.id === 'center';
            const size = isRoot ? 'w-14 h-14' : 'w-11 h-11';
            const styles = getNodeStyles(node.type);

            return (
              <div
                key={node.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-lg z-20 ${size} ${styles.bg} ${styles.shadow} hover:scale-110 transition-transform`}
                style={{ left: `calc(50% + ${node.x}px)`, top: `calc(50% + ${node.y}px)` }}
              >
                {/* Node Icon */}
                {renderIcon(node.icon, "text-white")}

                {/* Notification Badge */}
                {node.hasNotification && (
                  <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-[#f6b93b] border-2 border-[#2f9e8e] z-30" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================== */}
      {/* UI OVERLAYS (HUD)              */}
      {/* ============================== */}

      {/* Top Left Currency Counters */}
      <div className="absolute top-6 left-6 flex flex-col gap-2 z-30 pointer-events-none">
        {[
          { color: 'bg-emerald-400', val: '2,450' },
          { color: 'bg-amber-400', val: '12' },
          { color: 'bg-purple-400', val: '0' }
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-full border-2 border-dashed border-white/40 bg-black/20 backdrop-blur-sm min-w-[100px]">
            <div className={`w-3.5 h-3.5 rotate-45 ${item.color} shadow-sm`} />
            <span className="text-white font-bold text-sm tracking-wider drop-shadow-md">{item.val}</span>
          </div>
        ))}
      </div>

      {/* Bottom Corner Action Buttons */}
      <div className="absolute bottom-6 left-6 z-30 flex gap-3">
        <button className="px-4 py-2 rounded-xl bg-[#2b2b2b] text-white text-xs font-bold border-b-2 border-black/50 shadow-lg hover:bg-[#3a3a3a] transition-colors">
          [ESC] VOLTAR
        </button>
      </div>

      <div className="absolute bottom-6 right-6 z-30 flex gap-3">
        <button className="px-4 py-2 rounded-xl bg-[#2b2b2b] text-white text-xs font-bold border-b-2 border-black/50 shadow-lg hover:bg-[#3a3a3a] transition-colors">
          [ESPAÇO] DESBLOQUEAR
        </button>
      </div>

    </div>
  );
};
