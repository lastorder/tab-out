import { describe, expect, it } from 'vitest';
import manifest from '@/manifest.json';

type CommandDef = { suggested_key?: Record<string, string> };
const commands = manifest.commands as Record<string, CommandDef>;

describe('manifest commands', () => {
  // These assertions exist so the chords the options page *displays* (read
  // straight out of this manifest) can never silently disagree with the ones
  // Chrome actually binds, and so a future edit can't quietly change the
  // documented defaults. Neither command is gated by a settings flag any
  // more — both are always on, see `core/global-commands.ts`.
  it('declares _execute_action and the dashboard command with the documented Mac defaults', () => {
    expect(Object.keys(commands)).toEqual(['_execute_action', 'global-dashboard']);
    expect(commands['_execute_action']?.suggested_key).toEqual({
      default: 'Ctrl+Shift+F',
      mac: 'Command+Shift+F',
    });
    expect(commands['global-dashboard']?.suggested_key).toEqual({
      default: 'Ctrl+Shift+T',
      mac: 'Command+Shift+T',
    });
  });

  it('opens the search popup from the toolbar icon too', () => {
    expect(manifest.action.default_popup).toBe('popup.html');
  });
});
