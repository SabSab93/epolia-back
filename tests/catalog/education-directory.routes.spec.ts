import express from 'express';
import request from 'supertest';
import { errorHandler } from '@/middlewares/error.middleware';
import * as directory from '@/modules/catalog/education-directory';
import { educationDirectoryRouter } from '@/modules/catalog/education-directory.routes';

jest.mock('@/modules/catalog/education-directory');

describe('Education directory routes', () => {
  const app = express();
  app.use('/api', educationDirectoryRouter);
  app.use(errorHandler);
  const base = '/api/education-catalog/';
  beforeEach(() => jest.resetAllMocks());

  it('returns a genuine empty result and distinguishes source failure', async () => {
    jest.mocked(directory.searchCampuses).mockResolvedValueOnce([]);
    jest
      .mocked(directory.searchCampuses)
      .mockRejectedValueOnce(new Error('source unavailable'));
    await request(app)
      .get(base + 'campuses?q=%20My%20')
      .expect(200, []);
    expect(directory.searchCampuses).toHaveBeenCalledWith('My');
    expect((await request(app).get(base + 'campuses?q=My')).body.code).toBe(
      'EDUCATION_CATALOG_UNAVAILABLE',
    );
    await request(app)
      .get(base + 'campuses?q=x')
      .expect(400);
    await request(app)
      .get(base + 'campuses')
      .expect(400);
    await request(app)
      .get(base + 'campuses?q=' + 'x'.repeat(101))
      .expect(400);
    expect(directory.searchCampuses).toHaveBeenCalledTimes(2);
  });

  it('reports a failed candidate catalog read as unavailable', async () => {
    jest
      .mocked(directory.listServiceCandidates)
      .mockRejectedValueOnce(new Error('unavailable'));
    const failed = await request(app)
      .get(base + 'candidates')
      .expect(503);
    expect(failed.body.code).toBe('EDUCATION_CATALOG_UNAVAILABLE');
  });

  it('distinguishes an unknown campus or offer from a catalogued campus with no offers', async () => {
    jest
      .mocked(directory.getCampusOffers)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(null);
    await request(app)
      .get(base + 'campuses/school/offers')
      .expect(200, []);
    await request(app)
      .get(base + 'campuses/missing/offers')
      .expect(404);
    jest.mocked(directory.getCatalogOffer).mockResolvedValueOnce(null);
    await request(app)
      .get(base + 'offers/missing/candidates')
      .expect(404);
    expect(directory.listServiceCandidates).not.toHaveBeenCalled();
  });
});
