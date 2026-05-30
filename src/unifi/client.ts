export interface UnifiClientConfig {
  host: string;
  apiKey: string;
  site: string;
  verifyTls: boolean;
  timeoutMs: number;
}

export interface IUnifiClient {
  get<T>(path: string): Promise<T[]>;
  getOne<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T[]>;
  put<T>(path: string, body: unknown): Promise<T[]>;
  delete(path: string): Promise<void>;
  cmd(cmdPath: string, body: unknown): Promise<void>;
  v2get<T>(path: string): Promise<T[]>;
  v2getOne<T>(path: string): Promise<T>;
  v2post<T>(path: string, body: unknown): Promise<T>;
  v2put<T>(path: string, body: unknown): Promise<T>;
  v2delete(path: string): Promise<void>;
}

interface UnifiV1Response<T> {
  meta: { rc: string; msg?: string };
  data: T[];
}

export class UnifiClient implements IUnifiClient {
  private v1Base: string;
  private v2Base: string;

  constructor(private config: UnifiClientConfig) {
    if (!config.verifyTls) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    this.v1Base = `https://${config.host}/proxy/network/api/s/${config.site}`;
    this.v2Base = `https://${config.host}/proxy/network/v2/api/site/${config.site}`;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'X-API-Key': this.config.apiKey,
          'Content-Type': 'application/json',
          ...(options.headers as Record<string, string> ?? {}),
        },
      });
      if (!response.ok) {
        throw new Error(`UniFi API HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`UniFi API request timed out after ${this.config.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private checkRc<T>(result: UnifiV1Response<T>): T[] {
    if (result.meta.rc !== 'ok') {
      throw new Error(`UniFi API error: ${result.meta.msg ?? 'unknown error'}`);
    }
    return result.data;
  }

  async get<T>(path: string): Promise<T[]> {
    const result = await this.request<UnifiV1Response<T>>(`${this.v1Base}/${path}`);
    return this.checkRc(result);
  }

  async getOne<T>(path: string): Promise<T> {
    const items = await this.get<T>(path);
    if (items.length === 0) throw new Error(`UniFi API: no result for path '${path}'`);
    return items[0];
  }

  async post<T>(path: string, body: unknown): Promise<T[]> {
    const result = await this.request<UnifiV1Response<T>>(`${this.v1Base}/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return this.checkRc(result);
  }

  async put<T>(path: string, body: unknown): Promise<T[]> {
    const result = await this.request<UnifiV1Response<T>>(`${this.v1Base}/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return this.checkRc(result);
  }

  async delete(path: string): Promise<void> {
    const result = await this.request<UnifiV1Response<never>>(`${this.v1Base}/${path}`, {
      method: 'DELETE',
    });
    this.checkRc(result);
  }

  async cmd(cmdPath: string, body: unknown): Promise<void> {
    await this.post(`cmd/${cmdPath}`, body);
  }

  async v2get<T>(path: string): Promise<T[]> {
    return this.request<T[]>(`${this.v2Base}/${path}`);
  }

  async v2getOne<T>(path: string): Promise<T> {
    const items = await this.v2get<T>(path);
    if (!Array.isArray(items) || items.length === 0) throw new Error(`UniFi v2 API: no result for path '${path}'`);
    return items[0];
  }

  async v2post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(`${this.v2Base}/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async v2put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(`${this.v2Base}/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async v2delete(path: string): Promise<void> {
    await this.request<void>(`${this.v2Base}/${path}`, { method: 'DELETE' });
  }
}
