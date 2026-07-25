import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PurchaseRequestService } from './purchase-request.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PurchaseRequestService', () => {
  let service: PurchaseRequestService;

  const mockPrismaService = {
    purchaseRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    template: {
      findUnique: jest.fn(),
    },
    coupon: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseRequestService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PurchaseRequestService>(PurchaseRequestService);
    jest.clearAllMocks();
  });

  describe('create purchase request validation rules', () => {
    const userId = 'user-uuid-123';
    const dto = {
      templateId: 'template-uuid-456',
      contactEmail: 'user@example.com',
      contactPhone: '+966500000000',
    };

    it('should throw ConflictException (409) if the user already has a PENDING purchase request', async () => {
      // Mock existing PENDING request
      mockPrismaService.purchaseRequest.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        userId,
        status: RequestStatus.PENDING,
      });

      await expect(service.create(userId, dto)).rejects.toThrow(
        ConflictException,
      );

      expect(mockPrismaService.purchaseRequest.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          status: RequestStatus.PENDING,
        },
      });
    });

    it('should allow creating a purchase request if user has no PENDING request (e.g. previous is REJECTED or APPROVED)', async () => {
      // No PENDING request
      mockPrismaService.purchaseRequest.findFirst.mockResolvedValueOnce(null);

      // Mock template exists
      mockPrismaService.template.findUnique.mockResolvedValueOnce({
        id: dto.templateId,
        price: '100.00',
      });

      mockPrismaService.purchaseRequest.create.mockResolvedValueOnce({
        id: 'new-req-id',
        userId,
        templateId: dto.templateId,
        status: RequestStatus.PENDING,
      });

      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: userId,
        phoneNumber: '+966500000000',
      });

      const result = await service.create(userId, dto);

      expect(result).toBeDefined();
      expect(mockPrismaService.purchaseRequest.create).toHaveBeenCalled();
    });
  });
});
