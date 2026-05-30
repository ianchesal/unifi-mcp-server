import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('createLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('info logs at info level', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { createLogger } = await import('../src/logger.js?t=' + Date.now());
    const logger = createLogger('info');
    logger.info('hello');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'), 'hello');
  });

  it('does not log debug at info level', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { createLogger } = await import('../src/logger.js?t=' + Date.now());
    const logger = createLogger('info');
    logger.debug('should not appear');
    expect(spy).not.toHaveBeenCalled();
  });

  it('error always logs', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { createLogger } = await import('../src/logger.js?t=' + Date.now());
    const logger = createLogger('error');
    logger.error('oops');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'), 'oops');
  });
});
