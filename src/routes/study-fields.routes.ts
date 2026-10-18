import { Router } from 'express';
import { prisma } from '@/prisma/client';

export const studyFieldsRouter = Router();

studyFieldsRouter.get('/study-fields', async (_request, response) => {
  const fields = await prisma.studyField.findMany({
    select: { id: true, label: true },
    orderBy: { label: 'asc' },
  });

  response.status(200).json(fields);
});
