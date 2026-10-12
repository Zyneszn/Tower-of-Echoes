import React, { useEffect, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { CharacterSelect } from './components/CharacterSelect';
import { GameState, Archetype, RunEndStats } from './types';
import { audioManager } from './audioManager';
import { AudioControlWidget } from './components/AudioControlWidget';

const bgPattern = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='30' cy='30' rx='22' ry='14' fill='%23278f80' transform='rotate(-15 30 30)' opacity='0.7' /%3E%3Cellipse cx='90' cy='90' rx='20' ry='12' fill='%23278f80' transform='rotate(-15 90 90)' opacity='0.7' /%3E%3C/svg%3E")`;

const formatTime = (totalSecs?: number) => {
  if (totalSecs === undefined) return "00:00";
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const translateClass = (charClass?: string) => {
  if (!charClass) return "Desconhecido";
  switch(charClass) {
    case 'ARCHER': return '🏹 Lyra (Arqueira)';
    case 'MAGE': return '🔮 Kael (Mago Cósmico)';
    case 'VORGAR': return '🔨 Vorgar (Esmagador)';
    case 'SUMMONER': return '💀 Malakar (Invocador)';
    default: return charClass;
  }
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MAIN_MENU);
  const [selectedArchetype, setSelectedArchetype] = useState<Archetype>(Archetype.ARCHER);
  const [lastRunStats, setLastRunStats] = useState<RunEndStats | null>(null);

  useEffect(() => {
    if (gameState === GameState.MAIN_MENU) {
      audioManager.setFloorBiome('MENU');
    }
  }, [gameState]);

  const handleStartGame = () => {
    audioManager.initAudio();
    setGameState(GameState.CHAR_SELECT);
  };

  const handleStartWithBuild = (archetype: Archetype) => {
    setSelectedArchetype(archetype);
    setGameState(GameState.VILA);
  };

  const handleGameOver = (stats?: RunEndStats) => {
    if (stats) setLastRunStats(stats);
    setGameState(GameState.GAME_OVER);
  };

  const handleReturnToLobby = () => {
    setGameState(GameState.VILA);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#2f9e8e] font-sans select-none text-white touch-none">
      {gameState === GameState.MAIN_MENU && (
        <div 
          className="absolute inset-0 bg-[#2f9e8e] flex flex-col items-center justify-center text-white overflow-hidden"
          style={{ backgroundImage: bgPattern, backgroundSize: '120px 120px' }}
        >
          <div className="absolute top-4 right-5 z-50">
            <AudioControlWidget />
          </div>

          {/* Main Title Banner */}
          <div className="z-10 text-center mb-8 px-4 flex flex-col items-center max-w-xl">
            <h1 className="text-5xl md:text-7xl font-black text-white mb-8 tracking-tight uppercase drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
              Tower of Echoes
            </h1>

            {/* 3D Pop Arcade Start CTA */}
            <button
              onClick={handleStartGame}
              className="px-10 py-4 rounded-2xl bg-[#f3a65a] hover:bg-[#f5b878] text-slate-950 font-black tracking-widest text-lg transition-all transform hover:scale-105 uppercase border-b-4 border-amber-700 shadow-2xl cursor-pointer flex items-center gap-3"
            >
              <span>Entrar na Torre</span>
            </button>
          </div>
        </div>
      )}

      {gameState === GameState.CHAR_SELECT && (
        <CharacterSelect 
          onStartWithBuild={handleStartWithBuild} 
          onBackToMenu={() => setGameState(GameState.MAIN_MENU)}
        />
      )}

      {(gameState === GameState.VILA || gameState === GameState.FLOOR_0 || gameState === GameState.TOWER || gameState === GameState.TRANSITION) && (
        <GameCanvas 
          initialState={gameState}
          archetype={selectedArchetype}
          onGameOver={handleGameOver}
        />
      )}

      {gameState === GameState.GAME_OVER && (
        <div 
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 animate-in fade-in duration-700 font-sans overflow-y-auto"
          style={{ backgroundImage: bgPattern, backgroundSize: '120px 120px' }}
        >
          <div className="text-center p-6 sm:p-10 border-2 border-rose-500/30 max-w-xl w-full relative bg-slate-950/90 rounded-3xl shadow-2xl backdrop-blur-xl my-4">
            {/* Pulsing indicator */}
            <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] tracking-widest uppercase font-black mb-4 inline-block animate-pulse">
              Conexão Cortada • Sua Essência Retornou
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-rose-500 mb-2 tracking-tight uppercase drop-shadow-lg">
              FRACASSO NA EXPEDIÇÃO
            </h2>
            <p className="text-slate-400 mb-6 text-sm tracking-wide">Você sucumbiu aos perigos da Torre, mas seus ecos fortalecem a alma.</p>
            
            {/* Run Stats Table */}
            {lastRunStats && (
              <div className="space-y-4 mb-6">
                {/* Hero and Location info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3 text-left">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Caçador Utilizado</span>
                    <span className="text-sm font-bold text-slate-100 truncate block">{translateClass(lastRunStats.hunterClass)}</span>
                  </div>
                  <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3 text-left">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Local da Morte</span>
                    <span className="text-sm font-bold text-amber-400 truncate block">{lastRunStats.regionName || 'Andar Desconhecido'}</span>
                  </div>
                </div>

                {/* Performance stats grid */}
                <div className="grid grid-cols-3 gap-2 bg-slate-900/40 border border-white/5 rounded-2xl p-4 text-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Tempo</span>
                    <span className="text-base font-black text-white mt-1">{formatTime(lastRunStats.timeElapsed)}</span>
                  </div>
                  <div className="flex flex-col border-x border-white/10">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Abates</span>
                    <span className="text-base font-black text-white mt-1">{lastRunStats.monstersDefeated ?? 0}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Andar Máximo</span>
                    <span className="text-base font-black text-white mt-1">Andar {lastRunStats.floorReached}</span>
                  </div>
                </div>

                {/* Bosses defeated if any */}
                {lastRunStats.bossesDefeated && lastRunStats.bossesDefeated.length > 0 && (
                  <div className="bg-slate-900/60 border border-white/15 rounded-2xl p-4 text-left">
                    <span className="text-[10px] text-purple-400 uppercase tracking-wider block mb-2 font-bold">👑 Chefes Purificados</span>
                    <div className="flex flex-wrap gap-1.5">
                      {lastRunStats.bossesDefeated.map((bName, idx) => (
                        <span key={idx} className="px-2.5 py-0.5 text-xs font-bold rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          {bName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loss Breakdown Card */}
                <div className="bg-slate-950 border border-white/10 rounded-2xl p-4 text-left space-y-3 shadow-inner">
                  <div className="flex justify-between items-center text-sm text-slate-300">
                    <span>Cristais Coletados na Run:</span>
                    <span className="text-slate-100 font-bold flex items-center gap-1">
                      {lastRunStats.crystalsGathered} <span className="text-amber-500 text-xs">💎</span>
                    </span>
                  </div>
                  <div className="h-px bg-white/5 my-1" />
                  
                  <div className="flex justify-between items-center text-sm text-rose-400">
                    <span className="flex items-center gap-1">❌ Perdidos na Torre (80%):</span>
                    <span className="font-bold">-{lastRunStats.crystalsLost} 💎</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm text-emerald-400 bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
                    <span className="flex items-center gap-1 font-semibold">💎 Resgatados p/ o Cofre (20%):</span>
                    <span className="font-black">+{lastRunStats.crystalsSaved} 💎</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleReturnToLobby}
              className="w-full py-4 bg-rose-500 hover:bg-rose-400 text-slate-950 font-black tracking-widest uppercase text-sm rounded-xl border-b-4 border-rose-800 shadow-xl transition-all active:scale-95 cursor-pointer"
            >
              Retornar à Vila dos Ecos
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
