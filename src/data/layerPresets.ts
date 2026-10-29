import { ActionDefinition, KeyBinding, Layer } from '../types';

type PresetKey = { label: string; detail: string; icon: string; action: ActionDefinition };
export type PresetGroup = 'General' | 'Design' | 'Video' | 'Coding' | 'Office';
export interface LayerPreset { id: string; name: string; group: PresetGroup; description: string; note: string; keys: PresetKey[] }
const hotkey = (label: string, icon: string, ...keys: string[]): PresetKey => ({
  label, detail: keys.join(' + '), icon,
  action: { id: `preset-${label.toLowerCase().replace(/\W+/g, '-')}`, category: 'hotkey', name: label, payload: { keys } },
});
const media = (label: string, icon: string, action: NonNullable<ActionDefinition['payload']['mediaAction']>): PresetKey => ({
  label, detail: 'Media key', icon,
  action: { id: `preset-media-${action}`, category: 'media', name: label, payload: { mediaAction: action } },
});

/** All entries use pad-native single-key chords or USB consumer usages. */
export const LAYER_PRESETS: LayerPreset[] = [
  { id: 'everyday', group: 'General', name: 'Everyday editing', description: 'The essentials for working with text and files.', note: 'Ctrl shortcuts · Windows / Linux', keys: [
    hotkey('Copy','Copy','Ctrl','C'), hotkey('Paste','Clipboard','Ctrl','V'), hotkey('Cut','Scissors','Ctrl','X'),
    hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Redo','RotateCw','Ctrl','Y'), hotkey('Select all','Square','Ctrl','A'),
    hotkey('Find','Search','Ctrl','F'), hotkey('Save','Save','Ctrl','S'), hotkey('New','Square','Ctrl','N'),
  ] },
  { id: 'browser', group: 'General', name: 'Browser', description: 'Tabs, navigation and page controls.', note: 'Common browser shortcuts · Windows / Linux', keys: [
    hotkey('Back','ArrowLeft','Alt','ArrowLeft'), hotkey('Forward','ArrowRight','Alt','ArrowRight'), hotkey('Reload','RotateCw','Ctrl','R'),
    hotkey('New tab','Square','Ctrl','T'), hotkey('Close tab','Square','Ctrl','W'), hotkey('Reopen tab','RotateCcw','Ctrl','Shift','T'),
    hotkey('Next tab','ArrowRight','Ctrl','Tab'), hotkey('Address bar','Globe','Ctrl','L'), hotkey('Find','Search','Ctrl','F'),
  ] },
  { id: 'media', group: 'General', name: 'Media & sound', description: 'Playback, volume and screen brightness.', note: 'USB media keys · support depends on your computer', keys: [
    media('Previous','SkipBack','prev'), media('Play / pause','Play','play_pause'), media('Next','SkipForward','next'),
    media('Volume down','Volume2','volume_down'), media('Mute','VolumeX','mute'), media('Volume up','Volume2','volume_up'),
    media('Brightness down','Square','brightness_down'), media('Stop','Square','stop'), media('Brightness up','Square','brightness_up'),
  ] },
  { id: 'navigation', group: 'General', name: 'Navigation', description: 'Move around documents and pages.', note: 'Standard keyboard keys', keys: [
    hotkey('Home','Home','Home'), hotkey('Up','Square','ArrowUp'), hotkey('Page up','Square','PageUp'),
    hotkey('Left','ArrowLeft','ArrowLeft'), hotkey('Enter','Keyboard','Enter'), hotkey('Right','ArrowRight','ArrowRight'),
    hotkey('End','Square','End'), hotkey('Down','Square','ArrowDown'), hotkey('Page down','Square','PageDown'),
  ] },
  { id: 'blender', group: 'Design', name: 'Blender', description: 'Model and navigate in the 3D viewport.', note: 'Default Blender keymap · 3D viewport focused', keys: [
    hotkey('Move','ArrowRight','G'), hotkey('Rotate','RotateCw','R'), hotkey('Scale','Square','S'),
    hotkey('Edit mode','Square','Tab'), hotkey('Duplicate','Copy','Shift','D'), hotkey('Search','Search','F3'),
    hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Redo','RotateCw','Ctrl','Shift','Z'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'fusion', group: 'Design', name: 'Autodesk Fusion', description: 'Sketch and model the essentials.', note: 'Default Fusion shortcuts · commands depend on workspace', keys: [
    hotkey('Line','Square','L'), hotkey('Rectangle','Square','R'), hotkey('Circle','Square','C'),
    hotkey('Dimension','Square','D'), hotkey('Trim','Scissors','T'), hotkey('Offset','Square','O'),
    hotkey('Extrude','ArrowRight','E'), hotkey('Press pull','Square','Q'), hotkey('Measure','Square','I'),
  ] },
  { id: 'figma', group: 'Design', name: 'Figma', description: 'Tools and object actions for design files.', note: 'Figma Design · Windows defaults · canvas focused', keys: [
    hotkey('Move','ArrowRight','V'), hotkey('Frame','Square','F'), hotkey('Rectangle','Square','R'),
    hotkey('Ellipse','Square','O'), hotkey('Text','Square','T'), hotkey('Pen','Square','P'),
    hotkey('Duplicate','Copy','Ctrl','D'), hotkey('Group','Square','Ctrl','G'), hotkey('Undo','RotateCcw','Ctrl','Z'),
  ] },
  { id: 'canva', group: 'Design', name: 'Canva', description: 'Add elements and edit your design.', note: 'Canva editor · Windows defaults · canvas focused', keys: [
    hotkey('Text','Square','T'), hotkey('Rectangle','Square','R'), hotkey('Circle','Square','C'),
    hotkey('Line','Square','L'), hotkey('Duplicate','Copy','Ctrl','D'), hotkey('Select all','Square','Ctrl','A'),
    hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Redo','RotateCw','Ctrl','Y'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'photoshop', group: 'Design', name: 'Adobe Photoshop', description: 'Common image-editing tools.', note: 'Photoshop · Windows defaults · document focused', keys: [
    hotkey('Move tool','ArrowRight','V'), hotkey('Brush','Square','B'), hotkey('Crop','Square','C'),
    hotkey('Text','Square','T'), hotkey('Marquee','Square','M'), hotkey('Lasso','Square','L'),
    hotkey('Zoom tool','Search','Z'), hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'illustrator', group: 'Design', name: 'Adobe Illustrator', description: 'Vector tools and object controls.', note: 'Illustrator · Windows defaults · document focused', keys: [
    hotkey('Selection','ArrowRight','V'), hotkey('Direct select','Square','A'), hotkey('Pen','Square','P'),
    hotkey('Text','Square','T'), hotkey('Rectangle','Square','M'), hotkey('Ellipse','Square','L'),
    hotkey('Group','Square','Ctrl','G'), hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'resolve', group: 'Video', name: 'DaVinci Resolve', description: 'Edit-page tools and timeline controls.', note: 'Resolve default keymap · Edit page / timeline focused', keys: [
    hotkey('Selection','ArrowRight','A'), hotkey('Blade tool','Scissors','B'), hotkey('Blade at head','Scissors','Ctrl','B'),
    hotkey('Mark in','ArrowRight','I'), hotkey('Mark out','ArrowLeft','O'), hotkey('Marker','Square','M'),
    hotkey('Play / pause','Play','Space'), hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'premiere', group: 'Video', name: 'Adobe Premiere Pro', description: 'Timeline tools and edit commands.', note: 'Premiere Pro · Windows defaults · timeline focused', keys: [
    hotkey('Selection','ArrowRight','V'), hotkey('Razor tool','Scissors','C'), hotkey('Ripple tool','Square','B'),
    hotkey('Add edit','Scissors','Ctrl','K'), hotkey('Mark in','ArrowRight','I'), hotkey('Mark out','ArrowLeft','O'),
    hotkey('Marker','Square','M'), hotkey('Play / pause','Play','Space'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'claude-code', group: 'Coding', name: 'Claude Code', description: 'Interactive terminal session controls.', note: 'Claude Code CLI · terminal focused · defaults may vary', keys: [
    hotkey('Interrupt','Square','Escape'), hotkey('Submit','ArrowRight','Enter'), hotkey('Complete','Square','Tab'),
    hotkey('Search history','Search','Ctrl','R'), hotkey('History up','Square','ArrowUp'), hotkey('History down','Square','ArrowDown'),
    hotkey('Transcript','Square','Ctrl','O'), hotkey('Redraw screen','RotateCw','Ctrl','L'), hotkey('Open editor','Code','Ctrl','G'),
  ] },
  { id: 'codex', group: 'Coding', name: 'Codex CLI', description: 'Interactive terminal session controls.', note: 'Codex CLI · terminal focused · defaults may vary', keys: [
    hotkey('Escape','Square','Escape'), hotkey('Submit / steer','ArrowRight','Enter'), hotkey('Queue / tab','Square','Tab'),
    hotkey('Search history','Search','Ctrl','R'), hotkey('History up','Square','ArrowUp'), hotkey('History down','Square','ArrowDown'),
    hotkey('Copy response','Copy','Ctrl','O'), hotkey('Clear view','RotateCw','Ctrl','L'), hotkey('Open editor','Code','Ctrl','G'),
  ] },
  { id: 'vscode', group: 'Coding', name: 'Visual Studio Code', description: 'Navigate files, search and edit code.', note: 'VS Code · Windows / Linux defaults · editor focused', keys: [
    hotkey('Commands','Code','Ctrl','Shift','P'), hotkey('Open file','Search','Ctrl','P'), hotkey('Search files','Search','Ctrl','Shift','F'),
    hotkey('Toggle sidebar','Square','Ctrl','B'), hotkey('Terminal','Code','Ctrl','`'), hotkey('Toggle comment','Code','Ctrl','/'),
    hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Save','Save','Ctrl','S'), hotkey('Find','Search','Ctrl','F'),
  ] },
  { id: 'word', group: 'Office', name: 'Microsoft Word', description: 'Format text and align paragraphs.', note: 'Word desktop · Windows defaults · document focused', keys: [
    hotkey('Bold','Square','Ctrl','B'), hotkey('Italic','Square','Ctrl','I'), hotkey('Underline','Square','Ctrl','U'),
    hotkey('Heading 1','Square','Ctrl','Alt','1'), hotkey('Heading 2','Square','Ctrl','Alt','2'), hotkey('Heading 3','Square','Ctrl','Alt','3'),
    hotkey('Align left','Square','Ctrl','L'), hotkey('Center','Square','Ctrl','E'), hotkey('Align right','Square','Ctrl','R'),
  ] },
  { id: 'excel', group: 'Office', name: 'Microsoft Excel', description: 'Edit cells, format and work with data.', note: 'Excel desktop · Windows defaults · worksheet focused', keys: [
    hotkey('Edit cell','Square','F2'), hotkey('AutoSum','Square','Alt','='), hotkey('Filter','Square','Ctrl','Shift','L'),
    hotkey('Format cells','Square','Ctrl','1'), hotkey('Fill down','ArrowRight','Ctrl','D'), hotkey('Fill right','ArrowRight','Ctrl','R'),
    hotkey('Create table','Square','Ctrl','T'), hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'powerpoint', group: 'Office', name: 'Microsoft PowerPoint', description: 'Build slides and start a presentation.', note: 'PowerPoint desktop · Windows defaults · presentation focused', keys: [
    hotkey('New slide','Square','Ctrl','M'), hotkey('Duplicate','Copy','Ctrl','D'), hotkey('Group','Square','Ctrl','G'),
    hotkey('Ungroup','Square','Ctrl','Shift','G'), hotkey('From start','Play','F5'), hotkey('From slide','Play','Shift','F5'),
    hotkey('Copy','Copy','Ctrl','C'), hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Save','Save','Ctrl','S'),
  ] }
];

/** Replace all nine keys (including hold/safety gestures), not the knob or other layers. */
export function applyLayerPreset(layer: Layer, preset: LayerPreset): Layer {
  const keys: KeyBinding[] = preset.keys.map((key, keyIndex) => ({
    keyIndex, label: key.label, sublabel: key.detail, iconName: key.icon, accentColor: '#1351AA',
    tapAction: { ...key.action, payload: { ...key.action.payload, keys: key.action.payload.keys?.slice() } },
    holdAction: null, doubleTapAction: null,
  }));
  return { ...layer, keys, isExample: false };
}
