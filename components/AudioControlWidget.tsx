import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, Music, Disc } from 'lucide-react';
import { audioManager, AudioTheme } from '../audioManager';

const THEME_LABELS: Record<AudioTheme, { name: string; icon: string; color: string }> = {
  FOREST: { name: 'Santuário de Floresta', icon: '🌲', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40' },
  ICE: { name: 'Picos Gelados', icon: '❄️', color: 'text-cyan-300 border-cyan-400/40 bg-cyan-950/40' },
  RUINS: { name: 'Templo de Ruínas', icon: '🏛️', color: 'text-amber-400 border-amber-500/40 bg-amber-950/40' },
  VILLAGE: { name: 'Vila dos Ecos', icon: '🏰', color: 'text-indigo-300 border-indigo-400/40 bg-indigo-950/40' },
  MENU: { name: 'Vazio An ancestral', icon: '🌌', color: 'text-purple-300 border-purple-400/40 bg-purple-950/40' }
};

export const AudioControlWidget: React.FC = () => {
  return null;
};
