export const SOLO_APP_DIR = 'D:\\apps\\TRAE SOLO CN';
export const SOLO_EXE = `${SOLO_APP_DIR}\\TRAE SOLO CN.exe`;
export const PRODUCT_JSON = `${SOLO_APP_DIR}\\resources\\app\\product.json`;
export const MANIFEST_JSON = `${SOLO_APP_DIR}\\manifest.json`;
export const DESKTOP_CONFIG_JS = `${SOLO_APP_DIR}\\resources\\app\\out\\vs\\code\\electron-browser\\scenes\\desktop.config.js`;
export const CDP_PORT = 9222;
export const GATEWAY_PORT = 18080;
export const BACKUP_DIR = 'backups';
export const SCREENSHOT_DIR = 'screenshots';
export const API_DOCS_DIR = 'api-docs';

export const PRESETS = {
  aggressive: {
    name: 'aggressive',
    description: '激进模式：解锁全部功能',
    changes: {
      'computerUse.enable': true,
      'autoRunConfig.ideCommandMode': 'blacklist',
      'autoRunConfig.soloCommandMode': 'blacklist',
      'icubeConfig.mcpToolLimit': 200,
      'icubeConfig.mcpTokenLimit': 32000,
      'icubeConfig.customPromptTokenLimit': 50000,
      'icubeConfig.featureGates.enableHashDoc': true,
      'icubeConfig.featureGates.enableCueflow': true,
      'icubeConfig.featureGates.enableTabCue': true,
      'icubeConfig.worktree.enable': true,
    }
  },
  conservative: {
    name: 'conservative',
    description: '保守模式：仅放开AI限制',
    changes: {
      'icubeConfig.mcpToolLimit': 100,
      'icubeConfig.mcpTokenLimit': 16000,
      'icubeConfig.customPromptTokenLimit': 20000,
    }
  }
} as const;

export const SOLO_PROCESS_NAMES = [
  'TRAE SOLO CN.exe',
  'ai-agent.exe',
  'ckg_server_windows_x64.exe',
  'trae-sandbox.exe',
  'TRAE SOLO CN',
] as const;
