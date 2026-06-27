import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('returns the service health status', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('epolia-back');
    expect(result.timestamp).toEqual(expect.any(String));
  });
});
