// Cross-repository contract with MAGSpace (MAGSpace/docs/07-directory-api.md).
//
// `fetch` is mocked rather than `fetchJsonWithRetry`, so these tests also pin
// the things the wrapper is responsible for: the bearer header, the URL shape
// and — importantly — that the sign-in path does not retry.

import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import {
  DirectoryUnavailableError,
  EmployeeNotFoundError,
  MagspaceClient,
} from './magspace.client';

const TOKEN = 'x'.repeat(48);

function makeClient(overrides: Partial<Record<string, unknown>> = {}): MagspaceClient {
  const values: Record<string, unknown> = {
    MAGSPACE_API_URL: 'http://magspace-api:3001',
    MAGSPACE_INTERNAL_TOKEN: TOKEN,
    ...overrides,
  };
  return new MagspaceClient({
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>);
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const EMPLOYEE = {
  id: 'clx1234567890',
  email: 'jan.kowalski@magtrans.eu',
  firstName: 'Jan',
  lastName: 'Kowalski',
  active: true,
  stanowisko: { code: 'PLANISTA', name: 'Planista' },
  employedFrom: null,
  employedTo: null,
  updatedAt: '2026-09-01T10:00:00.000Z',
};

describe('MagspaceClient', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends the bearer token and normalises the e-mail into the query', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, EMPLOYEE));

    await makeClient().lookupByEmail('  Jan.Kowalski@MAGTRANS.eu ');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://magspace-api:3001/internal/v1/employees/lookup?email=jan.kowalski%40magtrans.eu',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('accepts a null employedFrom — everyone hired before MAGSpace has one', async () => {
    // Our own doc originally typed this non-null; MAGSpace serves null for the
    // pre-2026-09 roster, and a strict parse here would lock out the whole
    // company.
    fetchMock.mockResolvedValue(jsonResponse(200, { ...EMPLOYEE, employedFrom: null }));

    await expect(makeClient().lookupByEmail('a@magtrans.eu')).resolves.toMatchObject({
      employedFrom: null,
    });
  });

  it('accepts a null stanowisko', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ...EMPLOYEE, stanowisko: null }));

    await expect(makeClient().lookupByEmail('a@magtrans.eu')).resolves.toMatchObject({
      stanowisko: null,
    });
  });

  it('accepts a cuid id — MAGSpace does not use uuids', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ...EMPLOYEE, id: 'clabc0000000000' }));

    await expect(makeClient().lookupByEmail('a@magtrans.eu')).resolves.toMatchObject({
      id: 'clabc0000000000',
    });
  });

  it('maps a 404 to EmployeeNotFoundError without retrying', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { code: 'EMPLOYEE_NOT_FOUND' }));

    await expect(makeClient().lookupByEmail('a@magtrans.eu')).rejects.toBeInstanceOf(
      EmployeeNotFoundError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 5xx on the sign-in path', async () => {
    // Three attempts with 1 s + 2 s backoff would hold the login form for
    // seven seconds before failing.
    fetchMock.mockResolvedValue(jsonResponse(503, { code: 'DB_UNAVAILABLE' }));

    await expect(makeClient().lookupByEmail('a@magtrans.eu')).rejects.toBeInstanceOf(
      DirectoryUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a 401 (bad or rotated token) to "unavailable", not "not found"', async () => {
    // Getting this wrong would deprovision the entire company the moment the
    // token is rotated on one side only.
    fetchMock.mockResolvedValue(jsonResponse(401, { code: 'UNAUTHORIZED' }));

    await expect(makeClient().lookupByEmail('a@magtrans.eu')).rejects.toBeInstanceOf(
      DirectoryUnavailableError,
    );
  });

  it('rejects a response that does not match the contract', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'x', email: 'not-an-email' }));

    await expect(makeClient().lookupByEmail('a@magtrans.eu')).rejects.toBeInstanceOf(
      DirectoryUnavailableError,
    );
  });

  it('parses the roster envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { items: [EMPLOYEE], generatedAt: '2026-09-09T10:00:00.000Z' }),
    );

    await expect(makeClient().listAll()).resolves.toMatchObject({
      items: [{ id: EMPLOYEE.id }],
      generatedAt: '2026-09-09T10:00:00.000Z',
    });
  });

  it('unwraps the stanowiska list', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { items: [{ code: 'PLANISTA', name: 'Planista' }] }),
    );

    await expect(makeClient().listStanowiska()).resolves.toEqual([
      { code: 'PLANISTA', name: 'Planista' },
    ]);
  });

  it('sends the token to /health too — MAGSpace guards it like every other route', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await expect(makeClient().health()).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://magspace-api:3001/internal/v1/health');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('reports health as false rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(makeClient().health()).resolves.toBe(false);
  });

  it('strips a trailing slash from the base url', async () => {
    // `//internal/v1/...` hits MAGSpace's catch-all and 404s.
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await makeClient({ MAGSPACE_API_URL: 'http://magspace-api:3001/' }).health();

    expect(fetchMock.mock.calls[0][0]).toBe('http://magspace-api:3001/internal/v1/health');
  });

  it('refuses to call out at all when no token is configured', async () => {
    const client = makeClient({ MAGSPACE_INTERNAL_TOKEN: undefined });

    expect(client.isConfigured).toBe(false);
    await expect(client.lookupByEmail('a@magtrans.eu')).rejects.toBeInstanceOf(
      DirectoryUnavailableError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
