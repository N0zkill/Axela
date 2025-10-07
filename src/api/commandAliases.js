
export const COMMAND_ALIASES = {
  // Calculator
  'calculator': 'calc',
  'calc': 'calc',
  'calcular': 'calc',

  // Notepad
  'notepad': 'notepad',
  'note pad': 'notepad',
  'text editor': 'notepad',
  'editor': 'notepad',

  // Paint
  'paint': 'mspaint',
  'ms paint': 'mspaint',
  'mspaint': 'mspaint',
  'drawing': 'mspaint',

  // Task Manager
  'task manager': 'taskmgr',
  'taskmgr': 'taskmgr',
  'task mgr': 'taskmgr',
  'processes': 'taskmgr',

  // Command Prompt
  'command prompt': 'cmd',
  'cmd': 'cmd',
  'terminal': 'cmd',
  'command line': 'cmd',
  'console': 'cmd',

  // PowerShell
  'powershell': 'powershell',
  'power shell': 'powershell',
  'ps': 'powershell',

  // File Explorer
  'explorer': 'explorer',
  'file explorer': 'explorer',
  'files': 'explorer',
  'my computer': 'explorer',
  'this pc': 'explorer',

  // Control Panel
  'control panel': 'control',
  'control': 'control',
  'settings': 'control',

  // System Settings
  'system settings': 'ms-settings:',
  'windows settings': 'ms-settings:',

  // Chrome
  'chrome': 'chrome',
  'google chrome': 'chrome',
  'browser': 'chrome',

  // Edge
  'edge': 'msedge',
  'microsoft edge': 'msedge',
  'msedge': 'msedge',

  // Firefox
  'firefox': 'firefox',
  'mozilla': 'firefox',

  // Excel
  'excel': 'excel',
  'spreadsheet': 'excel',

  // Word
  'word': 'winword',
  'microsoft word': 'winword',
  'document': 'winword',

  // PowerPoint
  'powerpoint': 'powerpnt',
  'power point': 'powerpnt',
  'presentation': 'powerpnt',

  // Outlook
  'outlook': 'outlook',
  'email': 'outlook',
  'mail': 'outlook',

  // Snipping Tool
  'snipping tool': 'SnippingTool',
  'snip': 'SnippingTool',
  'screenshot': 'SnippingTool',
  'screen capture': 'SnippingTool',

  // Registry Editor
  'registry': 'regedit',
  'regedit': 'regedit',
  'registry editor': 'regedit',

  // Disk Cleanup
  'disk cleanup': 'cleanmgr',
  'cleanup': 'cleanmgr',
  'cleanmgr': 'cleanmgr',

  // Character Map
  'character map': 'charmap',
  'charmap': 'charmap',
  'characters': 'charmap',

  // Magnifier
  'magnifier': 'magnify',
  'magnify': 'magnify',
  'zoom': 'magnify',

  // On-Screen Keyboard
  'keyboard': 'osk',
  'on-screen keyboard': 'osk',
  'osk': 'osk',

  // Windows Media Player
  'media player': 'wmplayer',
  'wmplayer': 'wmplayer',
  'music player': 'wmplayer',

  // Device Manager
  'device manager': 'devmgmt.msc',
  'devices': 'devmgmt.msc',

  // Disk Management
  'disk management': 'diskmgmt.msc',
  'disks': 'diskmgmt.msc',

  // Services
  'services': 'services.msc',
  'service manager': 'services.msc',
};


export function resolveCommand(userCommand) {
  if (!userCommand || typeof userCommand !== 'string') {
    return userCommand;
  }

  const normalized = userCommand.toLowerCase().trim();

  if (COMMAND_ALIASES[normalized]) {
    return COMMAND_ALIASES[normalized];
  }

  const sortedAliases = Object.entries(COMMAND_ALIASES).sort((a, b) => b[0].length - a[0].length);

  let result = userCommand;

  for (const [alias, actualCommand] of sortedAliases) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedAlias}\\b`, 'gi');

    result = result.replace(regex, actualCommand);
  }

  return result;
}

export function addAlias(alias, command) {
  COMMAND_ALIASES[alias.toLowerCase()] = command;
}

export function getAllAliases() {
  return { ...COMMAND_ALIASES };
}

export function searchAliases(query) {
  const normalizedQuery = query.toLowerCase();
  const matches = [];

  for (const [alias, command] of Object.entries(COMMAND_ALIASES)) {
    if (alias.includes(normalizedQuery) || command.includes(normalizedQuery)) {
      matches.push({ alias, command });
    }
  }

  return matches;
}

export default {
  COMMAND_ALIASES,
  resolveCommand,
  addAlias,
  getAllAliases,
  searchAliases
};

