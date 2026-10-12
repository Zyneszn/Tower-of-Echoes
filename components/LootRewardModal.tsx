import React, { useState } from 'react';
import { Sparkles, Crown, Shield, Zap, Flame, Award, ArrowRight, Home, CheckCircle2, ChevronRight } from 'lucide-react';
import { Archetype, Stats } from '../types';
import { ActiveLootDraft, EquipmentItem, ItemRarity, PersistentSaveData } from '../src_types_progression';
import { audioManager } from '../audioManager';

interface LootRewardModalProps {
  isOpen: boolean;
  floor: number;
  bossName: string;
  isFirstVictory: boolean;
  draft: ActiveLootDraft | null;
  saveData: PersistentSaveData;
  playerClass: Archetype;
  onSelectReward: (item: EquipmentItem) => void;
  onCollectCrystals: (amount: number) => void;
  onProceedToMap: () => void;
  onReturnToVila: () => void;
}

export const LootRewardModal: React.FC<LootRewardModalProps> = ({
  isOpen,
  floor,
  bossName,
  isFirstVictory,
  draft,
  saveData,
  playerClass,
  onSelectReward,
  onCollectCrystals,
  onProceedToMap,
  onReturnToVila
}) => {
  const [chestPhase, setChestPhase] = useState<'CLOSED' | 'OPENING' | 'REVEALED'>('CLOSED');
  const [chosenItem, setChosenItem] = useState<EquipmentItem | null>(null);
  const [collectedCrystals, setCollectedCrystals] = useState<number | null>(null);

  if (!isOpen || !draft) return null;

  const handleOpenChest = () => {
    setChestPhase('OPENING');
    audioManager.playLevelUpSfx();
    setTimeout(() => {
      setChestPhase('REVEALED');
    }, 1100);
  };

  const handlePickItem = (item: EquipmentItem) => {
    setChosenItem(item);
    audioManager.playItemPickSfx();
    onSelectReward(item);
  };

  const handlePickCrystals = (amount: number) => {
    setCollectedCrystals(amount);
    audioManager.playItemPickSfx();
    onCollectCrystals(amount);
  };

  // Encontra o item que está atualmente equipado pelo jogador no mesmo slot
  const getCurrentlyEquippedItem = (slot: string): EquipmentItem | null => {
    const equippedInstanceId = saveData.equippedItems?.[playerClass]?.[slot];
    if (!equippedInstanceId) return null;
    return saveData.inventory.find(i => i.id === equippedInstanceId) || null;
  };

  const getRarityBadge = (rarity: ItemRarity) => {
    switch (rarity) {
      case 'LEGENDARY':
        return {
          label: 'Lendário',
          textClass: 'text-amber-400',
          borderClass: 'border-amber-500/30',
          bgClass: 'bg-amber-500/10',
          glowClass: 'from-amber-500/20 via-transparent to-transparent',
          badgeBorder: 'border-amber-500/40 bg-amber-950/60 text-amber-300'
        };
      case 'EPIC':
        return {
          label: 'Épico',
          textClass: 'text-purple-400',
          borderClass: 'border-purple-500/30',
          bgClass: 'bg-purple-500/10',
          glowClass: 'from-purple-500/20 via-transparent to-transparent',
          badgeBorder: 'border-purple-500/40 bg-purple-950/60 text-purple-300'
        };
      case 'RARE':
        return {
          label: 'Raro',
          textClass: 'text-cyan-400',
          borderClass: 'border-cyan-500/30',
          bgClass: 'bg-cyan-500/10',
          glowClass: 'from-cyan-500/20 via-transparent to-transparent',
          badgeBorder: 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300'
        };
      case 'UNCOMMON':
        return {
          label: 'Incomum',
          textClass: 'text-emerald-400',
          borderClass: 'border-emerald-500/30',
          bgClass: 'bg-emerald-500/10',
          glowClass: 'from-emerald-500/20 via-transparent to-transparent',
          badgeBorder: 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
        };
      default:
        return {
          label: 'Comum',
          textClass: 'text-slate-400',
          borderClass: 'border-slate-700',
          bgClass: 'bg-slate-800/40',
          glowClass: 'from-slate-700/20 via-transparent to-transparent',
          badgeBorder: 'border-slate-700 bg-slate-900 text-slate-400'
        };
    }
  };

  const isCompleted = chosenItem !== null || collectedCrystals !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl overflow-hidden my-auto">
        {/* Ambient background glow */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* --- FASE 1: BAÚ FECHADO --- */}
        {chestPhase === 'CLOSED' && (
          <div className="flex flex-col items-center text-center py-6 w-full animate-fade-in">
            <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 mb-3">
              <Crown className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>

            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                {isFirstVictory ? '★ Primeira Conquista de Região!' : 'Vitória sobre o Guardião'}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black uppercase text-slate-100 tracking-wider mt-2">
              {bossName} Derrotado!
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mt-1.5 mb-6 leading-relaxed">
              Você purificou a Região {floor}. O Baú dos Ecos Ancestrais materializou-se diante do portal com os tesouros da vitória.
            </p>

            {/* Baú pulsante animado */}
            <div className="w-32 h-32 flex items-center justify-center bg-slate-950/60 rounded-full border-2 border-amber-500/30 relative shadow-2xl shadow-amber-500/15 mb-8 hover:scale-105 transition-transform">
              <span className="text-6xl select-none animate-bounce" style={{ animationDuration: '2.5s' }}>🎁</span>
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
              </span>
            </div>

            <button
              onClick={handleOpenChest}
              className="px-10 py-4 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black uppercase tracking-wider text-xs sm:text-sm rounded-2xl shadow-xl shadow-amber-500/20 hover:shadow-amber-500/30 transition-all cursor-pointer flex items-center justify-center gap-2.5 active:scale-95"
            >
              <Sparkles className="w-4 h-4 animate-spin" style={{ animationDuration: '6s' }} />
              Abrir Baú de Recompensas
            </button>
          </div>
        )}

        {/* --- FASE 2: ABERTURA COM EFEITO DE CANALIZAÇÃO --- */}
        {chestPhase === 'OPENING' && (
          <div className="flex flex-col items-center text-center py-12 w-full animate-fade-in">
            <div className="w-32 h-32 flex items-center justify-center bg-slate-950/40 rounded-full border-2 border-amber-500/60 relative animate-pulse mb-6">
              <span className="text-6xl select-none animate-spin" style={{ animationDuration: '1.2s' }}>✨</span>
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest text-amber-400 animate-pulse">
              Sintonizando os Ecos da Torre...
            </h3>
            <p className="text-xs text-slate-400 mt-1">Revelando as opções de loot do chefe</p>
          </div>
        )}

        {/* --- FASE 3: REVELAÇÃO DOS ITENS OU CRISTAIS --- */}
        {chestPhase === 'REVEALED' && (
          <div className="flex flex-col items-center text-center w-full animate-fade-in">
            {/* Header da Tela de Escolha */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                {draft.isChest ? 'Escolha 1 Equipamento para sua Conta' : 'Reserva de Cristais de Mana'}
              </div>
              <h3 className="text-lg sm:text-xl font-black uppercase text-slate-100 tracking-wide">
                {draft.isChest ? 'Recompensas Forjadas pelo Chefe' : 'Espólio de Mana Concentrada'}
              </h3>
              <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1">
                {draft.isChest
                  ? 'Selecione uma das 3 opções abaixo para enviar diretamente ao seu Cofre permanente na Vila.'
                  : 'As energias residuais da região colapsaram em uma rica fonte de Cristais de Mana para sua Forja.'}
              </p>
            </div>

            {/* CASO 1: BAÚ DE EQUIPAMENTOS (3 CARTAS) */}
            {draft.isChest && draft.offers.length > 0 && !isCompleted && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-6">
                {draft.offers.map((item, idx) => {
                  const rarityStyle = getRarityBadge(item.rarity);
                  const currentlyEquipped = getCurrentlyEquippedItem(item.slot);

                  return (
                    <div
                      key={item.id || idx}
                      className={`relative flex flex-col justify-between rounded-2xl p-4 sm:p-5 border transition-all text-left bg-slate-950/80 hover:bg-slate-900/90 ${rarityStyle.borderClass} shadow-xl hover:shadow-2xl hover:scale-[1.02] group`}
                    >
                      {/* Glow topo da carta */}
                      <div className={`absolute top-0 left-0 right-0 h-24 bg-gradient-to-b ${rarityStyle.glowClass} rounded-t-2xl pointer-events-none opacity-40 group-hover:opacity-70 transition-opacity`} />

                      <div>
                        {/* Topo: Ícone + Rarity Badge */}
                        <div className="flex items-start justify-between gap-2 mb-3 relative">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border ${rarityStyle.borderClass} ${rarityStyle.bgClass}`}>
                            {item.slot === 'WEAPON' ? '⚔️' :
                             item.slot === 'CHEST' ? '🛡️' :
                             item.slot === 'RING' ? '💍' : '📿'}
                          </div>

                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${rarityStyle.badgeBorder}`}>
                            {rarityStyle.label}
                          </span>
                        </div>

                        {/* Nome do Item */}
                        <h4 className="text-slate-100 font-black text-sm sm:text-base uppercase tracking-wide group-hover:text-amber-300 transition-colors">
                          {item.name} {item.level > 0 ? `+${item.level}` : ''}
                        </h4>

                        <p className="text-[10px] text-slate-400 uppercase mt-0.5 mb-3 font-semibold">
                          {item.slot === 'WEAPON' ? 'Arma' :
                           item.slot === 'CHEST' ? 'Armadura Corporal' :
                           item.slot === 'RING' ? 'Anel de Poder' : 'Amuleto Relíquia'}
                          {item.hunterClass && ` • Exclusivo: ${item.hunterClass}`}
                        </p>

                        {/* Atributos Fornecidos */}
                        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-2.5 mb-3 flex flex-col gap-1 text-[11px] font-mono">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">
                            Atributos Concedidos:
                          </span>
                          {Object.entries(item.stats).map(([k, v]) => {
                            if (typeof v !== 'number') return null;
                            const isPercent = ['critChance', 'critDamage', 'omnivamp', 'summonPower', 'skillRadiusMult', 'atkSpeed', 'tenacity'].includes(k);
                            const label = k === 'maxHp' ? 'Vida Máx' :
                                          k === 'ad' ? 'Dano (AD)' :
                                          k === 'ap' ? 'Poder Mag (AP)' :
                                          k === 'armor' ? 'Armadura' :
                                          k === 'mr' ? 'Resistência Mag' :
                                          k === 'moveSpeed' ? 'Velocidade' :
                                          k === 'atkSpeed' ? 'Vel. Ataque' :
                                          k === 'omnivamp' ? 'Vampirismo' :
                                          k === 'critChance' ? 'Chance Crítica' :
                                          k === 'critDamage' ? 'Dano Crítico' :
                                          k === 'summonPower' ? 'Evocação' :
                                          k === 'regen' ? 'Regeneração' :
                                          k === 'skillRadiusMult' ? 'Área de Hab.' : k;
                            const valStr = isPercent ? `+${(v * 100).toFixed(0)}%` : `+${v.toFixed(0)}`;
                            return (
                              <div key={k} className="flex justify-between text-slate-300">
                                <span>{label}:</span>
                                <span className="text-emerald-400 font-bold">{valStr}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Efeito Passivo Único */}
                        {item.uniqueEffectDesc && (
                          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5 mb-3 text-left">
                            <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1 mb-1">
                              <Sparkles className="w-3 h-3" /> Efeito Passivo
                            </span>
                            <p className="text-[10px] text-amber-200/90 leading-relaxed font-sans">
                              {item.uniqueEffectDesc}
                            </p>
                          </div>
                        )}

                        {/* Comparação com item atualmente equipado */}
                        <div className="border-t border-slate-800/80 pt-2.5 mb-4 text-[10px] text-slate-400">
                          <span className="font-semibold text-slate-300">Slot Atual: </span>
                          {currentlyEquipped ? (
                            <span className="text-cyan-300">{currentlyEquipped.name} (+{currentlyEquipped.level})</span>
                          ) : (
                            <span className="italic text-slate-500">Nenhum equipado</span>
                          )}
                        </div>
                      </div>

                      {/* Botão de Escolha */}
                      <button
                        onClick={() => handlePickItem(item)}
                        className={`w-full py-3 rounded-xl font-black uppercase tracking-wider text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg ${
                          item.rarity === 'LEGENDARY'
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                            : item.rarity === 'EPIC'
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20'
                            : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20'
                        }`}
                      >
                        <Award className="w-3.5 h-3.5" />
                        Escolher Equipamento
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CASO 2: RESERVA DE CRISTAIS DE MANA (QUANDO NÃO DROPOU BAÚ DE ITENS) */}
            {!draft.isChest && !isCompleted && (
              <div className="flex flex-col items-center p-6 bg-slate-950/70 border border-slate-800 rounded-2xl max-w-md w-full mb-6">
                <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-4xl mb-4 animate-pulse">
                  💎
                </div>
                <span className="text-3xl font-black text-cyan-400 mb-1">
                  +{draft.crystalsReward || 50} Cristais
                </span>
                <p className="text-xs text-slate-400 text-center mb-6">
                  Adicionados imediatamente ao seu montante de Cristais de Mana desta expedição.
                </p>
                <button
                  onClick={() => handlePickCrystals(draft.crystalsReward || 50)}
                  className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black uppercase tracking-wider text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Coletar Cristais de Mana
                </button>
              </div>
            )}

            {/* ESTADO FINAL: RECOMPENSA ESCOLHIDA E CONFIRMADA */}
            {isCompleted && (
              <div className="flex flex-col items-center w-full max-w-lg mx-auto animate-fade-in">
                <div className="flex items-center gap-2 text-emerald-400 text-xs sm:text-sm font-black uppercase tracking-wider mb-6 bg-emerald-500/10 border border-emerald-500/25 px-4 py-2 rounded-xl">
                  <CheckCircle2 className="w-4 h-4" />
                  {chosenItem
                    ? `${chosenItem.name} foi adicionado ao seu Cofre com sucesso!`
                    : `+${collectedCrystals} Cristais de Mana coletados com sucesso!`}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  <button
                    onClick={onProceedToMap}
                    className="p-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black uppercase tracking-wider text-xs rounded-2xl shadow-xl shadow-cyan-500/15 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 active:scale-95"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Mapa de Regiões</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-semibold opacity-90">+20% Cristais na Run</span>
                  </button>

                  <button
                    onClick={onReturnToVila}
                    className="p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 font-black uppercase tracking-wider text-xs rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1 active:scale-95"
                  >
                    <div className="flex items-center gap-1.5">
                      <Home className="w-4 h-4 text-emerald-400" />
                      <span>Retornar à Vila</span>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-400">Salvar 100% dos Cristais</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
