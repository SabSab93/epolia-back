import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { prisma } from '@/prisma/client';

export const domainsRouter = Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanDomainId(value: string | undefined) {
  if (!value || !uuidRegex.test(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'domainId is invalid');
  }

  return value;
}

domainsRouter.get('/domains', async (_request, response) => {
  const domains = await prisma.domain.findMany({
    orderBy: {
      label: 'asc',
    },
  });

  response.status(200).json(domains);
});

domainsRouter.get(
  '/domains/:domainId/specialties',
  async (request, response) => {
    const domainId = cleanDomainId(request.params.domainId);

    const domain = await prisma.domain.findUnique({
      where: {
        id: domainId,
      },
    });

    if (!domain) {
      throw new AppError(404, 'DOMAIN_NOT_FOUND', 'Domain not found');
    }

    const specialties = await prisma.specialty.findMany({
      where: {
        domainId,
      },
      orderBy: {
        label: 'asc',
      },
    });

    response.status(200).json(specialties);
  },
);
