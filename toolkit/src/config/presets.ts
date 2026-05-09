import { PRESETS } from '../constants.js';

export interface Preset {
  name: string;
  description: string;
  changes: Record<string, any>;
}

export function getPreset(name: string): Preset | undefined {
  const preset = (PRESETS as Record<string, Preset>)[name];
  if (!preset) {
    console.error(`❌ 未知预设: ${name}`);
    console.error(`可用预设: ${Object.keys(PRESETS).join(', ')}`);
    return undefined;
  }
  return preset;
}

export function listPresets(): void {
  console.log('\n📋 可用预设:\n');
  for (const [name, preset] of Object.entries(PRESETS)) {
    const p = preset as Preset;
    console.log(`  ${name}: ${p.description}`);
    for (const [key, value] of Object.entries(p.changes)) {
      console.log(`    - ${key} → ${JSON.stringify(value)}`);
    }
    console.log();
  }
}
