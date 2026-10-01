import { NextFunction, Request, Response } from 'express';
import { CallController } from '@/controllers/call.controller';
import { CallService } from '@/services/call.service';

vi.mock('@/services/call.service', () => ({
  CallService: {
    getDailyPairUsage: vi.fn(),
    getCallHistory: vi.fn(),
  },
}));

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('CallController', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated TURN credential requests', () => {
    const next = vi.fn() as unknown as NextFunction;
    CallController.getTurnCredentials({} as Request, response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('returns daily call usage for the authenticated user pair', async () => {
    const usage = { usedSeconds: 120, remainingSeconds: 480 };
    vi.mocked(CallService.getDailyPairUsage).mockResolvedValue(usage as never);
    const req = { user: { id: 7 }, params: { mateUserId: '9' } } as unknown as Request;
    const res = response();
    const next = vi.fn() as unknown as NextFunction;

    await CallController.getLimit(req, res, next);

    expect(CallService.getDailyPairUsage).toHaveBeenCalledWith(7, 9);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', data: usage });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns call history for the authenticated user', async () => {
    const calls = [{ id: 1, durationSeconds: 30 }];
    vi.mocked(CallService.getCallHistory).mockResolvedValue(calls as never);
    const req = { user: { id: 7 } } as unknown as Request;
    const res = response();
    const next = vi.fn() as unknown as NextFunction;

    await CallController.getHistory(req, res, next);

    expect(CallService.getCallHistory).toHaveBeenCalledWith(7);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', data: { calls } });
    expect(next).not.toHaveBeenCalled();
  });
});
