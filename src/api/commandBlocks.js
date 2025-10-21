export const COMMAND_TYPES = {
  MOUSE: {
    id: 'mouse',
    name: 'Mouse',
    description: 'Mouse actions like clicking, scrolling, etc.',
    icon: '🖱️',
    actions: {
      CLICK: {
        id: 'click',
        name: 'Click',
        description: 'Click at a specific location',
        parameters: {
          x: { type: 'number', label: 'X Position', required: true, min: 0 },
          y: { type: 'number', label: 'Y Position', required: true, min: 0 },
          button: { type: 'select', label: 'Button', options: ['left', 'right', 'middle'], default: 'left' }
        }
      },
      DOUBLE_CLICK: {
        id: 'double_click',
        name: 'Double Click',
        description: 'Double click at a specific location',
        parameters: {
          x: { type: 'number', label: 'X Position', required: true, min: 0 },
          y: { type: 'number', label: 'Y Position', required: true, min: 0 },
          button: { type: 'select', label: 'Button', options: ['left', 'right', 'middle'], default: 'left' }
        }
      },
      RIGHT_CLICK: {
        id: 'right_click',
        name: 'Right Click',
        description: 'Right click at a specific location',
        parameters: {
          x: { type: 'number', label: 'X Position', required: true, min: 0 },
          y: { type: 'number', label: 'Y Position', required: true, min: 0 }
        }
      },
      SCROLL: {
        id: 'scroll',
        name: 'Scroll',
        description: 'Scroll up or down',
        parameters: {
          direction: { type: 'select', label: 'Direction', options: ['up', 'down'], required: true },
          amount: { type: 'number', label: 'Amount', required: true, min: 1, max: 10, default: 3 }
        }
      },
      DRAG: {
        id: 'drag',
        name: 'Drag',
        description: 'Drag from one point to another',
        parameters: {
          start_x: { type: 'number', label: 'Start X', required: true, min: 0 },
          start_y: { type: 'number', label: 'Start Y', required: true, min: 0 },
          end_x: { type: 'number', label: 'End X', required: true, min: 0 },
          end_y: { type: 'number', label: 'End Y', required: true, min: 0 },
          duration: { type: 'number', label: 'Duration (seconds)', min: 0.1, max: 5, default: 1 }
        }
      }
    }
  },
  KEYBOARD: {
    id: 'keyboard',
    name: 'Keyboard',
    description: 'Keyboard actions like typing, key combinations',
    icon: '⌨️',
    actions: {
      TYPE: {
        id: 'type',
        name: 'Type Text',
        description: 'Type text at the current cursor position',
        parameters: {
          text: { type: 'text', label: 'Text to Type', required: true, multiline: true }
        }
      },
      PRESS_KEY: {
        id: 'press_key',
        name: 'Press Key',
        description: 'Press a single key or key combination',
        parameters: {
          key: { type: 'select', label: 'Key', options: [
            'enter', 'space', 'tab', 'escape', 'backspace', 'delete',
            'ctrl+c', 'ctrl+v', 'ctrl+a', 'ctrl+z', 'ctrl+s', 'ctrl+n',
            'alt+tab', 'alt+f4', 'win+d', 'win+r', 'win+l'
          ], required: true }
        }
      },
      HOTKEY: {
        id: 'hotkey',
        name: 'Custom Hotkey',
        description: 'Press a custom key combination',
        parameters: {
          keys: { type: 'text', label: 'Key Combination (e.g., ctrl+shift+a)', required: true }
        }
      }
    }
  },
  SCREENSHOT: {
    id: 'screenshot',
    name: 'Screenshot',
    description: 'Take screenshots of the screen',
    icon: '📸',
    actions: {
      CAPTURE: {
        id: 'capture',
        name: 'Take Screenshot',
        description: 'Capture a screenshot of the entire screen',
        parameters: {
          filename: { type: 'text', label: 'Filename (optional)', placeholder: 'screenshot.png' }
        }
      },
      CAPTURE_REGION: {
        id: 'capture_region',
        name: 'Capture Region',
        description: 'Capture a specific region of the screen',
        parameters: {
          x: { type: 'number', label: 'X Position', required: true, min: 0 },
          y: { type: 'number', label: 'Y Position', required: true, min: 0 },
          width: { type: 'number', label: 'Width', required: true, min: 1 },
          height: { type: 'number', label: 'Height', required: true, min: 1 },
          filename: { type: 'text', label: 'Filename (optional)', placeholder: 'region.png' }
        }
      }
    }
  },
  SYSTEM: {
    id: 'system',
    name: 'System',
    description: 'System-level actions',
    icon: '⚙️',
    actions: {
      SLEEP: {
        id: 'sleep',
        name: 'Sleep',
        description: 'Wait for a specified amount of time',
        parameters: {
          duration: { type: 'number', label: 'Duration (seconds)', required: true, min: 0.1, max: 60, default: 1 }
        }
      },
      SHUTDOWN: {
        id: 'shutdown',
        name: 'Shutdown',
        description: 'Shutdown the computer',
        parameters: {
          delay: { type: 'number', label: 'Delay (seconds)', min: 0, max: 300, default: 0 }
        }
      },
      RESTART: {
        id: 'restart',
        name: 'Restart',
        description: 'Restart the computer',
        parameters: {
          delay: { type: 'number', label: 'Delay (seconds)', min: 0, max: 300, default: 0 }
        }
      }
    }
  },
  PROGRAM: {
    id: 'program',
    name: 'Program',
    description: 'Program and application control',
    icon: '💻',
    actions: {
      START: {
        id: 'start',
        name: 'Start Program',
        description: 'Launch a program or application',
        parameters: {
          program: { type: 'text', label: 'Program Name/Path', required: true, placeholder: 'notepad.exe' }
        }
      },
      CLOSE: {
        id: 'close',
        name: 'Close Program',
        description: 'Close a running program',
        parameters: {
          program: { type: 'text', label: 'Program Name', required: true, placeholder: 'notepad' }
        }
      }
    }
  },
  WEB: {
    id: 'web',
    name: 'Web',
    description: 'Web browser actions',
    icon: '🌐',
    actions: {
      NAVIGATE: {
        id: 'navigate',
        name: 'Navigate to URL',
        description: 'Open a URL in the default browser',
        parameters: {
          url: { type: 'text', label: 'URL', required: true, placeholder: 'https://example.com' }
        }
      },
      SEARCH: {
        id: 'search',
        name: 'Search',
        description: 'Search for something on the web',
        parameters: {
          query: { type: 'text', label: 'Search Query', required: true, placeholder: 'python tutorial' }
        }
      }
    }
  }
};

export function getCommandTypes() {
  return Object.values(COMMAND_TYPES);
}

export function getActionsForType(commandTypeId) {
  const commandType = COMMAND_TYPES[commandTypeId.toUpperCase()];
  return commandType ? Object.values(commandType.actions) : [];
}

export function getAction(commandTypeId, actionId) {
  const commandType = COMMAND_TYPES[commandTypeId.toUpperCase()];
  if (!commandType) return null;

  return Object.values(commandType.actions).find(action => action.id === actionId) || null;
}

export function generateCommandText(commandTypeId, actionId, parameters) {
  const action = getAction(commandTypeId, actionId);

  if (!action) {
    return '';
  }

  const commandType = COMMAND_TYPES[commandTypeId.toUpperCase()];
  const actionName = action.name.toLowerCase().replace(/\s+/g, '_');

  switch (commandTypeId.toLowerCase()) {
    case 'mouse':
      switch (actionId.toLowerCase()) {
        case 'click':
          return `click at ${parameters.x}, ${parameters.y}`;
        case 'double_click':
          return `double click at ${parameters.x}, ${parameters.y}`;
        case 'right_click':
          return `right click at ${parameters.x}, ${parameters.y}`;
        case 'scroll':
          return `scroll ${parameters.direction} ${parameters.amount} times`;
        case 'drag':
          return `drag from ${parameters.start_x}, ${parameters.start_y} to ${parameters.end_x}, ${parameters.end_y}`;
        default:
          return `${actionName} with parameters`;
      }
    case 'keyboard':
      switch (actionId.toLowerCase()) {
        case 'type':
          return `type "${parameters.text}"`;
        case 'press_key':
          return `press ${parameters.key}`;
        case 'hotkey':
          return `press ${parameters.keys}`;
        default:
          return `${actionName} with parameters`;
      }
    case 'screenshot':
      switch (actionId.toLowerCase()) {
        case 'capture':
          return `take screenshot${parameters.filename ? ` and save as ${parameters.filename}` : ''}`;
        case 'capture_region':
          return `capture region at ${parameters.x}, ${parameters.y} (${parameters.width}x${parameters.height})${parameters.filename ? ` and save as ${parameters.filename}` : ''}`;
        default:
          return `${actionName} with parameters`;
      }
    case 'system':
      switch (actionId.toLowerCase()) {
        case 'sleep':
          return `wait ${parameters.duration} seconds`;
        case 'shutdown':
          return `shutdown computer${parameters.delay ? ` in ${parameters.delay} seconds` : ''}`;
        case 'restart':
          return `restart computer${parameters.delay ? ` in ${parameters.delay} seconds` : ''}`;
        default:
          return `${actionName} with parameters`;
      }
    case 'program':
      switch (actionId.toLowerCase()) {
        case 'start':
          return `start ${parameters.program}`;
        case 'close':
          return `close ${parameters.program}`;
        default:
          return `${actionName} with parameters`;
      }
    case 'web':
      switch (actionId.toLowerCase()) {
        case 'navigate':
          return `go to ${parameters.url}`;
        case 'search':
          return `search for "${parameters.query}"`;
        default:
          return `${actionName} with parameters`;
      }
    default:
      return `${actionName} with parameters`;
  }
}
