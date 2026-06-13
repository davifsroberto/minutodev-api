import {
  createPaginatedResponse,
  PageMeta,
  PaginatedResponse,
} from './paginated-response.dto';

describe('createPaginatedResponse', () => {
  it.each([
    { expectedTotalPages: 0, limit: 20, total: 0 },
    { expectedTotalPages: 3, limit: 20, total: 45 },
    { expectedTotalPages: 1, limit: 20, total: 20 },
    { expectedTotalPages: 1, limit: 20, total: 1 },
  ])(
    'returns $expectedTotalPages total pages for total $total and limit $limit',
    ({ expectedTotalPages, limit, total }) => {
      const response = createPaginatedResponse([], 1, limit, total);

      expect(response.meta.totalPages).toBe(expectedTotalPages);
    },
  );

  it('returns the paginated envelope with data and meta', () => {
    const data = [{ id: 'first' }, { id: 'second' }];

    const response = createPaginatedResponse(data, 2, 10, 25);

    expect(response).toEqual({
      data,
      meta: {
        limit: 10,
        page: 2,
        total: 25,
        totalPages: 3,
      },
    });
    expect(response.data).toBe(data);
  });

  it('supports concrete class instances for Swagger metadata', () => {
    const meta = new PageMeta();
    meta.page = 1;
    meta.limit = 20;
    meta.total = 2;
    meta.totalPages = 1;

    const response = new PaginatedResponse<{ id: string }>();
    response.data = [{ id: 'first' }, { id: 'second' }];
    response.meta = meta;

    expect(response).toEqual({
      data: [{ id: 'first' }, { id: 'second' }],
      meta: {
        limit: 20,
        page: 1,
        total: 2,
        totalPages: 1,
      },
    });
  });
});
