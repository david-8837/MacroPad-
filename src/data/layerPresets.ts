import { ActionDefinition, KeyBinding, Layer } from '../types';

export type PresetKey = { label: string; detail: string; icon: string; action: ActionDefinition | null; binding?: KeyBinding };
export type PresetGroup = 'General' | 'Design' | 'Video' | 'Audio' | 'Coding' | 'Office' | 'Games' | 'Custom';
export interface LayerPreset { id: string; name: string; group: PresetGroup; description: string; note: string; keys: PresetKey[]; iconId?: string }
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
  ] },
  { id: 'gimp', group: 'Design', name: 'GIMP', description: 'Select and paint in an image.', note: 'GIMP default shortcuts · image window focused', keys: [
    hotkey('Paintbrush','Square','P'), hotkey('Pencil','Square','N'), hotkey('Eraser','Square','Shift','E'),
    hotkey('Rectangle select','Square','R'), hotkey('Ellipse select','Square','E'), hotkey('Free select','Square','F'),
    hotkey('Text','Square','T'), hotkey('Zoom tool','Search','Z'), hotkey('Undo','RotateCcw','Ctrl','Z'),
  ] },
  { id: 'inkscape', group: 'Design', name: 'Inkscape', description: 'Draw and edit vector artwork.', note: 'Inkscape default shortcuts · canvas focused', keys: [
    hotkey('Select','ArrowRight','S'), hotkey('Edit nodes','Square','N'), hotkey('Rectangle','Square','R'),
    hotkey('Ellipse','Square','E'), hotkey('Pen','Square','B'), hotkey('Pencil','Square','P'),
    hotkey('Text','Square','T'), hotkey('Zoom tool','Search','Z'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'krita', group: 'Design', name: 'Krita', description: 'Painting tools and canvas controls.', note: 'Krita default shortcuts · canvas focused', keys: [
    hotkey('Brush','Square','B'), hotkey('Eraser mode','Square','E'), hotkey('Multibrush','Square','Q'),
    hotkey('Smaller brush','Square','['), hotkey('Larger brush','Square',']'), hotkey('Mirror view','Square','M'),
    hotkey('Brush settings','Square','F5'), hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'after-effects', group: 'Video', name: 'Adobe After Effects', description: 'Preview and work with timeline layers.', note: 'After Effects · Windows defaults · timeline focused', keys: [
    hotkey('Preview','Play','Space'), hotkey('Layer in point','ArrowLeft','I'), hotkey('Layer out point','ArrowRight','O'),
    hotkey('Trim in point','Scissors','Alt','['), hotkey('Trim out point','Scissors','Alt',']'), hotkey('Zoom time in','Search','='),
    hotkey('Zoom time out','Search','-'), hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Save','Save','Ctrl','S'),
  ] },
  { id: 'audacity', group: 'Audio', name: 'Audacity', description: 'Record, navigate and edit audio.', note: 'Audacity default shortcuts · project window focused', keys: [
    hotkey('Play / stop','Play','Space'), hotkey('Pause','Square','P'), hotkey('Record','Square','R'),
    hotkey('Selection tool','Square','F1'), hotkey('Envelope tool','Square','F2'), hotkey('Zoom tool','Search','F4'),
    hotkey('Zoom in','Search','Ctrl','1'), hotkey('Zoom out','Search','Ctrl','3'), hotkey('Undo','RotateCcw','Ctrl','Z'),
  ] },
  { id: 'intellij', group: 'Coding', name: 'IntelliJ IDEA', description: 'Navigate, search and run your project.', note: 'IntelliJ IDEA · Windows default keymap · editor focused', keys: [
    hotkey('Find action','Search','Ctrl','Shift','A'), hotkey('Go to file','Search','Ctrl','Shift','N'), hotkey('Find in files','Search','Ctrl','Shift','F'),
    hotkey('Quick fix','Code','Alt','Enter'), hotkey('Run','Play','Shift','F10'), hotkey('Debug','Code','Shift','F9'),
    hotkey('Stop','Square','Ctrl','F2'), hotkey('Find','Search','Ctrl','F'), hotkey('Save all','Save','Ctrl','S'),
  ] },
  { id: 'google-docs', group: 'Office', name: 'Google Docs', description: 'Format text and structure documents.', note: 'Google Docs · Windows / ChromeOS defaults · document focused', keys: [
    hotkey('Bold','Square','Ctrl','B'), hotkey('Italic','Square','Ctrl','I'), hotkey('Underline','Square','Ctrl','U'),
    hotkey('Heading 1','Square','Ctrl','Alt','1'), hotkey('Heading 2','Square','Ctrl','Alt','2'), hotkey('Heading 3','Square','Ctrl','Alt','3'),
    hotkey('Align left','Square','Ctrl','Shift','L'), hotkey('Center','Square','Ctrl','Shift','E'), hotkey('Align right','Square','Ctrl','Shift','R'),
  ] },
  { id: 'google-sheets', group: 'Office', name: 'Google Sheets', description: 'Select, fill and format spreadsheet cells.', note: 'Google Sheets · Windows / ChromeOS defaults · sheet focused', keys: [
    hotkey('Select column','Square','Ctrl','Space'), hotkey('Select row','Square','Shift','Space'), hotkey('Select all','Square','Ctrl','A'),
    hotkey('Fill down','ArrowRight','Ctrl','D'), hotkey('Fill right','ArrowRight','Ctrl','R'), hotkey('Fill range','Square','Ctrl','Enter'),
    hotkey('Bold','Square','Ctrl','B'), hotkey('Find','Search','Ctrl','F'), hotkey('Undo','RotateCcw','Ctrl','Z'),
  ] },
  { id: 'google-slides', group: 'Office', name: 'Google Slides', description: 'Create slides and arrange objects.', note: 'Google Slides · Windows / ChromeOS defaults · editor focused', keys: [
    hotkey('New slide','Square','Ctrl','M'), hotkey('Duplicate','Copy','Ctrl','D'), hotkey('Group','Square','Ctrl','Alt','G'),
    hotkey('Ungroup','Square','Ctrl','Alt','Shift','G'), hotkey('Bring forward','Square','Ctrl','ArrowUp'), hotkey('Send backward','Square','Ctrl','ArrowDown'),
    hotkey('Insert link','Square','Ctrl','K'), hotkey('Undo','RotateCcw','Ctrl','Z'), hotkey('Redo','RotateCw','Ctrl','Y'),
  ] },
  { id: 'minecraft-java', group: 'Games', name: 'Minecraft: Java Edition', description: 'Select any of the nine hotbar slots.', note: 'Java Edition · default PC hotbar · gameplay focused', keys: [
    hotkey('Hotbar 1','Square','1'), hotkey('Hotbar 2','Square','2'), hotkey('Hotbar 3','Square','3'),
    hotkey('Hotbar 4','Square','4'), hotkey('Hotbar 5','Square','5'), hotkey('Hotbar 6','Square','6'),
    hotkey('Hotbar 7','Square','7'), hotkey('Hotbar 8','Square','8'), hotkey('Hotbar 9','Square','9'),
  ] },
  { id: 'fortnite', group: 'Games', name: 'Fortnite', description: 'Quick access to slot keys and menus.', note: 'PC defaults vary by version and mode · check your keybinds', keys: [
    hotkey('Slot key 1','Square','1'), hotkey('Slot key 2','Square','2'), hotkey('Slot key 3','Square','3'),
    hotkey('Slot key 4','Square','4'), hotkey('Slot key 5','Square','5'), hotkey('Reload','RotateCw','R'),
    hotkey('Use','Square','E'), hotkey('Inventory','Square','I'), hotkey('Map','Square','M'),
  ] },
  { id: 'valorant', group: 'Games', name: 'VALORANT', description: 'Ability keys and equipment controls.', note: 'PC defaults · abilities depend on agent and keybinds', keys: [
    hotkey('Ability C','Square','C'), hotkey('Ability Q','Square','Q'), hotkey('Ability E','Square','E'),
    hotkey('Ultimate','Square','X'), hotkey('Reload','RotateCw','R'), hotkey('Use object','Square','F'),
    hotkey('Buy menu','Square','B'), hotkey('Primary weapon','Square','1'), hotkey('Secondary weapon','Square','2'),
  ] },
  { id: 'counter-strike-2', group: 'Games', name: 'Counter-Strike 2', description: 'Weapon slots, reload and buy menu.', note: 'PC defaults · buy menu is limited by match rules', keys: [
    hotkey('Primary weapon','Square','1'), hotkey('Secondary weapon','Square','2'), hotkey('Knife','Square','3'),
    hotkey('Grenades','Square','4'), hotkey('Bomb slot','Square','5'), hotkey('Last weapon','Square','Q'),
    hotkey('Reload','RotateCw','R'), hotkey('Inspect','Search','F'), hotkey('Buy menu','Square','B'),
  ] },
  { id: 'league-of-legends', group: 'Games', name: 'League of Legends', description: 'Champion abilities, spells and shop.', note: 'PC defaults · abilities and casting depend on settings', keys: [
    hotkey('Ability Q','Square','Q'), hotkey('Ability W','Square','W'), hotkey('Ability E','Square','E'),
    hotkey('Ultimate','Square','R'), hotkey('Summoner D','Square','D'), hotkey('Summoner F','Square','F'),
    hotkey('Recall','Square','B'), hotkey('Shop','Square','P'), hotkey('Scoreboard toggle','Square','O'),
  ] },
  { id: 'dota-2', group: 'Games', name: 'Dota 2', description: 'Hero abilities and ability upgrades.', note: 'PC defaults · abilities and casting depend on hero and settings', keys: [
    hotkey('Ability Q','Square','Q'), hotkey('Ability W','Square','W'), hotkey('Ability E','Square','E'),
    hotkey('Ultimate','Square','R'), hotkey('Ability D','Square','D'), hotkey('Ability F','Square','F'),
    hotkey('Level Q','Square','Ctrl','Q'), hotkey('Level W','Square','Ctrl','W'), hotkey('Level E','Square','Ctrl','E'),
  ] },
  { id: 'roblox', group: 'Games', name: 'Roblox', description: 'Number keys for experiences with a hotbar.', note: 'PC · hotbar support and controls vary by experience', keys: [
    hotkey('Hotbar 1','Square','1'), hotkey('Hotbar 2','Square','2'), hotkey('Hotbar 3','Square','3'),
    hotkey('Hotbar 4','Square','4'), hotkey('Hotbar 5','Square','5'), hotkey('Hotbar 6','Square','6'),
    hotkey('Hotbar 7','Square','7'), hotkey('Hotbar 8','Square','8'), hotkey('Hotbar 9','Square','9'),
  ] },
  { id: 'elden-ring', group: 'Games', name: 'Elden Ring', description: 'Cycle equipment and open the map.', note: 'PC defaults · equipment cycling and interaction', keys: [
    hotkey('Switch spell','Square','ArrowUp'), hotkey('Switch item','Square','ArrowDown'), hotkey('Use item','Square','R'),
    hotkey('Left weapon','ArrowLeft','ArrowLeft'), hotkey('Right weapon','ArrowRight','ArrowRight'), hotkey('Interact','Square','E'),
    hotkey('Map','Globe','G'), hotkey('Menu','Square','Escape'), hotkey('Jump','Square','F'),
  ] },
  { id: 'cyberpunk-2077', group: 'Games', name: 'Cyberpunk 2077', description: 'Weapons, cyberware and navigation menus.', note: 'PC defaults · controls may vary by version and keybinds', keys: [
    hotkey('Weapon 1','Square','1'), hotkey('Weapon 2','Square','2'), hotkey('Weapon 3','Square','3'),
    hotkey('Cyberware','Square','E'), hotkey('Consumable','Square','X'), hotkey('Interact','Square','F'),
    hotkey('Inventory','Square','I'), hotkey('Journal','Square','J'), hotkey('Map','Globe','M'),
  ] },
  { id: 'witcher-3', group: 'Games', name: 'The Witcher 3: Wild Hunt', description: 'Open panels and quick save.', note: 'PC defaults · menu shortcuts · quick save replaces prior quick save', keys: [
    hotkey('Inventory','Square','I'), hotkey('Map','Globe','M'), hotkey('Journal','Square','J'),
    hotkey('Character','Square','K'), hotkey('Alchemy','Square','L'), hotkey('Crafting','Square','O'),
    hotkey('Meditation','Square','N'), hotkey('Bestiary','Square','B'), hotkey('Quick save','Save','F5'),
  ] },
  { id: 'skyrim', group: 'Games', name: 'The Elder Scrolls V: Skyrim', description: 'Open menus and access common actions.', note: 'PC defaults · quick save replaces prior quick save', keys: [
    hotkey('Inventory','Square','I'), hotkey('Map','Globe','M'), hotkey('Journal','Square','J'),
    hotkey('Magic','Square','P'), hotkey('Favorites','Square','Q'), hotkey('Wait','Square','T'),
    hotkey('Change view','Square','F'), hotkey('Interact','Square','E'), hotkey('Quick save','Save','F5'),
  ] },
  { id: 'baldurs-gate-3', group: 'Games', name: 'Baldur’s Gate 3', description: 'Party selection and character panels.', note: 'PC defaults · keyboard and mouse interface', keys: [
    hotkey('Inventory','Square','I'), hotkey('Map','Globe','M'), hotkey('Journal','Square','L'),
    hotkey('Character sheet','Square','N'), hotkey('Spells','Square','K'), hotkey('Party overview','Square','Tab'),
    hotkey('Character 1','Square','F1'), hotkey('Character 2','Square','F2'), hotkey('Character 3','Square','F3'),
  ] },
  { id: 'stardew-valley', group: 'Games', name: 'Stardew Valley', description: 'Select tools and open farm menus.', note: 'PC defaults · toolbar and menu controls', keys: [
    hotkey('Slot 1','Square','1'), hotkey('Slot 2','Square','2'), hotkey('Slot 3','Square','3'),
    hotkey('Slot 4','Square','4'), hotkey('Slot 5','Square','5'), hotkey('Next toolbar','Square','Tab'),
    hotkey('Inventory','Square','E'), hotkey('Journal','Square','F'), hotkey('Map','Globe','M'),
  ] },
  { id: 'terraria', group: 'Games', name: 'Terraria', description: 'Quick-use items and open the map.', note: 'PC defaults · quick-use actions require the relevant items', keys: [
    hotkey('Slot 1','Square','1'), hotkey('Slot 2','Square','2'), hotkey('Slot 3','Square','3'),
    hotkey('Quick heal','Square','H'), hotkey('Quick mana','Square','J'), hotkey('Quick buff','Square','B'),
    hotkey('Grapple','Square','E'), hotkey('Inventory','Square','Escape'), hotkey('Map','Globe','M'),
  ] }
];

/** Replace all nine keys (including hold/safety gestures), not the knob or other layers. */
export function applyLayerPreset(layer: Layer, preset: LayerPreset): Layer {
  const keys: KeyBinding[] = preset.keys.map((key, keyIndex) => {
    // Saved editor bindings may contain additional gestures and safety fields.
    // Deep-copy them so later editing a layer never mutates the preset.
    if (key.binding) return { ...JSON.parse(JSON.stringify(key.binding)), keyIndex } as KeyBinding;
    return {
      keyIndex, label: key.label, sublabel: key.detail, iconName: key.icon, accentColor: '#1351AA',
      tapAction: key.action ? JSON.parse(JSON.stringify(key.action)) as ActionDefinition : null,
      holdAction: null, doubleTapAction: null,
    };
  });
  return { ...layer, keys, isExample: false };
}
