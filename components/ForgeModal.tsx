import React, { useState } from 'react';
import { Archetype } from '../types';
import { EquipmentItem, ItemRarity, ItemSlot, PersistentSaveData } from '../src_types_progression';
import { SaveManager } from '../src_systems_progression';
import { EQUIPMENT_DATABASE, upgradeItemInForge } from '../src_data_items';
import { HUNTERS } from '../src_data_catalog';
import { 
  X, 
  Sword, 
  Shield, 
  Heart, 
  Sparkles, 
  Hammer, 
  Gem, 
  ChevronRight, 
  Check, 
  ArrowUp,
  Info,
  CircleAlert
} from 'lucide-react';

interface ForgeModalProps {
  saveData: PersistentSaveData;
  playerArchetype: Archetype;
  onClose: () => void;
  onRefreshPlayerStats: () => void;
}

const bgPattern = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='30' cy='30' rx='22' ry='14' fill='%231e293b' transform='rotate(-15 30 30)' opacity='0.4' /%3E%3Cellipse cx='90' cy='90' rx='20' ry='12' fill='%231e293b' transform='rotate(-15 90 90)' opacity='0.4' /%3E%3C/svg%3E")`;

export const ForgeModal: React.FC<ForgeModalProps> = ({
  saveData,
  playerArchetype,
  onClose,
  onRefreshPlayerStats
}) => {
  const [activeTab, setActiveTab] = useState<'EQUIP' | 'FORGE'>('EQUIP');
  const [selectedHero, setSelectedHero] = useState<Archetype>(playerArchetype);
  const [localSave, setLocalSave] = useState<PersistentSaveData>(saveData);
  
  // Estados para aba de equipamento
  const [selectedSlot, setSelectedSlot] = useState<ItemSlot>('WEAPON');
  const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);

  // Estados para aba da forja
  const [forgeItem, setForgeItem] = useState<EquipmentItem | null>(null);
  const [forgeSuccess, setForgeSuccess] = useState<boolean>(false);

  const inventory = localSave.inventory || [];
  const equippedForHero = localSave.equippedItems?.[selectedHero] || {};

  // Filtrar itens do inventário de acordo com o slot selecionado
  const filteredInventoryItems = inventory.filter(item => {
    if (item.slot !== selectedSlot) return false;
    // Se for arma, apenas mostrar armas específicas do caçador atual
    if (item.slot === 'WEAPON' && item.hunterClass && item.hunterClass !== selectedHero) {
      return false;
    }
    return true;
  });

  const getRarityTextAndColor = (rarity: ItemRarity) => {
    switch (rarity) {
      case 'LEGENDARY': return { name: 'Lendário', text: 'text-amber-400', border: 'border-amber-500', bg: 'bg-amber-950/40', badge: 'bg-amber-500/20 text-amber-300' };
      case 'EPIC': return { name: 'Épico', text: 'text-purple-400', border: 'border-purple-500', bg: 'bg-purple-950/40', badge: 'bg-purple-500/20 text-purple-300' };
      case 'RARE': return { name: 'Raro', text: 'text-cyan-400', border: 'border-cyan-500', bg: 'bg-cyan-950/40', badge: 'bg-cyan-500/20 text-cyan-300' };
      case 'UNCOMMON': return { name: 'Incomum', text: 'text-emerald-400', border: 'border-emerald-500', bg: 'bg-emerald-950/40', badge: 'bg-emerald-500/20 text-emerald-300' };
      default: return { name: 'Comum', text: 'text-slate-400', border: 'border-slate-600', bg: 'bg-slate-900/60', badge: 'bg-slate-500/20 text-slate-300' };
    }
  };

  const getSlotLabelAndIcon = (slot: ItemSlot) => {
    switch (slot) {
      case 'WEAPON': return { label: 'Arma Principal', icon: '⚔️' };
      case 'CHEST': return { label: 'Armadura Corporal', icon: '🛡️' };
      case 'RING': return { label: 'Anel do Pacto', icon: '💍' };
      case 'AMULET': return { label: 'Amuleto Relíquia', icon: '📿' };
    }
  };

  // Equipar um item (com desequipamento automático caso esteja em outro caçador)
  const handleEquipItem = (item: EquipmentItem) => {
    const freshSave = SaveManager.loadSave();
    const updatedEquipped: Record<string, Record<ItemSlot, string | null>> = { ...(freshSave.equippedItems || {}) };
    
    // Se o item já estiver equipado em algum outro caçador, remove dele
    Object.keys(updatedEquipped).forEach((heroKey) => {
      const heroSlots = updatedEquipped[heroKey];
      if (heroSlots) {
        Object.keys(heroSlots).forEach((slotKey) => {
          if (heroSlots[slotKey as ItemSlot] === item.id) {
            heroSlots[slotKey as ItemSlot] = null;
          }
        });
      }
    });

    if (!updatedEquipped[selectedHero]) {
      updatedEquipped[selectedHero] = { WEAPON: null, CHEST: null, RING: null, AMULET: null };
    }

    updatedEquipped[selectedHero][item.slot] = item.id;

    const newSave: PersistentSaveData = {
      ...freshSave,
      equippedItems: updatedEquipped
    };

    setLocalSave(newSave);
    SaveManager.saveGame(newSave);
    onRefreshPlayerStats();
    setSelectedItem(item);
  };

  // Desequipar um item de determinado slot
  const handleUnequipSlot = (slot: ItemSlot) => {
    const updatedEquipped = { ...localSave.equippedItems };
    if (updatedEquipped[selectedHero]) {
      updatedEquipped[selectedHero][slot] = null;
    }

    const newSave: PersistentSaveData = {
      ...localSave,
      equippedItems: updatedEquipped
    };

    setLocalSave(newSave);
    SaveManager.saveGame(newSave);
    onRefreshPlayerStats();
    setSelectedItem(null);
  };

  // Cálculo de custo de aprimoramento: (nível_atual + 1) * 15 cristais
  const getUpgradeCost = (item: EquipmentItem) => {
    return (item.level + 1) * 15;
  };

  // Executar o aprimoramento na Forja
  const handleUpgradeItem = () => {
    if (!forgeItem) return;
    const cost = getUpgradeCost(forgeItem);
    if (localSave.permanentManaCrystals < cost) return;

    // Clonar inventário para aplicar modificações com segurança
    const updatedInventory = [...inventory];
    const index = updatedInventory.findIndex(i => i.id === forgeItem.id);
    if (index === -1) return;

    const targetItem = { ...updatedInventory[index] };
    upgradeItemInForge(targetItem);
    updatedInventory[index] = targetItem;

    const newSave: PersistentSaveData = {
      ...localSave,
      permanentManaCrystals: localSave.permanentManaCrystals - cost,
      inventory: updatedInventory
    };

    setLocalSave(newSave);
    SaveManager.saveGame(newSave);
    onRefreshPlayerStats();
    setForgeItem(targetItem);
    
    setForgeSuccess(true);
    setTimeout(() => {
      setForgeSuccess(false);
    }, 1800);
  };

  // Estatísticas acumuladas de itens equipados para exibir no painel
  const calculateEquippedStats = () => {
    const statsTotal: Record<string, number> = {};
    const heroEquipped = equippedForHero;
    Object.values(heroEquipped).forEach(instanceId => {
      if (!instanceId) return;
      const item = inventory.find(i => i.id === instanceId);
      if (item) {
        Object.entries(item.stats).forEach(([k, v]) => {
          if (typeof v === 'number') {
            statsTotal[k] = (statsTotal[k] || 0) + v;
          }
        });
      }
    });
    return statsTotal;
  };

  const equippedStatsSummary = calculateEquippedStats();

  const getStatLabel = (key: string) => {
    switch (key) {
      case 'maxHp': return 'Vida Máxima';
      case 'ad': return 'Dano de Ataque (AD)';
      case 'ap': return 'Poder de Habilidade (AP)';
      case 'armor': return 'Armadura';
      case 'mr': return 'Resistência Mágica';
      case 'moveSpeed': return 'Velocidade de Movimento';
      case 'atkSpeed': return 'Velocidade de Ataque';
      case 'omnivamp': return 'Vampirismo';
      case 'critChance': return 'Chance Crítica';
      case 'critDamage': return 'Dano Crítico';
      case 'summonPower': return 'Poder de Evocação';
      case 'skillRadiusMult': return 'Área das Habilidades';
      default: return key;
    }
  };

  const formatStatValue = (key: string, val: number) => {
    const isPercentage = ['critChance', 'critDamage', 'omnivamp', 'summonPower', 'skillRadiusMult', 'atkSpeed'].includes(key);
    if (isPercentage) {
      return `+${(val * 100).toFixed(0)}%`;
    }
    return `+${val.toFixed(0)}`;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 animate-in fade-in duration-200 font-sans select-none text-slate-100 overflow-hidden"
      style={{ backgroundImage: bgPattern, backgroundSize: '120px 120px' }}
    >
      <div className="relative w-full max-w-5xl bg-slate-900 border-2 border-slate-700/60 rounded-3xl p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col gap-5 backdrop-blur-xl max-h-[92vh] overflow-hidden">
        
        {/* HEADER */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Hammer size={22} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                Forja de Ecos & Inventário
              </h2>
              <p className="text-xs text-slate-400">
                Gerencie seus armamentos, personalize builds para cada Caçador e aprimore itens ancestrais.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Cristais Display */}
            <div className="px-4 py-2 bg-slate-950/60 border border-cyan-500/30 text-cyan-300 rounded-2xl text-xs font-mono flex items-center gap-2">
              <Gem size={14} className="text-cyan-400" />
              <span className="font-bold">{localSave.permanentManaCrystals} Cristais</span>
            </div>

            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* TOP INTERACTIVE TAB CONTROL */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-3">
          <div className="flex gap-2 bg-slate-950/40 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => { setActiveTab('EQUIP'); setSelectedItem(null); }}
              className={`px-5 py-2 text-xs font-bold rounded-lg uppercase tracking-wider cursor-pointer transition-all ${
                activeTab === 'EQUIP'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Arsenal & Builds
            </button>
            <button
              onClick={() => { setActiveTab('FORGE'); setForgeItem(null); }}
              className={`px-5 py-2 text-xs font-bold rounded-lg uppercase tracking-wider cursor-pointer transition-all ${
                activeTab === 'FORGE'
                  ? 'bg-purple-600 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Aprimorar na Forja
            </button>
          </div>

          {/* Hero quick switcher */}
          <div className="flex items-center gap-1.5 bg-slate-950/30 px-3 py-1.5 rounded-xl border border-slate-800/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Foco do Caçador:</span>
            {Object.keys(HUNTERS).map(arch => {
              const h = HUNTERS[arch as Archetype];
              const isHeroActive = selectedHero === arch;
              return (
                <button
                  key={arch}
                  onClick={() => {
                    setSelectedHero(arch as Archetype);
                    setSelectedItem(null);
                  }}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm cursor-pointer border transition-all ${
                    isHeroActive
                      ? 'border-cyan-400 bg-cyan-950 text-white font-bold scale-105'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                  }`}
                  title={h.name}
                >
                  {h.icon}
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN BODY AREA */}
        <div className="flex-1 flex overflow-hidden min-h-0 gap-4">
          
          {activeTab === 'EQUIP' ? (
            <>
              {/* LEFT: CHARACTER CURRENT EQUIPMENT SLOTS */}
              <div className="w-64 bg-slate-950/20 rounded-2xl border border-slate-800/60 p-4 flex flex-col gap-3 overflow-y-auto">
                <div className="text-center pb-2 border-b border-slate-800/80 mb-1">
                  <span className="text-xl">{HUNTERS[selectedHero]?.icon}</span>
                  <h3 className="text-sm font-black text-slate-200 mt-1 uppercase tracking-wider font-mono">
                    {HUNTERS[selectedHero]?.name.split(',')[0]}
                  </h3>
                  <p className="text-[10px] text-cyan-400 font-mono">Atributos e Modificações</p>
                </div>

                {/* 4 EQUIP SLOTS */}
                {(['WEAPON', 'CHEST', 'RING', 'AMULET'] as ItemSlot[]).map((slot) => {
                  const info = getSlotLabelAndIcon(slot);
                  const itemInstanceId = equippedForHero[slot];
                  const item = itemInstanceId ? inventory.find(i => i.id === itemInstanceId) : null;
                  const isSelectedSlot = selectedSlot === slot;

                  return (
                    <button
                      key={slot}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setSelectedItem(item);
                      }}
                      className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer relative ${
                        isSelectedSlot
                          ? 'border-amber-400 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.08)]'
                          : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                      }`}
                    >
                      {/* Item Rarity Icon Background */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 border bg-slate-950 ${
                        item ? getRarityTextAndColor(item.rarity).border : 'border-slate-800'
                      }`}>
                        {item ? info.icon : <span className="opacity-25 text-xs font-mono">{info.icon}</span>}
                      </div>

                      <div className="flex-1 min-w-0 font-mono">
                        <div className="text-[9px] uppercase tracking-wider text-slate-400">{info.label}</div>
                        {item ? (
                          <div className="flex items-center gap-1">
                            <span className={`text-xs font-bold truncate block ${getRarityTextAndColor(item.rarity).text}`}>
                              {item.name}
                            </span>
                            {item.level > 0 && (
                              <span className="text-[10px] text-amber-300 font-black">+{item.level}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 block italic">Vazio</span>
                        )}
                      </div>

                      {item && isSelectedSlot && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnequipSlot(slot);
                          }}
                          className="absolute right-2 top-2 p-1 text-rose-500 hover:text-rose-400 bg-rose-950/20 hover:bg-rose-950/50 rounded"
                          title="Remover Equipamento"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </button>
                  );
                })}

                {/* HERO STATS GAINED FROM EQUIPMENT */}
                <div className="mt-auto bg-slate-950/50 rounded-xl p-3 border border-slate-800/80 font-mono text-[10px]">
                  <h4 className="text-slate-300 font-black uppercase mb-1.5 text-center text-[9px] tracking-wider text-cyan-400 border-b border-slate-800 pb-1">
                    Bônus Totais Equipados
                  </h4>
                  {Object.keys(equippedStatsSummary).length > 0 ? (
                    <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                      {Object.entries(equippedStatsSummary).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center text-slate-300">
                          <span>{getStatLabel(key)}:</span>
                          <span className="font-bold text-emerald-400">{formatStatValue(key, value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-500 italic text-center py-2">Nenhum bônus ativo</div>
                  )}
                </div>
              </div>

              {/* MIDDLE: SHARED INVENTORY GRID FILTERED BY SLOT */}
              <div className="flex-1 bg-slate-950/35 border border-slate-800/60 rounded-2xl p-4 flex flex-col gap-3 min-w-0">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="font-mono text-xs text-slate-300 flex items-center gap-1.5">
                    <span>Lista de itens para:</span>
                    <span className="font-black text-amber-400 uppercase tracking-wider bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
                      {getSlotLabelAndIcon(selectedSlot).label}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Total no Inventário: {inventory.length}</span>
                </div>

                {filteredInventoryItems.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pr-1">
                    {filteredInventoryItems.map((item) => {
                      const isEquippedHere = equippedForHero[selectedSlot] === item.id;
                      const isEquippedElsewhere = !isEquippedHere && Object.values(localSave.equippedItems || {}).some(slots => Object.values(slots).includes(item.id));
                      const isSelected = selectedItem?.id === item.id;
                      const config = getRarityTextAndColor(item.rarity);

                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedItem(item)}
                          className={`p-3 rounded-xl border text-left flex flex-col justify-between h-28 cursor-pointer transition-all select-none relative ${
                            isSelected
                              ? 'border-amber-400 bg-slate-900 shadow-[inset_0_0_15px_rgba(245,158,11,0.1)]'
                              : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/30'
                          }`}
                        >
                          <div className="w-full flex justify-between items-start">
                            <span className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded font-black ${config.badge}`}>
                              {config.name}
                            </span>
                            {isEquippedHere && (
                              <span className="text-[9px] uppercase font-bold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                Equipado
                              </span>
                            )}
                            {isEquippedElsewhere && (
                              <span className="text-[9px] uppercase font-bold text-amber-500/60 bg-slate-900 px-1 rounded border border-slate-800" title="Equipado em outro caçador">
                                Em Uso
                              </span>
                            )}
                          </div>

                          <div className="font-mono mt-2">
                            <div className="text-xs font-black text-slate-100 truncate flex items-center gap-1">
                              <span>{item.name}</span>
                              {item.level > 0 && <span className="text-amber-300 font-black">+{item.level}</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-1">
                              {Object.entries(item.stats).map(([k, v]) => {
                                if (typeof v === 'number') {
                                  return `${getStatLabel(k).split(' ')[0]}: ${formatStatValue(k, v)}`;
                                }
                                return null;
                              }).filter(Boolean).join(', ')}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-950/20 rounded-xl border border-dashed border-slate-800">
                    <span className="text-4xl opacity-35">📥</span>
                    <h4 className="text-sm font-black text-slate-300 mt-2">Sem equipamentos compatíveis</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      Derrote os chefes nos andares mais profundos da Torre para receber itens deste slot!
                    </p>
                  </div>
                )}
              </div>

              {/* RIGHT: DETAILED STAT PREVIEW & ACTION PANEL */}
              <div className="w-80 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between overflow-y-auto">
                {selectedItem ? (
                  <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                    {/* Visual Spotlight Card */}
                    <div className={`w-20 h-20 mx-auto flex items-center justify-center rounded-2xl border-2 bg-slate-900 shadow-inner text-4xl ${
                      getRarityTextAndColor(selectedItem.rarity).border
                    }`}>
                      {getSlotLabelAndIcon(selectedItem.slot).icon}
                    </div>

                    <div className="text-center font-mono">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${getRarityTextAndColor(selectedItem.rarity).badge}`}>
                        {getRarityTextAndColor(selectedItem.rarity).name} {selectedItem.level > 0 ? `+${selectedItem.level}` : ''}
                      </span>
                      <h3 className="text-slate-100 font-bold text-sm mt-2 uppercase tracking-wide">
                        {selectedItem.name}
                      </h3>
                      {selectedItem.hunterClass && (
                        <p className="text-[9px] text-cyan-400 uppercase mt-0.5 font-bold">
                          Exclusivo de: {selectedItem.hunterClass}
                        </p>
                      )}
                    </div>

                    <hr className="border-slate-800" />

                    {/* STATS LIST */}
                    <div className="font-mono text-xs flex flex-col gap-2">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">
                        Atributos Concedidos:
                      </div>
                      {Object.entries(selectedItem.stats).map(([key, val]) => {
                        if (val === undefined || typeof val !== 'number') return null;
                        return (
                          <div key={key} className="flex justify-between items-center py-1 bg-slate-950/30 px-2 rounded border border-slate-800/40">
                            <span className="text-slate-300 text-[10px]">{getStatLabel(key)}:</span>
                            <span className="font-bold text-emerald-400">{formatStatValue(key, val)}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* UNIQUE EFFECT */}
                    {selectedItem.uniqueEffectId && (
                      <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl font-mono text-[10px]">
                        <div className="flex items-center gap-1.5 text-amber-400 font-black uppercase tracking-wider">
                          <Sparkles size={11} className="animate-pulse" />
                          <span>Efeito Passivo Exclusivo</span>
                        </div>
                        <p className="text-amber-100 mt-1.5 leading-relaxed font-semibold">
                          {selectedItem.uniqueEffectDesc}
                        </p>
                      </div>
                    )}

                    {/* LORE / DESCRIPTION */}
                    {selectedItem.lore && (
                      <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-[10px] text-slate-400 italic leading-relaxed font-serif">
                        "{selectedItem.lore}"
                      </div>
                    )}

                    {/* EQUIP / UNEQUIP ACT BUTTON */}
                    <div className="pt-3">
                      {equippedForHero[selectedItem.slot] === selectedItem.id ? (
                        <button
                          onClick={() => handleUnequipSlot(selectedItem.slot)}
                          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold font-mono text-xs rounded-xl border border-slate-700 cursor-pointer transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
                        >
                          Remover do Herói
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEquipItem(selectedItem)}
                          className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black font-mono text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                        >
                          <Check size={14} /> Equipar no Herói
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <span className="text-4xl opacity-20">🔍</span>
                    <h4 className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-wide">
                      Nenhum item selecionado
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      Selecione um slot de equipamento ao lado ou toque em um item do inventário para ver seus atributos rúnicos detalhados.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            // ==========================================
            // TAB 2: FORGE (APRIMORAMENTO)
            // ==========================================
            <div className="flex-1 flex overflow-hidden min-h-0 gap-4">
              
              {/* LEFT FORGE: INVENTORY GRID TO SELECT ITEM */}
              <div className="flex-1 bg-slate-950/35 border border-slate-800/60 rounded-2xl p-4 flex flex-col gap-3 min-w-0">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono text-xs text-slate-300">Escolha o item que deseja reforçar na Forja:</span>
                  <span className="text-[10px] text-slate-500 font-mono">Total: {inventory.length}</span>
                </div>

                {inventory.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pr-1">
                    {inventory.map((item) => {
                      const isSelected = forgeItem?.id === item.id;
                      const config = getRarityTextAndColor(item.rarity);
                      const info = getSlotLabelAndIcon(item.slot);

                      return (
                        <button
                          key={item.id}
                          onClick={() => { setForgeItem(item); setForgeSuccess(false); }}
                          className={`p-3 rounded-xl border text-left flex flex-col justify-between h-24 cursor-pointer transition-all select-none relative ${
                            isSelected
                              ? 'border-purple-500 bg-slate-900 shadow-[0_0_15px_rgba(147,51,234,0.15)]'
                              : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/30'
                          }`}
                        >
                          <div className="w-full flex justify-between items-center text-[9px] font-mono">
                            <span className={`px-1 rounded ${config.badge}`}>{config.name}</span>
                            <span className="opacity-50">{info.icon}</span>
                          </div>

                          <div className="font-mono mt-1">
                            <div className="text-xs font-black text-slate-100 truncate flex items-center gap-1">
                              <span>{item.name}</span>
                              {item.level > 0 && <span className="text-amber-300 font-black">+{item.level}</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Upgrade atual: +{item.level}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <span className="text-4xl opacity-35">🔨</span>
                    <h4 className="text-sm font-black text-slate-300 mt-2">Nenhum equipamento</h4>
                    <p className="text-xs text-slate-500 mt-1">Sua coleção está vazia!</p>
                  </div>
                )}
              </div>

              {/* RIGHT FORGE: FORGE INTERACTIVE CENTER */}
              <div className="w-96 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between overflow-y-auto">
                {forgeItem ? (
                  <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                    
                    {/* Visual active forge display */}
                    <div className="relative p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center gap-6 overflow-hidden">
                      <div className="absolute inset-0 bg-purple-600/5 animate-pulse" />
                      
                      {/* Current level state */}
                      <div className="text-center font-mono">
                        <div className={`w-14 h-14 mx-auto flex items-center justify-center rounded-xl border bg-slate-900 text-2xl ${
                          getRarityTextAndColor(forgeItem.rarity).border
                        }`}>
                          {getSlotLabelAndIcon(forgeItem.slot).icon}
                        </div>
                        <div className="text-xs font-bold text-slate-300 mt-1 truncate max-w-[100px]">{forgeItem.name}</div>
                        <div className="text-[10px] font-black text-slate-500">Nível +{forgeItem.level}</div>
                      </div>

                      {/* Upgrade arrow */}
                      <div className="p-1.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-400 animate-bounce">
                        <ChevronRight size={18} />
                      </div>

                      {/* Next level state */}
                      <div className="text-center font-mono">
                        <div className={`w-14 h-14 mx-auto flex items-center justify-center rounded-xl border bg-slate-900 text-2xl border-purple-400 relative shadow-[0_0_12px_rgba(168,85,247,0.3)]`}>
                          <Sparkles className="absolute top-1 right-1 w-3.5 h-3.5 text-purple-400" />
                          {getSlotLabelAndIcon(forgeItem.slot).icon}
                        </div>
                        <div className="text-xs font-bold text-white mt-1 truncate max-w-[100px]">{forgeItem.name}</div>
                        <div className="text-[10px] font-black text-purple-400">Nível +{forgeItem.level + 1}</div>
                      </div>
                    </div>

                    {/* Stat Upgrade Comparisons */}
                    <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/80 font-mono text-xs">
                      <h4 className="text-purple-300 font-bold uppercase tracking-wide text-[10px] mb-2 border-b border-slate-800 pb-1">
                        Previsão de Atributos:
                      </h4>
                      <div className="flex flex-col gap-2">
                        {Object.entries(forgeItem.stats).map(([k, val]) => {
                          if (typeof val !== 'number') return null;
                          const isPercent = ['critChance', 'critDamage', 'omnivamp', 'summonPower', 'skillRadiusMult', 'atkSpeed'].includes(k);
                          const scale = isPercent ? 1.05 : 1.15;
                          const nextVal = parseFloat((val * scale).toFixed(2));
                          
                          return (
                            <div key={k} className="flex justify-between items-center py-1 px-1.5 hover:bg-slate-900 rounded">
                              <span className="text-slate-400 text-[10px]">{getStatLabel(k)}:</span>
                              <div className="flex items-center gap-1.5 font-bold">
                                <span className="text-slate-400">{formatStatValue(k, val)}</span>
                                <ArrowUp size={11} className="text-purple-400" />
                                <span className="text-purple-300">{formatStatValue(k, nextVal)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Cost section & confirmation */}
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3 font-mono">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Custo de Cristais:</span>
                        <div className="flex items-center gap-1 text-cyan-300 font-black">
                          <Gem size={12} className="text-cyan-400" />
                          <span>{getUpgradeCost(forgeItem)}</span>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Seus Cristais:</span>
                        <span className={`font-bold ${
                          localSave.permanentManaCrystals >= getUpgradeCost(forgeItem) ? 'text-emerald-400' : 'text-rose-500'
                        }`}>
                          {localSave.permanentManaCrystals}
                        </span>
                      </div>

                      {localSave.permanentManaCrystals < getUpgradeCost(forgeItem) ? (
                        <div className="p-2.5 rounded bg-rose-950/20 border border-rose-500/20 text-[10px] text-rose-300 leading-relaxed flex gap-2">
                          <CircleAlert size={14} className="shrink-0 mt-0.5 text-rose-400" />
                          <span>Cristais insuficientes! Conclua mais expedições e derrote chefes na Torre para colher mais.</span>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded bg-purple-950/20 border border-purple-500/20 text-[10px] text-purple-300 leading-relaxed flex gap-2">
                          <Info size={14} className="shrink-0 mt-0.5 text-purple-400" />
                          <span>O aprimoramento possui 100% de chance de sucesso e amplia permanentemente as estatísticas rúnicas deste item.</span>
                        </div>
                      )}

                      {forgeSuccess ? (
                        <div className="py-2 bg-emerald-500 text-slate-950 font-black text-center text-xs rounded-lg animate-bounce flex items-center justify-center gap-1">
                          <Check size={14} /> Item Aprimorado com Sucesso!
                        </div>
                      ) : (
                        <button
                          disabled={localSave.permanentManaCrystals < getUpgradeCost(forgeItem)}
                          onClick={handleUpgradeItem}
                          className={`w-full py-2.5 font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-widest cursor-pointer ${
                            localSave.permanentManaCrystals >= getUpgradeCost(forgeItem)
                              ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                          }`}
                        >
                          <Hammer size={14} /> Reforçar Item
                        </button>
                      )}
                    </div>

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <span className="text-5xl opacity-20">🌋</span>
                    <h4 className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-wide">
                      Forja do Vazio Inativa
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      Selecione qualquer arma, peitoral ou anel do seu inventário ao lado para carregar na Bigorna e forjar atributos de alto calibre.
                    </p>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
