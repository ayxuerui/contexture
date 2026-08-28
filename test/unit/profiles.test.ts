import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE_ID, SHIPPED_PROFILES, defaultProfile, profileById } from '../../src/taxonomy/profiles.js';

describe('taxonomy profiles', () => {
  it('ships exactly PARA, Zettelkasten, and Diátaxis', () => {
    expect(SHIPPED_PROFILES.map((p) => p.id).sort()).toEqual(['diataxis', 'para', 'zettelkasten']);
  });

  it('PARA has four layers: Projects, Areas, Resources, Archives', () => {
    const para = profileById('para');
    expect(para?.layers.map((l) => l.name)).toEqual(['Projects', 'Areas', 'Resources', 'Archives']);
  });

  it('Zettelkasten has zero layers', () => {
    const zettelkasten = profileById('zettelkasten');
    expect(zettelkasten?.layers).toEqual([]);
  });

  it('Diátaxis has four layers: Tutorials, How-to guides, Reference, Explanation', () => {
    const diataxis = profileById('diataxis');
    expect(diataxis?.layers.map((l) => l.name)).toEqual([
      'Tutorials',
      'How-to guides',
      'Reference',
      'Explanation',
    ]);
  });

  it('every shipped profile has a non-empty name and description', () => {
    for (const profile of SHIPPED_PROFILES) {
      expect(profile.name.length).toBeGreaterThan(0);
      expect(profile.description.length).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_PROFILE_ID is "para" and defaultProfile() resolves to it', () => {
    expect(DEFAULT_PROFILE_ID).toBe('para');
    expect(defaultProfile().id).toBe('para');
  });

  it('profileById returns undefined for an unknown id', () => {
    expect(profileById('nonexistent')).toBeUndefined();
  });
});
