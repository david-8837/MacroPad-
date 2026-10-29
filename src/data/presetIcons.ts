// Locally bundled artwork; see src/assets/preset-icons/README.md for sources.
import blender from '../assets/preset-icons/blender.png';
import fusion from '../assets/preset-icons/fusion.svg';
import figma from '../assets/preset-icons/figma.svg';
import canva from '../assets/preset-icons/canva.svg';
import photoshop from '../assets/preset-icons/photoshop.svg';
import illustrator from '../assets/preset-icons/illustrator.svg';
import resolve from '../assets/preset-icons/davinciresolve.svg';
import premiere from '../assets/preset-icons/premierepro.svg';
import claude from '../assets/preset-icons/claudecode.svg';
import codex from '../assets/preset-icons/codex.svg';
import vscode from '../assets/preset-icons/vscode.svg';
import word from '../assets/preset-icons/word.svg';
import excel from '../assets/preset-icons/excel.svg';
import powerpoint from '../assets/preset-icons/powerpoint.svg';
import gimp from '../assets/preset-icons/gimp.svg';
import inkscape from '../assets/preset-icons/inkscape.svg';
import krita from '../assets/preset-icons/krita.svg';
import afterEffects from '../assets/preset-icons/aftereffects.svg';
import audacity from '../assets/preset-icons/audacity.svg';
import intellij from '../assets/preset-icons/intellij.svg';
import googleDocs from '../assets/preset-icons/googledocs.svg';
import googleSheets from '../assets/preset-icons/googlesheets.svg';
import googleSlides from '../assets/preset-icons/googleslides.svg';
import minecraft from '../assets/preset-icons/minecraft.svg';
import fortnite from '../assets/preset-icons/fortnite.svg';
import valorant from '../assets/preset-icons/valorant.svg';
import counterstrike from '../assets/preset-icons/counterstrike.svg';
import league from '../assets/preset-icons/leagueoflegends.svg';
import dota from '../assets/preset-icons/dota2.svg';
import roblox from '../assets/preset-icons/roblox.svg';
// The following are themed illustrations, not official game logos.
import eldenring from '../assets/preset-icons/eldenring.svg';
import cyberpunk from '../assets/preset-icons/cyberpunk.svg';
import witcher from '../assets/preset-icons/witcher.svg';
import skyrim from '../assets/preset-icons/skyrim.svg';
import baldursgate from '../assets/preset-icons/baldursgate.svg';
import stardew from '../assets/preset-icons/stardew.svg';
import terraria from '../assets/preset-icons/terraria.svg';

/** IDs match layerPresets.ts. The four general layouts use neutral symbols. */
export const PRESET_APP_ICONS: Readonly<Record<string, string>> = {
  blender, fusion, figma, canva, photoshop, illustrator, resolve, premiere,
  'claude-code': claude, codex, vscode, word, excel, powerpoint,
  gimp, inkscape, krita, 'after-effects': afterEffects, audacity, intellij,
  'google-docs': googleDocs, 'google-sheets': googleSheets, 'google-slides': googleSlides,
  'minecraft-java': minecraft, fortnite, valorant, 'counter-strike-2': counterstrike,
  'league-of-legends': league, 'dota-2': dota, roblox,
  'elden-ring': eldenring, 'cyberpunk-2077': cyberpunk, 'witcher-3': witcher,
  skyrim, 'baldurs-gate-3': baldursgate, 'stardew-valley': stardew, terraria,
};
