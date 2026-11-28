import { describe, it, expect } from 'vitest';
import { buildDashboardNotices } from '@/lib/dashboard/notices';

describe('actionable dashboard indicators', () => {
  it('routes unlocated stock to putaway rather than a stock exit', () => {
    expect(buildDashboardNotices({ unlocated: 4 })[0]).toMatchObject({ count: 4, destination: 'putaway' });
  });
  it('routes picking work to the pending picking page', () => {
    expect(buildDashboardNotices({ picking: 2 })[0]?.destination).toBe('scanner-picking');
  });
  it('routes staged or loaded notes to delivery resolution', () => {
    expect(buildDashboardNotices({ deliveries: 3 })[0]?.destination).toBe('deliveries');
  });
  it('does not invent warnings from unknown or zero counts', () => {
    expect(buildDashboardNotices({ damages: 0, picking: undefined })).toEqual([]);
  });
});
