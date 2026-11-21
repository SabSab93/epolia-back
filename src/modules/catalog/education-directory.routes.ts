import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import {
  getCampusOffers,
  listOfferCandidates,
  listServiceCandidates,
  searchCampuses,
} from '@/modules/catalog/education-directory';
import {
  readDirectory,
  readDirectoryId,
  requireCatalogOffer,
} from '@/modules/catalog/education-directory-access';

export const educationDirectoryRouter = Router();

educationDirectoryRouter.get(
  '/education-catalog/candidates',
  async (_request, response) => {
    response.json(await readDirectory(() => listServiceCandidates()));
  },
);

educationDirectoryRouter.get(
  '/education-catalog/campuses',
  async (request, response) => {
    const q = request.query.q;
    if (typeof q !== 'string' || q.trim().length < 2 || q.length > 100) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'q must contain between 2 and 100 characters',
      );
    }
    response.json(await readDirectory(() => searchCampuses(q.trim())));
  },
);

educationDirectoryRouter.get(
  '/education-catalog/campuses/:campusId/offers',
  async (request, response) => {
    const campusId = readDirectoryId(request.params.campusId, 'campusId');
    const offers = await readDirectory(() => getCampusOffers(campusId));
    if (offers === null) {
      throw new AppError(404, 'CATALOG_CAMPUS_NOT_FOUND', 'Campus not found');
    }
    response.json(offers);
  },
);

educationDirectoryRouter.get(
  '/education-catalog/offers/:offerId/candidates',
  async (request, response) => {
    const offerId = readDirectoryId(request.params.offerId, 'offerId');
    await requireCatalogOffer(offerId);
    const candidates = await readDirectory(() => listOfferCandidates(offerId));
    response.json({ offerId, candidates });
  },
);
