import { beforeEach, describe, expect, it, vi } from 'vitest';

const provider = {
  id: 'fixture',
  name: 'Fixture',
  catalog: [{ title: 'Featured', filter: 'featured' }],
  genres: [],
  hasEpisodes: false,
  getPosts: vi.fn(),
  getSearchPosts: vi.fn(),
};

vi.mock('@/providers/registry', () => ({
  getProvider: () => provider,
  listProviders: () => [provider],
}));
vi.mock('@/providers/_shared', () => ({
  createProviderContext: () => ({}),
}));

import { catalog } from '@/services/catalog';
import { search } from '@/services/search';

describe('catalog and search normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const post = { title: 'Same title', link: '/same-title', image: '' };
    provider.getPosts.mockResolvedValue([post]);
    provider.getSearchPosts.mockResolvedValue([post]);
  });

  it('assigns the same stable id for the same post', async () => {
    const [fromCatalog] = await catalog('fixture', 'featured');
    const [fromSearch] = await search('same title', 'fixture');
    expect(fromCatalog.id).toBe(fromSearch.id);
  });
});
