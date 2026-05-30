import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const orig = process.env;

  beforeEach(() => {
    process.env = { ...orig };
  });

  afterEach(() => {
    process.env = orig;
  });

  it('throws if UNIFI_HOST is missing', () => {
    delete process.env.UNIFI_HOST;
    process.env.UNIFI_API_KEY = 'key';
    process.env.MCP_SECRET = 'secret';
    expect(() => loadConfig()).toThrow('UNIFI_HOST');
  });

  it('throws if UNIFI_API_KEY is missing', () => {
    process.env.UNIFI_HOST = '192.168.1.1';
    delete process.env.UNIFI_API_KEY;
    process.env.MCP_SECRET = 'secret';
    expect(() => loadConfig()).toThrow('UNIFI_API_KEY');
  });

  it('throws if MCP_SECRET is missing', () => {
    process.env.UNIFI_HOST = '192.168.1.1';
    process.env.UNIFI_API_KEY = 'key';
    delete process.env.MCP_SECRET;
    expect(() => loadConfig()).toThrow('MCP_SECRET');
  });

  it('returns config with defaults for optional vars', () => {
    process.env.UNIFI_HOST = '192.168.1.1';
    process.env.UNIFI_API_KEY = 'key';
    process.env.MCP_SECRET = 'secret';
    const config = loadConfig();
    expect(config.unifiSite).toBe('default');
    expect(config.unifiVerifyTls).toBe(false);
    expect(config.unifiRequestTimeoutMs).toBe(10000);
    expect(config.mcpPort).toBe(3000);
    expect(config.mcpHost).toBe('0.0.0.0');
    expect(config.logLevel).toBe('info');
  });

  it('parses optional vars when provided', () => {
    process.env.UNIFI_HOST = '10.0.0.1';
    process.env.UNIFI_API_KEY = 'mykey';
    process.env.MCP_SECRET = 'mysecret';
    process.env.UNIFI_SITE = 'mysite';
    process.env.UNIFI_VERIFY_TLS = 'true';
    process.env.UNIFI_REQUEST_TIMEOUT_MS = '5000';
    process.env.MCP_PORT = '8080';
    process.env.MCP_HOST = '127.0.0.1';
    process.env.LOG_LEVEL = 'debug';
    const config = loadConfig();
    expect(config.unifiHost).toBe('10.0.0.1');
    expect(config.unifiSite).toBe('mysite');
    expect(config.unifiVerifyTls).toBe(true);
    expect(config.unifiRequestTimeoutMs).toBe(5000);
    expect(config.mcpPort).toBe(8080);
    expect(config.mcpHost).toBe('127.0.0.1');
    expect(config.logLevel).toBe('debug');
  });
});
