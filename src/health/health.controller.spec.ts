import { Test, TestingModule } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  const mockHealthResult = {
    status: 'ok',
    timestamp: '2026-07-30T00:00:00.000Z',
    uptimeSeconds: 100,
    database: {
      status: 'connected',
    },
  };

  const mockHealthService = {
    getHealth: jest.fn(() => mockHealthResult),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: mockHealthService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return health information from the service', () => {
    const result = controller.getHealth();

    expect(result).toEqual(mockHealthResult);
    expect(mockHealthService.getHealth).toHaveBeenCalledTimes(1);
  });
});
