import { getCostLabel, CostModel } from '../costSharingService';

describe('CostSharingService', () => {
  describe('getCostLabel', () => {
    it('shows BYOB label when cost is zero', () => {
      expect(getCostLabel('BYOB', 0)).toBe('Bring your own birdies');
    });

    it('shows BYOB + court cost', () => {
      expect(getCostLabel('BYOB', 5)).toBe('$5/player + BYOB');
    });

    it('shows split evenly label', () => {
      expect(getCostLabel('SPLIT_EVENLY', 8.75)).toBe('~$9/player');
    });

    it('shows per-player label', () => {
      expect(getCostLabel('PER_PLAYER', 10)).toBe('$10/player');
    });

    it('shows free for organizer covers', () => {
      expect(getCostLabel('ORGANIZER_COVERS', 0)).toBe('Free · organizer covers');
    });
  });
});
